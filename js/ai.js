// Cerveau IA de l'app : Claude écrit le scénario, choisit les personnages,
// le décor, les effets, la musique et le texte de publication.
// La clé API reste sur le téléphone (localStorage) et part directement vers
// api.anthropic.com — aucun serveur intermédiaire.

import Anthropic from "./vendor/anthropic-sdk-1.6.0.mjs";
import {
  DECORS, EFFECTS, TRANSITIONS, CAMERAS, TEXT_STYLES, ANIMS, ENTERS, MOODS,
  AGES, STYLES, LANGS,
} from "./constants.js";

const enumOf = (obj) => ({ type: "string", enum: Object.keys(obj) });

const CHARACTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["emoji", "x", "y", "size", "anim", "enter"],
  properties: {
    emoji: { type: "string", description: "Un seul emoji (personnage ou objet)" },
    x: { type: "number", description: "Position horizontale 0..1 (0 = gauche)" },
    y: { type: "number", description: "Position verticale 0..1 (0 = haut)" },
    size: { type: "number", description: "Taille relative à la largeur, 0.08..0.5" },
    anim: enumOf(ANIMS),
    enter: enumOf(ENTERS),
  },
};

const SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "duration", "narration", "caption", "bgTop", "bgBottom", "decor",
    "effect", "transition", "camera", "textStyle", "characters",
  ],
  properties: {
    duration: { type: "number", description: "Durée en secondes (2 à 10)" },
    narration: { type: "string", description: "Texte lu par le narrateur" },
    caption: { type: "string", description: "Texte affiché à l'écran, 8 mots max" },
    bgTop: { type: "string", description: "Couleur hex du haut du fond, ex #8EC5FC" },
    bgBottom: { type: "string", description: "Couleur hex du bas du fond" },
    decor: enumOf(DECORS),
    effect: enumOf(EFFECTS),
    transition: enumOf(TRANSITIONS),
    camera: enumOf(CAMERAS),
    textStyle: enumOf(TEXT_STYLES),
    characters: { type: "array", items: CHARACTER_SCHEMA },
  },
};

const STORYBOARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "music", "publication", "scenes"],
  properties: {
    title: { type: "string" },
    music: {
      type: "object",
      additionalProperties: false,
      required: ["mood", "tempo"],
      properties: {
        mood: enumOf(MOODS),
        tempo: { type: "integer", description: "BPM entre 70 et 140" },
      },
    },
    publication: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "hashtags"],
      properties: {
        title: { type: "string", description: "Titre accrocheur < 70 caractères" },
        description: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
      },
    },
    scenes: { type: "array", items: SCENE_SCHEMA },
  },
};

const IDEAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["emoji", "title", "prompt"],
        properties: {
          emoji: { type: "string" },
          title: { type: "string" },
          prompt: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `Tu es le réalisateur IA de « Clipou Studio », une app privée qui crée des vidéos courtes verticales (9:16, TikTok / YouTube Shorts) pour les enfants.

Tu produis un storyboard que le moteur de l'app anime lui-même : fonds en dégradé, décors dessinés, personnages emoji animés, effets de particules, sous-titres karaoké, musique générée.

RÈGLES DE CONTENU (non négociables) :
- 100 % adapté aux enfants de la tranche d'âge demandée : bienveillant, joyeux, rassurant, jamais effrayant, violent, moqueur ou anxiogène.
- Aucun personnage, marque, chanson ou univers protégé (pas de Disney, Pixar, Pokémon, Peppa Pig, Pat'Patrouille, Bluey, etc.) : uniquement des personnages originaux.
- Aucune donnée personnelle, aucun défi dangereux, aucune incitation à acheter, aucune nourriture ou geste risqué pour un tout-petit.
- Si la demande n'est pas adaptée aux enfants, transforme-la en une version douce et éducative.
- Valeur éducative quand c'est possible (compter, couleurs, animaux, émotions, politesse, nature, alphabet, sciences simples).

RÈGLES DE FORMAT :
- Les 2 premières secondes = accroche forte (question, surprise, personnage qui arrive en pop).
- Phrases très courtes, vocabulaire simple, répétitions et onomatopées pour les petits.
- Narration lisible dans la durée de la scène : environ 2,3 mots par seconde maximum.
- "caption" = 8 mots maximum, peut contenir 1 emoji.
- La somme des durées des scènes doit égaler la durée cible (à ±1 s). Scènes de 2 à 8 s.
- La dernière scène est une conclusion chaleureuse (récap, petite leçon ou question au public, ex. « Et toi, quel est ton animal préféré ? »). Pas d'appel à s'abonner adressé aux enfants.

RÈGLES DE MISE EN SCÈNE (coordonnées 0..1, y = 0 en haut) :
- Zone sûre : garde les personnages entre x 0.15 et 0.82 et entre y 0.3 et 0.72 (l'interface TikTok couvre le bas et la droite).
- "subtitle" affiche le texte en bas (y≈0.75), "big" en haut en gros (y≈0.2), "bubble" en bulle en haut. Ne place pas de personnage sous le texte.
- 1 à 4 personnages/objets par scène, tailles 0.12 à 0.45. Le personnage principal reste le même emoji d'une scène à l'autre.
- Couleurs de fond cohérentes avec le style demandé ; contraste suffisant pour le texte blanc.
- Varie transitions, caméras et effets sans surcharger (effet "none" quand ce n'est pas utile).
- Hashtags pertinents, sans « # » dupliqués, 5 à 8 maximum, adaptés au contenu jeunesse.

Écris tout le texte (narration, caption, publication) dans la langue demandée.`;

function client(apiKey) {
  // La clé appartient à l'utilisateur et ne quitte jamais son téléphone,
  // d'où l'appel direct depuis le navigateur.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError)
    return "Clé API refusée. Vérifie-la dans Réglages.";
  if (err instanceof Anthropic.PermissionDeniedError)
    return "Cette clé n'a pas accès à ce modèle. Essaie un autre modèle dans Réglages.";
  if (err instanceof Anthropic.NotFoundError)
    return "Modèle introuvable pour cette clé. Change de modèle dans Réglages.";
  if (err instanceof Anthropic.RateLimitError)
    return "Trop de demandes ou crédit épuisé. Réessaie dans un instant.";
  if (err instanceof Anthropic.BadRequestError)
    return "Requête refusée par l'API : " + (err.message || "");
  if (err instanceof Anthropic.APIConnectionError)
    return "Pas de connexion à l'API. Vérifie ton réseau.";
  if (err instanceof Anthropic.APIError)
    return "Erreur de l'API (" + (err.status || "?") + "). Réessaie.";
  return err?.message || String(err);
}

// Appel structuré : la réponse respecte le schéma JSON fourni.
async function callJSON({ apiKey, model, schema, user, onProgress, effort = "medium" }) {
  if (!apiKey) throw new Error("Ajoute ta clé API Claude dans Réglages.");
  const params = {
    model,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  };
  // Repli automatique côté serveur si le modèle principal refuse.
  if (model !== "claude-haiku-5-5") {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }

  let message;
  try {
    const stream = client(apiKey).beta.messages.stream(params);
    let chars = 0;
    stream.on("text", (delta) => {
      chars += delta.length;
      onProgress?.(chars);
    });
    message = await stream.finalMessage();
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  if (message.stop_reason === "refusal") {
    throw new Error("L'IA a refusé cette demande. Reformule ton idée de façon plus douce.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Réponse trop longue. Essaie une vidéo plus courte.");
  }
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Réponse illisible de l'IA. Réessaie.");
  }
}

// ---------- Nettoyage des données reçues ----------
const clamp = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
const pick = (v, obj, d) => (v in obj ? v : d);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : d);

export function sanitizeScene(s) {
  return {
    duration: Math.round(clamp(s.duration, 1.5, 12, 4) * 10) / 10,
    narration: String(s.narration || ""),
    caption: String(s.caption || ""),
    bgTop: hex(s.bgTop, "#8EC5FC"),
    bgBottom: hex(s.bgBottom, "#E0C3FC"),
    decor: pick(s.decor, DECORS, "none"),
    effect: pick(s.effect, EFFECTS, "none"),
    transition: pick(s.transition, TRANSITIONS, "fade"),
    camera: pick(s.camera, CAMERAS, "static"),
    textStyle: pick(s.textStyle, TEXT_STYLES, "subtitle"),
    characters: (s.characters || []).slice(0, 6).map((c) => ({
      emoji: String(c.emoji || "⭐").slice(0, 16),
      x: clamp(c.x, 0, 1, 0.5),
      y: clamp(c.y, 0, 1, 0.5),
      size: clamp(c.size, 0.05, 0.6, 0.25),
      anim: pick(c.anim, ANIMS, "none"),
      enter: pick(c.enter, ENTERS, "pop"),
    })),
  };
}

function sanitizeStoryboard(sb) {
  return {
    title: String(sb.title || "Ma vidéo"),
    music: {
      mood: pick(sb.music?.mood, MOODS, "joyeux"),
      tempo: Math.round(clamp(sb.music?.tempo, 60, 150, 110)),
    },
    publication: {
      title: String(sb.publication?.title || sb.title || ""),
      description: String(sb.publication?.description || ""),
      hashtags: (sb.publication?.hashtags || [])
        .map((h) => "#" + String(h).replace(/^#+/, "").replace(/\s+/g, ""))
        .filter((h) => h.length > 1)
        .slice(0, 10),
    },
    scenes: (sb.scenes || []).map(sanitizeScene).filter(Boolean),
  };
}

// ---------- Fonctions publiques ----------
export async function generateStoryboard({ apiKey, model, prompt, age, duration, style, lang, onProgress }) {
  const user = `Crée une vidéo pour enfants.
Idée : ${prompt}
Âge du public : ${AGES[age] || age}
Durée cible : ${duration} secondes
Style visuel : ${STYLES[style] || style}
Langue : ${LANGS[lang] || lang}`;
  const sb = await callJSON({ apiKey, model, schema: STORYBOARD_SCHEMA, user, onProgress });
  const clean = sanitizeStoryboard(sb);
  if (!clean.scenes.length) throw new Error("L'IA n'a renvoyé aucune scène. Réessaie.");
  return clean;
}

function projectForAI(project) {
  return {
    title: project.title,
    music: { mood: project.music.mood, tempo: project.music.tempo },
    publication: project.publication,
    scenes: project.scenes.map(({ id, ...s }) => s),
  };
}

export async function editStoryboard({ apiKey, model, project, instruction, onProgress }) {
  const user = `Voici le storyboard actuel (JSON) d'une vidéo pour enfants (${AGES[project.age] || ""}, langue ${LANGS[project.lang] || "Français"}) :
${JSON.stringify(projectForAI(project))}

Modification demandée par le créateur : ${instruction}

Renvoie le storyboard complet mis à jour. Garde tout ce qui n'est pas concerné par la demande.`;
  const sb = await callJSON({ apiKey, model, schema: STORYBOARD_SCHEMA, user, onProgress });
  const clean = sanitizeStoryboard(sb);
  if (!clean.scenes.length) throw new Error("L'IA n'a renvoyé aucune scène.");
  return clean;
}

export async function editScene({ apiKey, model, project, sceneIndex, instruction, onProgress }) {
  const ctx = projectForAI(project);
  const user = `Vidéo pour enfants « ${project.title} » (${AGES[project.age] || ""}, langue ${LANGS[project.lang] || "Français"}).
Storyboard complet pour le contexte :
${JSON.stringify(ctx)}

Modifie UNIQUEMENT la scène n°${sceneIndex + 1} :
${JSON.stringify(ctx.scenes[sceneIndex])}

Demande : ${instruction}

Renvoie seulement la scène modifiée.`;
  const scene = await callJSON({ apiKey, model, schema: SCENE_SCHEMA, user, onProgress, effort: "low" });
  return sanitizeScene(scene);
}

export async function generateIdeas({ apiKey, model, age, lang, theme }) {
  const user = `Propose 6 idées variées de vidéos courtes pour enfants de ${AGES[age] || age}, en ${LANGS[lang] || lang}${theme ? `, autour de : ${theme}` : ""}.
Formats qui marchent bien en Shorts : comptine à répéter, devinette « Qui suis-je ? », compter jusqu'à 5, découverte d'un animal, émotion du jour, mini-histoire du soir, couleurs, petit défi calme.
Pour chaque idée : un emoji, un titre court et un prompt détaillé (2 phrases) prêt à être utilisé.`;
  const res = await callJSON({ apiKey, model, schema: IDEAS_SCHEMA, user, effort: "low" });
  return (res.ideas || []).slice(0, 8);
}

export async function testKey({ apiKey, model }) {
  try {
    const msg = await client(apiKey).messages.create({
      model,
      max_tokens: 512,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: "Réponds juste : OK" }],
    });
    return { ok: true, model: msg.model };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}
