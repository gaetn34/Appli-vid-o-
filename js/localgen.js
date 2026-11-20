// Mode sans IA : fabrique un storyboard directement sur le téléphone,
// à partir de mots-clés du prompt. Aucune clé, aucun réseau.

import { sanitizeScene } from "./ai.js";

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// mot-clé (sans accents) -> personnage
const CAST = [
  [["lapin", "bunny", "rabbit", "conejo"], "🐰", { fr: "le petit lapin", en: "the little bunny", es: "el conejito" }],
  [["chat", "cat", "gato", "minou"], "🐱", { fr: "le petit chat", en: "the little cat", es: "el gatito" }],
  [["chien", "dog", "perro", "chiot"], "🐶", { fr: "le petit chien", en: "the little puppy", es: "el perrito" }],
  [["ours", "bear", "oso", "nounours"], "🐻", { fr: "le petit ours", en: "the little bear", es: "el osito" }],
  [["panda"], "🐼", { fr: "le petit panda", en: "the little panda", es: "el pandita" }],
  [["dino", "dinosaure", "dinosaur", "dinosaurio"], "🦖", { fr: "le petit dino", en: "the little dino", es: "el dinosaurito" }],
  [["dragon", "dragón"], "🐲", { fr: "le petit dragon", en: "the little dragon", es: "el dragoncito" }],
  [["licorne", "unicorn", "unicornio"], "🦄", { fr: "la petite licorne", en: "the little unicorn", es: "el unicornio" }],
  [["poisson", "fish", "pez"], "🐠", { fr: "le petit poisson", en: "the little fish", es: "el pececito" }],
  [["baleine", "whale", "ballena"], "🐳", { fr: "la petite baleine", en: "the little whale", es: "la ballenita" }],
  [["dauphin", "dolphin", "delfin"], "🐬", { fr: "le petit dauphin", en: "the little dolphin", es: "el delfin" }],
  [["pieuvre", "poulpe", "octopus", "pulpo"], "🐙", { fr: "la petite pieuvre", en: "the little octopus", es: "el pulpito" }],
  [["tortue", "turtle", "tortuga"], "🐢", { fr: "la petite tortue", en: "the little turtle", es: "la tortuguita" }],
  [["grenouille", "frog", "rana"], "🐸", { fr: "la petite grenouille", en: "the little frog", es: "la ranita" }],
  [["papillon", "butterfly", "mariposa"], "🦋", { fr: "le papillon", en: "the butterfly", es: "la mariposa" }],
  [["abeille", "bee", "abeja"], "🐝", { fr: "la petite abeille", en: "the little bee", es: "la abejita" }],
  [["coccinelle", "ladybug", "mariquita"], "🐞", { fr: "la coccinelle", en: "the ladybug", es: "la mariquita" }],
  [["hibou", "chouette", "owl", "buho"], "🦉", { fr: "le petit hibou", en: "the little owl", es: "el buho" }],
  [["pingouin", "manchot", "penguin", "pinguino"], "🐧", { fr: "le petit pingouin", en: "the little penguin", es: "el pingüinito" }],
  [["elephant", "elefante"], "🐘", { fr: "le petit éléphant", en: "the little elephant", es: "el elefantito" }],
  [["girafe", "giraffe", "jirafa"], "🦒", { fr: "la petite girafe", en: "the little giraffe", es: "la jirafita" }],
  [["lion", "leon"], "🦁", { fr: "le petit lion", en: "the little lion", es: "el leoncito" }],
  [["tigre", "tiger"], "🐯", { fr: "le petit tigre", en: "the little tiger", es: "el tigrecito" }],
  [["singe", "monkey", "mono"], "🐵", { fr: "le petit singe", en: "the little monkey", es: "el monito" }],
  [["cochon", "pig", "cerdo"], "🐷", { fr: "le petit cochon", en: "the little pig", es: "el cerdito" }],
  [["vache", "cow", "vaca"], "🐮", { fr: "la petite vache", en: "the little cow", es: "la vaquita" }],
  [["poussin", "poule", "chick", "pollito"], "🐥", { fr: "le petit poussin", en: "the little chick", es: "el pollito" }],
  [["renard", "fox", "zorro"], "🦊", { fr: "le petit renard", en: "the little fox", es: "el zorrito" }],
  [["koala"], "🐨", { fr: "le petit koala", en: "the little koala", es: "el koala" }],
  [["souris", "mouse", "raton"], "🐭", { fr: "la petite souris", en: "the little mouse", es: "el ratoncito" }],
  [["robot"], "🤖", { fr: "le petit robot", en: "the little robot", es: "el robotito" }],
  [["extraterrestre", "alien"], "👽", { fr: "le petit extraterrestre", en: "the little alien", es: "el extraterrestre" }],
  [["fee", "fairy", "hada"], "🧚", { fr: "la petite fée", en: "the little fairy", es: "el hada" }],
];

// objets secondaires repérés dans le prompt
const PROPS = {
  carotte: "🥕", carrot: "🥕", zanahoria: "🥕", pomme: "🍎", apple: "🍎", manzana: "🍎",
  fraise: "🍓", strawberry: "🍓", banane: "🍌", banana: "🍌", gateau: "🎂", cake: "🎂",
  ballon: "🎈", balloon: "🎈", globo: "🎈", fleur: "🌸", flower: "🌸", flor: "🌸",
  etoile: "⭐", star: "⭐", estrella: "⭐", fusee: "🚀", rocket: "🚀", cohete: "🚀",
  voiture: "🚗", car: "🚗", coche: "🚗", train: "🚂", tren: "🚂", bateau: "⛵", boat: "⛵",
  oeuf: "🥚", egg: "🥚", huevo: "🥚", coeur: "❤️", heart: "❤️", cadeau: "🎁", gift: "🎁",
  arbre: "🌳", tree: "🌳", soleil: "☀️", sun: "☀️", lune: "🌙", moon: "🌙", livre: "📚", book: "📚",
  balle: "⚽", ball: "⚽", pelota: "⚽", nounours: "🧸", doudou: "🧸", champignon: "🍄", mushroom: "🍄",
};

const DECOR_RULES = [
  [["espace", "space", "planete", "planet", "fusee", "rocket", "espacio", "astronaute"], "space"],
  [["sous l'eau", "ocean", "poisson", "fish", "baleine", "pieuvre", "mer profonde", "underwater", "pez"], "underwater"],
  [["mer", "plage", "beach", "sea", "playa", "vague", "bateau"], "waves"],
  [["nuit", "dodo", "coucher", "dormir", "night", "sleep", "bedtime", "noche", "lune", "moon"], "stars"],
  [["foret", "forest", "bosque", "bois"], "forest"],
  [["ville", "city", "ciudad", "rue"], "city"],
  [["arc-en-ciel", "arc en ciel", "rainbow", "arcoiris", "couleur", "color"], "rainbow"],
  [["ciel", "nuage", "sky", "cloud", "avion", "plane", "voler", "fly"], "clouds"],
];

const STYLE_PALETTES = {
  pastel: [["#FFDEE9", "#B5FFFC"], ["#E0C3FC", "#8EC5FC"], ["#FFF1EB", "#ACE0F9"], ["#FBC2EB", "#A6C1EE"]],
  vif: [["#8EC5FC", "#E0C3FC"], ["#FFE29F", "#FFA99F"], ["#90F7EC", "#32CCBC"], ["#FDEB71", "#F8D800"], ["#CE9FFC", "#7367F0"]],
  nuit: [["#1E1B4B", "#4C1D95"], ["#0F2027", "#2C5364"], ["#232526", "#414345"], ["#141E30", "#243B55"]],
  nature: [["#D4FC79", "#96E6A1"], ["#ABDCFF", "#81FBB8"], ["#FFF6B7", "#C3F584"], ["#A1C4FD", "#C2E9FB"]],
};

const COLORS = {
  fr: [["rouge", "🍎", "#FF6B6B"], ["jaune", "🌞", "#FFD43B"], ["bleu", "🐳", "#4DABF7"], ["vert", "🐸", "#51CF66"], ["orange", "🥕", "#FF922B"], ["violet", "🍇", "#9775FA"], ["rose", "🌸", "#F783AC"]],
  en: [["red", "🍎", "#FF6B6B"], ["yellow", "🌞", "#FFD43B"], ["blue", "🐳", "#4DABF7"], ["green", "🐸", "#51CF66"], ["orange", "🥕", "#FF922B"], ["purple", "🍇", "#9775FA"], ["pink", "🌸", "#F783AC"]],
  es: [["rojo", "🍎", "#FF6B6B"], ["amarillo", "🌞", "#FFD43B"], ["azul", "🐳", "#4DABF7"], ["verde", "🐸", "#51CF66"], ["naranja", "🥕", "#FF922B"], ["morado", "🍇", "#9775FA"], ["rosa", "🌸", "#F783AC"]],
};

const NUM_WORDS = {
  fr: ["un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"],
  en: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"],
  es: ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"],
};

const T = {
  fr: {
    hello: (h) => `Coucou ! C'est ${h} !`,
    helloCap: "Coucou ! 👋",
    today: (h) => `Aujourd'hui, ${h} part à l'aventure.`,
    todayCap: "C'est parti ! ✨",
    look: "Oh ! Qu'est-ce que c'est ?",
    lookCap: "Oh ! Regarde ! 👀",
    friend: (h) => `${cap(h)} se fait un nouvel ami.`,
    friendCap: "Un nouvel ami ! 💛",
    play: "Ils jouent ensemble. Youpi !",
    playCap: "Youpi ! 🎉",
    oops: "Oups ! Un petit souci…",
    oopsCap: "Oups ! 😮",
    fix: "Ensemble, on y arrive toujours !",
    fixCap: "Ensemble ! 🤝",
    dance: "Et maintenant, on danse !",
    danceCap: "On danse ! 💃",
    bye: "Et toi, qu'est-ce que tu as préféré ?",
    byeCap: "Et toi ? 🤗",
    countIntro: "On compte ensemble ?",
    countIntroCap: "On compte ? 🔢",
    count: (n, w) => `${cap(w)} !`,
    countEnd: (n) => `Bravo ! Il y en a ${NUM_WORDS.fr[n - 1]} !`,
    countEndCap: (n) => `Bravo ! ${n} ! 🎉`,
    colorIntro: "Tu connais les couleurs ?",
    colorIntroCap: "Les couleurs ! 🌈",
    color: (c) => `Ça, c'est ${c} !`,
    colorEnd: "Quelle est ta couleur préférée ?",
    colorEndCap: "Ta préférée ? 🎨",
    nightIntro: (h) => `C'est l'heure du dodo pour ${h}.`,
    nightIntroCap: "L'heure du dodo 🌙",
    night1: "On fait un gros câlin.",
    night1Cap: "Un câlin 🤗",
    night2: "On regarde les étoiles briller.",
    night2Cap: "Les étoiles ✨",
    night3: "On ferme les yeux tout doucement.",
    night3Cap: "Chut… 😴",
    nightEnd: "Bonne nuit, fais de beaux rêves.",
    nightEndCap: "Bonne nuit 💤",
    tags: ["#enfants", "#maternelle", "#comptine", "#apprendre", "#dessinanimé", "#shorts"],
    desc: (t) => `${t} — une petite vidéo douce et joyeuse pour les enfants.`,
  },
  en: {
    hello: (h) => `Hi! It's ${h}!`,
    helloCap: "Hello! 👋",
    today: (h) => `Today, ${h} goes on an adventure.`,
    todayCap: "Let's go! ✨",
    look: "Oh! What is that?",
    lookCap: "Oh! Look! 👀",
    friend: (h) => `${cap(h)} makes a new friend.`,
    friendCap: "A new friend! 💛",
    play: "They play together. Yay!",
    playCap: "Yay! 🎉",
    oops: "Oops! A little problem…",
    oopsCap: "Oops! 😮",
    fix: "Together, we can do it!",
    fixCap: "Together! 🤝",
    dance: "And now, let's dance!",
    danceCap: "Let's dance! 💃",
    bye: "What was your favorite part?",
    byeCap: "And you? 🤗",
    countIntro: "Let's count together!",
    countIntroCap: "Let's count! 🔢",
    count: (n, w) => `${cap(w)}!`,
    countEnd: (n) => `Great job! There are ${NUM_WORDS.en[n - 1]}!`,
    countEndCap: (n) => `Great! ${n}! 🎉`,
    colorIntro: "Do you know your colors?",
    colorIntroCap: "Colors! 🌈",
    color: (c) => `This is ${c}!`,
    colorEnd: "What is your favorite color?",
    colorEndCap: "Your favorite? 🎨",
    nightIntro: (h) => `It's bedtime for ${h}.`,
    nightIntroCap: "Bedtime 🌙",
    night1: "Let's have a big hug.",
    night1Cap: "A hug 🤗",
    night2: "Look at the stars shining.",
    night2Cap: "The stars ✨",
    night3: "Close your eyes, nice and slow.",
    night3Cap: "Shhh… 😴",
    nightEnd: "Good night, sweet dreams.",
    nightEndCap: "Good night 💤",
    tags: ["#kids", "#preschool", "#learning", "#nurseryrhyme", "#cartoon", "#shorts"],
    desc: (t) => `${t} — a sweet and happy little video for kids.`,
  },
  es: {
    hello: (h) => `¡Hola! ¡Soy ${h}!`,
    helloCap: "¡Hola! 👋",
    today: (h) => `Hoy, ${h} se va de aventura.`,
    todayCap: "¡Vamos! ✨",
    look: "¡Oh! ¿Qué es eso?",
    lookCap: "¡Mira! 👀",
    friend: (h) => `${cap(h)} hace un nuevo amigo.`,
    friendCap: "¡Un amigo! 💛",
    play: "Juegan juntos. ¡Bien!",
    playCap: "¡Bien! 🎉",
    oops: "¡Uy! Un pequeño problema…",
    oopsCap: "¡Uy! 😮",
    fix: "¡Juntos lo logramos!",
    fixCap: "¡Juntos! 🤝",
    dance: "¡Y ahora, a bailar!",
    danceCap: "¡A bailar! 💃",
    bye: "¿Y a ti, qué te gustó más?",
    byeCap: "¿Y tú? 🤗",
    countIntro: "¿Contamos juntos?",
    countIntroCap: "¿Contamos? 🔢",
    count: (n, w) => `¡${cap(w)}!`,
    countEnd: (n) => `¡Muy bien! ¡Hay ${NUM_WORDS.es[n - 1]}!`,
    countEndCap: (n) => `¡Bravo! ¡${n}! 🎉`,
    colorIntro: "¿Conoces los colores?",
    colorIntroCap: "¡Colores! 🌈",
    color: (c) => `¡Este es el ${c}!`,
    colorEnd: "¿Cuál es tu color favorito?",
    colorEndCap: "¿Tu favorito? 🎨",
    nightIntro: (h) => `Es hora de dormir para ${h}.`,
    nightIntroCap: "A dormir 🌙",
    night1: "Un abrazo muy grande.",
    night1Cap: "Un abrazo 🤗",
    night2: "Mira las estrellas brillar.",
    night2Cap: "Estrellas ✨",
    night3: "Cierra los ojos despacito.",
    night3Cap: "Shhh… 😴",
    nightEnd: "Buenas noches, dulces sueños.",
    nightEndCap: "Buenas noches 💤",
    tags: ["#niños", "#infantil", "#aprender", "#canciones", "#dibujos", "#shorts"],
    desc: (t) => `${t} — un video dulce y alegre para niños.`,
  },
};

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

function findCast(text) {
  const found = [];
  for (const [words, emoji, names] of CAST) {
    const idx = Math.min(...words.map((w) => { const i = text.indexOf(w); return i < 0 ? Infinity : i; }));
    if (idx !== Infinity) found.push({ idx, emoji, names });
  }
  return found.sort((a, b) => a.idx - b.idx);
}

function findProps(text) {
  const out = [];
  for (const [w, e] of Object.entries(PROPS)) if (text.includes(w) && !out.includes(e)) out.push(e);
  return out;
}

function rand(seed) {
  let a = seed >>> 0 || 7;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function seedOf(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

const ANIMS = ["bounce", "float", "wiggle", "pulse", "jump"];
const TRANS = ["fade", "zoom", "slide", "pop", "wipe"];
const CAMS = ["zoom-in", "pan-right", "zoom-out", "pan-left", "static"];

export function localStoryboard({ prompt, age, duration, style, lang }) {
  const L = T[lang] ? lang : "fr";
  const t = T[L];
  const text = norm(prompt);
  const r = rand(seedOf(text + duration + style));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];

  const cast = findCast(text);
  const hero = cast[0] || { emoji: "🐰", names: { fr: "Lapinou", en: "Bunny", es: "Conejito" } };
  const friend = cast[1] || { emoji: pick(["🐥", "🦋", "🐞", "🐸", "🐭"]) };
  const props = findProps(text);
  const heroName = hero.names[L];

  let decor = "hills";
  for (const [words, d] of DECOR_RULES) if (hasAny(text, words.map(norm))) { decor = d; break; }

  const isCount = hasAny(text, ["compt", "count", "contar", "chiffre", "nombre", "number", "numero"]);
  const isColor = hasAny(text, ["couleur", "color", "colour"]);
  const isNight = hasAny(text, ["dodo", "coucher", "dormir", "bedtime", "sleep", "nuit", "night", "noche"]);

  const palettes = STYLE_PALETTES[style] || STYLE_PALETTES.vif;
  const nScenes = Math.max(4, Math.min(10, Math.round(duration / 5)));
  const per = Math.round((duration / nScenes) * 10) / 10;
  const effects = isNight ? ["stars", "sparkles", "none"] : ["sparkles", "confetti", "bubbles", "hearts", "stars", "none"];

  const scene = (narration, caption, chars, extra = {}) => ({
    duration: per,
    narration,
    caption,
    bgTop: extra.bg?.[0] || pick(palettes)[0],
    bgBottom: extra.bg?.[1] || pick(palettes)[1],
    decor: extra.decor || decor,
    effect: extra.effect ?? pick(effects),
    transition: pick(TRANS),
    camera: pick(CAMS),
    textStyle: extra.textStyle || pick(["subtitle", "subtitle", "bubble", "big"]),
    characters: chars,
  });
  const heroC = (x = 0.5, y = 0.55, size = 0.34, anim) => ({ emoji: hero.emoji, x, y, size, anim: anim || pick(ANIMS), enter: pick(["pop", "slide-left", "drop", "rise"]) });

  let scenes = [];
  let mood = "joyeux";
  let title;

  if (isCount) {
    mood = "comptine";
    const obj = props[0] || pick(["⭐", "🍎", "🎈", "🌸"]);
    const words = NUM_WORDS.fr.concat(NUM_WORDS.en, NUM_WORDS.es);
    const target = parseInt((text.match(/\b(\d{1,2})\b/) || [])[1], 10) ||
      (words.findIndex((w) => new RegExp(`jusqu'a ${w}\\b|to ${w}\\b|hasta ${w}\\b`).test(text)) % 10) + 1 || 0;
    const N = target >= 2 && target <= 10 ? target : Math.min(10, Math.max(3, nScenes - 2));
    scenes.push(scene(t.countIntro, t.countIntroCap, [heroC(0.5, 0.55, 0.38, "bounce")], { textStyle: "big", effect: "sparkles" }));
    const bg = pick(palettes);
    for (let n = 1; n <= N; n++) {
      const items = Array.from({ length: n }, (_, k) => ({
        emoji: obj, x: 0.2 + (k % 5) * 0.15, y: 0.36 + Math.floor(k / 5) * 0.13, size: 0.13,
        anim: "pulse", enter: k === n - 1 ? "pop" : "none",
      }));
      scenes.push(scene(t.count(n, NUM_WORDS[L][n - 1]), `${n}`, [heroC(0.5, 0.62, 0.26, "bounce"), ...items], { bg, textStyle: "big", effect: "none" }));
    }
    scenes.push(scene(t.countEnd(N), t.countEndCap(N), [heroC(0.5, 0.55, 0.36, "jump")], { effect: "confetti", decor: "rainbow" }));
    title = { fr: `On compte jusqu'à ${N} avec ${heroName} !`, en: `Count to ${N} with ${heroName}!`, es: `¡Contamos hasta ${N} con ${heroName}!` }[L];
  } else if (isColor) {
    mood = "comptine";
    const cols = COLORS[L].slice(0, Math.max(2, nScenes - 2));
    scenes.push(scene(t.colorIntro, t.colorIntroCap, [heroC(0.5, 0.55, 0.36, "bounce")], { decor: "rainbow", textStyle: "big", effect: "sparkles" }));
    for (const [name, emoji, hex] of cols) {
      scenes.push(scene(t.color(name), `${cap(name)} ${emoji}`, [heroC(0.3, 0.58, 0.26, "wiggle"), { emoji, x: 0.66, y: 0.48, size: 0.28, anim: "pulse", enter: "pop" }], { bg: [hex, "#FFFFFF"], decor: "none", textStyle: "big", effect: "none" }));
    }
    scenes.push(scene(t.colorEnd, t.colorEndCap, [heroC(0.5, 0.55, 0.36, "jump")], { decor: "rainbow", effect: "confetti" }));
    title = { fr: `Les couleurs avec ${heroName} 🌈`, en: `Colors with ${heroName} 🌈`, es: `Los colores con ${heroName} 🌈` }[L];
  } else if (isNight) {
    mood = "calme";
    const bg = STYLE_PALETTES.nuit;
    const beats = [
      [t.nightIntro(heroName), t.nightIntroCap],
      [t.night1, t.night1Cap],
      [t.night2, t.night2Cap],
      [t.night3, t.night3Cap],
    ];
    beats.forEach(([n, c], i) => scenes.push(scene(n, c, i === 1 ? [heroC(0.38, 0.58, 0.3, "float"), { emoji: "🧸", x: 0.66, y: 0.6, size: 0.2, anim: "float", enter: "fade" }] : [heroC(0.5, 0.58, 0.32, "float")], { bg: bg[i % bg.length], decor: "stars", effect: i === 2 ? "sparkles" : "stars" })));
    while (scenes.length < nScenes - 1) scenes.push(scene(t.night2, t.night2Cap, [heroC(0.5, 0.6, 0.28, "float")], { bg: pick(bg), decor: "stars", effect: "stars" }));
    scenes.push(scene(t.nightEnd, t.nightEndCap, [heroC(0.5, 0.6, 0.3, "float"), { emoji: "🌙", x: 0.75, y: 0.3, size: 0.16, anim: "pulse", enter: "fade" }], { bg: bg[0], decor: "stars", effect: "sparkles", textStyle: "big" }));
    scenes.forEach((s) => (s.transition = "fade"));
    const bare = heroName.replace(/^(le |la |l'|the |el |la )/i, "");
    title = { fr: `Bonne nuit, ${bare} 🌙`, en: `Good night, ${bare} 🌙`, es: `Buenas noches, ${bare} 🌙` }[L];
  } else {
    const obj = props[0] || pick(["🎈", "⭐", "🍓", "🎁", "🌸"]);
    const beats = [
      [t.hello(heroName), t.helloCap, [heroC(0.5, 0.55, 0.38, "bounce")], { textStyle: "big", effect: "sparkles" }],
      [t.today(heroName), t.todayCap, [heroC(0.35, 0.58, 0.3, "jump")], {}],
      [t.look, t.lookCap, [heroC(0.3, 0.6, 0.28, "wiggle"), { emoji: obj, x: 0.68, y: 0.45, size: 0.18, anim: "float", enter: "drop" }], { textStyle: "bubble" }],
      [t.friend(heroName), t.friendCap, [heroC(0.32, 0.58, 0.28), { emoji: friend.emoji, x: 0.68, y: 0.58, size: 0.26, anim: "bounce", enter: "slide-right" }], {}],
      [t.play, t.playCap, [heroC(0.32, 0.58, 0.28, "jump"), { emoji: friend.emoji, x: 0.68, y: 0.58, size: 0.26, anim: "jump", enter: "none" }, { emoji: obj, x: 0.5, y: 0.38, size: 0.14, anim: "spin", enter: "pop" }], { effect: "confetti" }],
      [t.oops, t.oopsCap, [heroC(0.4, 0.6, 0.28, "wiggle"), { emoji: obj, x: 0.7, y: 0.32, size: 0.14, anim: "float", enter: "none" }], { effect: "none", camera: "shake" }],
      [t.fix, t.fixCap, [heroC(0.32, 0.58, 0.28, "bounce"), { emoji: friend.emoji, x: 0.68, y: 0.58, size: 0.26, anim: "bounce", enter: "none" }], { effect: "hearts" }],
      [t.dance, t.danceCap, [heroC(0.32, 0.58, 0.28, "spin"), { emoji: friend.emoji, x: 0.68, y: 0.58, size: 0.26, anim: "wiggle", enter: "none" }], { effect: "confetti", decor: "rainbow" }],
    ];
    // choisit les étapes selon la durée en gardant le début et une fin
    const order = nScenes >= 9 ? [0, 1, 2, 3, 4, 5, 6, 7] : nScenes >= 7 ? [0, 1, 2, 3, 4, 6, 7].slice(0, nScenes - 1) : [0, 2, 3, 4, 7].slice(0, nScenes - 1);
    for (const i of order) {
      const [n, c, ch, ex] = beats[i];
      const s = scene(n, c, ch, ex);
      if (ex.camera) s.camera = ex.camera;
      scenes.push(s);
    }
    while (scenes.length < nScenes - 1) {
      const [n, c, ch, ex] = beats[4];
      scenes.push(scene(n, c, ch, ex));
    }
    scenes.push(scene(t.bye, t.byeCap, [heroC(0.5, 0.56, 0.36, "jump")], { effect: "sparkles", textStyle: "big" }));
    title = cap(prompt.trim().replace(/[.!?]+$/, "")).slice(0, 60);
    mood = decor === "space" ? "aventure" : "joyeux";
  }

  // ajuste la somme des durées à la durée visée
  const sum = scenes.reduce((a, s) => a + s.duration, 0);
  const k = duration / sum;
  scenes.forEach((s) => (s.duration = Math.max(2, Math.round(s.duration * k * 2) / 2)));
  scenes[0].transition = "none";

  const kw = cast.slice(0, 2).map((c) => "#" + norm(c.names[L].split(" ").pop()).replace(/[^a-z]/g, ""));
  return {
    title,
    music: { mood, tempo: mood === "calme" ? 78 : mood === "comptine" ? 108 : mood === "aventure" ? 120 : 114 },
    publication: {
      title: title.slice(0, 70),
      description: t.desc(title),
      hashtags: [...new Set([...kw, ...t.tags])].slice(0, 8),
    },
    scenes: scenes.map(sanitizeScene),
  };
}

export const LOCAL_IDEAS = [
  { emoji: "🐰", title: "Lapinou compte", prompt: "Un petit lapin compte jusqu'à 5 avec des carottes dans un jardin ensoleillé." },
  { emoji: "🌈", title: "Les couleurs", prompt: "Une licorne fait découvrir les couleurs de l'arc-en-ciel." },
  { emoji: "🌙", title: "Bonne nuit", prompt: "Un petit ours se prépare pour le dodo sous les étoiles." },
  { emoji: "🦖", title: "Dino et son ami", prompt: "Un petit dinosaure se fait un nouvel ami dans la forêt." },
  { emoji: "🐳", title: "Sous la mer", prompt: "Une petite baleine découvre les poissons sous l'eau." },
  { emoji: "🚀", title: "Voyage dans l'espace", prompt: "Un petit robot part en fusée visiter les planètes." },
  { emoji: "🐥", title: "Compter les œufs", prompt: "Un poussin compte 4 œufs dans la ferme." },
  { emoji: "🐸", title: "La mare joyeuse", prompt: "Une grenouille joue avec un papillon au bord de l'eau." },
];

// Retouches simples sans IA (mots-clés).
export function localEdit(project, instruction, sceneIndex) {
  const i = norm(instruction);
  const targets = sceneIndex == null ? project.scenes : [project.scenes[sceneIndex]];
  let done = false;
  if (hasAny(i, ["court", "rapide", "rythm", "short", "fast"])) {
    targets.forEach((s) => (s.duration = Math.max(2, Math.round(s.duration * 0.75 * 2) / 2)));
    done = true;
  }
  if (hasAny(i, ["long", "lent", "slow"])) {
    targets.forEach((s) => (s.duration = Math.min(12, Math.round(s.duration * 1.25 * 2) / 2)));
    done = true;
  }
  if (hasAny(i, ["drole", "funny", "fun", "rigol"])) {
    targets.forEach((s) => {
      s.characters.forEach((c, k) => (c.anim = ["jump", "wiggle", "spin", "bounce"][k % 4]));
      s.effect = s.effect === "none" ? "confetti" : s.effect;
      s.camera = "shake";
    });
    done = true;
  }
  if (hasAny(i, ["calme", "doux", "douce", "coucher", "calm", "sleep"])) {
    targets.forEach((s) => {
      s.characters.forEach((c) => (c.anim = "float"));
      s.effect = "stars";
      s.transition = "fade";
      s.camera = "zoom-in";
    });
    if (sceneIndex == null) Object.assign(project.music, { mood: "calme", tempo: 78 });
    done = true;
  }
  if (hasAny(i, ["accroche", "hook", "debut"])) {
    const s = project.scenes[0];
    Object.assign(s, { textStyle: "big", effect: "sparkles", camera: "zoom-in" });
    s.characters.forEach((c) => (c.enter = "pop"));
    done = true;
  }
  if (hasAny(i, ["quiz", "question", "devinette"])) {
    const last = project.scenes[project.scenes.length - 1];
    const hero = last.characters[0] || { emoji: "🐰", x: 0.5, y: 0.55, size: 0.3, anim: "bounce", enter: "pop" };
    const q = { fr: "Et toi, tu as bien regardé ? Qui était là ?", en: "Were you watching? Who was there?", es: "¿Miraste bien? ¿Quién estaba?" }[project.lang] || "Et toi, tu as bien regardé ? Qui était là ?";
    project.scenes.push({ ...last, duration: 4, narration: q, caption: "Quiz ! ❓", textStyle: "big", effect: "sparkles", characters: [{ ...hero, x: 0.5, y: 0.55, anim: "wiggle", enter: "pop" }] });
    done = true;
  }
  if (hasAny(i, ["refrain", "repet", "chorus"])) {
    project.scenes.push({ ...JSON.parse(JSON.stringify(project.scenes[0])), transition: "zoom" });
    done = true;
  }
  const m = instruction.match(/\p{Extended_Pictographic}/u);
  if (hasAny(i, ["personnage", "character", "heros"]) || m) {
    const old = project.scenes[0].characters[0]?.emoji;
    const neu = m ? m[0] : ["🐻", "🦊", "🐼", "🦄", "🐸", "🐱"].find((e) => e !== old);
    if (old) project.scenes.forEach((s) => s.characters.forEach((c) => c.emoji === old && (c.emoji = neu)));
    done = true;
  }
  return done;
}

export const LOCAL_EDIT_HELP = "Sans IA, je comprends : plus courte, plus longue, plus drôle, plus calme, accroche, quiz, refrain, changer de personnage (ou mets un emoji).";
