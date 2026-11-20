// Vocabulaire commun entre l'IA, l'éditeur et le moteur de rendu.

export const DECORS = {
  none: "Aucun",
  hills: "Collines",
  clouds: "Nuages",
  stars: "Nuit étoilée",
  waves: "Mer",
  underwater: "Sous l'eau",
  forest: "Forêt",
  city: "Ville",
  rainbow: "Arc-en-ciel",
  space: "Espace",
};

export const EFFECTS = {
  none: "Aucun",
  confetti: "🎉 Confettis",
  bubbles: "🫧 Bulles",
  stars: "⭐ Étoiles",
  snow: "❄️ Neige",
  hearts: "💖 Cœurs",
  rain: "🌧️ Pluie",
  sparkles: "✨ Paillettes",
  leaves: "🍂 Feuilles",
};

export const TRANSITIONS = {
  fade: "Fondu",
  zoom: "Zoom",
  slide: "Glissé",
  pop: "Pop",
  wipe: "Cercle magique",
  none: "Coupe",
};

export const CAMERAS = {
  static: "Fixe",
  "zoom-in": "Zoom avant",
  "zoom-out": "Zoom arrière",
  "pan-left": "Travelling ←",
  "pan-right": "Travelling →",
  shake: "Tremblement doux",
};

export const TEXT_STYLES = {
  subtitle: "Sous-titres",
  big: "Gros titre",
  bubble: "Bulle",
  none: "Sans texte",
};

export const ANIMS = {
  bounce: "Rebond",
  float: "Flotte",
  wiggle: "Se dandine",
  spin: "Tourne",
  pulse: "Bat",
  walk: "Marche",
  jump: "Saute",
  none: "Immobile",
};

export const ENTERS = {
  pop: "Pop",
  "slide-left": "Arrive de gauche",
  "slide-right": "Arrive de droite",
  drop: "Tombe du ciel",
  rise: "Monte du bas",
  fade: "Apparaît",
  none: "Déjà là",
};

export const MOODS = {
  joyeux: "😄 Joyeux",
  comptine: "🎵 Comptine",
  calme: "😴 Calme",
  aventure: "🗺️ Aventure",
  mystere: "🔮 Mystère",
  fete: "🥳 Fête",
};

export const AGES = { "2-4": "2–4 ans", "4-7": "4–7 ans", "7-10": "7–10 ans" };
export const DURATIONS = [15, 30, 45, 60];
export const STYLES = {
  pastel: "🍬 Pastel doux",
  vif: "🌈 Couleurs vives",
  nuit: "🌙 Douce nuit",
  nature: "🌿 Nature",
};
export const LANGS = { fr: "Français", en: "English", es: "Español" };

export const MODELS = {
  "claude-opus-5-5": "Claude Opus 5.5 — meilleure qualité (défaut)",
  "claude-sonnet-5-5": "Claude Sonnet 5.5 — plus rapide",
  "claude-haiku-5-5": "Claude Haiku 5.5 — très économique",
};

export const PALETTES = [
  ["#8EC5FC", "#E0C3FC"],
  ["#FFDEE9", "#B5FFFC"],
  ["#FDEB71", "#F8D800"],
  ["#ABDCFF", "#0396FF"],
  ["#FEB692", "#EA5455"],
  ["#CE9FFC", "#7367F0"],
  ["#90F7EC", "#32CCBC"],
  ["#FFF6B7", "#F6416C"],
  ["#81FBB8", "#28C76F"],
  ["#1E1B4B", "#4C1D95"],
  ["#0F2027", "#2C5364"],
  ["#FFE29F", "#FFA99F"],
];

export const DEFAULT_SCENE = () => ({
  duration: 4,
  narration: "",
  caption: "Nouvelle scène",
  bgTop: "#8EC5FC",
  bgBottom: "#E0C3FC",
  decor: "hills",
  effect: "none",
  transition: "fade",
  camera: "zoom-in",
  textStyle: "subtitle",
  characters: [
    { emoji: "🐰", x: 0.5, y: 0.55, size: 0.3, anim: "bounce", enter: "pop" },
  ],
});
