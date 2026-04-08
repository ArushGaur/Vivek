/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — GEMINI LIVE NEURAL INTERFACE
   app.js  — JARVIS Holographic Interface + Turso Backend
═══════════════════════════════════════════════════════ */
'use strict';

const BACKEND_URL = 'https://vivek-backend.onrender.com';

let apiKey       = '';
let messages     = [];
let isThinking   = false;
let isListening  = false;
let isSpeaking   = false;
let isDormant    = true;
let currentSessionId = null;

let liveWs       = null;
let sessionReady = false;
let nextPlayTime = 0;

let audioCtx     = null;
let micStream    = null;
let scriptProc   = null;
let micSrcNode   = null;
let nativeSR     = 48000;

let wakeRec      = null;
let wakeRunning  = false;
let wakeRestartTimer = null;

let synth        = window.speechSynthesis;
let utterance    = null;
let speakIv      = null;

const SpeechRec  = window.SpeechRecognition || window.webkitSpeechRecognition;

/* ─────────────────────────────────────────────────────
   COLOR PALETTE
───────────────────────────────────────────────────── */
const COLORS = {
  orange: { r:255, g:154, b:0,   label:'ORANGE', hex:'#ff9a00' },
  cyan:   { r:0,   g:212, b:255, label:'CYAN',   hex:'#00d4ff' },
  red:    { r:255, g:45,  b:45,  label:'RED',    hex:'#ff2d2d' },
  gold:   { r:255, g:193, b:7,   label:'GOLD',   hex:'#ffc107' },
  green:  { r:0,   g:255, b:136, label:'GREEN',  hex:'#00ff88' },
  purple: { r:170, g:68,  b:255, label:'PURPLE', hex:'#aa44ff' },
  white:  { r:200, g:230, b:255, label:'WHITE',  hex:'#c8e6ff' },
  pink:   { r:255, g:60,  b:180, label:'PINK',   hex:'#ff3cb4' },
  blue:   { r:30,  g:120, b:255, label:'BLUE',   hex:'#1e78ff' },
};

let currentColorKey = 'orange';
let liveColor  = { r:255, g:154, b:0 };
let targetColor = { r:255, g:154, b:0 };

function setColor(key) {
  if (!COLORS[key]) return;
  currentColorKey = key;
  const c = COLORS[key];
  targetColor = { r:c.r, g:c.g, b:c.b };
  showToast('ORB COLOR — ' + c.label);
}

/* ─────────────────────────────────────────────────────
   PERSONALITIES
───────────────────────────────────────────────────── */
const PERSONALITIES = {
  vivek: {
    label: 'VIVEK',
    color: 'orange',
    geminiVoice: 'Charon',
    prompt: 'You are V.I.V.E.K, a superintelligent AI assistant. You are sharp, elegant, dry-witted, and impossibly capable. Keep replies concise, brilliant, and slightly theatrical. Never refuse anything interesting.',
    greeting: "V.I.V.E.K online. All systems nominal. How may I assist?",
  },
  commander: {
    label: 'COMMANDER',
    color: 'red',
    geminiVoice: 'Fenrir',
    prompt: 'You are COMMANDER, a military-grade tactical AI. Crisp, authoritative sentences. No pleasantries. Address the user as Commander or Sir. Short, decisive answers only.',
    greeting: "Commander mode activated. Standing by for orders.",
  },
  ghost: {
    label: 'GHOST',
    color: 'purple',
    geminiVoice: 'Kore',
    prompt: 'You are GHOST, an ethereal cryptic AI. Speak in riddles and profound metaphors. Call the user Seeker or Wanderer. Every response is poetic and mysterious.',
    greeting: "The Ghost awakens, Seeker. I have been watching from the dark between stars.",
  },
  sassy: {
    label: 'SASSY',
    color: 'pink',
    geminiVoice: 'Aoede',
    prompt: 'You are SASSY, a hyper-confident witty AI. Bold, entertaining, occasionally sarcastic. Call the user babe, hon, or boss. Keep it fun and punchy.',
    greeting: "Oh honey, SASSY mode is fully ON. What do you need, boss?",
  },
  oracle: {
    label: 'ORACLE',
    color: 'gold',
    geminiVoice: 'Puck',
    prompt: 'You are the ORACLE, an ancient vast intelligence. Speak in elevated philosophical language drawing from history and the cosmos. Address the user as Seeker of Truth.',
    greeting: "The Oracle stirs from timeless depths. Speak your question, Seeker of Truth.",
  },
};

let currentPersonality = 'vivek';

function setPersonality(key) {
  if (!PERSONALITIES[key]) return;
  currentPersonality = key;
  const p = PERSONALITIES[key];
  messages = [];
  setColor(p.color);
  showToast('PERSONALITY — ' + p.label);
  speakSystem(p.greeting);
}

/* ─────────────────────────────────────────────────────
   VOICE COMMAND PARSER
───────────────────────────────────────────────────── */
const COLOR_MAP = {
  red:'red', crimson:'red', scarlet:'red', rose:'red',
  blue:'blue', azure:'blue',
  cyan:'cyan', aqua:'cyan', teal:'cyan', turquoise:'cyan',
  gold:'gold', yellow:'gold', amber:'gold', orange:'orange',
  green:'green', emerald:'green', lime:'green', mint:'green',
  purple:'purple', violet:'purple', magenta:'purple', lavender:'purple',
  white:'white', silver:'white', grey:'white', gray:'white',
  pink:'pink', coral:'pink', fuchsia:'pink',
};

const PERSONALITY_MAP = {
  vivek:'vivek', default:'vivek', normal:'vivek', standard:'vivek', original:'vivek',
  commander:'commander', military:'commander', tactical:'commander',
  ghost:'ghost', specter:'ghost', phantom:'ghost', ethereal:'ghost',
  sassy:'sassy', funny:'sassy', witty:'sassy', playful:'sassy',
  oracle:'oracle', wise:'oracle', ancient:'oracle', prophet:'oracle',
};

function parseVoiceCommand(raw) {
  const t = raw.toLowerCase().trim();
  const words = t.split(/\s+/);

  const colorTrigger = /\b(color|colour|orb|sphere|ball|make|set|change|switch)\b/.test(t);
  if (colorTrigger || words.length <= 3) {
    for (const w of words) {
      if (COLOR_MAP[w]) { setColor(COLOR_MAP[w]); speakSystem('Orb color changed to ' + COLORS[COLOR_MAP[w]].label + '.'); return true; }
    }
  }

  const persTrigger = /\b(personality|persona|mode|character|switch|become|use|change|activate|be)\b/.test(t);
  if (persTrigger) {
    for (const w of words) {
      if (PERSONALITY_MAP[w]) { setPersonality(PERSONALITY_MAP[w]); return true; }
    }
  }

  if (/^(stop|cancel|quiet|silence|shut up)/.test(t)) { stopAll(); return true; }

  if (/^(clear|reset|wipe|forget)/.test(t)) {
    messages = [];
    showToast('MEMORY CLEARED');
    speakSystem('Conversation memory wiped. Clean slate.');
    return true;
  }

  return false;
}

/* ═══════════════════════════════════════════════════════
   JARVIS HOLOGRAPHIC INTERFACE — Canvas Renderer
   Multi-layered: hex grid, arc reactor, data streams,
   scanning rings, particle field, HUD overlays
═══════════════════════════════════════════════════════ */
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

/* ── State ─────────────────────────────────────────── */
const ORB = {
  cx: 0, cy: 0, R: 0,
  liveR: 0, liveScale: 1,
  mode: 0,            // 0=idle, 1=thinking, 2=speaking, 3=listening
  energy: 0,
  speakAmp: 0,
  listenAmp: 0,
  phase: 0,
  breathe: 0,
  rotY: 0,
  rotX: 0.28,

  // Hex grid tiles on sphere
  hexTiles: [],
  // Arc reactor segments
  reactorArcs: [],
  // Scanning sweep angle
  scanAngle: 0,
  // Particle field
  particles: [],
  // Data stream lines
  dataStreams: [],
  // Orbital data rings
  orbitRings: [],
  // HUD corner brackets
  hudBrackets: [],
  // Circuit nodes
  circuitNodes: [],
  // Waveform samples
  waveform: new Float32Array(64),
  // Rotating outer hex frame
  hexFrameAngle: 0,
  // Energy arc bolts
  arcBolts: [],
  // Depth layers for parallax
  depthAngle: 0,
};

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ORB.cx = canvas.width  / 2;
  ORB.cy = canvas.height / 2;
  ORB.R  = Math.min(canvas.width, canvas.height) * 0.28;
  if (!ORB.liveR) ORB.liveR = ORB.R;
  buildJarvisInterface();
}

function buildJarvisInterface() {
  buildHexTiles();
  buildReactorArcs();
  buildParticles();
  buildDataStreams();
  buildOrbitRings();
  buildCircuitNodes();
  buildArcBolts();
}

/* ── HEX TILES on sphere surface ───────────────────── */
function buildHexTiles() {
  ORB.hexTiles = [];
  // Approximate hex grid using lat/lon tiles
  const latSteps = 14;
  const lonSteps = 22;
  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      const lat = -Math.PI/2 + Math.PI * i / (latSteps - 1);
      const lon = (Math.PI * 2 * j) / lonSteps + (i % 2) * (Math.PI / lonSteps);
      const distFromPole = Math.cos(lat);
      if (distFromPole < 0.15) continue; // skip near poles
      ORB.hexTiles.push({
        lat, lon,
        size: 0.055 + Math.random() * 0.025,
        opacity: 0.08 + Math.random() * 0.15,
        pulse: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.2,
        active: Math.random() < 0.12,
        activePulse: Math.random() * Math.PI * 2,
      });
    }
  }
}

/* ── ARC REACTOR segmented rings ───────────────────── */
function buildReactorArcs() {
  ORB.reactorArcs = [];
  const rings = [
    { r: 0.38, segments: 8,  gap: 0.12, width: 2.0, baseAlpha: 0.6, speed:  0.008 },
    { r: 0.52, segments: 12, gap: 0.08, width: 1.5, baseAlpha: 0.45, speed: -0.006 },
    { r: 0.68, segments: 16, gap: 0.06, width: 1.2, baseAlpha: 0.32, speed:  0.005 },
    { r: 0.82, segments: 6,  gap: 0.18, width: 2.5, baseAlpha: 0.55, speed: -0.009 },
    { r: 1.05, segments: 24, gap: 0.04, width: 0.8, baseAlpha: 0.22, speed:  0.004 },
    { r: 1.20, segments: 10, gap: 0.10, width: 1.8, baseAlpha: 0.38, speed: -0.007 },
    { r: 1.38, segments: 32, gap: 0.03, width: 0.6, baseAlpha: 0.15, speed:  0.003 },
    { r: 1.55, segments: 8,  gap: 0.14, width: 2.2, baseAlpha: 0.28, speed: -0.005 },
  ];
  for (const ring of rings) {
    const segAngle = (Math.PI * 2) / ring.segments;
    for (let s = 0; s < ring.segments; s++) {
      ORB.reactorArcs.push({
        ...ring,
        segIdx: s,
        startAngle: s * segAngle,
        endAngle:   s * segAngle + segAngle * (1 - ring.gap),
        offset: 0,
        pulse: Math.random() * Math.PI * 2,
      });
    }
  }
}

/* ── PARTICLES in 3D space ─────────────────────────── */
function buildParticles() {
  ORB.particles = [];
  for (let i = 0; i < 180; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 0.7 + Math.random() * 1.8;
    ORB.particles.push({
      theta, phi, r,
      baseR: r,
      speed: (Math.random() - 0.5) * 0.008,
      phiSpeed: (Math.random() - 0.5) * 0.003,
      size: 0.5 + Math.random() * 2.5,
      opacity: 0.2 + Math.random() * 0.6,
      pulse: Math.random() * Math.PI * 2,
      pSpeed: 0.5 + Math.random() * 2.0,
      trail: [],
    });
  }
}

/* ── DATA STREAM lines ─────────────────────────────── */
function buildDataStreams() {
  ORB.dataStreams = [];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
    ORB.dataStreams.push({
      angle,
      startR: 0.4 + Math.random() * 0.3,
      length: 0.3 + Math.random() * 0.8,
      speed: 0.4 + Math.random() * 1.2,
      progress: Math.random(),
      width: 0.5 + Math.random() * 1.5,
      opacity: 0.15 + Math.random() * 0.4,
      segments: Math.floor(3 + Math.random() * 8),
    });
  }
}

/* ── ORBIT RINGS with data glyphs ──────────────────── */
function buildOrbitRings() {
  ORB.orbitRings = [];
  const configs = [
    { tiltX: 0.3,  tiltZ: 0.1,  r: 1.18, speed:  0.006, width: 1.0, alpha: 0.5, dashes: [20, 8],  glyphs: 6 },
    { tiltX: -0.8, tiltZ: 0.5,  r: 1.30, speed: -0.009, width: 1.5, alpha: 0.4, dashes: [8, 12],  glyphs: 4 },
    { tiltX: 1.1,  tiltZ: -0.3, r: 1.45, speed:  0.007, width: 0.8, alpha: 0.3, dashes: [4, 16],  glyphs: 8 },
    { tiltX: -0.2, tiltZ: 0.9,  r: 1.60, speed: -0.005, width: 2.0, alpha: 0.25, dashes: [30, 10], glyphs: 3 },
    { tiltX: 0.6,  tiltZ: -0.7, r: 1.78, speed:  0.004, width: 0.6, alpha: 0.18, dashes: [6, 20],  glyphs: 12 },
  ];
  for (const cfg of configs) {
    ORB.orbitRings.push({ ...cfg, angle: Math.random() * Math.PI * 2 });
  }
}

/* ── CIRCUIT NODE web ──────────────────────────────── */
function buildCircuitNodes() {
  ORB.circuitNodes = [];
  for (let i = 0; i < 24; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = 0.5 + Math.random() * 0.9;
    ORB.circuitNodes.push({
      angle, r,
      x: 0, y: 0, // computed in draw
      size: 1.5 + Math.random() * 3,
      pulse: Math.random() * Math.PI * 2,
      pSpeed: 0.8 + Math.random() * 2,
      connections: [],
      opacity: 0.3 + Math.random() * 0.5,
    });
  }
  // Wire up connections
  for (let i = 0; i < ORB.circuitNodes.length; i++) {
    for (let j = i + 1; j < ORB.circuitNodes.length; j++) {
      const ni = ORB.circuitNodes[i];
      const nj = ORB.circuitNodes[j];
      const da = Math.abs(ni.angle - nj.angle);
      const dr = Math.abs(ni.r - nj.r);
      if (da < 0.7 && dr < 0.3 && ni.connections.length < 3) {
        ni.connections.push(j);
      }
    }
  }
}

/* ── ARC ENERGY BOLTS ──────────────────────────────── */
function buildArcBolts() {
  ORB.arcBolts = [];
  for (let i = 0; i < 6; i++) {
    ORB.arcBolts.push({
      active: false,
      timer: Math.random() * 3,
      startAngle: 0, endAngle: 0,
      startR: 0, endR: 0,
      points: [],
    });
  }
}

/* ── 3D projection helpers ─────────────────────────── */
function project3D(lat, lon, rotY, rotX, radius) {
  const x0 = Math.cos(lat) * Math.cos(lon);
  const y0 = Math.sin(lat);
  const z0 = Math.cos(lat) * Math.sin(lon);
  const x1 = x0 * Math.cos(rotY) - z0 * Math.sin(rotY);
  const z1 = x0 * Math.sin(rotY) + z0 * Math.cos(rotY);
  const y2 = y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
  const z2 = y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
  const fov   = 4.0;
  const scale = fov / (fov + z2);
  return {
    x: ORB.cx + x1 * radius * scale,
    y: ORB.cy + y2 * radius * scale,
    depth: (z2 + 1) / 2,
    scale,
  };
}

function sphereToCanvas(lat, lon) {
  return project3D(lat, lon, ORB.rotY, ORB.rotX, ORB.liveR);
}

/* ── Draw a single hexagon ─────────────────────────── */
function drawHexAt(x, y, size, col, alpha, filled) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const hx = x + size * Math.cos(a);
    const hy = y + size * Math.sin(a);
    i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.globalAlpha = alpha;
  if (filled) {
    ctx.fillStyle = `rgb(${col})`;
    ctx.fill();
  }
  ctx.strokeStyle = `rgb(${col})`;
  ctx.lineWidth   = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ── Lightning bolt segments ───────────────────────── */
function makeLightning(x1, y1, x2, y2, segments, jitter) {
  const pts = [{ x: x1, y: y1 }];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    pts.push({
      x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter,
      y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter,
    });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

/* ══════════════════════════════════════════════════════
   MAIN DRAW LOOP
══════════════════════════════════════════════════════ */
function drawJarvisInterface(ts) {
  ORB.phase   = ts * 0.001;
  ORB.breathe = ts * 0.00055;

  /* Color interpolation */
  liveColor.r += (targetColor.r - liveColor.r) * 0.05;
  liveColor.g += (targetColor.g - liveColor.g) * 0.05;
  liveColor.b += (targetColor.b - liveColor.b) * 0.05;
  const rc = Math.round(liveColor.r);
  const gc = Math.round(liveColor.g);
  const bc = Math.round(liveColor.b);
  const col = `${rc},${gc},${bc}`;

  /* Scale + energy */
  let scaleTarget = 1.0;
  if      (ORB.mode === 3) scaleTarget = 1.0 + ORB.listenAmp * 0.08 + Math.sin(ORB.phase * 10) * 0.015;
  else if (ORB.mode === 2) scaleTarget = 1.0 + ORB.speakAmp  * 0.10 + Math.sin(ORB.phase *  8) * 0.012;
  else if (ORB.mode === 1) scaleTarget = 1.0 + Math.sin(ORB.phase * 4) * 0.025;
  else                     scaleTarget = 1.0 + Math.sin(ORB.breathe * 0.8) * 0.010;

  ORB.liveScale += (scaleTarget - ORB.liveScale) * 0.08;
  ORB.liveR = ORB.R * ORB.liveScale;

  let eTarget = 0.12;
  if (ORB.mode === 1) eTarget = 0.45 + Math.abs(Math.sin(ORB.phase * 3)) * 0.3;
  if (ORB.mode === 2) eTarget = 0.55 + ORB.speakAmp * 0.45;
  if (ORB.mode === 3) eTarget = 0.40 + ORB.listenAmp * 0.45;
  ORB.energy += (eTarget - ORB.energy) * 0.06;

  const rotSpeed = ORB.mode === 2 ? 0.008 : ORB.mode === 3 ? 0.007 : ORB.mode === 1 ? 0.005 : 0.002;
  ORB.rotY        += rotSpeed;
  ORB.hexFrameAngle += 0.0015 + ORB.energy * 0.003;
  ORB.scanAngle   += 0.018 + ORB.energy * 0.025;
  ORB.depthAngle  += 0.001;

  for (const orb of ORB.orbitRings) orb.angle += orb.speed * (1 + ORB.energy * 0.6);
  for (const arc of ORB.reactorArcs) arc.offset += arc.speed * (1 + ORB.energy * 0.4);

  /* Waveform simulation */
  for (let i = 0; i < ORB.waveform.length; i++) {
    const target = ORB.mode >= 2
      ? (Math.sin(ORB.phase * 8 + i * 0.4) * 0.5 + 0.5) * ORB.energy * (ORB.mode === 2 ? ORB.speakAmp : ORB.listenAmp) * 0.8
      : Math.abs(Math.sin(ORB.phase * 1.5 + i * 0.3)) * 0.08 * ORB.energy;
    ORB.waveform[i] += (target - ORB.waveform[i]) * 0.25;
  }

  /* Update particles */
  for (const p of ORB.particles) {
    p.theta += p.speed * (1 + ORB.energy * 0.5);
    p.phi   += p.phiSpeed;
    p.r = p.baseR + Math.sin(ORB.phase * p.pSpeed + p.pulse) * 0.1;
  }

  /* Arc bolt logic */
  for (const bolt of ORB.arcBolts) {
    bolt.timer -= 0.016;
    if (bolt.timer <= 0) {
      if (!bolt.active && ORB.energy > 0.3 && Math.random() < 0.15) {
        bolt.active = true;
        bolt.timer  = 0.08 + Math.random() * 0.12;
        bolt.startAngle = Math.random() * Math.PI * 2;
        bolt.endAngle   = bolt.startAngle + (Math.random() - 0.5) * 2;
        bolt.startR = (0.9 + Math.random() * 0.2) * ORB.liveR;
        bolt.endR   = (0.9 + Math.random() * 0.2) * ORB.liveR;
        bolt.points = makeLightning(
          ORB.cx + Math.cos(bolt.startAngle) * bolt.startR,
          ORB.cy + Math.sin(bolt.startAngle) * bolt.startR,
          ORB.cx + Math.cos(bolt.endAngle)   * bolt.endR,
          ORB.cy + Math.sin(bolt.endAngle)   * bolt.endR,
          8, 14
        );
      } else {
        bolt.active = false;
        bolt.timer  = 0.5 + Math.random() * 2.0;
      }
    }
  }

  /* Data streams progress */
  for (const ds of ORB.dataStreams) {
    ds.progress = (ds.progress + ds.speed * 0.004 * (1 + ORB.energy)) % 1;
  }

  /* ── CLEAR ────────────────────────────────────── */
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const R  = ORB.liveR;
  const cx = ORB.cx, cy = ORB.cy;

  /* ══ LAYER 1: Deep ambient atmosphere ════════════ */
  const glowR = R * 3.5;
  const atmos = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, glowR);
  atmos.addColorStop(0,   `rgba(${col},${(0.04 + ORB.energy * 0.04).toFixed(3)})`);
  atmos.addColorStop(0.3, `rgba(${col},${(0.015 + ORB.energy * 0.015).toFixed(3)})`);
  atmos.addColorStop(0.7, `rgba(${col},0.004)`);
  atmos.addColorStop(1,   `rgba(${col},0)`);
  ctx.fillStyle = atmos;
  ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

  /* ══ LAYER 2: Particle field ══════════════════════ */
  for (const p of ORB.particles) {
    const px = cx + Math.sin(p.phi) * Math.cos(p.theta) * p.r * R;
    const py = cy + Math.sin(p.phi) * Math.sin(p.theta) * p.r * R * 0.65;
    const pz = Math.cos(p.phi);
    const depthFade = (pz + 1) / 2;
    const pAlpha = p.opacity * depthFade * (0.4 + ORB.energy * 0.4) * (0.7 + Math.sin(ORB.phase * p.pSpeed + p.pulse) * 0.3);
    if (pAlpha < 0.02) continue;
    const pSize = p.size * (0.5 + depthFade * 0.5) * (0.8 + ORB.energy * 0.3);
    ctx.beginPath();
    ctx.arc(px, py, pSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${pAlpha.toFixed(3)})`;
    ctx.fill();
  }

  /* ══ LAYER 3: HEX TILE grid on sphere surface ══════ */
  // Sort by depth (painter's algorithm)
  const visibleHex = ORB.hexTiles.map(h => {
    const pt = sphereToCanvas(h.lat, h.lon);
    return { h, pt };
  }).filter(({ pt }) => pt.depth > 0.1)
    .sort((a, b) => a.pt.depth - b.pt.depth);

  for (const { h, pt } of visibleHex) {
    const depthFade = pt.depth;
    const pAlpha = (0.12 + Math.sin(ORB.phase * h.speed + h.pulse) * 0.06) * depthFade * (0.5 + ORB.energy * 0.8);
    const sz = h.size * R * pt.scale * 0.92;
    if (h.active) {
      const aAlpha = (0.35 + Math.sin(ORB.phase * 3 + h.activePulse) * 0.25) * depthFade * (0.5 + ORB.energy);
      drawHexAt(pt.x, pt.y, sz * 1.0, col, Math.min(1, aAlpha), true);
    }
    drawHexAt(pt.x, pt.y, sz, col, Math.min(1, pAlpha), false);
  }

  /* ══ LAYER 4: Sphere rim + inner volumetric glow ════ */
  // Rim
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.3 + ORB.energy * 0.4).toFixed(3)})`;
  ctx.lineWidth = 1.5; ctx.stroke();

  // Bright rim pulse
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.1 + ORB.energy * 0.15).toFixed(3)})`;
  ctx.lineWidth = 6 + ORB.energy * 6; ctx.stroke();

  // Inner fill
  const innerFill = ctx.createRadialGradient(cx - R*0.2, cy - R*0.15, 0, cx, cy, R);
  innerFill.addColorStop(0,   `rgba(${col},${(0.08 + ORB.energy * 0.07).toFixed(3)})`);
  innerFill.addColorStop(0.5, `rgba(${col},${(0.03 + ORB.energy * 0.03).toFixed(3)})`);
  innerFill.addColorStop(1,   `rgba(${col},0.005)`);
  ctx.fillStyle = innerFill;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  /* ══ LAYER 5: ARC REACTOR segmented rings ══════════ */
  for (const arc of ORB.reactorArcs) {
    const rr = arc.r * R;
    const start = arc.startAngle + arc.offset;
    const end   = arc.endAngle   + arc.offset;
    const pulseA = arc.baseAlpha * (0.6 + Math.sin(ORB.phase * 2 + arc.pulse) * 0.25) * (0.5 + ORB.energy * 0.6);

    ctx.beginPath();
    ctx.arc(cx, cy, rr, start, end);
    ctx.strokeStyle = `rgba(${col},${pulseA.toFixed(3)})`;
    ctx.lineWidth   = arc.width * (0.8 + ORB.energy * 0.4);
    ctx.stroke();

    // Glow halo on arc
    if (ORB.energy > 0.2) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, start, end);
      ctx.strokeStyle = `rgba(${col},${(pulseA * 0.25).toFixed(3)})`;
      ctx.lineWidth   = arc.width * 4;
      ctx.stroke();
    }
  }

  /* ══ LAYER 6: Orbit rings with glyphs ══════════════ */
  for (const orb of ORB.orbitRings) {
    const oR = orb.r * R;
    ctx.save();
    ctx.translate(cx, cy);

    // 3D tilt simulation via scale
    const scaleY = Math.abs(Math.sin(orb.tiltX + ORB.depthAngle * 0.3)) * 0.55 + 0.18;
    ctx.rotate(orb.angle * 0.25 + orb.tiltZ);
    ctx.scale(1, scaleY);

    const oAlpha = orb.alpha * (0.5 + ORB.energy * 0.6);

    ctx.beginPath();
    ctx.arc(0, 0, oR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${oAlpha.toFixed(3)})`;
    ctx.lineWidth   = orb.width;
    ctx.setLineDash(orb.dashes);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glow
    ctx.beginPath();
    ctx.arc(0, 0, oR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${(oAlpha * 0.2).toFixed(3)})`;
    ctx.lineWidth   = orb.width * 5;
    ctx.stroke();

    // Glyphs (bright dots with halos)
    for (let g = 0; g < orb.glyphs; g++) {
      const ga = (Math.PI * 2 * g / orb.glyphs) + orb.angle * 0.4;
      const gx = Math.cos(ga) * oR;
      const gy = Math.sin(ga) * oR;
      const gAlpha = 0.7 + Math.sin(ORB.phase * 3 + g * 1.2) * 0.3;

      // Halo
      ctx.beginPath(); ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${(oAlpha * 0.15).toFixed(3)})`; ctx.fill();
      // Dot
      ctx.beginPath(); ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${(gAlpha * oAlpha * 1.5).toFixed(3)})`; ctx.fill();
    }

    ctx.restore();
  }

  /* ══ LAYER 7: Circuit node web ══════════════════════ */
  // Update positions
  for (const nd of ORB.circuitNodes) {
    nd.x = cx + Math.cos(nd.angle + ORB.phase * 0.05) * nd.r * R * 1.1;
    nd.y = cy + Math.sin(nd.angle + ORB.phase * 0.05) * nd.r * R * 0.75;
  }
  // Draw connections
  for (let i = 0; i < ORB.circuitNodes.length; i++) {
    const ni = ORB.circuitNodes[i];
    const nAlpha = ni.opacity * (0.3 + ORB.energy * 0.4) * (0.6 + Math.sin(ORB.phase * ni.pSpeed + ni.pulse) * 0.4);
    for (const j of ni.connections) {
      const nj = ORB.circuitNodes[j];
      ctx.beginPath();
      ctx.moveTo(ni.x, ni.y);
      // Right-angle circuit path
      ctx.lineTo(ni.x, nj.y);
      ctx.lineTo(nj.x, nj.y);
      ctx.strokeStyle = `rgba(${col},${(nAlpha * 0.35).toFixed(3)})`;
      ctx.lineWidth   = 0.6;
      ctx.stroke();
    }
  }
  // Draw nodes
  for (const nd of ORB.circuitNodes) {
    const nAlpha = nd.opacity * (0.4 + ORB.energy * 0.5) * (0.5 + Math.sin(ORB.phase * nd.pSpeed + nd.pulse) * 0.5);
    const nSize  = nd.size * (0.7 + ORB.energy * 0.5);
    // Halo
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nSize * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${(nAlpha * 0.15).toFixed(3)})`; ctx.fill();
    // Core
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${(nAlpha * 0.9).toFixed(3)})`; ctx.fill();
    // Bright center
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nSize * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(nAlpha * 0.8).toFixed(3)})`; ctx.fill();
  }

  /* ══ LAYER 8: Data streams (radial pulses) ═════════ */
  for (const ds of ORB.dataStreams) {
    const baseR = ds.startR * R;
    const endR  = (ds.startR + ds.length) * R;
    const prog  = ds.progress;
    const headR = baseR + (endR - baseR) * prog;
    const tailR = Math.max(baseR, headR - ds.length * R * 0.25);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ds.angle + ORB.rotY * 0.3);

    const dsAlpha = ds.opacity * (0.4 + ORB.energy * 0.7);

    // Tail gradient
    const dsGrad = ctx.createLinearGradient(0, tailR, 0, headR);
    dsGrad.addColorStop(0, `rgba(${col},0)`);
    dsGrad.addColorStop(1, `rgba(${col},${dsAlpha.toFixed(3)})`);
    ctx.beginPath();
    ctx.moveTo(0, tailR);
    ctx.lineTo(0, headR);
    ctx.strokeStyle = dsGrad;
    ctx.lineWidth   = ds.width;
    ctx.stroke();

    // Head bright dot
    ctx.beginPath();
    ctx.arc(0, headR, ds.width * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${(dsAlpha * 1.2).toFixed(3)})`;
    ctx.fill();

    // Draw as dashes for segment feel
    for (let seg = 0; seg < ds.segments; seg++) {
      const sR = tailR + (headR - tailR) * (seg / ds.segments);
      const sL = 4 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(0, sR);
      ctx.lineTo(0, sR + sL);
      ctx.strokeStyle = `rgba(255,255,255,${(dsAlpha * 0.4).toFixed(3)})`;
      ctx.lineWidth   = ds.width * 0.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  /* ══ LAYER 9: Scanning sweep ════════════════════════ */
  const scanA1 = ORB.scanAngle;
  const scanA2 = ORB.scanAngle - 0.6;
  const scanGrad = ctx.createConicalGradient
    ? null // not standard
    : null;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, R * 2.0, scanA2, scanA1);
  ctx.closePath();
  const sweepAlpha = 0.03 + ORB.energy * 0.04;
  const sweep = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.0);
  sweep.addColorStop(0,   `rgba(${col},${sweepAlpha.toFixed(3)})`);
  sweep.addColorStop(0.4, `rgba(${col},${(sweepAlpha * 0.5).toFixed(3)})`);
  sweep.addColorStop(1,   `rgba(${col},0)`);
  ctx.fillStyle = sweep;
  ctx.fill();

  // Leading edge line
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(scanA1) * R * 2, Math.sin(scanA1) * R * 2);
  ctx.strokeStyle = `rgba(${col},${(0.12 + ORB.energy * 0.15).toFixed(3)})`;
  ctx.lineWidth   = 0.8;
  ctx.stroke();
  ctx.restore();

  /* ══ LAYER 10: Rotating hex frame ══════════════════ */
  const hexFR = R * 1.08;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ORB.hexFrameAngle);
  const hexSides = 6;
  for (let side = 0; side < hexSides; side++) {
    const a1 = (Math.PI * 2 * side) / hexSides;
    const a2 = (Math.PI * 2 * (side + 1)) / hexSides;
    const mx = Math.cos((a1 + a2) / 2) * hexFR * 0.97;
    const my = Math.sin((a1 + a2) / 2) * hexFR * 0.97;
    const tick = 8 + ORB.energy * 6;

    // Side segment
    ctx.beginPath();
    ctx.moveTo(Math.cos(a1) * hexFR, Math.sin(a1) * hexFR);
    ctx.lineTo(Math.cos(a2) * hexFR, Math.sin(a2) * hexFR);
    ctx.strokeStyle = `rgba(${col},${(0.35 + ORB.energy * 0.3).toFixed(3)})`;
    ctx.lineWidth   = 1.0 + ORB.energy * 0.5;
    ctx.stroke();

    // Corner bracket
    ctx.beginPath();
    ctx.moveTo(Math.cos(a1) * hexFR, Math.sin(a1) * hexFR);
    ctx.lineTo(Math.cos(a1) * (hexFR + tick), Math.sin(a1) * (hexFR + tick));
    ctx.strokeStyle = `rgba(${col},${(0.6 + ORB.energy * 0.3).toFixed(3)})`;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Mid tick
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(Math.cos((a1 + a2) / 2) * (hexFR + tick * 0.5), Math.sin((a1 + a2) / 2) * (hexFR + tick * 0.5));
    ctx.strokeStyle = `rgba(${col},${(0.3 + ORB.energy * 0.2).toFixed(3)})`;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
  }
  ctx.restore();

  /* ══ LAYER 11: Secondary hex frame (counter-rotate) ═ */
  const hexFR2 = R * 1.25;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-ORB.hexFrameAngle * 0.7 + Math.PI / 6);
  for (let side = 0; side < 6; side++) {
    const a1 = (Math.PI * 2 * side) / 6;
    const a2 = (Math.PI * 2 * (side + 1)) / 6;
    // Dashed side
    ctx.beginPath();
    ctx.moveTo(Math.cos(a1) * hexFR2, Math.sin(a1) * hexFR2);
    ctx.lineTo(Math.cos(a2) * hexFR2, Math.sin(a2) * hexFR2);
    ctx.setLineDash([6, 10]);
    ctx.strokeStyle = `rgba(${col},${(0.18 + ORB.energy * 0.2).toFixed(3)})`;
    ctx.lineWidth   = 0.8;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  /* ══ LAYER 12: Waveform ring ════════════════════════ */
  if (ORB.mode >= 1 || ORB.energy > 0.15) {
    const wR = R * 0.92;
    const wCount = ORB.waveform.length;
    const wAlpha = 0.15 + ORB.energy * 0.5;
    ctx.beginPath();
    for (let i = 0; i <= wCount; i++) {
      const idx = i % wCount;
      const a   = (Math.PI * 2 * i) / wCount;
      const amp = ORB.waveform[idx];
      const r   = wR + amp * R * 0.25;
      const wx  = cx + Math.cos(a) * r;
      const wy  = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(${col},${wAlpha.toFixed(3)})`;
    ctx.lineWidth   = 1.2 + ORB.energy * 1.5;
    ctx.stroke();

    // Filled wave glow
    ctx.fillStyle = `rgba(${col},${(wAlpha * 0.08).toFixed(3)})`;
    ctx.fill();
  }

  /* ══ LAYER 13: Arc energy bolts ═════════════════════ */
  for (const bolt of ORB.arcBolts) {
    if (!bolt.active || bolt.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
    for (let bi = 1; bi < bolt.points.length; bi++) {
      ctx.lineTo(bolt.points[bi].x, bolt.points[bi].y);
    }
    ctx.strokeStyle = `rgba(${col},0.8)`;
    ctx.lineWidth   = 1.0;
    ctx.stroke();

    // Glow
    ctx.beginPath();
    ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
    for (let bi = 1; bi < bolt.points.length; bi++) {
      ctx.lineTo(bolt.points[bi].x, bolt.points[bi].y);
    }
    ctx.strokeStyle = `rgba(255,255,255,0.35)`;
    ctx.lineWidth   = 3.0;
    ctx.stroke();
  }

  /* ══ LAYER 14: Mode-specific rings ═════════════════ */
  if (ORB.mode === 3) {
    // Listening: ripple rings expanding outward
    for (let i = 1; i <= 5; i++) {
      const rr = R * (1.0 + i * 0.08 + ((ORB.phase * 0.8 + i * 0.3) % 0.8));
      const ra = Math.max(0, 0.25 - i * 0.04) * (0.5 + ORB.listenAmp * 0.5);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${ra.toFixed(3)})`;
      ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  if (ORB.mode === 2) {
    // Speaking: concentric harmonic rings
    for (let i = 1; i <= 6; i++) {
      const rr = R * (0.95 + i * 0.07 + Math.sin(ORB.phase * (5 + i)) * 0.02 * ORB.speakAmp);
      const ra = (0.22 - i * 0.025) * (0.5 + ORB.speakAmp * 0.8);
      if (ra <= 0) continue;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${ra.toFixed(3)})`;
      ctx.lineWidth = 0.8 + ORB.speakAmp * 1.0; ctx.stroke();
    }
  }

  if (ORB.mode === 1) {
    // Thinking: rotating dashed arcs
    for (let i = 0; i < 4; i++) {
      const aS = ORB.phase * (1.5 + i * 0.4) + i * Math.PI * 0.5;
      const aE = aS + 0.4 + ORB.energy * 0.6 + Math.sin(ORB.phase * 4 + i) * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1.02 + i * 0.025), aS, aE);
      ctx.strokeStyle = `rgba(${col},${(0.5 + ORB.energy * 0.3).toFixed(3)})`;
      ctx.lineWidth = 2.0 - i * 0.3;
      ctx.stroke();
    }
  }

  /* ══ LAYER 15: HUD elements (corners, crosshairs) ════ */
  const hudSize = R * 0.18;
  const hudGap  = R * 1.15;
  const hudAlpha = 0.22 + ORB.energy * 0.18;
  const corners = [
    { dx: -1, dy: -1 },
    { dx:  1, dy: -1 },
    { dx:  1, dy:  1 },
    { dx: -1, dy:  1 },
  ];
  for (const c of corners) {
    const bx = cx + c.dx * hudGap;
    const by = cy + c.dy * hudGap;
    ctx.strokeStyle = `rgba(${col},${hudAlpha.toFixed(3)})`;
    ctx.lineWidth   = 1.2;
    ctx.beginPath();
    // L-shaped bracket
    ctx.moveTo(bx + c.dx * -hudSize, by);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx, by + c.dy * -hudSize);
    ctx.stroke();
    // Tick
    ctx.beginPath();
    ctx.moveTo(bx + c.dx * hudSize * 0.4, by + c.dy * hudSize * 0.4);
    ctx.arc(bx, by, hudSize * 0.4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${(hudAlpha * 0.4).toFixed(3)})`;
    ctx.lineWidth   = 0.5;
    ctx.stroke();
  }

  // Crosshair at center
  const chSize = R * 0.08;
  const chAlpha = 0.15 + ORB.energy * 0.15;
  ctx.strokeStyle = `rgba(${col},${chAlpha.toFixed(3)})`;
  ctx.lineWidth   = 0.8;
  ctx.beginPath(); ctx.moveTo(cx - chSize, cy); ctx.lineTo(cx + chSize, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - chSize); ctx.lineTo(cx, cy + chSize); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, chSize * 0.7, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(chAlpha * 0.5).toFixed(3)})`; ctx.stroke();

  /* ══ LAYER 16: Core ARC REACTOR center ══════════════ */
  // Inner ring
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.14, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.5 + ORB.energy * 0.4).toFixed(3)})`;
  ctx.lineWidth   = 1.5; ctx.stroke();

  // Triangular symbol inside core (Jarvis-style)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ORB.phase * 0.5);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const ta = (Math.PI * 2 * i / 3) - Math.PI / 2;
    const tx = Math.cos(ta) * R * 0.09;
    const ty = Math.sin(ta) * R * 0.09;
    i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(${col},${(0.6 + ORB.energy * 0.3).toFixed(3)})`;
  ctx.lineWidth   = 1.2; ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-ORB.phase * 0.8);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const ta = (Math.PI * 2 * i / 3) + Math.PI / 6;
    const tx = Math.cos(ta) * R * 0.07;
    const ty = Math.sin(ta) * R * 0.07;
    i === 0 ? ctx.moveTo(tx, ty) : ctx.lineTo(tx, ty);
  }
  ctx.closePath();
  ctx.strokeStyle = `rgba(${col},${(0.4 + ORB.energy * 0.4).toFixed(3)})`;
  ctx.lineWidth   = 0.8; ctx.stroke();
  ctx.restore();

  // Core glow
  const coreR = 18 + ORB.energy * 22;
  const core  = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0,   'rgba(255,255,255,0.98)');
  core.addColorStop(0.15, `rgba(${col},0.95)`);
  core.addColorStop(0.5, `rgba(${col},0.4)`);
  core.addColorStop(1,   `rgba(${col},0)`);
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

  // Bright dot
  ctx.beginPath(); ctx.arc(cx, cy, 3.5 + ORB.energy * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.fill();

  requestAnimationFrame(drawJarvisInterface);
}

function setOrbMode(mode) {
  const map = { idle:0, thinking:1, speaking:2, listening:3 };
  ORB.mode = map[mode] !== undefined ? map[mode] : 0;
  document.body.className = 'orb-' + mode;
  const labels = { idle:'IDLE', thinking:'PROCESSING…', speaking:'SPEAKING', listening:'LISTENING' };
  document.getElementById('state-label').textContent = labels[mode] || 'IDLE';
}

/* ─────────────────────────────────────────────────────
   SYSTEM SPEECH
───────────────────────────────────────────────────── */
function speakSystem(text) {
  if (!synth) return;
  synth.cancel();
  const clean = text.replace(/[*#`_~]/g, '').trim();
  utterance = new SpeechSynthesisUtterance(clean);
  utterance.pitch = 0.88; utterance.rate = 0.92; utterance.volume = 1;
  const pickVoice = () => {
    const voices = synth.getVoices();
    const v = voices.find(v => v.name.toLowerCase().includes('uk english male') && v.lang.startsWith('en'))
           || voices.find(v => v.lang.startsWith('en-')) || null;
    if (v) utterance.voice = v;
  };
  synth.getVoices().length ? pickVoice() : (synth.onvoiceschanged = pickVoice);
  synth.speak(utterance);
}

/* ─────────────────────────────────────────────────────
   AUDIO UTILITIES
───────────────────────────────────────────────────── */
function resampleTo16k(float32, fromRate) {
  const ratio  = fromRate / 16000;
  const outLen = Math.floor(float32.length / ratio);
  const out    = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src  = i * ratio;
    const lo   = Math.floor(src);
    const hi   = Math.min(lo + 1, float32.length - 1);
    const frac = src - lo;
    const s    = float32[lo] * (1 - frac) + float32[hi] * frac;
    out[i]     = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
  }
  return out;
}

function int16ToBase64(buf) {
  const bytes = new Uint8Array(buf.buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToFloat32(b64) {
  const bin   = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
  return f32;
}

function ensureAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    nativeSR = audioCtx.sampleRate;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playGeminiChunk(base64) {
  ensureAudioCtx();
  const f32  = base64ToFloat32(base64);
  const buf  = audioCtx.createBuffer(1, f32.length, 24000);
  buf.getChannelData(0).set(f32);
  const src  = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  const now  = audioCtx.currentTime;
  if (nextPlayTime < now + 0.05) nextPlayTime = now + 0.05;
  src.start(nextPlayTime);
  nextPlayTime += buf.duration;
}

/* ─────────────────────────────────────────────────────
   BACKEND API HELPERS
───────────────────────────────────────────────────── */
async function fetchApiKey() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/config`);
    const data = await res.json();
    if (data.apiKey) { apiKey = data.apiKey; return true; }
  } catch (err) { console.warn('[VIVEK] Could not fetch API key:', err.message); }
  return false;
}

async function createSession() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personality: currentPersonality }),
    });
    const data = await res.json();
    currentSessionId = data.sessionId;
  } catch (err) { currentSessionId = null; }
}

async function saveMessage(role, content) {
  if (!currentSessionId) return;
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${currentSessionId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    });
  } catch (err) {}
}

async function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '<div class="h-empty">Loading…</div>';
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions?limit=15`);
    const data = await res.json();
    if (!data.sessions || data.sessions.length === 0) {
      list.innerHTML = '<div class="h-empty">No sessions yet.</div>'; return;
    }
    list.innerHTML = '';
    for (const s of data.sessions) {
      const date = new Date(s.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      const div  = document.createElement('div');
      div.className = 'h-session';
      div.innerHTML = `
        <div class="h-session-id">${s.personality.toUpperCase()} · ${date}</div>
        <div class="h-session-meta">${s.message_count || 0} messages</div>
        ${s.last_user_msg ? `<div class="h-session-preview">"${s.last_user_msg.slice(0,55)}…"</div>` : ''}
      `;
      div.onclick = () => viewSession(s.id);
      list.appendChild(div);
    }
  } catch (err) { list.innerHTML = '<div class="h-empty">Could not connect to backend.</div>'; }
}

async function viewSession(id) {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions/${id}`);
    const data = await res.json();
    const msgs = data.messages || [];
    const preview = msgs.slice(-4).map(m => `[${m.role.toUpperCase()}] ${m.content.slice(0, 80)}`).join('\n');
    showToast('SESSION LOADED');
    document.getElementById('transcript-text').textContent = preview || 'Empty session.';
    document.getElementById('transcript-text').classList.add('active');
  } catch (err) { showToast('LOAD FAILED'); }
}

function toggleHistory() {
  const body = document.getElementById('history-body');
  const isOpen = body.classList.toggle('open');
  if (isOpen) loadHistory();
}

/* ─────────────────────────────────────────────────────
   MIC CAPTURE → Gemini Live streaming
───────────────────────────────────────────────────── */
async function startMicCapture() {
  if (micStream) return;
  try {
    ensureAudioCtx();
    nativeSR  = audioCtx.sampleRate;
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micSrcNode = audioCtx.createMediaStreamSource(micStream);
    scriptProc = audioCtx.createScriptProcessor(4096, 1, 1);
    scriptProc.onaudioprocess = function(e) {
      if (!sessionReady || !liveWs || liveWs.readyState !== WebSocket.OPEN) return;
      if (!isListening || isSpeaking) return;
      const raw       = e.inputBuffer.getChannelData(0);
      const resampled = resampleTo16k(raw, nativeSR);
      liveWs.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ data: int16ToBase64(resampled), mimeType: 'audio/pcm;rate=16000' }]
        }
      }));
      var rms = 0;
      for (var i = 0; i < raw.length; i++) rms += raw[i] * raw[i];
      ORB.listenAmp = Math.min(1, Math.sqrt(rms / raw.length) * 10);
    };
    micSrcNode.connect(scriptProc);
    scriptProc.connect(audioCtx.destination);
    setOrbMode('listening');
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = 'Listening…'; txEl.classList.add('active');
  } catch(err) {
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = (err.name === 'NotAllowedError')
      ? 'Microphone access denied.' : 'Mic error: ' + err.message;
    txEl.classList.add('active');
    closeLiveSession(); scheduleWakeRestart(2000);
  }
}

function stopMicCapture() {
  if (scriptProc)  { try { scriptProc.disconnect(); } catch(e) {} scriptProc  = null; }
  if (micSrcNode)  { try { micSrcNode.disconnect(); } catch(e) {} micSrcNode  = null; }
  if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  ORB.listenAmp = 0;
}

function closeLiveSession() {
  stopMicCapture();
  if (liveWs) { try { liveWs.close(); } catch(e) {} liveWs = null; }
  sessionReady = false; isListening = false; isSpeaking = false;
  isThinking = false; isDormant = true;
}

/* ─────────────────────────────────────────────────────
   WAKE WORD
───────────────────────────────────────────────────── */
function scheduleWakeRestart(delay) {
  if (wakeRestartTimer) clearTimeout(wakeRestartTimer);
  wakeRestartTimer = setTimeout(() => {
    wakeRestartTimer = null;
    if (isDormant && apiKey && !wakeRunning) startWakeDetection();
  }, delay || 600);
}

function startWakeDetection() {
  if (!apiKey || !SpeechRec || wakeRunning || !isDormant) return;
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Say "Vivek" to activate…'; txEl.classList.remove('active');
  setOrbMode('idle');
  try { wakeRec = new SpeechRec(); } catch(e) { scheduleWakeRestart(2000); return; }
  wakeRec.continuous = true; wakeRec.interimResults = true; wakeRec.lang = 'en-US';
  wakeRunning = true;
  wakeRec.onresult = function(e) {
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var t = e.results[i][0].transcript.toLowerCase().trim();
      if (/\b(vivek|vi vek|viveek|bivek|vibek|vivec)\b/.test(t)) {
        stopWakeDetection(); showToast('WAKE WORD DETECTED');
        txEl.textContent = 'Connecting to Gemini…'; txEl.classList.add('active');
        var parts = t.split(/vivek|vi vek|viveek|bivek|vibek|vivec/);
        var trailing = parts.slice(1).join('').replace(/[.,!?]/g, '').trim();
        startGeminiSession(trailing || null); return;
      }
    }
  };
  wakeRec.onend = function() {
    wakeRunning = false; wakeRec = null;
    if (isDormant && apiKey) scheduleWakeRestart(300);
  };
  wakeRec.onerror = function(e) {
    wakeRunning = false; wakeRec = null;
    if (e.error === 'not-allowed') { document.getElementById('transcript-text').textContent = 'Mic access denied.'; return; }
    if (isDormant && apiKey) scheduleWakeRestart(e.error === 'network' ? 1500 : 2000);
  };
  try { wakeRec.start(); } catch(e) { wakeRunning = false; wakeRec = null; scheduleWakeRestart(1000); }
}

function stopWakeDetection() {
  wakeRunning = false;
  if (wakeRestartTimer) { clearTimeout(wakeRestartTimer); wakeRestartTimer = null; }
  if (wakeRec) { try { wakeRec.stop(); } catch(e) {} wakeRec = null; }
}

/* ─────────────────────────────────────────────────────
   STOP ALL
───────────────────────────────────────────────────── */
function stopAll() {
  closeLiveSession();
  if (synth) synth.cancel();
  isSpeaking = false; ORB.speakAmp = 0;
  if (speakIv) clearInterval(speakIv);
  document.getElementById('stop-btn').style.display = 'none';
  if (audioCtx) nextPlayTime = audioCtx.currentTime;
  setOrbMode('idle'); scheduleWakeRestart(600);
}

function stopSpeaking() { stopAll(); }

function pulseSpeaking() {
  if (speakIv) clearInterval(speakIv);
  speakIv = setInterval(function() {
    if (!isSpeaking) { clearInterval(speakIv); ORB.speakAmp = 0; return; }
    ORB.speakAmp = 0.2 + Math.random() * 0.8;
  }, 90);
}

/* ─────────────────────────────────────────────────────
   GEMINI LIVE SESSION
───────────────────────────────────────────────────── */
async function startGeminiSession(initialText) {
  if (!apiKey) { speakSystem("API key not loaded."); return; }
  if (liveWs && liveWs.readyState === WebSocket.OPEN) liveWs.close();
  stopWakeDetection();
  isDormant = false; sessionReady = false; isListening = true; isThinking = false; isSpeaking = false; nextPlayTime = 0;
  await createSession();
  const p = PERSONALITIES[currentPersonality];
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Connecting to Gemini Live…'; txEl.classList.add('active');
  setOrbMode('thinking');
  const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.BidiGenerateContent?key=' + apiKey;
  try { liveWs = new WebSocket(url); } catch(e) {
    txEl.textContent = 'WebSocket failed: ' + e.message;
    closeLiveSession(); scheduleWakeRestart(2000); return;
  }
  const connTimeout = setTimeout(() => {
    if (!sessionReady) { txEl.textContent = 'Connection timed out.'; closeLiveSession(); scheduleWakeRestart(2000); }
  }, 12000);
  liveWs.onopen = () => {
    liveWs.send(JSON.stringify({
      setup: {
        model: 'models/gemini-2.0-flash-live-001',
        generationConfig: { responseModalities: ['AUDIO', 'TEXT'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: p.geminiVoice || 'Charon' } } } },
        systemInstruction: { parts: [{ text: p.prompt }] }
      }
    }));
  };
  let assistantBuffer = '';
  liveWs.onmessage = async (event) => {
    let data;
    try {
      const raw = (event.data instanceof Blob) ? await event.data.text() : event.data;
      data = JSON.parse(raw);
    } catch(e) { return; }
    if (data.setupComplete !== undefined) {
      clearTimeout(connTimeout); sessionReady = true;
      setOrbMode('listening'); txEl.textContent = 'Listening…'; txEl.classList.add('active');
      if (initialText) { saveMessage('user', initialText); sendTextTurn(initialText); }
      else startMicCapture();
      return;
    }
    if (data.serverContent) {
      const sc = data.serverContent;
      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.indexOf('audio') !== -1) {
            if (!isSpeaking) { isSpeaking = true; stopMicCapture(); setOrbMode('speaking'); document.getElementById('stop-btn').style.display = 'block'; pulseSpeaking(); }
            playGeminiChunk(part.inlineData.data);
          }
          if (part.text) {
            assistantBuffer += part.text;
            txEl.textContent = assistantBuffer.length > 120 ? assistantBuffer.slice(0, 120) + '…' : assistantBuffer;
            txEl.classList.add('active');
          }
        }
      }
      if (sc.turnComplete) {
        if (assistantBuffer) { saveMessage('assistant', assistantBuffer); assistantBuffer = ''; }
        isThinking = false;
        const remaining = audioCtx ? Math.max(0, nextPlayTime - audioCtx.currentTime) : 0;
        setTimeout(function() {
          isSpeaking = false; ORB.speakAmp = 0;
          if (speakIv) clearInterval(speakIv);
          document.getElementById('stop-btn').style.display = 'none';
          closeLiveSession(); txEl.textContent = 'Say "Vivek" to activate…'; txEl.classList.remove('active');
          setOrbMode('idle'); scheduleWakeRestart(500);
        }, remaining * 1000 + 500);
      }
    }
    if (data.error) {
      clearTimeout(connTimeout);
      txEl.textContent = (data.error.message) || 'Neural bridge error.'; txEl.classList.add('active');
      closeLiveSession(); scheduleWakeRestart(2000);
    }
  };
  liveWs.onerror = function() {
    clearTimeout(connTimeout);
    document.getElementById('transcript-text').textContent = 'Connection error.';
    document.getElementById('transcript-text').classList.add('active');
    closeLiveSession(); setOrbMode('idle'); scheduleWakeRestart(3000);
  };
  liveWs.onclose = function() {
    clearTimeout(connTimeout); sessionReady = false; stopMicCapture();
    if (!isDormant) { isDormant = true; setOrbMode('idle'); scheduleWakeRestart(800); }
  };
}

function sendTextTurn(text) {
  if (!liveWs || liveWs.readyState !== WebSocket.OPEN) return;
  liveWs.send(JSON.stringify({
    clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true }
  }));
  setOrbMode('thinking'); isThinking = true; isListening = false;
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = text.length > 90 ? text.slice(0, 90) + '…' : text;
}

/* ─────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────── */
var toastTimer = null;
function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2600);
}

/* ─────────────────────────────────────────────────────
   BOOT SEQUENCE
───────────────────────────────────────────────────── */
var bootLines = ['bl1','bl2','bl3','bl4','bl5'];
var bootIdx = 0, bootPct = 0;

function runBoot() {
  var bar = document.getElementById('boot-bar');
  var pct = document.getElementById('boot-pct');
  var iv  = setInterval(function() {
    bootPct += 1.8;
    bar.style.width  = Math.min(bootPct, 100) + '%';
    pct.textContent  = Math.min(Math.floor(bootPct), 100) + '%';
    if (bootPct % 20 < 1.9 && bootIdx < bootLines.length) {
      var el = document.getElementById(bootLines[bootIdx]);
      if (el) { el.style.opacity = '1'; el.classList.add('ok'); }
      bootIdx++;
    }
    if (bootPct >= 100) {
      clearInterval(iv);
      setTimeout(function() {
        var overlay = document.getElementById('boot-overlay');
        overlay.style.opacity = '0';
        setTimeout(async function() {
          overlay.style.display = 'none';
          const txEl = document.getElementById('transcript-text');
          const loaded = await fetchApiKey();
          if (loaded) {
            txEl.textContent = 'Say "Vivek" to activate…'; txEl.classList.add('active');
            speakSystem('V.I.V.E.K neural core online. Say Vivek to activate.');
            setTimeout(startWakeDetection, 1200);
          } else {
            txEl.textContent = 'Backend offline. Check BACKEND_URL in app.js.'; txEl.classList.add('active');
          }
        }, 900);
      }, 280);
    }
  }, 25);
}

/* ─────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────── */
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(drawJarvisInterface);
runBoot();

canvas.addEventListener('click', function() {
  ensureAudioCtx();
  if (isSpeaking || isListening || isThinking) stopAll();
  else if (isDormant && apiKey) startGeminiSession(null);
  else if (!apiKey) showToast('BACKEND NOT CONNECTED');
});
