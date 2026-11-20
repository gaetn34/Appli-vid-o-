# Prompt de passation — Clipou Studio

Copie tout ce qui suit et donne-le à ton autre IA.

---

Tu reprends un projet en cours. Lis tout avant d'agir.

## Le projet
**Clipou Studio** : application mobile personnelle (PWA installable sur téléphone) pour **créer et monter des vidéos courtes pour enfants** au format vertical 9:16 (TikTok, YouTube Shorts) à partir d'un prompt. Interface en français, thème **rose** (fond rose soutenu, éléments en roses plus clairs). Usage strictement personnel.

## Accès
- Dépôt GitHub (public) : **https://github.com/gaetn34/Appli-vid-o-**
- Branche principale : `main` (c'est elle qui est publiée). Branche de travail utilisée jusqu'ici : `claude/beautiful-faraday-966j8y` (identique à `main`).
- Site en ligne (GitHub Pages, publié par GitHub Actions) : **https://gaetn34.github.io/Appli-vid-o-/**
- Publication : chaque push sur `main` relance le workflow `.github/workflows/pages.yml`, qui met le site à jour en ~30 s. Pages est activé avec la source « GitHub Actions ».
- **Aucune clé API ni aucun secret n'existe dans le dépôt.** Ne jamais en mettre : le dépôt et le site sont publics. La clé API Claude de l'utilisateur, s'il en ajoute une, est saisie dans l'appli (Réglages) et stockée uniquement dans le `localStorage` de son téléphone.
- Pour pousser du code, l'utilisateur doit te donner accès à son GitHub (connexion GitHub de ton outil). Tu n'as pas besoin d'autre accès.

## Architecture (HTML/CSS/JS pur, aucune étape de build, aucun serveur)
| Fichier | Rôle |
|---|---|
| `index.html` | Tous les écrans : Créer, Mes vidéos, Réglages, éditeur de montage, chargement, export, verrou PIN |
| `css/styles.css` | Thème rose (variables CSS dans `:root`), mobile d'abord |
| `js/app.js` | Contrôleur : navigation, création, éditeur (timeline, panneaux Scène/Persos/Son/IA/Publier), lecture, glisser-déposer des personnages sur l'aperçu, annuler (historique), enregistrement de voix, export vidéo, réglages, PIN |
| `js/ai.js` | Appels à l'API Claude via le SDK officiel embarqué (`js/vendor/anthropic-sdk-1.6.0.mjs`, `dangerouslyAllowBrowser: true`). Modèle par défaut `claude-opus-5-5` (choix : `claude-sonnet-5-5`, `claude-haiku-5-5`). Sorties structurées `output_config.format` json_schema, `effort: "medium"`, streaming + `finalMessage()`, repli serveur `fallbacks: "default"` + beta `server-side-fallback-2026-07-01` (pas pour Haiku). Gère `stop_reason` refusal / max_tokens et les erreurs typées. Fonctions : `generateStoryboard`, `editStoryboard`, `editScene`, `generateIdeas`, `testKey`, `sanitizeScene`. Le prompt système impose des règles de contenu pour enfants (bienveillant, aucun personnage protégé, pas de données personnelles) et la zone sûre TikTok |
| `js/localgen.js` | **Mode sans IA** (utilisé quand aucune clé n'est enregistrée) : fabrique un storyboard sur le téléphone à partir des mots-clés du prompt (personnage, décor, thèmes comptage / couleurs / dodo / histoire, FR/EN/ES), idées locales (`LOCAL_IDEAS`), retouches par mots-clés (`localEdit` : plus courte, plus longue, drôle, calme, accroche, quiz, refrain, changer de personnage/emoji) |
| `js/renderer.js` | Moteur de rendu canvas 1080×1920, déterministe (même temps t = même image) : fonds en dégradé, décors dessinés (hills, clouds, stars, space, waves, underwater, forest, city, rainbow), personnages emoji animés (entrée + animation en boucle), particules, caméra, transitions, sous-titres karaoké, filigrane, zone sûre |
| `js/audio.js` | Musique générée en Web Audio selon l'ambiance (joyeux, comptine, calme, aventure, mystère, fête), mixage des voix enregistrées, la musique baisse sous la voix, sortie vers l'enregistreur pour l'export |
| `js/constants.js` | Vocabulaire commun (décors, effets, transitions, caméras, animations, ambiances, âges, durées, styles, langues, modèles, palettes) |
| `js/storage.js` | Réglages + projets dans `localStorage` (`clipou.settings.v1`, `clipou.projects.v1`), voix dans IndexedDB (`clipou-media`), hash SHA-256 du PIN |
| `sw.js` | Service worker (réseau d'abord, cache en secours, jamais de cache pour api.anthropic.com). **Incrémenter `VERSION` (actuellement `clipou-v3`) et ajouter tout nouveau fichier JS à `SHELL` à chaque changement.** |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `README.md` | Documentation utilisateur |

Format d'un projet : `{id, title, prompt, age, duration, style, lang, music:{mood,tempo,volume,voiceVolume,enabled}, publication:{title,description,hashtags[]}, scenes:[{id, duration, narration, caption, bgTop, bgBottom, decor, effect, transition, camera, textStyle, characters:[{emoji,x,y,size,anim,enter}]}]}`. Coordonnées de 0 à 1, y = 0 en haut.

## Ce qui est fait et testé (Chromium mobile simulé, API Claude simulée)
- Création par l'IA (requête vérifiée : modèle, json_schema, effort, fallbacks, en-têtes navigateur) et en mode sans IA (5 prompts testés, FR et EN)
- Idées, retouches IA (vidéo entière ou une scène), annuler, glisser-déposer des personnages
- Lecture avec musique, voix de synthèse en aperçu, enregistrement de voix par scène
- Export MP4 720×1280 (ou 1080×1920) via `MediaRecorder` (WebM en secours), téléchargement et partage
- Message d'erreur pour une clé invalide, code PIN, thème rose, publication GitHub Pages

## Pas encore vérifié / limites connues
- **Jamais testé avec une vraie clé API** (l'utilisateur n'en a pas encore). À vérifier dès qu'il en a une : Réglages, puis « Tester la connexion », puis une création complète.
- Pas testé sur un vrai iPhone ou Android (seulement en simulation) : surtout l'export vidéo, le micro et l'installation.
- L'export se fait en temps réel : l'écran doit rester allumé (Wake Lock demandé).
- La voix de synthèse n'est pas enregistrée dans l'export (limite des navigateurs) : seules les voix enregistrées au micro le sont.
- Les visuels sont des emojis et des décors dessinés : pas de génération d'images.

## Préférences de l'utilisateur
- Parle-lui en **français**, simplement, sans jargon. Il utilise surtout son téléphone.
- Il veut que l'appli reste **rose**.
- Il veut pouvoir tester **sans qu'on lui demande sa clé API** : garde le mode sans IA par défaut, la clé reste facultative (Réglages).
- Contenu destiné aux enfants : garde les règles de sécurité du prompt système.

## Pour travailler
- Tester en local : `python3 -m http.server 8000`, puis ouvrir http://localhost:8000 (les modules ES ne marchent pas en `file://`).
- Après une modification : mettre à jour `sw.js` (VERSION + SHELL), pousser sur `main`, vérifier que le workflow « Publier sur GitHub Pages » réussit, puis dire à l'utilisateur de fermer et rouvrir l'appli.
- Ne jamais committer de clé ni de secret.
