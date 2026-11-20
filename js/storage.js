// Stockage 100 % local sur le téléphone : réglages + projets (localStorage),
// enregistrements de voix (IndexedDB). Rien n'est envoyé ailleurs.

const LS_SETTINGS = "clipou.settings.v1";
const LS_PROJECTS = "clipou.projects.v1";

export const DEFAULT_SETTINGS = {
  apiKey: "",
  model: "claude-opus-5-5",
  channelName: "",
  quality: "720",
  ttsPreview: true,
  pinHash: "",
  lang: "fr",
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error("Stockage plein ou indisponible", err);
    return false;
  }
}

export const Settings = {
  get() {
    return { ...DEFAULT_SETTINGS, ...readJSON(LS_SETTINGS, {}) };
  },
  set(patch) {
    const next = { ...Settings.get(), ...patch };
    writeJSON(LS_SETTINGS, next);
    return next;
  },
  clear() {
    localStorage.removeItem(LS_SETTINGS);
  },
};

export const Projects = {
  list() {
    const all = readJSON(LS_PROJECTS, []);
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  get(id) {
    return Projects.list().find((p) => p.id === id) || null;
  },
  save(project) {
    const all = readJSON(LS_PROJECTS, []).filter((p) => p.id !== project.id);
    project.updatedAt = Date.now();
    all.push(project);
    return writeJSON(LS_PROJECTS, all);
  },
  remove(id) {
    writeJSON(
      LS_PROJECTS,
      readJSON(LS_PROJECTS, []).filter((p) => p.id !== id)
    );
  },
  clear() {
    localStorage.removeItem(LS_PROJECTS);
  },
};

export function uid(prefix = "") {
  const rnd = crypto.getRandomValues(new Uint32Array(2));
  return prefix + rnd[0].toString(36) + rnd[1].toString(36);
}

// ---------- IndexedDB pour les voix enregistrées ----------
const DB_NAME = "clipou-media";
const STORE = "voices";
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export const VoiceStore = {
  put: (key, blob) => tx("readwrite", (s) => s.put(blob, key)),
  get: (key) => tx("readonly", (s) => s.get(key)),
  remove: (key) => tx("readwrite", (s) => s.delete(key)),
  async removeProject(projectId) {
    const d = await db();
    return new Promise((resolve) => {
      const t = d.transaction(STORE, "readwrite");
      const s = t.objectStore(STORE);
      const req = s.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return;
        if (String(cur.key).startsWith(projectId + ":")) cur.delete();
        cur.continue();
      };
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
    });
  },
  clear: () => tx("readwrite", (s) => s.clear()),
};

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
