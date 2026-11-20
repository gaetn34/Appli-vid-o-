// Musique générée en direct (Web Audio) + voix enregistrées.
// Même partition pour l'aperçu et l'export.

let ctx = null;
export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

const MOOD_SETUP = {
  joyeux:   { root: 60, scale: [0, 2, 4, 7, 9], prog: [0, 7, 9, 5], lead: "triangle", bass: "sine", hat: true,  swing: 0 },
  comptine: { root: 67, scale: [0, 2, 4, 5, 7, 9], prog: [0, 5, 7, 0], lead: "sine", bell: true, bass: "sine", hat: false, swing: 0 },
  calme:    { root: 65, scale: [0, 2, 4, 7, 9], prog: [0, 9, 5, 7], lead: "sine", bass: "sine", hat: false, pad: true, swing: 0 },
  aventure: { root: 62, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 10, 5, 7], lead: "square", bass: "triangle", hat: true, swing: 0 },
  mystere:  { root: 57, scale: [0, 3, 5, 7, 10], prog: [0, 8, 3, 10], lead: "triangle", bass: "sine", hat: false, pad: true, swing: 0 },
  fete:     { root: 64, scale: [0, 2, 4, 7, 9], prog: [0, 5, 9, 7], lead: "square", bass: "sawtooth", hat: true, clap: true, swing: 0 },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function seeded(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a ^= a << 13; a ^= a >>> 17; a ^= a << 5;
    return ((a >>> 0) % 10000) / 10000;
  };
}

function strHash(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// Compose une boucle de 4 mesures (8 croches par mesure).
function compose(mood, seed) {
  const set = MOOD_SETUP[mood] || MOOD_SETUP.joyeux;
  const r = seeded(seed);
  const melody = [];
  let deg = 2;
  for (let bar = 0; bar < 4; bar++) {
    for (let st = 0; st < 8; st++) {
      const rest = r() < (mood === "calme" || mood === "mystere" ? 0.45 : 0.22) && st % 2 === 1;
      deg = Math.max(0, Math.min(set.scale.length * 2 - 1, deg + Math.round((r() - 0.5) * 3)));
      const oct = Math.floor(deg / set.scale.length);
      const note = set.root + set.scale[deg % set.scale.length] + 12 * oct;
      melody.push(rest ? null : note);
    }
  }
  // Répète la 1re mesure à la 3e : effet « refrain » facile à retenir.
  for (let i = 0; i < 8; i++) melody[16 + i] = melody[i];
  return { set, melody };
}

function noiseBuffer(ac) {
  const b = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

export class Music {
  constructor(output) {
    this.ac = audioCtx();
    this.output = output; // GainNode
    this.timer = null;
    this.noise = noiseBuffer(this.ac);
    this.nodes = new Set();
  }

  // Démarre la musique à `when` (temps AudioContext) depuis `offset` secondes,
  // jusqu'à `until` secondes de vidéo.
  start({ mood, tempo, seed, when, offset, until }) {
    this.stop();
    const { set, melody } = compose(mood, strHash(String(seed)) + mood.length);
    const step = 60 / tempo / 2; // croche
    const loopLen = melody.length;
    let n = Math.ceil(offset / step);
    const ac = this.ac;

    const tick = () => {
      const horizon = ac.currentTime + 0.25;
      while (true) {
        const videoT = n * step;
        if (videoT >= until) break;
        const t = when + (videoT - offset);
        if (t > horizon) break;
        if (t >= ac.currentTime - 0.01) this.scheduleStep(set, melody, n, loopLen, t, step);
        n++;
      }
    };
    tick();
    this.timer = setInterval(tick, 40);
  }

  scheduleStep(set, melody, n, loopLen, t, step) {
    const i = n % loopLen;
    const bar = Math.floor(i / 8);
    const beat = i % 8;
    const chordRoot = set.root - 12 + set.prog[bar];
    // mélodie
    const note = melody[i];
    if (note != null) {
      this.tone(set.bell ? "sine" : set.lead, mtof(note), t, step * 0.9, set.lead === "square" ? 0.05 : 0.11);
      if (set.bell) this.tone("sine", mtof(note + 12), t, step * 0.5, 0.03);
    }
    // basse
    if (beat === 0 || beat === 4) this.tone(set.bass, mtof(chordRoot - 12), t, step * 1.8, set.bass === "sawtooth" ? 0.05 : 0.14);
    // nappe
    if (set.pad && beat === 0) {
      [0, 4, 7].forEach((iv) => this.tone("sine", mtof(chordRoot + iv), t, step * 7.5, 0.035, 0.5));
    }
    // percussions douces
    if (set.hat && beat % 2 === 1) this.hit(t, 0.03, 7000, 0.05);
    if (beat === 0) this.kick(t);
    if (set.clap && (beat === 2 || beat === 6)) this.hit(t, 0.08, 1500, 0.12);
  }

  tone(type, freq, t, dur, vol, attack = 0.01) {
    const ac = this.ac;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.output);
    o.start(t);
    o.stop(t + dur + 0.05);
    this.track(o);
  }

  hit(t, dur, freq, vol) {
    const ac = this.ac;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.output);
    src.start(t);
    src.stop(t + dur + 0.02);
    this.track(src);
  }

  kick(t) {
    const ac = this.ac;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.output);
    o.start(t);
    o.stop(t + 0.25);
    this.track(o);
  }

  track(node) {
    this.nodes.add(node);
    node.onended = () => this.nodes.delete(node);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    for (const n of this.nodes) {
      try { n.stop(); } catch {}
    }
    this.nodes.clear();
  }
}

// Mélangeur : musique + voix -> haut-parleur et/ou enregistrement.
export class Mixer {
  constructor() {
    this.ac = audioCtx();
    this.master = this.ac.createGain();
    this.musicGain = this.ac.createGain();
    this.voiceGain = this.ac.createGain();
    this.musicGain.connect(this.master);
    this.voiceGain.connect(this.master);
    this.master.connect(this.ac.destination);
    this.music = new Music(this.musicGain);
    this.voiceSources = [];
    this.recordDest = null;
  }

  enableRecording() {
    if (!this.recordDest) this.recordDest = this.ac.createMediaStreamDestination();
    this.master.connect(this.recordDest);
    return this.recordDest.stream;
  }

  disableRecording() {
    if (this.recordDest) {
      try { this.master.disconnect(this.recordDest); } catch {}
    }
  }

  // voices: [{start, duration, buffer}] en temps vidéo
  play({ project, offset, voices }) {
    const ac = this.ac;
    const when = ac.currentTime + 0.08;
    const total = project.scenes.reduce((a, s) => a + s.duration, 0);
    const m = project.music || {};
    const musicVol = m.enabled === false ? 0 : m.volume ?? 0.6;
    this.musicGain.gain.cancelScheduledValues(0);
    this.musicGain.gain.setValueAtTime(musicVol, when);
    this.voiceGain.gain.value = m.voiceVolume ?? 1;

    if (musicVol > 0) {
      this.music.start({ mood: m.mood || "joyeux", tempo: m.tempo || 110, seed: project.id, when, offset, until: total });
    }
    // fondu final de la musique
    const endAt = when + (total - offset);
    if (total - offset > 1.2) {
      this.musicGain.gain.setValueAtTime(musicVol, endAt - 1);
      this.musicGain.gain.linearRampToValueAtTime(0.0001, endAt);
    }

    for (const v of voices) {
      const vEnd = v.start + v.buffer.duration;
      if (vEnd <= offset) continue;
      const src = ac.createBufferSource();
      src.buffer = v.buffer;
      src.connect(this.voiceGain);
      const startIn = Math.max(0, v.start - offset);
      const skip = Math.max(0, offset - v.start);
      src.start(when + startIn, skip);
      this.voiceSources.push(src);
      // la musique baisse pendant la voix
      if (musicVol > 0) {
        const a = when + startIn, b = when + (vEnd - offset);
        this.musicGain.gain.setValueAtTime(musicVol, a);
        this.musicGain.gain.linearRampToValueAtTime(musicVol * 0.35, a + 0.15);
        this.musicGain.gain.setValueAtTime(musicVol * 0.35, Math.max(a + 0.15, b - 0.1));
        this.musicGain.gain.linearRampToValueAtTime(musicVol, b + 0.2);
      }
    }
    return when;
  }

  stop() {
    this.music.stop();
    for (const s of this.voiceSources) {
      try { s.stop(); } catch {}
    }
    this.voiceSources = [];
    this.musicGain.gain.cancelScheduledValues(0);
  }
}

// Décode un Blob audio en AudioBuffer.
export async function decodeBlob(blob) {
  const buf = await blob.arrayBuffer();
  const ac = audioCtx();
  return await new Promise((resolve, reject) => {
    const p = ac.decodeAudioData(buf, resolve, reject);
    if (p && p.then) p.then(resolve, reject);
  });
}
