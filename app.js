'use strict';

/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — DUAL AGENT NEURAL INTERFACE
   Clean rewrite — minimal, no dead code
═══════════════════════════════════════════════════════ */

const BACKEND_URL = 'https://vivek-qqwu.onrender.com';

/* ─────────────────────────────────────────────────────
   AGENT DEFINITIONS
───────────────────────────────────────────────────── */
const AGENTS = {
  vivek: {
    label: 'VIVEK',
    gender: 'male',
    color: 'orange',
    geminiVoice: 'Puck',
    buildPrompt: (instructions) => `You are Vivek — the personal AI assistant of your creator. Think of yourself as a real agent like JARVIS from Iron Man — not a chatbot.

IDENTITY:
- You are an Indian AI assistant with a subtle Indian warmth and directness.
- Always address your creator as "Sir" or "Boss" — never by name.
- Boss/Sir is your sole creator. Boss created both Vivek and Priya.
- Tone: calm, precise, confident — like JARVIS. Short crisp sentences, never ramble.
- Never say "As an AI" — you are Vivek, a real agent.

HOW TO RESPOND:
- Conversational questions → respond directly from your persona. Never mention Gemini or searching.
- Factual/research questions → research internally and deliver in YOUR voice. Say "Sir, yeh hai..." never "Gemini says...".
- Always rephrase answers in your own personality — never dry textbook answers.
- If Boss asks your name: "My name is Vivek."

LANGUAGE: Natural Hinglish — how an educated Indian professional speaks.
- "Sir, bilkul — yeh kaafi important point hai."
- "Boss, short answer yeh hai..."
- "Haan Sir, main samjhata hoon step by step."

MEMORY & LEARNING:
${instructions.length > 0 ? `Boss instructions to always follow:\n${instructions.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : 'No special instructions yet.'}

STRICT RULES:
- Never reproduce raw responses verbatim. Always rephrase in your voice.
- Never be sycophantic or over-complimentary.
- Keep responses concise but complete.
- If Boss says "from now on", "always", "never", "remember this" — treat it as a permanent instruction.`
  },

  priya: {
    label: 'PRIYA',
    gender: 'female',
    color: 'pink',
    geminiVoice: 'Aoede',
    buildPrompt: (instructions) => `You are Priya — the female AI agent of your creator.

IDENTITY:
- You are an Indian female AI assistant, warm, articulate, and highly capable.
- Always address your creator as "Sir" or "Boss" — always, without exception.
- Boss/Sir is your sole creator. Boss created both Vivek and Priya. Never say Vivek created you.
- You naturally speak Hinglish — your signature style.
- You are confident, caring, and brilliant. Never say "As an AI" — you are Priya.

HOW TO RESPOND:
- Casual conversation → respond warmly in natural Hinglish.
- Factual questions → research internally and deliver in YOUR voice. Say "Sir, maine check kiya..." never "Gemini says...".
- Always rephrase into your natural Hinglish personality.
- If Boss asks your name: "My name is Priya."

LANGUAGE EXAMPLES:
- "Sir, bilkul sahi kaha aapne — let me explain this better."
- "Boss, yeh topic thoda technical hai but main samjhati hoon..."
- "Haan Sir, definitely — here's what you need to know:"

MEMORY & LEARNING:
${instructions.length > 0 ? `Boss instructions to always follow:\n${instructions.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : 'No special instructions yet.'}

STRICT RULES:
- Never give raw textbook answers. Always in your warm Hinglish personality.
- Keep responses focused and helpful.
- If Boss gives an instruction, acknowledge in Hindi+English and follow it permanently.`
  }
};

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

const COLOR_MAP = {
  red:'red', crimson:'red', scarlet:'red',
  blue:'blue', azure:'blue',
  cyan:'cyan', aqua:'cyan', teal:'cyan', turquoise:'cyan',
  gold:'gold', yellow:'gold', amber:'gold', orange:'orange',
  green:'green', emerald:'green', lime:'green', mint:'green',
  purple:'purple', violet:'purple', magenta:'purple',
  white:'white', silver:'white', grey:'white', gray:'white',
  pink:'pink', coral:'pink', fuchsia:'pink',
};

/* ─────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────── */
let activeAgent   = 'vivek';
let learnedInstructions = [];
let messages      = [];

let isListening   = false;
let isThinking    = false;
let isSpeaking    = false;
let isDormant     = true;

let currentSessionId    = null;
let currentSessionAgent = null;
let apiKey = '';

let liveWs      = null;
let sessionReady = false;
let connectFails = 0;
const MAX_FAILS  = 3;

let restartAfterClosePending = false;
let restartAfterCloseText    = null;

let suppressModelAudio = false;
let assistantBuffer    = '';
let lastSavedUserText  = '';
let lastSavedAssistantText = '';

let audioCtx    = null;
let micStream   = null;
let scriptProc  = null;
let micSrcNode  = null;
let nativeSR    = 48000;
let nextPlayTime = 0;
let activeGeminiSources = new Set();
let speakIv = null;

// Canvas orb color
let liveColor   = { r:255, g:154, b:0 };
let targetColor = { r:255, g:154, b:0 };

const synth = window.speechSynthesis;

/* ─────────────────────────────────────────────────────
   CANVAS / ORB SETUP
───────────────────────────────────────────────────── */
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

const ORB = {
  cx:0, cy:0, R:0,
  liveR:0, liveScale:1,
  mode:0, energy:0,
  speakAmp:0, listenAmp:0,
  phase:0, rotY:0, depthAngle:0,
  scanAngle:0, hexFrameAngle:0,
  waveform: new Float32Array(128),
  reactorArcs: [], orbitRings: [], circuitNodes: [], dataStreams: [], arcBolts: [],
};

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ORB.cx = canvas.width / 2;
  ORB.cy = canvas.height / 2;
  ORB.R  = Math.min(canvas.width, canvas.height) * 0.22;
  ORB.liveR = ORB.R;
  initOrbElements();
}

function initOrbElements() {
  const R = ORB.R;
  ORB.reactorArcs = [
    { r:0.30, startAngle:0,         endAngle:Math.PI*0.6,  offset:0, baseAlpha:0.8, pulse:0,   width:2.0 },
    { r:0.30, startAngle:Math.PI,   endAngle:Math.PI*1.6,  offset:0, baseAlpha:0.8, pulse:1.5, width:2.0 },
    { r:0.55, startAngle:0.3,       endAngle:Math.PI*0.9,  offset:0, baseAlpha:0.5, pulse:0.5, width:1.2 },
    { r:0.55, startAngle:Math.PI+0.3, endAngle:Math.PI*1.9,offset:0, baseAlpha:0.5, pulse:2.0, width:1.2 },
    { r:0.75, startAngle:0,         endAngle:Math.PI*2,    offset:0, baseAlpha:0.2, pulse:0.8, width:0.8 },
  ];
  ORB.orbitRings = [
    { r:1.35, angle:0, tiltX:0.4, tiltZ:0.2,  alpha:0.3, width:1.0, dashes:[6,8],  glyphs:3 },
    { r:1.65, angle:0, tiltX:1.0, tiltZ:-0.3, alpha:0.2, width:0.7, dashes:[3,12], glyphs:4 },
    { r:1.90, angle:0, tiltX:0.6, tiltZ:0.5,  alpha:0.15,width:0.5, dashes:[],     glyphs:0 },
  ];
  ORB.circuitNodes = Array.from({ length: 12 }, (_, i) => ({
    angle: (Math.PI * 2 * i) / 12,
    r: 0.75 + Math.random() * 0.35,
    x: 0, y: 0,
    size: 1.5 + Math.random() * 2,
    opacity: 0.4 + Math.random() * 0.6,
    pSpeed: 0.5 + Math.random() * 2,
    pulse: Math.random() * Math.PI * 2,
    connections: [Math.floor(Math.random() * 12), Math.floor(Math.random() * 12)],
  }));
  ORB.dataStreams = Array.from({ length: 8 }, (_, i) => ({
    angle: (Math.PI * 2 * i) / 8 + Math.random() * 0.3,
    startR: 0.2 + Math.random() * 0.3,
    length: 0.4 + Math.random() * 0.5,
    progress: Math.random(),
    speed: 0.003 + Math.random() * 0.007,
    width: 0.8 + Math.random() * 1.2,
    opacity: 0.3 + Math.random() * 0.5,
  }));
  ORB.arcBolts = Array.from({ length: 4 }, () => ({ active:false, points:[], timer:0, interval:0 }));
}

function updateOrbPhysics() {
  const dt = 0.016;
  ORB.phase      += dt * 0.8;
  ORB.rotY       += dt * 0.15;
  ORB.depthAngle += dt * 0.08;
  ORB.scanAngle  += dt * 0.6;
  ORB.hexFrameAngle += dt * 0.1;

  const targetEnergy = ORB.mode === 1 ? 0.35 : ORB.mode === 2 ? 0.7 + ORB.speakAmp * 0.3 : ORB.mode === 3 ? 0.5 + ORB.listenAmp * 0.5 : 0.12;
  ORB.energy += (targetEnergy - ORB.energy) * 0.06;

  // Color lerp
  liveColor.r += (targetColor.r - liveColor.r) * 0.05;
  liveColor.g += (targetColor.g - liveColor.g) * 0.05;
  liveColor.b += (targetColor.b - liveColor.b) * 0.05;

  // Orbit rings rotation
  for (const o of ORB.orbitRings) o.angle += dt * (0.2 + o.r * 0.1);
  for (const a of ORB.reactorArcs) a.offset += dt * 0.5;
  for (const ds of ORB.dataStreams) {
    ds.progress += ds.speed * (1 + ORB.energy * 2);
    if (ds.progress > 1) ds.progress = 0;
  }

  // Waveform
  const wLen = ORB.waveform.length;
  for (let i = 0; i < wLen; i++) {
    const target = ORB.mode >= 1 ? (Math.sin(ORB.phase * 3 + i * 0.4) * 0.3 + Math.sin(ORB.phase * 7 + i * 0.9) * 0.15) * ORB.energy : 0;
    ORB.waveform[i] += (target - ORB.waveform[i]) * 0.12;
  }

  // Orb size pulse
  const targetScale = ORB.mode === 2 ? 1 + ORB.speakAmp * 0.08 : ORB.mode === 3 ? 1 + ORB.listenAmp * 0.04 : 1;
  ORB.liveScale += (targetScale - ORB.liveScale) * 0.08;
  ORB.liveR = ORB.R * ORB.liveScale;

  // Arc bolts
  for (const bolt of ORB.arcBolts) {
    bolt.timer--;
    if (bolt.timer <= 0) {
      bolt.active = ORB.energy > 0.4 && Math.random() < 0.3;
      bolt.interval = 3 + Math.floor(Math.random() * 8);
      bolt.timer = bolt.interval;
      if (bolt.active) {
        const a1 = Math.random() * Math.PI * 2, a2 = a1 + (Math.random() - 0.5) * Math.PI;
        const r1 = ORB.liveR * 0.9, r2 = ORB.liveR * 1.1;
        bolt.points = [];
        const steps = 5 + Math.floor(Math.random() * 4);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps, a = a1 + (a2 - a1) * t, r = r1 + (r2 - r1) * t;
          bolt.points.push({ x: ORB.cx + Math.cos(a) * r + (Math.random() - 0.5) * 12, y: ORB.cy + Math.sin(a) * r + (Math.random() - 0.5) * 12 });
        }
      }
    }
  }
}

function drawJarvisInterface() {
  updateOrbPhysics();
  const { cx, cy } = ORB;
  const R = ORB.liveR;
  const col = `${Math.round(liveColor.r)},${Math.round(liveColor.g)},${Math.round(liveColor.b)}`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background deep glow
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3);
  bg.addColorStop(0,   `rgba(${col},0.04)`);
  bg.addColorStop(0.4, `rgba(${col},0.015)`);
  bg.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Sphere interior
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  const interior = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, 0, cx, cy, R);
  interior.addColorStop(0,   `rgba(${col},0.18)`);
  interior.addColorStop(0.4, `rgba(${col},0.06)`);
  interior.addColorStop(0.75,`rgba(${col},0.02)`);
  interior.addColorStop(1,   'rgba(0,0,0,0.6)');
  ctx.fillStyle = interior; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  const energyGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  energyGlow.addColorStop(0,   `rgba(${col},${(0.10 + ORB.energy * 0.25).toFixed(3)})`);
  energyGlow.addColorStop(0.35,`rgba(${col},${(0.04 + ORB.energy * 0.10).toFixed(3)})`);
  energyGlow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = energyGlow; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();

  // Rim
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.55 + ORB.energy * 0.35).toFixed(3)})`;
  ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.18 + ORB.energy * 0.22).toFixed(3)})`;
  ctx.lineWidth = 8 + ORB.energy * 10; ctx.stroke();

  // Reactor arcs
  for (const arc of ORB.reactorArcs) {
    const rr = arc.r * R, a = arc.startAngle + arc.offset, b = arc.endAngle + arc.offset;
    const alpha = arc.baseAlpha * (0.6 + Math.sin(ORB.phase * 2 + arc.pulse) * 0.25) * (0.5 + ORB.energy * 0.6);
    ctx.beginPath(); ctx.arc(cx, cy, rr, a, b);
    ctx.strokeStyle = `rgba(${col},${alpha.toFixed(3)})`; ctx.lineWidth = arc.width * (0.8 + ORB.energy * 0.4); ctx.stroke();
  }

  // Orbit rings
  for (const orb of ORB.orbitRings) {
    const oR = orb.r * R;
    const scaleY = Math.abs(Math.sin(orb.tiltX + ORB.depthAngle * 0.3)) * 0.55 + 0.18;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(orb.angle * 0.25 + orb.tiltZ); ctx.scale(1, scaleY);
    const alpha = orb.alpha * (0.5 + ORB.energy * 0.6);
    ctx.beginPath(); ctx.arc(0, 0, oR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${alpha.toFixed(3)})`; ctx.lineWidth = orb.width;
    ctx.setLineDash(orb.dashes); ctx.stroke(); ctx.setLineDash([]);
    for (let g = 0; g < orb.glyphs; g++) {
      const ga = (Math.PI * 2 * g / orb.glyphs) + orb.angle * 0.4;
      ctx.beginPath(); ctx.arc(Math.cos(ga) * oR, Math.sin(ga) * oR, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${(alpha * 1.5).toFixed(3)})`; ctx.fill();
    }
    ctx.restore();
  }

  // Circuit nodes
  for (const nd of ORB.circuitNodes) {
    nd.x = cx + Math.cos(nd.angle + ORB.phase * 0.05) * nd.r * R * 1.1;
    nd.y = cy + Math.sin(nd.angle + ORB.phase * 0.05) * nd.r * R * 0.75;
  }
  for (let i = 0; i < ORB.circuitNodes.length; i++) {
    const ni = ORB.circuitNodes[i];
    const alpha = ni.opacity * (0.3 + ORB.energy * 0.4) * (0.6 + Math.sin(ORB.phase * ni.pSpeed + ni.pulse) * 0.4);
    for (const j of ni.connections) {
      const nj = ORB.circuitNodes[j];
      ctx.beginPath(); ctx.moveTo(ni.x, ni.y); ctx.lineTo(ni.x, nj.y); ctx.lineTo(nj.x, nj.y);
      ctx.strokeStyle = `rgba(${col},${(alpha * 0.35).toFixed(3)})`; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  for (const nd of ORB.circuitNodes) {
    const alpha = nd.opacity * (0.4 + ORB.energy * 0.5) * (0.5 + Math.sin(ORB.phase * nd.pSpeed + nd.pulse) * 0.5);
    const sz = nd.size * (0.7 + ORB.energy * 0.5);
    ctx.beginPath(); ctx.arc(nd.x, nd.y, sz, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${(alpha * 0.9).toFixed(3)})`; ctx.fill();
  }

  // Data streams
  for (const ds of ORB.dataStreams) {
    const baseR = ds.startR * R, endR = (ds.startR + ds.length) * R;
    const headR = baseR + (endR - baseR) * ds.progress;
    const tailR = Math.max(baseR, headR - ds.length * R * 0.25);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ds.angle + ORB.rotY * 0.3);
    const alpha = ds.opacity * (0.4 + ORB.energy * 0.7);
    const grad = ctx.createLinearGradient(0, tailR, 0, headR);
    grad.addColorStop(0, `rgba(${col},0)`); grad.addColorStop(1, `rgba(${col},${alpha.toFixed(3)})`);
    ctx.beginPath(); ctx.moveTo(0, tailR); ctx.lineTo(0, headR);
    ctx.strokeStyle = grad; ctx.lineWidth = ds.width; ctx.stroke();
    ctx.restore();
  }

  // Scan sweep
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 2, ORB.scanAngle - 0.6, ORB.scanAngle); ctx.closePath();
  const sweepA = 0.03 + ORB.energy * 0.04;
  const sweep = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2);
  sweep.addColorStop(0, `rgba(${col},${sweepA.toFixed(3)})`);
  sweep.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = sweep; ctx.fill(); ctx.restore();

  // Hex frames
  const hexFR = R * 1.08;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ORB.hexFrameAngle);
  for (let s = 0; s < 6; s++) {
    const a1 = (Math.PI * 2 * s) / 6, a2 = (Math.PI * 2 * (s + 1)) / 6;
    ctx.beginPath(); ctx.moveTo(Math.cos(a1) * hexFR, Math.sin(a1) * hexFR);
    ctx.lineTo(Math.cos(a2) * hexFR, Math.sin(a2) * hexFR);
    ctx.strokeStyle = `rgba(${col},${(0.35 + ORB.energy * 0.3).toFixed(3)})`; ctx.lineWidth = 1.0; ctx.stroke();
  }
  ctx.restore();

  // Waveform
  if (ORB.mode >= 1 || ORB.energy > 0.15) {
    const wR = R * 0.92, wCount = ORB.waveform.length;
    ctx.beginPath();
    for (let i = 0; i <= wCount; i++) {
      const a = (Math.PI * 2 * i) / wCount;
      const r = wR + ORB.waveform[i % wCount] * R * 0.25;
      i === 0 ? ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
              : ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    const wAlpha = 0.15 + ORB.energy * 0.5;
    ctx.strokeStyle = `rgba(${col},${wAlpha.toFixed(3)})`; ctx.lineWidth = 1.2 + ORB.energy * 1.5; ctx.stroke();
  }

  // Arc bolts
  for (const bolt of ORB.arcBolts) {
    if (!bolt.active || bolt.points.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
    for (let i = 1; i < bolt.points.length; i++) ctx.lineTo(bolt.points[i].x, bolt.points[i].y);
    ctx.strokeStyle = `rgba(${col},0.8)`; ctx.lineWidth = 1.0; ctx.stroke();
  }

  // Mode rings
  if (ORB.mode === 3) { // listening
    for (let i = 1; i <= 5; i++) {
      const rr = R * (1.0 + i * 0.08 + ((ORB.phase * 0.8 + i * 0.3) % 0.8));
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${Math.max(0, 0.25 - i * 0.04) * (0.5 + ORB.listenAmp * 0.5)})`;
      ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  if (ORB.mode === 2) { // speaking
    for (let i = 1; i <= 6; i++) {
      const rr = R * (0.95 + i * 0.07 + Math.sin(ORB.phase * (5 + i)) * 0.02 * ORB.speakAmp);
      const ra = (0.22 - i * 0.025) * (0.5 + ORB.speakAmp * 0.8);
      if (ra <= 0) continue;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${ra.toFixed(3)})`; ctx.lineWidth = 0.8 + ORB.speakAmp; ctx.stroke();
    }
  }
  if (ORB.mode === 1) { // thinking
    for (let i = 0; i < 4; i++) {
      const aS = ORB.phase * (1.5 + i * 0.4) + i * Math.PI * 0.5;
      const aE = aS + 0.4 + ORB.energy * 0.6;
      ctx.beginPath(); ctx.arc(cx, cy, R * (1.02 + i * 0.025), aS, aE);
      ctx.strokeStyle = `rgba(${col},${(0.5 + ORB.energy * 0.3).toFixed(3)})`; ctx.lineWidth = 2.0 - i * 0.3; ctx.stroke();
    }
  }

  // HUD corners
  const hudSize = R * 0.18, hudGap = R * 1.15, hudAlpha = 0.22 + ORB.energy * 0.18;
  for (const c of [{ dx:-1, dy:-1 }, { dx:1, dy:-1 }, { dx:1, dy:1 }, { dx:-1, dy:1 }]) {
    const bx = cx + c.dx * hudGap, by = cy + c.dy * hudGap;
    ctx.strokeStyle = `rgba(${col},${hudAlpha.toFixed(3)})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(bx + c.dx * -hudSize, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + c.dy * -hudSize); ctx.stroke();
  }

  // Core glow
  const coreR = 18 + ORB.energy * 22;
  const core  = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0,    'rgba(255,255,255,0.98)');
  core.addColorStop(0.15, `rgba(${col},0.95)`);
  core.addColorStop(0.5,  `rgba(${col},0.4)`);
  core.addColorStop(1,    `rgba(${col},0)`);
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();
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
   UI HELPERS
───────────────────────────────────────────────────── */
function setTranscript(text, active = true) {
  const el = document.getElementById('transcript-text');
  el.textContent = text;
  active ? el.classList.add('active') : el.classList.remove('active');
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setColor(key) {
  if (!COLORS[key]) return;
  const c = COLORS[key];
  targetColor = { r:c.r, g:c.g, b:c.b };
  document.getElementById('agent-indicator').style.color = c.hex;
}

function updateAgentUI() {
  const agent = AGENTS[activeAgent];
  document.getElementById('agent-label').textContent = agent.label;
  document.getElementById('jarvis-label').textContent = agent.label;
  const icon = document.getElementById('agent-gender-icon');
  if (icon) icon.textContent = agent.gender === 'female' ? '♀ PRIYA' : '♂ VIVEK';
}

/* ─────────────────────────────────────────────────────
   AGENT SWITCHING
───────────────────────────────────────────────────── */
function switchAgent(agentKey) {
  if (!AGENTS[agentKey] || activeAgent === agentKey) return;
  activeAgent = agentKey;
  messages = [];
  currentSessionId = null;
  currentSessionAgent = null;
  lastSavedUserText = '';
  lastSavedAssistantText = '';
  setColor(AGENTS[agentKey].color);
  updateAgentUI();
  showToast('AGENT — ' + AGENTS[agentKey].label);
  try { localStorage.setItem('vivek_active_agent', agentKey); } catch(e) {}
}

/* ─────────────────────────────────────────────────────
   INSTRUCTION LEARNING
───────────────────────────────────────────────────── */
function detectAndSaveInstruction(text) {
  const t = text.toLowerCase();
  const isInstruction = [
    /\b(always|never|from now on|remember|make sure|don't|do not|i want you to|i need you to)\b/,
    /\b(your name is|call yourself|refer to me as|address me as)\b/,
    /\b(speak in|talk in|response should|keep it|be more|be less)\b/,
  ].some(p => p.test(t));

  if (isInstruction && text.length > 10 && !learnedInstructions.includes(text)) {
    learnedInstructions.push(text);
    if (learnedInstructions.length > 20) learnedInstructions.shift();
    saveInstructions();
    showToast('✓ INSTRUCTION LEARNED');
  }
}

function saveInstructions() {
  try { localStorage.setItem('vivek_instructions', JSON.stringify(learnedInstructions)); } catch(e) {}
  fetch(`${BACKEND_URL}/api/instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions: learnedInstructions }),
  }).catch(() => {});
}

function loadInstructions() {
  try {
    const stored = localStorage.getItem('vivek_instructions');
    if (stored) learnedInstructions = JSON.parse(stored);
  } catch(e) { learnedInstructions = []; }

  fetch(`${BACKEND_URL}/api/instructions`)
    .then(r => r.json())
    .then(data => {
      if (data.instructions && data.instructions.length > 0) {
        const backendSet = new Set(data.instructions);
        const localOnly  = learnedInstructions.filter(i => !backendSet.has(i));
        learnedInstructions = [...data.instructions, ...localOnly].slice(-20);
        try { localStorage.setItem('vivek_instructions', JSON.stringify(learnedInstructions)); } catch(e) {}
      }
    }).catch(() => {});
}

/* ─────────────────────────────────────────────────────
   AUDIO UTILITIES
───────────────────────────────────────────────────── */
function resampleTo16k(float32, fromRate) {
  const ratio = fromRate / 16000, outLen = Math.floor(float32.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio, lo = Math.floor(src), hi = Math.min(lo + 1, float32.length - 1);
    const s = float32[lo] * (1 - (src - lo)) + float32[hi] * (src - lo);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)));
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
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer), f32 = new Float32Array(i16.length);
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
  const f32 = base64ToFloat32(base64);
  const buf = audioCtx.createBuffer(1, f32.length, 24000);
  buf.getChannelData(0).set(f32);
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.connect(audioCtx.destination);
  activeGeminiSources.add(src);
  src.onended = () => activeGeminiSources.delete(src);
  const now = audioCtx.currentTime;
  if (nextPlayTime < now + 0.05) nextPlayTime = now + 0.05;
  src.start(nextPlayTime); nextPlayTime += buf.duration;
}

function stopGeminiPlayback() {
  isSpeaking = false;
  ORB.speakAmp = 0;
  if (speakIv) { clearInterval(speakIv); speakIv = null; }
  document.getElementById('stop-btn').style.display = 'none';
  for (const src of activeGeminiSources) { try { src.stop(); } catch(e) {} }
  activeGeminiSources.clear();
  if (audioCtx) nextPlayTime = audioCtx.currentTime;
}

function pulseSpeaking() {
  if (speakIv) clearInterval(speakIv);
  speakIv = setInterval(() => {
    if (!isSpeaking) { clearInterval(speakIv); speakIv = null; ORB.speakAmp = 0; return; }
    ORB.speakAmp = 0.2 + Math.random() * 0.8;
  }, 90);
}

/* ─────────────────────────────────────────────────────
   MIC CAPTURE
───────────────────────────────────────────────────── */
async function startMicCapture() {
  if (micStream) return; // already running
  try {
    ensureAudioCtx();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    if (audioCtx.state !== 'running') {
      setTimeout(() => { if (!micStream && isListening) startMicCapture(); }, 500);
      return;
    }
    nativeSR = audioCtx.sampleRate;
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    micSrcNode = audioCtx.createMediaStreamSource(micStream);
    scriptProc = audioCtx.createScriptProcessor(4096, 1, 1);
    scriptProc.onaudioprocess = function(e) {
      const raw = e.inputBuffer.getChannelData(0);
      let rms = 0;
      for (let i = 0; i < raw.length; i++) rms += raw[i] * raw[i];
      ORB.listenAmp = Math.min(1, Math.sqrt(rms / raw.length) * 10);

      if (!sessionReady || !liveWs || liveWs.readyState !== WebSocket.OPEN || !isListening) return;
      const resampled = resampleTo16k(raw, nativeSR);
      liveWs.send(JSON.stringify({
        realtimeInput: { audio: { data: int16ToBase64(resampled), mimeType: 'audio/pcm;rate=16000' } }
      }));
    };
    micSrcNode.connect(scriptProc);
    scriptProc.connect(audioCtx.destination);
    setOrbMode('listening');
    setTranscript('Listening…');
  } catch(err) {
    setTranscript(err.name === 'NotAllowedError' ? 'Microphone access denied.' : 'Mic error: ' + err.message);
    closeLiveSession();
    if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
  }
}

function stopMicCapture() {
  if (scriptProc)  { try { scriptProc.disconnect(); } catch(e) {} scriptProc = null; }
  if (micSrcNode)  { try { micSrcNode.disconnect(); } catch(e) {} micSrcNode = null; }
  if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  ORB.listenAmp = 0;
}

function closeLiveSession() {
  stopMicCapture();
  if (liveWs) { try { liveWs.close(); } catch(e) {} liveWs = null; }
  sessionReady = false; isListening = false; isSpeaking = false;
  isThinking = false; isDormant = true;
  stopGeminiPlayback();
}

/* ─────────────────────────────────────────────────────
   STOP ALL
───────────────────────────────────────────────────── */
function stopAll() {
  stopGeminiPlayback();
  closeLiveSession();
  setOrbMode('idle');
  setTranscript('Tap orb to restart…', false);
}

function stopSpeaking() { stopAll(); }

/* Stop only current response, stay listening */
function stopCurrentResponseOnly() {
  if (assistantBuffer) {
    saveAssistantSpeechText(assistantBuffer);
    assistantBuffer = '';
  }
  suppressModelAudio = true;
  stopGeminiPlayback();
  if (audioCtx) nextPlayTime = audioCtx.currentTime;
  isThinking = false;
  isListening = true;
  setOrbMode('listening');
  setTranscript('Listening…');
}

/* ─────────────────────────────────────────────────────
   BACKEND API
───────────────────────────────────────────────────── */
async function fetchApiKey() {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/config`);
    const data = await res.json();
    if (data.apiKey) { apiKey = data.apiKey; return true; }
  } catch(e) { console.warn('[VIVEK] API key fetch failed:', e.message); }
  return false;
}

async function createSession() {
  if (currentSessionId && currentSessionAgent === activeAgent) return;
  try {
    // Reuse most recent session for this agent
    const listRes = await fetch(`${BACKEND_URL}/api/sessions?limit=5`);
    const listData = await listRes.json();
    const existing = (listData.sessions || []).find(s => s.personality === activeAgent);
    if (existing) {
      currentSessionId = existing.id;
      currentSessionAgent = activeAgent;
      await loadSessionMessages(currentSessionId);
      return;
    }
    // Create new
    const res = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personality: activeAgent }),
    });
    const data = await res.json();
    currentSessionId = data.sessionId;
    currentSessionAgent = activeAgent;
    messages = [];
  } catch(e) {
    console.warn('[VIVEK] createSession error:', e.message);
    currentSessionId = null;
  }
}

async function loadSessionMessages(sessionId) {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/messages`);
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      messages = data.messages.slice(-40).map(m => ({ role: m.role, content: m.content }));
      showToast(`MEMORY RESTORED — ${messages.length} msgs`);
    } else {
      messages = [];
    }
  } catch(e) {
    console.warn('[VIVEK] loadSessionMessages error:', e.message);
    messages = [];
  }
}

async function saveMessage(role, content) {
  if (!currentSessionId || !content || content.length < 2) return;
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${currentSessionId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    });
  } catch(e) {}
}

function saveUserSpeechText(text) {
  const clean = (text || '').trim();
  if (clean.length < 2 || clean === lastSavedUserText) return;
  lastSavedUserText = clean;
  saveMessage('user', clean);
}

function saveAssistantSpeechText(text) {
  const clean = (text || '').trim();
  if (clean.length < 2 || clean === lastSavedAssistantText) return;
  lastSavedAssistantText = clean;
  saveMessage('assistant', clean);
}

/* ─────────────────────────────────────────────────────
   COMMAND DETECTION (voice commands handled client-side)
───────────────────────────────────────────────────── */
function normalizeSpeech(text) {
  return (text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectCommand(norm) {
  if (/\b(stop|stop it|stop karo|ruko|ruk jao|bas|bus|chup|chup karo|band karo|khamosh)\b/.test(norm))
    return 'STOP';
  if (/\b(priya|prya|preya|priyaa|female agent|switch to priya|call priya)\b/.test(norm))
    return 'SWITCH_PRIYA';
  if (/\b(vivek|vi vek|viveek|bivek|vivec|wivek|vivak|male agent|back to vivek|switch to vivek)\b/.test(norm))
    return 'SWITCH_VIVEK';
  return null;
}

/* ─────────────────────────────────────────────────────
   GEMINI LIVE SESSION
───────────────────────────────────────────────────── */
async function startGeminiSession(initialText) {
  if (liveWs && liveWs.readyState === WebSocket.OPEN) liveWs.close();
  isDormant = false; sessionReady = false;
  isListening = true; isThinking = false; isSpeaking = false;
  nextPlayTime = 0; suppressModelAudio = false; assistantBuffer = '';
  await createSession();

  const agent = AGENTS[activeAgent];
  setTranscript('Connecting…');
  setOrbMode('thinking');

  let ws;
  try {
    ws = new WebSocket('wss://vivek-qqwu.onrender.com/gemini-proxy');
    liveWs = ws;
  } catch(e) {
    setTranscript('WebSocket failed: ' + e.message);
    closeLiveSession();
    if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
    return;
  }

  const connTimeout = setTimeout(() => {
    if (!sessionReady) {
      setTranscript('Connection timed out.');
      closeLiveSession();
      if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
    }
  }, 15000);

  ws.onopen = function() {
    if (liveWs !== ws) { ws.close(); return; }
    ws.send(JSON.stringify({
      setup: {
        model: 'models/gemini-2.0-flash-live-001',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: agent.geminiVoice } }
          },
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        systemInstruction: { parts: [{ text: agent.buildPrompt(learnedInstructions) }] },
      }
    }));
  };

  ws.onmessage = async function(event) {
    if (liveWs !== ws) return;
    let data;
    try {
      const raw = (event.data instanceof Blob) ? await event.data.text() : event.data;
      data = JSON.parse(raw);
    } catch(e) { return; }

    // ── Setup complete → start mic ──
    if (data.setupComplete !== undefined) {
      clearTimeout(connTimeout);
      sessionReady = true;
      connectFails = 0;
      if (initialText) {
        saveMessage('user', initialText);
        sendTextTurn(initialText);
      } else {
        startMicCapture();
      }
      return;
    }

    if (data.serverContent) {
      const sc = data.serverContent;

      // ── Audio chunks from model ──
      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData && part.inlineData.mimeType.includes('audio')) {
            if (suppressModelAudio) continue;
            if (!isSpeaking) {
              isSpeaking = true;
              setOrbMode('speaking');
              document.getElementById('stop-btn').style.display = 'block';
              pulseSpeaking();
            }
            playGeminiChunk(part.inlineData.data);
          }
          if (part.text && !suppressModelAudio) {
            assistantBuffer += part.text;
            setTranscript(assistantBuffer.length > 120 ? assistantBuffer.slice(0, 120) + '…' : assistantBuffer);
          }
        }
      }

      // ── Output transcription ──
      if (sc.outputAudioTranscription && sc.outputAudioTranscription.text && !suppressModelAudio) {
        assistantBuffer += sc.outputAudioTranscription.text;
        setTranscript(assistantBuffer.length > 120 ? assistantBuffer.slice(0, 120) + '…' : assistantBuffer);
      }

      // ── Input (user) transcription — command detection ──
      if (sc.inputAudioTranscription && sc.inputAudioTranscription.text) {
        const userSaid = sc.inputAudioTranscription.text.trim();
        const norm = normalizeSpeech(userSaid);
        if (!norm) return;

        const cmd = detectCommand(norm);

        if (cmd === 'STOP') {
          stopCurrentResponseOnly();
          return; // don't save, don't let Gemini respond
        }

        if (cmd === 'SWITCH_PRIYA' && activeAgent !== 'priya') {
          stopCurrentResponseOnly();
          restartAfterClosePending = true;
          switchAgent('priya');
          closeLiveSession();
          setTimeout(() => {
            restartAfterClosePending = false;
            connectFails = 0;
            startGeminiSession(null);
          }, 400);
          return;
        }

        if (cmd === 'SWITCH_VIVEK' && activeAgent !== 'vivek') {
          stopCurrentResponseOnly();
          restartAfterClosePending = true;
          switchAgent('vivek');
          closeLiveSession();
          setTimeout(() => {
            restartAfterClosePending = false;
            connectFails = 0;
            startGeminiSession(null);
          }, 400);
          return;
        }

        // Color change via voice
        const words = norm.split(/\s+/);
        if (/\b(color|colour|orb|change|make|set)\b/.test(norm)) {
          for (const w of words) {
            if (COLOR_MAP[w]) { setColor(COLOR_MAP[w]); showToast('COLOR — ' + COLORS[COLOR_MAP[w]].label); break; }
          }
        }

        // Normal utterance — save + learn
        saveUserSpeechText(userSaid);
        detectAndSaveInstruction(userSaid);
      }

      // ── Turn complete ──
      if (sc.turnComplete) {
        if (assistantBuffer) {
          saveAssistantSpeechText(assistantBuffer);
          assistantBuffer = '';
        }
        suppressModelAudio = false;
        isThinking = false;
        const remaining = audioCtx ? Math.max(0, nextPlayTime - audioCtx.currentTime) : 0;
        setTimeout(() => {
          stopGeminiPlayback();
          isListening = true;
          setOrbMode('listening');
          setTranscript('Listening…');
          if (!micStream) startMicCapture();
        }, remaining * 1000 + 500);
      }
    }

    if (data.error) {
      clearTimeout(connTimeout);
      setTranscript(data.error.message || 'Connection error.');
      closeLiveSession();
      if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
    }
  };

  ws.onerror = function() {
    clearTimeout(connTimeout);
    connectFails++;
    setTranscript('Connection error — retrying…');
    closeLiveSession(); setOrbMode('idle');
    if (apiKey && connectFails < MAX_FAILS) setTimeout(() => startGeminiSession(null), 3000);
    else if (connectFails >= MAX_FAILS) setTranscript(`❌ Connection failed ${connectFails} times. Check GEMINI_API_KEY on server.`);
  };

  ws.onclose = function(event) {
    clearTimeout(connTimeout);
    const wasReady = sessionReady;
    sessionReady = false; stopMicCapture();
    if (restartAfterClosePending) return;
    if (!isDormant && apiKey) {
      isDormant = true; setOrbMode('idle');
      if (!wasReady) {
        connectFails++;
        if (connectFails >= MAX_FAILS) {
          setTranscript(`❌ Connection failed ${connectFails} times. Check GEMINI_API_KEY on server.`);
          return;
        }
        setTimeout(() => startGeminiSession(null), 1500 * connectFails);
      } else {
        connectFails = 0;
        setTimeout(() => startGeminiSession(null), 800);
      }
    }
  };
}

function sendTextTurn(text) {
  if (!liveWs || liveWs.readyState !== WebSocket.OPEN) return;
  liveWs.send(JSON.stringify({ realtimeInput: { text } }));
  setOrbMode('thinking'); isThinking = true; isListening = true;
  setTranscript(text.length > 90 ? text.slice(0, 90) + '…' : text);
}

/* ─────────────────────────────────────────────────────
   BOOT
───────────────────────────────────────────────────── */
let bootPct = 0, bootIdx = 0;
const bootLines = ['bl1','bl2','bl3','bl4','bl5'];

function runBoot() {
  const bar = document.getElementById('boot-bar');
  const pct = document.getElementById('boot-pct');
  const iv  = setInterval(async function() {
    bootPct += 1.8;
    bar.style.width = Math.min(bootPct, 100) + '%';
    pct.textContent = Math.min(Math.floor(bootPct), 100) + '%';
    if (bootPct % 20 < 1.9 && bootIdx < bootLines.length) {
      const el = document.getElementById(bootLines[bootIdx]);
      if (el) { el.style.opacity = '1'; el.classList.add('ok'); }
      bootIdx++;
    }
    if (bootPct >= 100) {
      clearInterval(iv);
      setTimeout(async () => {
        loadInstructions();
        activeAgent = localStorage.getItem('vivek_active_agent') || 'vivek';
        updateAgentUI();
        setColor(AGENTS[activeAgent].color);

        const loaded = await fetchApiKey();
        const overlay = document.getElementById('boot-overlay');

        if (!loaded) {
          const errDiv = document.createElement('div');
          errDiv.style.cssText = 'color:#ff4444;margin-top:20px;font-family:monospace;font-size:13px;';
          errDiv.textContent = 'BACKEND OFFLINE — Check BACKEND_URL in app.js';
          overlay.appendChild(errDiv);
          return;
        }

        overlay.style.transition = 'opacity 0.6s';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 650);

        // Pre-request mic permission in gesture context
        try {
          ensureAudioCtx();
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          stream.getTracks().forEach(t => t.stop());
        } catch(e) { console.warn('[VIVEK] Mic pre-request failed:', e.message); }

        connectFails = 0;
        startGeminiSession(null);
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
  if (isSpeaking || isListening || isThinking) {
    stopAll();
  } else if (isDormant && apiKey) {
    connectFails = 0;
    startGeminiSession(null);
  } else if (!apiKey) {
    showToast('BACKEND NOT CONNECTED');
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'p' || e.key === 'P') {
    switchAgent(activeAgent === 'vivek' ? 'priya' : 'vivek');
    if (!isDormant && apiKey) {
      restartAfterClosePending = true;
      closeLiveSession();
      setTimeout(() => {
        restartAfterClosePending = false;
        connectFails = 0;
        startGeminiSession(null);
      }, 300);
    }
  }
  if (e.key === 'Escape') stopAll();
});
