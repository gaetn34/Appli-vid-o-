import { Settings, Projects, VoiceStore, uid, sha256 } from "./storage.js";
import * as AI from "./ai.js";
import { localStoryboard, LOCAL_IDEAS, localEdit, LOCAL_EDIT_HELP } from "./localgen.js";
import { drawFrame, drawThumb, totalDuration, sceneStarts, sceneAt, characterBase, W, H } from "./renderer.js";
import { Mixer, audioCtx, decodeBlob } from "./audio.js";
import {
  DECORS, EFFECTS, TRANSITIONS, CAMERAS, TEXT_STYLES, ANIMS, ENTERS, MOODS,
  AGES, DURATIONS, STYLES, LANGS, MODELS, PALETTES, DEFAULT_SCENE,
} from "./constants.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

const state = {
  settings: Settings.get(),
  create: { age: "4-7", duration: 30, style: "vif", lang: Settings.get().lang || "fr" },
  project: null,
  sel: 0,
  t: 0,
  playing: false,
  raf: 0,
  history: [],
  pendingSnap: null,
  voices: new Map(), // sceneId -> AudioBuffer
  showSafe: false,
  aiScope: "all",
  lastSpokenScene: -1,
};

let mixer = null;
const getMixer = () => (mixer ||= new Mixer());

// ---------------------------------------------------------------- UI helpers
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

function fillSelect(sel, obj) {
  sel.innerHTML = Object.entries(obj).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const LOADER_STEPS = [
  ["🐰", "L'IA écrit le scénario…"],
  ["🎨", "Choix des couleurs et du décor…"],
  ["🦄", "Casting des personnages…"],
  ["🎵", "Composition de la petite musique…"],
  ["✂️", "Montage des scènes…"],
  ["✨", "Dernières paillettes…"],
];
let loaderTimer;
function showLoading(on, sub = "") {
  const el = $("#loading");
  el.classList.toggle("hidden", !on);
  clearInterval(loaderTimer);
  if (!on) return;
  let i = 0;
  $("#loaderBar").style.width = "4%";
  $("#loaderSub").textContent = sub;
  const step = () => {
    const [e, t] = LOADER_STEPS[i % LOADER_STEPS.length];
    $("#loaderEmoji").textContent = e;
    $("#loaderText").textContent = t;
    i++;
  };
  step();
  loaderTimer = setInterval(step, 2600);
}
function loadingProgress(chars, expected) {
  $("#loaderBar").style.width = Math.min(96, 6 + (chars / expected) * 90) + "%";
}

// ---------------------------------------------------------------- Verrou
async function initLock() {
  if (!state.settings.pinHash) return;
  $("#lock").classList.remove("hidden");
  const tryUnlock = async () => {
    const h = await sha256($("#pinInput").value);
    if (h === Settings.get().pinHash) {
      $("#lock").classList.add("hidden");
      $("#pinInput").value = "";
    } else {
      $("#pinError").textContent = "Code incorrect";
      $("#pinInput").value = "";
    }
  };
  $("#pinBtn").onclick = tryUnlock;
  $("#pinInput").onkeydown = (e) => e.key === "Enter" && tryUnlock();
  setTimeout(() => $("#pinInput").focus(), 100);
}

// ---------------------------------------------------------------- Navigation
function showView(name) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  $$(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  if (name === "projects") renderProjects();
  window.scrollTo(0, 0);
}

function updateKeyBadge() {
  const ok = !!state.settings.apiKey;
  const b = $("#keyBadge");
  b.textContent = ok ? "IA Claude ✓" : "Mode sans IA";
  b.classList.toggle("ok", ok);
}

// ---------------------------------------------------------------- Écran Créer
function renderChips() {
  const groups = {
    age: Object.entries(AGES),
    duration: DURATIONS.map((d) => [d, d + " s"]),
    style: Object.entries(STYLES),
    lang: Object.entries(LANGS),
  };
  for (const [g, items] of Object.entries(groups)) {
    const box = $(`.chips[data-group="${g}"]`);
    box.innerHTML = items
      .map(([k, v]) => `<button class="chip ${String(state.create[g]) === String(k) ? "active" : ""}" data-k="${k}">${v}</button>`)
      .join("");
    box.onclick = (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      state.create[g] = g === "duration" ? +b.dataset.k : b.dataset.k;
      if (g === "lang") Settings.set({ lang: b.dataset.k });
      renderChips();
    };
  }
}

function showIdeas(ideas) {
  $("#ideas").innerHTML = ideas
    .map((i, n) => `<button class="idea" data-n="${n}"><span class="e">${esc(i.emoji)}</span><span><b>${esc(i.title)}</b><small>${esc(i.prompt)}</small></span></button>`)
    .join("");
  $("#ideas").onclick = (e) => {
    const b = e.target.closest(".idea");
    if (!b) return;
    $("#prompt").value = ideas[+b.dataset.n].prompt;
    $("#ideas").innerHTML = "";
    $("#prompt").scrollIntoView({ behavior: "smooth", block: "center" });
  };
}

async function onIdeas() {
  if (!state.settings.apiKey) {
    showIdeas([...LOCAL_IDEAS].sort(() => Math.random() - 0.5).slice(0, 5));
    return;
  }
  const btn = $("#ideasBtn");
  btn.disabled = true;
  btn.textContent = "💡 Je réfléchis…";
  try {
    const ideas = await AI.generateIdeas({
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      age: state.create.age,
      lang: state.create.lang,
      theme: $("#prompt").value.trim(),
    });
    showIdeas(ideas);
  } catch (err) {
    toast(err.message, 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = "💡 Idées";
  }
}

function newProject(sb, meta) {
  return {
    id: uid("p"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt: meta.prompt || "",
    age: meta.age,
    duration: meta.duration,
    style: meta.style,
    lang: meta.lang,
    title: sb.title,
    music: { mood: sb.music.mood, tempo: sb.music.tempo, volume: 0.55, voiceVolume: 1, enabled: true },
    publication: sb.publication,
    scenes: sb.scenes.map((s) => ({ id: uid("s"), ...s })),
  };
}

async function onGenerate() {
  const prompt = $("#prompt").value.trim();
  if (!prompt) {
    toast("Écris ton idée de vidéo d'abord ✍️");
    $("#prompt").focus();
    return;
  }
  audioCtx().resume?.(); // débloque l'audio sur iOS pendant le geste utilisateur
  const useAI = !!state.settings.apiKey;
  showLoading(true, `${AGES[state.create.age]} · ${state.create.duration} s${useAI ? "" : " · mode sans IA"}`);
  try {
    if (!useAI) {
      for (let k = 1; k <= 6; k++) {
        await new Promise((r) => setTimeout(r, 220));
        loadingProgress(k, 6);
      }
      const sb = localStoryboard({ prompt, ...state.create });
      const p = newProject(sb, { prompt, ...state.create });
      Projects.save(p);
      showLoading(false);
      openEditor(p);
      toast("Vidéo créée sans IA ✨ Appuie sur ▶");
      return;
    }
    const sb = await AI.generateStoryboard({
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      prompt,
      ...state.create,
      onProgress: (c) => loadingProgress(c, 900 + state.create.duration * 110),
    });
    const p = newProject(sb, { prompt, ...state.create });
    Projects.save(p);
    showLoading(false);
    openEditor(p);
    toast("Ta vidéo est prête ! Appuie sur ▶");
  } catch (err) {
    showLoading(false);
    toast(err.message, 5000);
  }
}

function onBlank() {
  const p = newProject(
    {
      title: "Ma nouvelle vidéo",
      music: { mood: "joyeux", tempo: 112 },
      publication: { title: "", description: "", hashtags: ["#enfants", "#shorts"] },
      scenes: [DEFAULT_SCENE()],
    },
    { ...state.create }
  );
  Projects.save(p);
  openEditor(p);
}

// ---------------------------------------------------------------- Projets
function renderProjects() {
  const list = Projects.list();
  const box = $("#projectList");
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="big">🎞️</div>Aucune vidéo pour l'instant.<br>Crée ta première dans l'onglet ✨</div>`;
    return;
  }
  box.innerHTML = list
    .map(
      (p) => `<div class="project" data-id="${p.id}">
        <canvas width="180" height="320"></canvas>
        <div class="meta"><b>${esc(p.title)}</b><small>${Math.round(totalDuration(p))} s · ${new Date(p.updatedAt).toLocaleDateString("fr-FR")}</small></div>
        <div class="acts"><button class="btn ghost tiny" data-act="dup">⧉</button><button class="btn danger tiny" data-act="del">🗑</button></div>
      </div>`
    )
    .join("");
  $$(".project", box).forEach((el) => {
    const p = list.find((x) => x.id === el.dataset.id);
    if (p.scenes[0]) drawThumb($("canvas", el), p.scenes[0]);
  });
  box.onclick = async (e) => {
    const card = e.target.closest(".project");
    if (!card) return;
    const p = Projects.get(card.dataset.id);
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "del") {
      if (!confirm(`Supprimer « ${p.title} » ?`)) return;
      Projects.remove(p.id);
      await VoiceStore.removeProject(p.id).catch(() => {});
      renderProjects();
    } else if (act === "dup") {
      const c = clone(p);
      c.id = uid("p");
      c.title = p.title + " (copie)";
      c.scenes.forEach((s) => (s.id = uid("s")));
      Projects.save(c);
      renderProjects();
      toast("Copie créée (sans les voix enregistrées)");
    } else {
      openEditor(p);
    }
  };
}

// ---------------------------------------------------------------- Éditeur
const stage = $("#stage");
const sctx = stage.getContext("2d");

function scene() {
  return state.project.scenes[state.sel];
}

function drawNow() {
  if (!state.project) return;
  drawFrame(sctx, state.project, state.t, {
    channelName: state.settings.channelName,
    showSafeZone: state.showSafe && !state.playing,
  });
  const total = totalDuration(state.project);
  $("#timeLabel").textContent = fmt(state.t);
  $("#totalLabel").textContent = fmt(total);
  $("#scrub").value = total ? Math.round((state.t / total) * 1000) : 0;
}

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (state.project && !Projects.save(state.project)) toast("Stockage plein : supprime d'anciennes vidéos");
  }, 300);
}

// Historique (annuler)
function pushHistory(snap = JSON.stringify(state.project)) {
  state.history.push(snap);
  if (state.history.length > 40) state.history.shift();
}
function captureSnap() {
  if (state.pendingSnap == null) state.pendingSnap = JSON.stringify(state.project);
}
function flushSnap() {
  if (state.pendingSnap != null && state.pendingSnap !== JSON.stringify(state.project)) pushHistory(state.pendingSnap);
  state.pendingSnap = null;
}
function undo() {
  const snap = state.history.pop();
  if (!snap) return toast("Rien à annuler");
  pause();
  state.project = JSON.parse(snap);
  state.sel = Math.min(state.sel, state.project.scenes.length - 1);
  refreshAll();
  persist();
  toast("Annulé ↶");
}

function changed({ structure = false } = {}) {
  persist();
  if (structure) renderTimeline();
  else updateThumb(state.sel);
  if (!state.playing) drawNow();
}

function seekToScene(i) {
  const starts = sceneStarts(state.project);
  const s = state.project.scenes[i];
  state.t = starts[i] + Math.min(s.duration - 0.05, 0.75 + 0.18 * s.characters.length);
  drawNow();
}

function selectScene(i, { seek = true } = {}) {
  state.sel = Math.max(0, Math.min(i, state.project.scenes.length - 1));
  $$(".clip[data-i]").forEach((c) => c.classList.toggle("active", +c.dataset.i === state.sel));
  const active = $(`.clip[data-i="${state.sel}"]`);
  active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  renderScenePanel();
  renderCast();
  if (seek && !state.playing) seekToScene(state.sel);
}

async function openEditor(p) {
  state.project = clone(p);
  state.project.music ||= { mood: "joyeux", tempo: 110, volume: 0.55, voiceVolume: 1, enabled: true };
  state.history = [];
  state.sel = 0;
  state.t = 0;
  state.voices = new Map();
  $("#editor").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  $("#dragHint").classList.remove("gone");
  setTimeout(() => $("#dragHint").classList.add("gone"), 3500);
  refreshAll();
  // fontes prêtes -> redessiner
  document.fonts?.load('700 80px "Fredoka"').then(() => { drawNow(); renderTimeline(); }).catch(() => {});
  loadVoices();
}

function closeEditor() {
  pause();
  if (state.project) Projects.save(state.project);
  state.project = null;
  $("#editor").classList.add("hidden");
  document.body.style.overflow = "";
  showView("projects");
}

async function loadVoices() {
  const p = state.project;
  for (const s of p.scenes) {
    try {
      const blob = await VoiceStore.get(`${p.id}:${s.id}`);
      if (blob) state.voices.set(s.id, await decodeBlob(blob));
    } catch (e) {
      console.warn("voix illisible", e);
    }
  }
  if (state.project === p) {
    renderTimeline();
    renderScenePanel();
  }
}

function refreshAll() {
  $("#edTitle").value = state.project.title;
  renderTimeline();
  renderScenePanel();
  renderCast();
  renderSound();
  renderPublish();
  seekToScene(state.sel);
}

// Timeline
function renderTimeline() {
  const tl = $("#timeline");
  const p = state.project;
  tl.innerHTML =
    p.scenes
      .map(
        (s, i) => `<div class="clip ${i === state.sel ? "active" : ""}" data-i="${i}">
          <canvas width="98" height="172" style="width:49px"></canvas>
          <span class="num">${i + 1}</span><span class="dur">${s.duration}s</span>
          ${state.voices.has(s.id) ? '<span class="mic">🎙️</span>' : ""}
        </div>`
      )
      .join("") + `<div class="clip add" id="addScene" title="Ajouter une scène">＋</div>`;
  $$(".clip[data-i]", tl).forEach((el) => drawThumb($("canvas", el), p.scenes[+el.dataset.i]));
  $("#totalLabel").textContent = fmt(totalDuration(p));
}

let thumbTimer;
function updateThumb(i) {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => {
    const el = $(`.clip[data-i="${i}"]`);
    const s = state.project?.scenes[i];
    if (!el || !s) return;
    drawThumb($("canvas", el), s);
    $(".dur", el).textContent = s.duration + "s";
  }, 120);
}

$("#timeline").addEventListener("click", (e) => {
  if (e.target.closest("#addScene")) {
    pushHistory();
    const base = scene() ? clone(scene()) : DEFAULT_SCENE();
    const ns = { ...DEFAULT_SCENE(), bgTop: base.bgTop, bgBottom: base.bgBottom, decor: base.decor, id: uid("s") };
    ns.characters = base.characters?.length ? [clone(base.characters[0])] : ns.characters;
    state.project.scenes.splice(state.sel + 1, 0, ns);
    changed({ structure: true });
    selectScene(state.sel + 1);
    return;
  }
  const c = e.target.closest(".clip[data-i]");
  if (c) {
    if (state.playing) pause();
    selectScene(+c.dataset.i);
  }
});

// Panneau Scène
function renderScenePanel() {
  const s = scene();
  if (!s) return;
  $("#fCaption").value = s.caption;
  $("#fNarration").value = s.narration;
  $("#fDuration").value = s.duration;
  $("#durLabel").textContent = s.duration + " s";
  $("#fTextStyle").value = s.textStyle;
  $("#fDecor").value = s.decor;
  $("#fEffect").value = s.effect;
  $("#fCamera").value = s.camera;
  $("#fTransition").value = s.transition;
  $("#fBgTop").value = s.bgTop;
  $("#fBgBottom").value = s.bgBottom;
  const hasVoice = state.voices.has(s.id);
  $("#voicePlay").classList.toggle("hidden", !hasVoice);
  $("#voiceDel").classList.toggle("hidden", !hasVoice);
  if (!recorder) $("#recBtn").textContent = hasVoice ? "🎙️ Réenregistrer" : "🎙️ Enregistrer ma voix";
}

function bindField(sel, key, { num = false, event = "input" } = {}) {
  const el = $(sel);
  el.addEventListener("focus", captureSnap);
  el.addEventListener("pointerdown", captureSnap);
  el.addEventListener(event, () => {
    captureSnap();
    scene()[key] = num ? +el.value : el.value;
    if (key === "duration") {
      $("#durLabel").textContent = el.value + " s";
      changed({ structure: false });
      $("#totalLabel").textContent = fmt(totalDuration(state.project));
    } else changed();
    if (["caption", "textStyle", "camera", "effect", "decor", "transition"].includes(key) && !state.playing) {
      // montre l'effet du changement
      const starts = sceneStarts(state.project);
      if (key === "transition") state.t = starts[state.sel] + 0.3;
      drawNow();
    }
  });
  el.addEventListener("change", flushSnap);
  el.addEventListener("blur", flushSnap);
}

function initScenePanel() {
  fillSelect($("#fTextStyle"), TEXT_STYLES);
  fillSelect($("#fDecor"), DECORS);
  fillSelect($("#fEffect"), EFFECTS);
  fillSelect($("#fCamera"), CAMERAS);
  fillSelect($("#fTransition"), TRANSITIONS);
  bindField("#fCaption", "caption");
  bindField("#fNarration", "narration");
  bindField("#fDuration", "duration", { num: true });
  bindField("#fTextStyle", "textStyle", { event: "change" });
  bindField("#fDecor", "decor", { event: "change" });
  bindField("#fEffect", "effect", { event: "change" });
  bindField("#fCamera", "camera", { event: "change" });
  bindField("#fTransition", "transition", { event: "change" });
  bindField("#fBgTop", "bgTop");
  bindField("#fBgBottom", "bgBottom");

  $("#palettes").innerHTML = PALETTES.map(
    ([a, b], i) => `<button data-i="${i}" style="background:linear-gradient(${a},${b})" aria-label="Palette ${i + 1}"></button>`
  ).join("");
  $("#palettes").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    pushHistory();
    const [a, c] = PALETTES[+b.dataset.i];
    Object.assign(scene(), { bgTop: a, bgBottom: c });
    renderScenePanel();
    changed();
  };

  $("#sLeft").onclick = () => moveScene(-1);
  $("#sRight").onclick = () => moveScene(1);
  $("#sDup").onclick = () => {
    pushHistory();
    const c = { ...clone(scene()), id: uid("s") };
    state.project.scenes.splice(state.sel + 1, 0, c);
    changed({ structure: true });
    selectScene(state.sel + 1);
  };
  $("#sDel").onclick = () => {
    if (state.project.scenes.length <= 1) return toast("Il faut au moins une scène");
    pushHistory();
    state.project.scenes.splice(state.sel, 1);
    state.sel = Math.min(state.sel, state.project.scenes.length - 1);
    changed({ structure: true });
    selectScene(state.sel);
    toast("Scène supprimée (↶ pour annuler)");
  };

  $("#ttsBtn").onclick = () => speak(scene().narration || scene().caption);
  $("#recBtn").onclick = toggleRecord;
  $("#voicePlay").onclick = () => {
    const buf = state.voices.get(scene().id);
    if (!buf) return;
    const ac = audioCtx();
    ac.resume?.();
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start();
  };
  $("#voiceDel").onclick = async () => {
    const s = scene();
    state.voices.delete(s.id);
    await VoiceStore.remove(`${state.project.id}:${s.id}`).catch(() => {});
    renderScenePanel();
    renderTimeline();
    toast("Voix supprimée");
  };
}

function moveScene(dir) {
  const i = state.sel, j = i + dir;
  const arr = state.project.scenes;
  if (j < 0 || j >= arr.length) return;
  pushHistory();
  [arr[i], arr[j]] = [arr[j], arr[i]];
  state.sel = j;
  changed({ structure: true });
  selectScene(j);
}

// Voix de synthèse (aperçu)
const LANG_CODES = { fr: "fr-FR", en: "en-US", es: "es-ES" };
function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LANG_CODES[state.project?.lang] || "fr-FR";
  u.rate = 0.95;
  u.pitch = 1.15;
  speechSynthesis.speak(u);
}

// Enregistrement de la voix
let recorder = null;
async function toggleRecord() {
  if (recorder) {
    recorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) return toast("Micro non disponible sur ce navigateur");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    return toast("Autorise le micro pour enregistrer ta voix");
  }
  const s = scene();
  const p = state.project;
  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    recorder = null;
    $("#recBtn").classList.remove("danger");
    const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
    try {
      const buf = await decodeBlob(blob);
      await VoiceStore.put(`${p.id}:${s.id}`, blob);
      state.voices.set(s.id, buf);
      if (buf.duration > s.duration - 0.2) {
        pushHistory();
        s.duration = Math.ceil((buf.duration + 0.5) * 2) / 2;
        toast(`Durée de la scène ajustée à ${s.duration} s pour ta voix`);
      } else toast("Voix enregistrée 🎙️");
      if (state.project === p) {
        renderScenePanel();
        renderTimeline();
        persist();
      }
    } catch (e) {
      toast("Enregistrement illisible, réessaie");
    }
  };
  recorder.start();
  $("#recBtn").textContent = "⏹ Arrêter (lis ta narration)";
  $("#recBtn").classList.add("danger");
}

// Panneau Personnages
const EMOJIS = "🐰🐻🐼🦊🐱🐶🐸🦁🐯🐨🐷🐮🐵🦄🐲🦖🐢🐙🐳🐬🦋🐝🐞🐥🦉🐧🐘🦒👧👦👶🧚🤖👽🚀🛸🌈☀️🌙⭐🌸🌳🍎🥕🍓🍌🎈🎁🧸⚽🚗🚂🏰🎵❤️💧🔵🔴🟡🟢1️⃣2️⃣3️⃣4️⃣5️⃣";
function splitEmojis(str) {
  if (window.Intl?.Segmenter) return [...new Intl.Segmenter("fr", { granularity: "grapheme" }).segment(str)].map((s) => s.segment);
  return [...str];
}

function renderCast() {
  const s = scene();
  if (!s) return;
  const box = $("#castList");
  if (!s.characters.length) {
    box.innerHTML = `<p class="hint">Aucun personnage dans cette scène.</p>`;
    return;
  }
  const opt = (obj, v) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${l}</option>`).join("");
  box.innerHTML = s.characters
    .map(
      (c, i) => `<div class="cast" data-i="${i}">
        <div class="em">${esc(c.emoji)}</div>
        <div class="ctrls">
          <select data-k="anim">${opt(ANIMS, c.anim)}</select>
          <select data-k="enter">${opt(ENTERS, c.enter)}</select>
          <button class="btn danger tiny" data-act="del">✕</button>
        </div>
        <div class="sz">Taille <input type="range" data-k="size" min="0.06" max="0.6" step="0.01" value="${c.size}" /></div>
      </div>`
    )
    .join("");
}

function initCast() {
  const box = $("#castList");
  box.addEventListener("pointerdown", captureSnap);
  box.addEventListener("input", (e) => {
    const row = e.target.closest(".cast");
    const k = e.target.dataset.k;
    if (!row || !k) return;
    captureSnap();
    const c = scene().characters[+row.dataset.i];
    c[k] = k === "size" ? +e.target.value : e.target.value;
    changed();
    if (k === "enter" || k === "anim") {
      // rejoue le début de la scène pour voir l'effet
      state.t = sceneStarts(state.project)[state.sel] + (k === "enter" ? 0.25 : 1.2);
      drawNow();
    }
  });
  box.addEventListener("change", flushSnap);
  box.addEventListener("click", (e) => {
    const row = e.target.closest(".cast");
    if (!row) return;
    if (e.target.closest('[data-act="del"]')) {
      pushHistory();
      scene().characters.splice(+row.dataset.i, 1);
      renderCast();
      changed();
    } else if (e.target.closest(".em")) {
      const v = prompt("Nouvel emoji pour ce personnage :", scene().characters[+row.dataset.i].emoji);
      if (v && v.trim()) {
        pushHistory();
        scene().characters[+row.dataset.i].emoji = splitEmojis(v.trim())[0];
        renderCast();
        changed();
      }
    }
  });

  $("#emojiPicker").innerHTML = splitEmojis(EMOJIS).map((e) => `<button>${e}</button>`).join("");
  $("#emojiPicker").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) addCharacter(b.textContent);
  };
  $("#addEmoji").onclick = () => {
    const v = $("#customEmoji").value.trim();
    if (!v) return;
    addCharacter(splitEmojis(v)[0]);
    $("#customEmoji").value = "";
  };
}

function addCharacter(emoji) {
  pushHistory();
  const s = scene();
  const n = s.characters.length;
  s.characters.push({ emoji, x: [0.5, 0.3, 0.7, 0.4, 0.6][n % 5], y: 0.5 + (n % 2) * 0.08, size: 0.22, anim: "bounce", enter: "pop" });
  renderCast();
  changed();
  seekToScene(state.sel);
  toast(`${emoji} ajouté — fais-le glisser sur l'image`);
}

// Glisser les personnages directement sur l'aperçu
let drag = null;
stage.addEventListener("pointerdown", (e) => {
  if (!state.project) return;
  const r = stage.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W;
  const y = ((e.clientY - r.top) / r.height) * H;
  drag = { startX: e.clientX, startY: e.clientY, moved: false, ci: -1 };
  if (!state.playing) {
    const { index } = sceneAt(state.project, state.t);
    const s = state.project.scenes[index];
    for (let i = s.characters.length - 1; i >= 0; i--) {
      const b = characterBase(s.characters[i]);
      if (Math.hypot(b.x - x, b.y - y) < b.size * 0.55) {
        if (index !== state.sel) selectScene(index, { seek: false });
        drag.ci = i;
        drag.dx = b.x - x;
        drag.dy = b.y - y;
        captureSnap();
        stage.setPointerCapture(e.pointerId);
        break;
      }
    }
  }
});
stage.addEventListener("pointermove", (e) => {
  if (!drag || drag.ci < 0) return;
  if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4) drag.moved = true;
  const r = stage.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W + drag.dx;
  const y = ((e.clientY - r.top) / r.height) * H + drag.dy;
  const c = scene().characters[drag.ci];
  c.x = Math.max(0, Math.min(1, x / W));
  c.y = Math.max(0, Math.min(1, y / H));
  drawNow();
});
stage.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const wasDrag = drag.ci >= 0 && drag.moved;
  const tap = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 8;
  drag = null;
  $("#dragHint").classList.add("gone");
  if (wasDrag) {
    flushSnap();
    changed();
  } else {
    state.pendingSnap = null;
    if (tap) togglePlay();
  }
});

// Panneau Son
function renderSound() {
  const m = state.project.music;
  $("#musicOn").checked = m.enabled !== false;
  $("#tempo").value = m.tempo;
  $("#tempoLabel").textContent = m.tempo;
  $("#musicVol").value = m.volume ?? 0.55;
  $("#voiceVol").value = m.voiceVolume ?? 1;
  $("#moodChips").innerHTML = Object.entries(MOODS)
    .map(([k, v]) => `<button class="chip ${k === m.mood ? "active" : ""}" data-k="${k}">${v}</button>`)
    .join("");
}
function initSound() {
  const restartIfPlaying = () => {
    if (state.playing) { pause(); play(); }
  };
  $("#moodChips").onclick = (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    pushHistory();
    state.project.music.mood = b.dataset.k;
    renderSound();
    persist();
    restartIfPlaying();
  };
  $("#musicOn").onchange = (e) => { state.project.music.enabled = e.target.checked; persist(); restartIfPlaying(); };
  $("#tempo").oninput = (e) => { state.project.music.tempo = +e.target.value; $("#tempoLabel").textContent = e.target.value; persist(); };
  $("#tempo").onchange = restartIfPlaying;
  $("#musicVol").oninput = (e) => { state.project.music.volume = +e.target.value; persist(); };
  $("#musicVol").onchange = restartIfPlaying;
  $("#voiceVol").oninput = (e) => { state.project.music.voiceVolume = +e.target.value; persist(); };
  $("#voiceVol").onchange = restartIfPlaying;
}

// Panneau IA
const AI_SUGGESTIONS = [
  "Rends-la plus drôle",
  "Plus courte et plus rythmée",
  "Ajoute un quiz à la fin",
  "Ajoute un refrain à répéter",
  "Plus calme pour le coucher",
  "Change le personnage principal",
  "Traduis en anglais",
  "Rends l'accroche plus forte",
];
function initAIPanel() {
  $("#aiSuggestions").innerHTML = AI_SUGGESTIONS.map((s) => `<button class="chip">${s}</button>`).join("");
  $("#aiSuggestions").onclick = (e) => {
    const b = e.target.closest(".chip");
    if (b) $("#aiInstruction").value = b.textContent;
  };
  $("#aiScope").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.aiScope = b.dataset.scope;
    $$("#aiScope button").forEach((x) => x.classList.toggle("active", x === b));
  };
  $("#aiApply").onclick = onAIApply;
}

async function onAIApply() {
  const instruction = $("#aiInstruction").value.trim();
  if (!instruction) return toast("Dis ce qu'il faut changer ✍️");
  pause();
  if (!state.settings.apiKey) {
    const snap = JSON.stringify(state.project);
    const ok = localEdit(state.project, instruction, state.aiScope === "scene" ? state.sel : null);
    if (!ok) return toast(LOCAL_EDIT_HELP, 6000);
    pushHistory(snap);
    state.project.scenes.forEach((s) => (s.id ||= uid("s")));
    state.sel = Math.min(state.sel, state.project.scenes.length - 1);
    refreshAll();
    persist();
    $("#aiInstruction").value = "";
    toast("Modification appliquée ✨ (↶ pour annuler)");
    return;
  }
  const p = state.project;
  const scope = state.aiScope;
  showLoading(true, scope === "all" ? "Retouche de toute la vidéo" : `Retouche de la scène ${state.sel + 1}`);
  try {
    const common = { apiKey: state.settings.apiKey, model: state.settings.model, project: p, instruction };
    if (scope === "scene") {
      const ns = await AI.editScene({ ...common, sceneIndex: state.sel, onProgress: (c) => loadingProgress(c, 700) });
      if (state.project !== p) return;
      pushHistory();
      p.scenes[state.sel] = { id: p.scenes[state.sel].id, ...ns };
    } else {
      const sb = await AI.editStoryboard({ ...common, onProgress: (c) => loadingProgress(c, 900 + totalDuration(p) * 110) });
      if (state.project !== p) return;
      pushHistory();
      p.title = sb.title;
      p.music = { ...p.music, mood: sb.music.mood, tempo: sb.music.tempo };
      p.publication = sb.publication;
      p.scenes = sb.scenes.map((s, i) => ({ id: p.scenes[i]?.id || uid("s"), ...s }));
      if (/anglais|english/i.test(instruction)) p.lang = "en";
      else if (/espagnol|spanish|español/i.test(instruction)) p.lang = "es";
    }
    state.sel = Math.min(state.sel, p.scenes.length - 1);
    refreshAll();
    persist();
    $("#aiInstruction").value = "";
    toast("Modification appliquée ✨ (↶ pour annuler)");
  } catch (err) {
    toast(err.message, 5000);
  } finally {
    showLoading(false);
  }
}

// Panneau Publier
function renderPublish() {
  const pub = state.project.publication || { title: "", description: "", hashtags: [] };
  $("#pTitle").value = pub.title;
  $("#pDesc").value = pub.description;
  $("#pTags").value = (pub.hashtags || []).join(" ");
}
function initPublish() {
  const sync = () => {
    state.project.publication = {
      title: $("#pTitle").value,
      description: $("#pDesc").value,
      hashtags: $("#pTags").value.split(/\s+/).filter(Boolean),
    };
    persist();
  };
  ["#pTitle", "#pDesc", "#pTags"].forEach((s) => $(s).addEventListener("input", sync));
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copié 📋");
    } catch {
      toast("Copie impossible sur ce navigateur");
    }
  };
  $$(".copy").forEach((b) => (b.onclick = () => copy($("#" + b.dataset.copy).value)));
  $("#copyAll").onclick = () => copy(`${$("#pTitle").value}\n\n${$("#pDesc").value}\n\n${$("#pTags").value}`);
}

// ---------------------------------------------------------------- Lecture
function voiceList() {
  const starts = sceneStarts(state.project);
  return state.project.scenes
    .map((s, i) => (state.voices.has(s.id) ? { start: starts[i] + 0.15, buffer: state.voices.get(s.id) } : null))
    .filter(Boolean);
}

function play() {
  if (!state.project || state.playing) return;
  const total = totalDuration(state.project);
  if (state.t >= total - 0.1) state.t = 0;
  const ac = audioCtx();
  ac.resume?.();
  const offset = state.t;
  const when = getMixer().play({ project: state.project, offset, voices: voiceList() });
  const startAt = when - offset;
  state.playing = true;
  state.lastSpokenScene = -1;
  $("#playBtn").textContent = "❚❚";
  $("#dragHint").classList.add("gone");

  const loop = () => {
    if (!state.playing) return;
    state.t = Math.max(offset, ac.currentTime - startAt);
    if (state.t >= total) {
      state.t = total;
      pause();
      state.t = 0;
      drawNow();
      return;
    }
    const { index, local } = sceneAt(state.project, state.t);
    if (index !== state.sel) selectScene(index, { seek: false });
    if (
      state.settings.ttsPreview && index !== state.lastSpokenScene && local < 0.6 &&
      !state.voices.has(state.project.scenes[index].id)
    ) {
      speak(state.project.scenes[index].narration);
    }
    if (index !== state.lastSpokenScene) state.lastSpokenScene = index;
    drawNow();
    state.raf = requestAnimationFrame(loop);
  };
  loop();
}

function pause() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(state.raf);
  mixer?.stop();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $("#playBtn").textContent = "▶";
  drawNow();
}

function togglePlay() {
  state.playing ? pause() : play();
}

// ---------------------------------------------------------------- Export vidéo
function pickMime() {
  const cands = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return cands.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
}

let exportJob = null;
async function onExport() {
  if (!state.project) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    return toast("Export non supporté par ce navigateur (essaie Chrome ou Safari récent)", 5000);
  }
  pause();
  const project = clone(state.project);
  const total = totalDuration(project);
  const q = state.settings.quality === "1080" ? 1080 : 720;
  const canvas = document.createElement("canvas");
  canvas.width = q;
  canvas.height = Math.round((q * 16) / 9);
  canvas.style.cssText = "width:120px;border-radius:10px;margin:8px auto;display:block";
  const ctx = canvas.getContext("2d");

  const modal = $("#exportModal");
  modal.classList.remove("hidden");
  $("#exportTitle").textContent = "Export en cours… 🎞️";
  $("#exportHint").textContent = `Garde l'écran allumé et l'app ouverte (${Math.ceil(total)} s, en temps réel).`;
  $("#exportBar").style.width = "0%";
  $("#exportVideo").classList.add("hidden");
  $("#downloadLink").classList.add("hidden");
  $("#shareBtn").classList.add("hidden");
  $("#exportClose").textContent = "Annuler";
  $(".export-card canvas")?.remove();
  $("#exportBar").parentElement.after(canvas);

  try { await document.fonts?.load('700 80px "Fredoka"'); } catch {}
  let wake = null;
  try { wake = await navigator.wakeLock?.request("screen"); } catch {}

  const ac = audioCtx();
  await ac.resume?.();
  const mx = getMixer();
  const audioStream = mx.enableRecording();
  drawFrame(ctx, project, 0, { channelName: state.settings.channelName });
  const stream = canvas.captureStream(30);
  audioStream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = pickMime();
  const rec = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: q === 1080 ? 8_000_000 : 5_000_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const job = { cancelled: false };
  exportJob = job;

  const voices = (() => {
    const starts = sceneStarts(project);
    return project.scenes
      .map((s, i) => (state.voices.has(s.id) ? { start: starts[i] + 0.15, buffer: state.voices.get(s.id) } : null))
      .filter(Boolean);
  })();

  const finished = new Promise((resolve) => (rec.onstop = resolve));
  rec.start(500);
  const when = mx.play({ project, offset: 0, voices });

  await new Promise((resolve) => {
    const loop = () => {
      if (job.cancelled) return resolve();
      const t = Math.max(0, ac.currentTime - when);
      drawFrame(ctx, project, Math.min(t, total - 0.001), { channelName: state.settings.channelName });
      $("#exportBar").style.width = Math.min(100, (t / total) * 100) + "%";
      if (t >= total + 0.2) return resolve();
      requestAnimationFrame(loop);
    };
    loop();
  });
  mx.stop();
  rec.stop();
  await finished;
  mx.disableRecording();
  stream.getTracks().forEach((t) => t.stop());
  try { await wake?.release(); } catch {}
  canvas.remove();
  exportJob = null;
  if (job.cancelled) {
    modal.classList.add("hidden");
    return;
  }

  const type = (rec.mimeType || mime || "video/webm").split(";")[0];
  const ext = type.includes("mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type });
  const url = URL.createObjectURL(blob);
  const name = (project.title || "video").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "") || "video";
  const file = new File([blob], `${name}.${ext}`, { type });

  $("#exportTitle").textContent = "Ta vidéo est prête ! 🎉";
  $("#exportHint").textContent =
    ext === "mp4"
      ? "Format MP4 vertical, prêt pour TikTok et YouTube Shorts."
      : "Format WebM : si ton app ne l'accepte pas, ouvre-le dans CapCut pour le convertir en MP4.";
  const video = $("#exportVideo");
  video.src = url;
  video.classList.remove("hidden");
  const dl = $("#downloadLink");
  dl.href = url;
  dl.download = file.name;
  dl.classList.remove("hidden");
  if (navigator.canShare?.({ files: [file] })) {
    $("#shareBtn").classList.remove("hidden");
    $("#shareBtn").onclick = () =>
      navigator.share({ files: [file], title: project.publication?.title || project.title, text: (project.publication?.hashtags || []).join(" ") }).catch(() => {});
  }
  $("#exportClose").textContent = "Fermer";
}

$("#exportClose").onclick = () => {
  if (exportJob) exportJob.cancelled = true;
  else {
    $("#exportModal").classList.add("hidden");
    const v = $("#exportVideo");
    v.pause();
    if (v.src) URL.revokeObjectURL(v.src);
    v.removeAttribute("src");
  }
};

// ---------------------------------------------------------------- Réglages
function initSettings() {
  const s = state.settings;
  fillSelect($("#model"), MODELS);
  $("#apiKey").value = s.apiKey;
  $("#model").value = s.model in MODELS ? s.model : "claude-opus-5-5";
  $("#channelName").value = s.channelName;
  $("#quality").value = s.quality;
  $("#ttsPreview").checked = s.ttsPreview;

  $("#toggleKey").onclick = () => {
    const k = $("#apiKey");
    k.type = k.type === "password" ? "text" : "password";
  };
  $("#saveKey").onclick = () => {
    state.settings = Settings.set({ apiKey: $("#apiKey").value.trim(), model: $("#model").value });
    updateKeyBadge();
    toast("Enregistré ✓");
  };
  $("#model").onchange = () => { state.settings = Settings.set({ model: $("#model").value }); };
  $("#testKey").onclick = async () => {
    const apiKey = $("#apiKey").value.trim();
    if (!apiKey) return toast("Colle ta clé API d'abord");
    $("#keyStatus").textContent = "Test en cours…";
    const r = await AI.testKey({ apiKey, model: $("#model").value });
    $("#keyStatus").textContent = r.ok ? `✅ Connexion OK (${r.model})` : "❌ " + r.error;
    if (r.ok) {
      state.settings = Settings.set({ apiKey, model: $("#model").value });
      updateKeyBadge();
    }
  };
  $("#channelName").oninput = (e) => { state.settings = Settings.set({ channelName: e.target.value }); };
  $("#quality").onchange = (e) => { state.settings = Settings.set({ quality: e.target.value }); };
  $("#ttsPreview").onchange = (e) => { state.settings = Settings.set({ ttsPreview: e.target.checked }); };
  $("#setPin").onclick = async () => {
    const v = $("#newPin").value;
    if (!/^\d{4,8}$/.test(v)) return toast("Le code doit faire 4 à 8 chiffres");
    state.settings = Settings.set({ pinHash: await sha256(v) });
    $("#newPin").value = "";
    toast("Code défini 🔒");
  };
  $("#removePin").onclick = () => {
    state.settings = Settings.set({ pinHash: "" });
    toast("Code retiré");
  };
  $("#wipeAll").onclick = async () => {
    if (!confirm("Effacer la clé API, les réglages, toutes les vidéos et les voix ?")) return;
    Projects.clear();
    Settings.clear();
    await VoiceStore.clear().catch(() => {});
    location.reload();
  };

  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    $("#installBtn").classList.remove("hidden");
  });
  $("#installBtn").onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    deferred = null;
    $("#installBtn").classList.add("hidden");
  };
}

// ---------------------------------------------------------------- Démarrage
function init() {
  initLock();
  renderChips();
  initSettings();
  updateKeyBadge();
  initScenePanel();
  initCast();
  initSound();
  initAIPanel();
  initPublish();

  $$(".tabbar button").forEach((b) => (b.onclick = () => showView(b.dataset.view)));
  $("#keyBadge").onclick = () => showView("settings");
  $("#ideasBtn").onclick = onIdeas;
  $("#clearPrompt").onclick = () => { $("#prompt").value = ""; $("#ideas").innerHTML = ""; };
  $("#generateBtn").onclick = onGenerate;
  $("#blankBtn").onclick = onBlank;

  $("#edBack").onclick = closeEditor;
  $("#edUndo").onclick = undo;
  $("#edExport").onclick = onExport;
  $("#exportBtn2").onclick = onExport;
  $("#playBtn").onclick = togglePlay;
  $("#edTitle").addEventListener("focus", captureSnap);
  $("#edTitle").addEventListener("input", (e) => { state.project.title = e.target.value; persist(); });
  $("#edTitle").addEventListener("change", flushSnap);
  $("#scrub").addEventListener("input", (e) => {
    const was = state.playing;
    if (was) pause();
    state.t = (+e.target.value / 1000) * totalDuration(state.project);
    const { index } = sceneAt(state.project, state.t);
    if (index !== state.sel) selectScene(index, { seek: false });
    drawNow();
  });
  $("#safeBtn").onclick = () => {
    state.showSafe = !state.showSafe;
    drawNow();
    toast(state.showSafe ? "Zones rouges = cachées par l'interface TikTok/Shorts" : "Zone sûre masquée");
  };
  $$(".ed-tabs button").forEach(
    (b) =>
      (b.onclick = () => {
        $$(".ed-tabs button").forEach((x) => x.classList.toggle("active", x === b));
        $$(".panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === b.dataset.panel));
      })
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pause();
      if (state.project) Projects.save(state.project);
    }
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
