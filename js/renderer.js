// Moteur de rendu : dessine une image de la vidéo à l'instant t.
// Tout est déterministe (même t => même image) pour que l'aperçu et l'export
// soient identiques.

export const W = 1080;
export const H = 1920;
const TRANS = 0.55; // durée des transitions (s)
const FONT = '"Fredoka", "Baloo 2", "Nunito", system-ui, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

// ---------- utilitaires ----------
export function totalDuration(project) {
  return project.scenes.reduce((a, s) => a + s.duration, 0);
}

export function sceneStarts(project) {
  const starts = [];
  let acc = 0;
  for (const s of project.scenes) {
    starts.push(acc);
    acc += s.duration;
  }
  return starts;
}

export function sceneAt(project, t) {
  const starts = sceneStarts(project);
  for (let i = project.scenes.length - 1; i >= 0; i--) {
    if (t >= starts[i]) return { index: i, local: t - starts[i], start: starts[i] };
  }
  return { index: 0, local: 0, start: 0 };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}

// ---------- cache des emojis (dessiner du texte emoji à chaque image est lent) ----------
const emojiCache = new Map();
function emojiImage(emoji) {
  let c = emojiCache.get(emoji);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `200px ${EMOJI_FONT}`;
  x.fillText(emoji, 128, 138);
  emojiCache.set(emoji, c);
  return c;
}

// ---------- fond & décors ----------
function drawBackground(ctx, s) {
  const g = ctx.createLinearGradient(0, -100, 0, H + 100);
  g.addColorStop(0, s.bgTop);
  g.addColorStop(1, s.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(-200, -200, W + 400, H + 400);
}

function hillPath(ctx, baseY, amp, freq, phase) {
  ctx.beginPath();
  ctx.moveTo(-200, H + 200);
  for (let x = -200; x <= W + 200; x += 20) {
    ctx.lineTo(x, baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase) * amp * 0.3);
  }
  ctx.lineTo(W + 200, H + 200);
  ctx.closePath();
}

function cloud(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 50 * s, 0, Math.PI * 2);
  ctx.arc(x + 55 * s, y - 25 * s, 60 * s, 0, Math.PI * 2);
  ctx.arc(x + 120 * s, y, 48 * s, 0, Math.PI * 2);
  ctx.arc(x + 60 * s, y + 18 * s, 50 * s, 0, Math.PI * 2);
  ctx.fill();
}

function star(ctx, x, y, r, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * inner : r;
    const a = (i * Math.PI) / points - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  ctx.fill();
}

function drawDecor(ctx, s, t, seed) {
  const r = rng(seed);
  switch (s.decor) {
    case "hills": {
      ctx.fillStyle = "#9BE07A";
      hillPath(ctx, H * 0.74, 50, 0.004, 1 + seed % 5);
      ctx.fill();
      ctx.fillStyle = "#6CC551";
      hillPath(ctx, H * 0.8, 60, 0.0032, 3 + seed % 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 3; i++) cloud(ctx, ((r() * W + t * 25 * (i + 1)) % (W + 300)) - 200, 180 + r() * 380, 0.8 + r() * 0.6);
      // petites fleurs
      for (let i = 0; i < 14; i++) {
        const fx = r() * W, fy = H * 0.82 + r() * H * 0.15;
        ctx.fillStyle = ["#FF7AB6", "#FFD23F", "#FFFFFF", "#B388FF"][i % 4];
        ctx.beginPath();
        ctx.arc(fx, fy + Math.sin(t * 2 + i) * 3, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "clouds": {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      for (let i = 0; i < 7; i++) {
        const sp = 15 + r() * 35;
        cloud(ctx, ((r() * W + t * sp) % (W + 400)) - 250, r() * H * 0.9, 0.7 + r() * 1.2);
      }
      break;
    }
    case "stars":
    case "space": {
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H, tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + r() * 2) + i));
        ctx.fillStyle = `rgba(255,255,240,${tw})`;
        ctx.beginPath();
        ctx.arc(x, y, 2 + r() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (s.decor === "stars") {
        ctx.fillStyle = "#FFF6C8";
        ctx.shadowColor = "#FFF6C8";
        ctx.shadowBlur = 60;
        ctx.beginPath();
        ctx.arc(W * 0.78, H * 0.16, 90, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = s.bgTop;
        ctx.beginPath();
        ctx.arc(W * 0.78 + 45, H * 0.16 - 25, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2E2A6B";
        hillPath(ctx, H * 0.86, 40, 0.003, seed % 9);
        ctx.fill();
      } else {
        // planètes
        const planets = [["#FF9E7A", 0.2, 0.18, 110], ["#7AD3FF", 0.82, 0.3, 70], ["#C59BFF", 0.7, 0.86, 150]];
        planets.forEach(([c, px, py, pr], i) => {
          const y = py * H + Math.sin(t * 0.8 + i) * 12;
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(px * W, y, pr, 0, Math.PI * 2);
          ctx.fill();
          if (i === 0) {
            ctx.strokeStyle = "rgba(255,255,255,0.6)";
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.ellipse(px * W, y, pr * 1.6, pr * 0.35, -0.3, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
      }
      break;
    }
    case "waves": {
      ctx.fillStyle = "#FFE7A3";
      ctx.beginPath();
      ctx.arc(W * 0.2, H * 0.18, 110, 0, Math.PI * 2);
      ctx.fill();
      const cols = ["#7FD6F5", "#45B6E8", "#2193C8"];
      cols.forEach((c, i) => {
        ctx.fillStyle = c;
        hillPath(ctx, H * (0.72 + i * 0.07), 28, 0.012, t * (1.4 + i * 0.4) + i * 2);
        ctx.fill();
      });
      break;
    }
    case "underwater": {
      ctx.fillStyle = "#F4D58D";
      hillPath(ctx, H * 0.88, 25, 0.005, seed % 4);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const bx = 60 + r() * (W - 120), h = 160 + r() * 260;
        ctx.strokeStyle = i % 2 ? "#3FBF7F" : "#2E9E6A";
        ctx.lineWidth = 22;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx, H * 0.92);
        for (let k = 1; k <= 6; k++) {
          ctx.lineTo(bx + Math.sin(t * 1.5 + k + i) * 18, H * 0.92 - (h * k) / 6);
        }
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const x = ((r() * W + t * 30) % W);
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 120, 0);
        ctx.lineTo(x - 80, H * 0.8);
        ctx.lineTo(x - 160, H * 0.8);
        ctx.fill();
      }
      break;
    }
    case "forest": {
      ctx.fillStyle = "#7BC86C";
      hillPath(ctx, H * 0.8, 30, 0.004, seed % 6);
      ctx.fill();
      for (let i = 0; i < 9; i++) {
        const tx = (i / 8) * W + (r() - 0.5) * 60, th = 260 + r() * 220, ty = H * 0.8 + r() * 40;
        ctx.fillStyle = "#8B5A2B";
        ctx.fillRect(tx - 14, ty - 40, 28, 70);
        ctx.fillStyle = i % 2 ? "#2F8F4E" : "#3BAA5C";
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          const w = 120 - k * 25, yy = ty - 40 - k * th * 0.28;
          ctx.moveTo(tx - w, yy);
          ctx.lineTo(tx + w, yy);
          ctx.lineTo(tx, yy - th * 0.45);
          ctx.fill();
        }
      }
      break;
    }
    case "city": {
      for (let i = 0; i < 9; i++) {
        const bw = 100 + r() * 70, bh = 300 + r() * 450, bx = i * 125 - 20;
        ctx.fillStyle = ["#6C63FF", "#8F7BFF", "#5A52D5", "#A393FF"][i % 4];
        ctx.fillRect(bx, H * 0.86 - bh, bw, bh + 300);
        for (let wy = H * 0.86 - bh + 30; wy < H * 0.84; wy += 70) {
          for (let wx = bx + 18; wx < bx + bw - 30; wx += 40) {
            const on = Math.sin(wx * 13.1 + wy * 7.7 + Math.floor(t * 0.7)) > -0.2;
            ctx.fillStyle = on ? "#FFE680" : "rgba(255,255,255,0.15)";
            ctx.fillRect(wx, wy, 22, 34);
          }
        }
      }
      ctx.fillStyle = "#4B4B6B";
      ctx.fillRect(-200, H * 0.86, W + 400, H);
      break;
    }
    case "rainbow": {
      const cols = ["#FF6B6B", "#FFA94D", "#FFE066", "#69DB7C", "#4DABF7", "#9775FA"];
      ctx.lineWidth = 46;
      const k = easeOutCubic(clamp01(t / 1.2));
      cols.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.62, 520 - i * 46, Math.PI, Math.PI + Math.PI * k);
        ctx.stroke();
      });
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      cloud(ctx, -30, H * 0.6, 1.3);
      cloud(ctx, W - 230, H * 0.6, 1.3);
      ctx.fillStyle = "#9BE07A";
      hillPath(ctx, H * 0.82, 40, 0.004, 2);
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

// ---------- particules ----------
function drawEffect(ctx, s, t, seed) {
  if (!s.effect || s.effect === "none") return;
  const r = rng(seed ^ 0x9e3779b9);
  const N = s.effect === "rain" ? 70 : 38;
  for (let i = 0; i < N; i++) {
    const x0 = r() * W, y0 = r() * H, sp = 0.5 + r(), sz = 0.6 + r() * 0.8, ph = r() * 10;
    const hue = Math.floor(r() * 360);
    ctx.save();
    switch (s.effect) {
      case "confetti": {
        const y = (y0 + t * 260 * sp) % (H + 100) - 50;
        const x = x0 + Math.sin(t * 2 + ph) * 40;
        ctx.translate(x, y);
        ctx.rotate(t * 4 * sp + ph);
        ctx.fillStyle = `hsl(${hue},90%,62%)`;
        ctx.fillRect(-12 * sz, -6 * sz, 24 * sz, 12 * sz);
        break;
      }
      case "bubbles": {
        const y = H - ((H - y0 + t * 140 * sp) % (H + 100)) + 50;
        const x = x0 + Math.sin(t * 1.5 + ph) * 30;
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 26 * sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(x - 9 * sz, y - 9 * sz, 6 * sz, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "stars": {
        const tw = Math.abs(Math.sin(t * 2.5 * sp + ph));
        ctx.globalAlpha = 0.3 + 0.7 * tw;
        ctx.fillStyle = "#FFE45E";
        star(ctx, x0, y0 + Math.sin(t + ph) * 10, (16 + 14 * tw) * sz);
        break;
      }
      case "sparkles": {
        const tw = Math.max(0, Math.sin(t * 3 * sp + ph));
        ctx.globalAlpha = tw;
        ctx.fillStyle = "#FFFFFF";
        star(ctx, x0, y0, 22 * sz * tw + 2, 4, 0.25);
        break;
      }
      case "snow": {
        const y = (y0 + t * 90 * sp) % (H + 40) - 20;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(x0 + Math.sin(t + ph) * 30, y, 8 * sz + 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "hearts": {
        const y = H - ((H - y0 + t * 120 * sp) % (H + 100)) + 50;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = ["#FF5DA2", "#FF8FC7", "#FF3D7F"][i % 3];
        heart(ctx, x0 + Math.sin(t * 2 + ph) * 25, y, 44 * sz);
        break;
      }
      case "rain": {
        const y = (y0 + t * 900 * sp) % (H + 80) - 40;
        ctx.strokeStyle = "rgba(200,230,255,0.7)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 - 8, y + 40);
        ctx.stroke();
        break;
      }
      case "leaves": {
        const y = (y0 + t * 120 * sp) % (H + 80) - 40;
        ctx.translate(x0 + Math.sin(t * 1.4 + ph) * 60, y);
        ctx.rotate(Math.sin(t * 2 + ph) * 1.2);
        ctx.fillStyle = ["#F59F00", "#E8590C", "#FAB005", "#94D82D"][i % 4];
        ctx.beginPath();
        ctx.ellipse(0, 0, 20 * sz, 10 * sz, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  }
}

// ---------- personnages ----------
export function characterBase(c) {
  return { x: c.x * W, y: c.y * H, size: c.size * W };
}

function drawCharacter(ctx, c, i, t, dur) {
  const base = characterBase(c);
  let { x, y } = base;
  const s = base.size;
  let scale = 1, rot = 0, alpha = 1;
  const ph = i * 1.7;

  // entrée
  const delay = i * 0.18;
  const k = clamp01((t - delay) / 0.6);
  switch (c.enter) {
    case "pop": scale *= k <= 0 ? 0 : easeOutBack(k); break;
    case "slide-left": x = -s + (x + s) * easeOutCubic(k); break;
    case "slide-right": x = W + s - (W + s - x) * easeOutCubic(k); break;
    case "drop": y = -s + (y + s) * easeOutBack(k); break;
    case "rise": y = H + s - (H + s - y) * easeOutCubic(k); break;
    case "fade": alpha = k; break;
  }
  // animation en boucle
  const at = Math.max(0, t - delay);
  switch (c.anim) {
    case "bounce": {
      const b = Math.abs(Math.sin(at * 3.4 + ph));
      y -= b * s * 0.16;
      scale *= 1 + (1 - b) * 0.04;
      break;
    }
    case "float":
      y += Math.sin(at * 1.6 + ph) * s * 0.08;
      x += Math.cos(at * 1.1 + ph) * s * 0.05;
      break;
    case "wiggle": rot = Math.sin(at * 6 + ph) * 0.16; break;
    case "spin": rot = at * 2.2; break;
    case "pulse": scale *= 1 + Math.sin(at * 4.5 + ph) * 0.08; break;
    case "walk": {
      x += (at / Math.max(dur, 1)) * W * 0.25 - W * 0.06;
      y -= Math.abs(Math.sin(at * 7 + ph)) * s * 0.06;
      rot = Math.sin(at * 7 + ph) * 0.06;
      break;
    }
    case "jump": {
      const cyc = (at * 0.9 + ph * 0.1) % 1.6;
      if (cyc < 0.6) y -= Math.sin((cyc / 0.6) * Math.PI) * s * 0.45;
      break;
    }
  }
  if (scale <= 0.001 || alpha <= 0) return;

  // ombre
  ctx.save();
  ctx.globalAlpha = 0.14 * alpha;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(base.x + (x - base.x), base.y + s * 0.46, s * 0.32 * scale, s * 0.07 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.drawImage(emojiImage(c.emoji), -s / 2, -s / 2, s, s);
  ctx.restore();
}

// ---------- textes ----------
function wrapWords(ctx, words, maxW) {
  const lines = [];
  let line = [];
  for (const w of words) {
    const test = [...line, w].join(" ");
    if (line.length && ctx.measureText(test).width > maxW) {
      lines.push(line);
      line = [w];
    } else line.push(w);
  }
  if (line.length) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCaption(ctx, s, t) {
  const text = (s.caption || "").trim();
  if (!text || s.textStyle === "none") return;
  const style = s.textStyle || "subtitle";
  const size = style === "big" ? 104 : style === "bubble" ? 70 : 80;
  const cy = style === "subtitle" ? H * 0.75 : style === "big" ? H * 0.2 : H * 0.17;
  ctx.save();
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const words = text.split(/\s+/);
  const lines = wrapWords(ctx, words, W * 0.78);
  const lh = size * 1.18;
  const appear = easeOutBack(clamp01((t - 0.12) / 0.35));
  const spoken = clamp01(t / Math.max(0.5, s.duration * 0.8));
  const activeWord = Math.floor(spoken * words.length);

  ctx.translate(W / 2, cy);
  ctx.scale(appear, appear);
  const totalH = lines.length * lh;

  if (style === "bubble") {
    const maxLine = Math.max(...lines.map((l) => ctx.measureText(l.join(" ")).width));
    const bw = maxLine + 90, bh = totalH + 60;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 30;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 50);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-40, bh / 2 - 4);
    ctx.lineTo(10, bh / 2 + 50);
    ctx.lineTo(40, bh / 2 - 4);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  let wi = 0;
  lines.forEach((line, li) => {
    const lw = ctx.measureText(line.join(" ")).width + (line.length - 1) * size * 0.06;
    let x = -lw / 2;
    const y = -totalH / 2 + lh * (li + 0.5);
    for (const w of line) {
      const ww = ctx.measureText(w).width;
      const isActive = wi === activeWord && style !== "bubble";
      const done = wi < activeWord;
      ctx.save();
      if (isActive) {
        ctx.translate(x + ww / 2, y);
        ctx.scale(1.08, 1.08);
        ctx.translate(-(x + ww / 2), -y);
      }
      if (style === "bubble") {
        ctx.fillStyle = "#2B2350";
        ctx.fillText(w, x, y);
      } else {
        ctx.lineJoin = "round";
        ctx.lineWidth = size * 0.2;
        ctx.strokeStyle = "#2B2350";
        ctx.strokeText(w, x, y);
        ctx.fillStyle = isActive ? "#FFE14D" : done ? "#FFFFFF" : "rgba(255,255,255,0.92)";
        ctx.fillText(w, x, y);
      }
      ctx.restore();
      x += ww + ctx.measureText(" ").width + size * 0.06;
      wi++;
    }
  });
  ctx.restore();
}

// ---------- caméra ----------
function applyCamera(ctx, s, t) {
  const k = easeInOut(clamp01(t / Math.max(0.1, s.duration)));
  ctx.translate(W / 2, H / 2);
  switch (s.camera) {
    case "zoom-in": ctx.scale(1 + 0.1 * k, 1 + 0.1 * k); break;
    case "zoom-out": ctx.scale(1.1 - 0.1 * k, 1.1 - 0.1 * k); break;
    case "pan-left": ctx.scale(1.08, 1.08); ctx.translate(40 - 80 * k, 0); break;
    case "pan-right": ctx.scale(1.08, 1.08); ctx.translate(-40 + 80 * k, 0); break;
    case "shake": ctx.translate(Math.sin(t * 13) * 5, Math.cos(t * 11) * 4); ctx.rotate(Math.sin(t * 7) * 0.004); break;
  }
  ctx.translate(-W / 2, -H / 2);
}

// ---------- scène complète ----------
export function drawScene(ctx, scene, t, sceneId = "x") {
  const seed = hash(sceneId);
  ctx.save();
  applyCamera(ctx, scene, t);
  drawBackground(ctx, scene);
  drawDecor(ctx, scene, t, seed);
  scene.characters.forEach((c, i) => drawCharacter(ctx, c, i, t, scene.duration));
  drawEffect(ctx, scene, t, seed);
  ctx.restore();
  drawCaption(ctx, scene, t);
}

function drawWatermark(ctx, name) {
  if (!name) return;
  ctx.save();
  ctx.font = `600 38px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(name).width;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  roundRect(ctx, 50, 150, w + 50, 64, 32);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(name, 75, 183);
  ctx.restore();
}

// Dessine l'image de la vidéo au temps t (secondes) dans un contexte 1080×1920 logique.
export function drawFrame(ctx, project, t, opts = {}) {
  const scaleX = ctx.canvas.width / W;
  ctx.save();
  ctx.setTransform(scaleX, 0, 0, scaleX, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!project.scenes.length) {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }
  const total = totalDuration(project);
  t = Math.max(0, Math.min(total - 0.0001, t));
  const { index, local } = sceneAt(project, t);
  const scene = project.scenes[index];
  const prev = project.scenes[index - 1];

  if (prev && local < TRANS && scene.transition !== "none") {
    const p = easeInOut(local / TRANS);
    drawScene(ctx, prev, prev.duration + local, prev.id);
    ctx.save();
    switch (scene.transition) {
      case "fade":
        ctx.globalAlpha = p;
        break;
      case "zoom":
        ctx.globalAlpha = p;
        ctx.translate(W / 2, H / 2);
        ctx.scale(1.35 - 0.35 * p, 1.35 - 0.35 * p);
        ctx.translate(-W / 2, -H / 2);
        break;
      case "slide":
        ctx.translate(W * (1 - p), 0);
        break;
      case "pop": {
        const q = easeOutBack(clamp01(local / TRANS));
        ctx.translate(W / 2, H / 2);
        ctx.scale(Math.max(0.01, q), Math.max(0.01, q));
        ctx.translate(-W / 2, -H / 2);
        ctx.beginPath();
        roundRect(ctx, 0, 0, W, H, 80 * (1 - p));
        ctx.clip();
        break;
      }
      case "wipe":
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.55 * p + 1, 0, Math.PI * 2);
        ctx.clip();
        break;
    }
    drawScene(ctx, scene, local, scene.id);
    ctx.restore();
  } else {
    drawScene(ctx, scene, local, scene.id);
  }

  drawWatermark(ctx, opts.channelName);

  if (opts.showSafeZone) {
    ctx.fillStyle = "rgba(255,0,80,0.16)";
    ctx.fillRect(0, H - 330, W, 330);
    ctx.fillRect(W - 150, H * 0.45, 150, H * 0.55 - 330);
    ctx.fillRect(0, 0, W, 130);
  }
  ctx.restore();
}

// Petite vignette d'une scène (pour la timeline).
export function drawThumb(canvas, scene) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width / W;
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  drawScene(ctx, scene, Math.min(1.4, scene.duration * 0.6), scene.id);
  ctx.restore();
}
