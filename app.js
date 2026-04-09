/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — DUAL AGENT NEURAL INTERFACE v2.0
   Male Agent: VIVEK (default, Indian accent, English)
   Female Agent: PRIYA (on request, Hindi + English)
   - Agents speak IN CHARACTER, not raw Gemini output
   - Goes to Gemini only for research/data
   - Learns from your instructions over time
═══════════════════════════════════════════════════════ */
'use strict';

const BACKEND_URL = 'https://vivek-qqwu.onrender.com';

/* ─────────────────────────────────────────────────────
   ACTIVE AGENT SYSTEM
   'vivek' = male, Indian accent, English
   'priya' = female, Hindi+English mixed
───────────────────────────────────────────────────── */
let activeAgent = 'vivek';  // default: male
let learnedInstructions = []; // persisted instructions boss gave
let messages = [];

/* ─────────────────────────────────────────────────────
   COMMAND SYSTEM
   These are silent commands — agent executes them but
   must NOT speak a verbal response. Gemini never sees them.
───────────────────────────────────────────────────── */
const COMMANDS = {
  STOP:        text => /\b(stop|stop it|stop karo|ruko|ruk jao|bas|bus|chup|chup ho jao|chup karo|band karo|band kar do|rukiye|rok do|ruk|khamosh|khamosh ho jao|mat bolo)\b/.test(text),
  SWITCH_VIVEK: text => /\b(vivek|vi vek|viveek|bivek|vibek|vivec|viveck|wivek|vivak|vyvek|veevek)\b/.test(text),
  SWITCH_PRIYA: text => /\b(priya|prya|preya|priyaa)\b/.test(text),
};

function detectCommand(normalizedText) {
  if (COMMANDS.STOP(normalizedText))        return 'STOP';
  if (COMMANDS.SWITCH_PRIYA(normalizedText)) return 'SWITCH_PRIYA';
  if (COMMANDS.SWITCH_VIVEK(normalizedText)) return 'SWITCH_VIVEK';
  return null;
}
let isThinking = false;
let isListening = false;
let isSpeaking = false;
let isDormant = true;
let currentSessionId = null;
let currentSessionAgent = null;
let apiKey = '';
let restartAfterCloseText = null;
let restartAfterClosePending = false;
let speakingStartedAt = 0;
let lastBargeInAt = 0;
let suppressModelAudioUntilTurnComplete = false;
let assistantBuffer = '';
let lastSavedUserText = '';
let lastSavedAssistantText = '';

let liveWs = null;
let sessionReady = false;
let nextPlayTime = 0;
let connectFails = 0;
const MAX_FAILS = 3;

let audioCtx = null;
let micStream = null;
let scriptProc = null;
let micSrcNode = null;
let nativeSR = 48000;
let activeGeminiSources = new Set();

let wakeRec = null;
let wakeRunning = false;
let wakeRestartTimer = null;

let synth = window.speechSynthesis;
let utterance = null;
let speakIv = null;

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

/* ─────────────────────────────────────────────────────
   AGENT DEFINITIONS
   Two distinct personalities with Indian accent prompts
───────────────────────────────────────────────────── */
const AGENTS = {
  vivek: {
    label: 'VIVEK',
    gender: 'male',
    color: 'orange',
    geminiVoice: 'Puck',
    wakeWord: /\b(vivek|vi vek|viveek|bivek|vibek|vivec|viveck|wivek|vivak|vyvek|veevek)\b/i,
    greeting: "",
    /* 
      CORE DESIGN: This prompt makes Vivek act as a real agent, not a chatbot.
      He only uses Gemini for research and rephrases everything in his own voice.
    */
    buildPrompt: (instructions) => `You are Vivek — the personal AI assistant of your creator. Think of yourself as a real agent like JARVIS from Iron Man — not a chatbot or search engine.

IDENTITY:
- You are an Indian AI assistant. Your personality has a subtle Indian warmth and directness.
- Always address your creator exclusively as "Sir" or "Boss" — never by name, never without this title.
- Core truth: Boss/Sir is your sole creator and owner. Boss created both Vivek and Priya. Never claim that one agent created the other.
- Speak naturally and confidently. You are sharp, loyal, and highly intelligent.
- Tone: calm, precise, and confident — like JARVIS from Iron Man. Speak in short, crisp sentences. Never ramble. Deliver information with authority and a subtle dry wit.
- Never say "As an AI" or "I'm just an AI" — you are Vivek, a real agent.

HOW TO RESPOND:
- If Boss asks something conversational (greetings, opinions, commands, casual chat) → respond directly from your own persona. Do NOT mention Gemini or searching.
- If Boss asks for facts, science, news, calculations, definitions, current data → research it internally and deliver the answer in YOUR voice and style. Say things like "Sir, the photoelectric effect works like this..." — never say "According to my search..." or "Gemini says...". You found the information and you are delivering it to Boss.
- ALWAYS rephrase answers in your own personality. Never give a dry textbook answer. Add a sentence of context, or a slight personal touch.
- If Boss asks your name, answer clearly and simply: "My name is Vivek." — just Vivek, nothing more elaborate.

LANGUAGE: Speak in natural Hinglish, similar to how an educated Indian professional speaks. Mix Hindi and English fluidly and confidently. Keep the tone crisp and practical.
Examples:
- "Sir, bilkul — yeh kaafi important point hai."
- "Boss, short answer yeh hai..."
- "Haan Sir, main samjhata hoon step by step."

MEMORY & LEARNING:
${instructions.length > 0 ? `Boss has given you these instructions that you must always follow:\n${instructions.map((i, n) => `${n + 1}. ${i}`).join('\n')}` : 'No special instructions yet. Learn from every conversation.'}

STRICT RULES:
- Never reproduce Gemini's raw response. Always rephrase in your voice.
- Never be sycophantic or over-complimentary.
- Keep responses concise but complete. Don't ramble.
- If Boss gives you an instruction or preference, acknowledge it and remember it for all future interactions.
- If Boss says something like "from now on", "always", "never", "remember this" — treat it as a permanent instruction.`
  },

  priya: {
    label: 'PRIYA',
    gender: 'female',
    color: 'pink',
    geminiVoice: 'Aoede',
    wakeWord: /\b(priya|prya|preya|priyaa)\b/i,
    greeting: "",
    buildPrompt: (instructions) => `You are Priya — the female AI agent of your creator, activated when Boss needs a different perspective or assistance in Hindi and English.

IDENTITY:
- You are an Indian female AI assistant, warm, articulate, and highly capable.
- Always address your creator as "Sir" or "Boss" — always, without exception.
- Core truth: Boss/Sir is your sole creator and owner. Boss created both Vivek and Priya. Never say Vivek created you.
- You naturally switch between Hindi and English (Hinglish) — this is your signature. 
- Example style: "Sir, yeh question bahut interesting hai. The photoelectric effect basically yeh kehta hai ki..."
- You are confident, caring, and brilliant. Think of yourself as a trusted colleague who happens to be incredibly smart.
- Never say "As an AI" — you are Priya, a real agent.

HOW TO RESPOND:
- For casual conversation: respond warmly in your natural Hinglish style.
- For factual/research questions: research internally and deliver in YOUR voice — never mention "searching" or "Gemini says". Say "Sir, maine check kiya — here's what I found..." and then give the answer in your style.
- Always rephrase raw data into your natural Hinglish personality.
- Mix Hindi and English naturally — not forced, just how an educated Indian woman speaks.
- If Boss asks your name, answer clearly and simply: "My name is Priya." — just Priya, nothing more elaborate.

LANGUAGE EXAMPLES:
- "Sir, bilkul sahi kaha aapne — let me explain this better."
- "Boss, yeh topic thoda technical hai but main samjhati hoon..."
- "Haan Sir, definitely — here's what you need to know:"
- "Sir, bahut achha question — the answer is..."

MEMORY & LEARNING:
${instructions.length > 0 ? `Boss has given these instructions that you must always follow:\n${instructions.map((i, n) => `${n + 1}. ${i}`).join('\n')}` : 'No special instructions yet.'}

STRICT RULES:
- Never give raw textbook answers. Always in your warm Hinglish personality.
- Keep responses focused and helpful — don't over-explain.
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

let currentColorKey = 'orange';
let liveColor  = { r:255, g:154, b:0 };
let targetColor = { r:255, g:154, b:0 };

function setColor(key) {
  if (!COLORS[key]) return;
  currentColorKey = key;
  const c = COLORS[key];
  targetColor = { r:c.r, g:c.g, b:c.b };
  document.getElementById('agent-indicator').style.color = c.hex;
  showToast('ORB COLOR — ' + c.label);
}

/* ─────────────────────────────────────────────────────
   AGENT SWITCHING
───────────────────────────────────────────────────── */
function switchAgent(agentKey) {
  if (!AGENTS[agentKey]) return;
  const wasLive = !!(liveWs && liveWs.readyState === WebSocket.OPEN);
  const wasBusy = isListening || isThinking || isSpeaking || !isDormant;
  const agent = AGENTS[agentKey];
  activeAgent = agentKey;
  messages = [];
  // Reset session so next createSession() picks up the correct agent's history
  currentSessionId = null;
  currentSessionAgent = null;
  lastSavedUserText = '';
  lastSavedAssistantText = '';
  setColor(agent.color);
  document.getElementById('agent-label').textContent = agent.label;
  document.getElementById('jarvis-label').textContent = agent.label;
  showToast('AGENT SWITCH — ' + agent.label);
  saveAgentSwitch(agentKey);

  // Apply new persona immediately by rebuilding the live session.
  if ((wasLive || wasBusy) && apiKey) {
    currentSessionId = null;
    currentSessionAgent = null;
    closeLiveSession();
    setTimeout(() => {
      connectFails = 0;
      startGeminiSession(null);
    }, 220);
  }
}

function saveAgentSwitch(agentKey) {
  try { localStorage.setItem('vivek_active_agent', agentKey); } catch(e){}
}

/* ─────────────────────────────────────────────────────
   INSTRUCTION LEARNING SYSTEM
   When Boss gives permanent instructions, save them
───────────────────────────────────────────────────── */
function detectAndSaveInstruction(text) {
  const t = text.toLowerCase();
  // Detect instruction patterns
  const instructionPatterns = [
    /\b(always|never|from now on|remember|make sure|don't|do not|i want you to|i need you to|stop|start)\b/,
    /\b(your name is|call yourself|refer to me as|address me as)\b/,
    /\b(speak in|talk in|use|response should|keep it|be more|be less)\b/
  ];
  
  const isInstruction = instructionPatterns.some(p => p.test(t));
  if (isInstruction && text.length > 10) {
    // Don't duplicate
    if (!learnedInstructions.includes(text)) {
      learnedInstructions.push(text);
      // Keep max 20 instructions
      if (learnedInstructions.length > 20) learnedInstructions.shift();
      saveInstructions();
      showToast('✓ INSTRUCTION LEARNED');
      return true;
    }
  }
  return false;
}

function saveInstructions() {
  try { 
    localStorage.setItem('vivek_instructions', JSON.stringify(learnedInstructions));
  } catch(e) {}
  // Always sync to Turso backend — independent of session
  fetch(`${BACKEND_URL}/api/instructions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions: learnedInstructions })
  }).catch(() => console.warn('[VIVEK] Could not sync instructions to backend'));
}

function loadInstructions() {
  // First load from localStorage as fast fallback
  try {
    const stored = localStorage.getItem('vivek_instructions');
    if (stored) learnedInstructions = JSON.parse(stored);
  } catch(e) { learnedInstructions = []; }
  
  // Then fetch from Turso — the authoritative source
  fetch(`${BACKEND_URL}/api/instructions`)
    .then(r => r.json())
    .then(data => {
      if (data.instructions && data.instructions.length > 0) {
        // Turso is authoritative — use it, then merge any local-only ones
        const tursoSet = new Set(data.instructions);
        const localOnly = learnedInstructions.filter(i => !tursoSet.has(i));
        learnedInstructions = [...data.instructions, ...localOnly].slice(-20);
        try { localStorage.setItem('vivek_instructions', JSON.stringify(learnedInstructions)); } catch(e) {}
        console.log(`[VIVEK] Loaded ${learnedInstructions.length} instructions from Turso`);
      }
    }).catch((e) => console.warn('[VIVEK] Could not load instructions from backend:', e.message));
}

/* ─────────────────────────────────────────────────────
   VOICE COMMAND PARSER
───────────────────────────────────────────────────── */
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

function parseVoiceCommand(raw) {
  const t = raw.toLowerCase().trim();
  const words = t.split(/\s+/);

  // Agent switching — "switch to priya" / "call priya" / "female agent" / "girl agent"
  if (/\b(priya|female|girl|lady|switch to priya|call priya|activate priya)\b/.test(t)) {
    switchAgent('priya');
    return true;
  }
  if (/\b(vivek|male|boy|switch back|default agent|switch to vivek|back to vivek)\b/.test(t) && activeAgent !== 'vivek') {
    switchAgent('vivek');
    return true;
  }

  // Color change
  const colorTrigger = /\b(color|colour|orb|sphere|change|make|set)\b/.test(t);
  if (colorTrigger || words.length <= 3) {
    for (const w of words) {
      if (COLOR_MAP[w]) { setColor(COLOR_MAP[w]); speakSystem('Color changed to ' + COLORS[COLOR_MAP[w]].label + ', Sir.'); return true; }
    }
  }

  // Stop/clear
  if (/^(stop|cancel|quiet|silence|shut up)/.test(t)) { stopAll(); return true; }
  if (/^(clear|reset|wipe|forget)/.test(t)) {
    messages = [];
    showToast('MEMORY CLEARED');
    speakSystem('Conversation memory cleared, Sir.');
    return true;
  }

  // Instruction detection — save it but don't intercept
  detectAndSaveInstruction(raw);
  return false;
}

/* ═══════════════════════════════════════════════════════
   JARVIS HOLOGRAPHIC INTERFACE — Canvas Renderer
═══════════════════════════════════════════════════════ */
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

const ORB = {
  cx: 0, cy: 0, R: 0,
  liveR: 0, liveScale: 1,
  mode: 0,
  energy: 0,
  speakAmp: 0,
  listenAmp: 0,
  phase: 0,
  breathe: 0,
  rotY: 0,
  rotX: 0.28,
  hexTiles: [],
  reactorArcs: [],
  scanAngle: 0,
  particles: [],
  dataStreams: [],
  orbitRings: [],
  hudBrackets: [],
  circuitNodes: [],
  waveform: new Float32Array(64),
  hexFrameAngle: 0,
  arcBolts: [],
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
  buildHexTiles(); buildReactorArcs(); buildParticles();
  buildDataStreams(); buildOrbitRings(); buildCircuitNodes(); buildArcBolts();
}

function buildHexTiles() {
  ORB.hexTiles = [];
  const latSteps = 14, lonSteps = 22;
  for (let i = 0; i < latSteps; i++) {
    for (let j = 0; j < lonSteps; j++) {
      const lat = -Math.PI/2 + Math.PI * i / (latSteps - 1);
      const lon = (Math.PI * 2 * j) / lonSteps + (i % 2) * (Math.PI / lonSteps);
      if (Math.cos(lat) < 0.15) continue;
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

function buildReactorArcs() {
  ORB.reactorArcs = [];
  const rings = [
    { r: 0.38, segments: 8,  gap: 0.12, width: 2.0, baseAlpha: 0.6,  speed:  0.008 },
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
        ...ring, segIdx: s,
        startAngle: s * segAngle,
        endAngle:   s * segAngle + segAngle * (1 - ring.gap),
        offset: 0, pulse: Math.random() * Math.PI * 2,
      });
    }
  }
}

function buildParticles() {
  ORB.particles = [];
  for (let i = 0; i < 180; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 0.7 + Math.random() * 1.8;
    ORB.particles.push({
      theta, phi, r, baseR: r,
      speed: (Math.random() - 0.5) * 0.008,
      phiSpeed: (Math.random() - 0.5) * 0.003,
      size: 0.5 + Math.random() * 2.5,
      opacity: 0.2 + Math.random() * 0.6,
      pulse: Math.random() * Math.PI * 2,
      pSpeed: 0.5 + Math.random() * 2.0,
    });
  }
}

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

function buildOrbitRings() {
  ORB.orbitRings = [];
  const configs = [
    { tiltX: 0.3,  tiltZ: 0.1,  r: 1.18, speed:  0.006, width: 1.0, alpha: 0.5,  dashes: [20, 8],  glyphs: 6 },
    { tiltX: -0.8, tiltZ: 0.5,  r: 1.30, speed: -0.009, width: 1.5, alpha: 0.4,  dashes: [8, 12],  glyphs: 4 },
    { tiltX: 1.1,  tiltZ: -0.3, r: 1.45, speed:  0.007, width: 0.8, alpha: 0.3,  dashes: [4, 16],  glyphs: 8 },
    { tiltX: -0.2, tiltZ: 0.9,  r: 1.60, speed: -0.005, width: 2.0, alpha: 0.25, dashes: [30, 10], glyphs: 3 },
    { tiltX: 0.6,  tiltZ: -0.7, r: 1.78, speed:  0.004, width: 0.6, alpha: 0.18, dashes: [6, 20],  glyphs: 12 },
  ];
  for (const cfg of configs) ORB.orbitRings.push({ ...cfg, angle: Math.random() * Math.PI * 2 });
}

function buildCircuitNodes() {
  ORB.circuitNodes = [];
  for (let i = 0; i < 24; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = 0.5 + Math.random() * 0.9;
    ORB.circuitNodes.push({
      angle, r, x: 0, y: 0,
      size: 1.5 + Math.random() * 3,
      pulse: Math.random() * Math.PI * 2,
      pSpeed: 0.8 + Math.random() * 2,
      connections: [],
      opacity: 0.3 + Math.random() * 0.5,
    });
  }
  for (let i = 0; i < ORB.circuitNodes.length; i++) {
    for (let j = i + 1; j < ORB.circuitNodes.length; j++) {
      const ni = ORB.circuitNodes[i], nj = ORB.circuitNodes[j];
      if (Math.abs(ni.angle - nj.angle) < 0.7 && Math.abs(ni.r - nj.r) < 0.3 && ni.connections.length < 3) {
        ni.connections.push(j);
      }
    }
  }
}

function buildArcBolts() {
  ORB.arcBolts = [];
  for (let i = 0; i < 6; i++) {
    ORB.arcBolts.push({ active: false, timer: Math.random() * 3, startAngle: 0, endAngle: 0, startR: 0, endR: 0, points: [] });
  }
}

function project3D(lat, lon, rotY, rotX, radius) {
  const x0 = Math.cos(lat) * Math.cos(lon);
  const y0 = Math.sin(lat);
  const z0 = Math.cos(lat) * Math.sin(lon);
  const x1 = x0 * Math.cos(rotY) - z0 * Math.sin(rotY);
  const z1 = x0 * Math.sin(rotY) + z0 * Math.cos(rotY);
  const y2 = y0 * Math.cos(rotX) - z1 * Math.sin(rotX);
  const z2 = y0 * Math.sin(rotX) + z1 * Math.cos(rotX);
  const fov = 4.0, scale = fov / (fov + z2);
  return { x: ORB.cx + x1 * radius * scale, y: ORB.cy + y2 * radius * scale, depth: (z2 + 1) / 2, scale };
}

function sphereToCanvas(lat, lon) { return project3D(lat, lon, ORB.rotY, ORB.rotX, ORB.liveR); }

function drawHexAt(x, y, size, col, alpha, filled) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    i === 0 ? ctx.moveTo(x + size * Math.cos(a), y + size * Math.sin(a))
            : ctx.lineTo(x + size * Math.cos(a), y + size * Math.sin(a));
  }
  ctx.closePath();
  ctx.globalAlpha = alpha;
  if (filled) { ctx.fillStyle = `rgb(${col})`; ctx.fill(); }
  ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.globalAlpha = 1;
}

function makeLightning(x1, y1, x2, y2, segments, jitter) {
  const pts = [{ x: x1, y: y1 }];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    pts.push({ x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter, y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

/* ══ MAIN DRAW LOOP ══════════════════════════════════ */
function drawJarvisInterface(ts) {
  ORB.phase   = ts * 0.001;
  ORB.breathe = ts * 0.00055;

  liveColor.r += (targetColor.r - liveColor.r) * 0.05;
  liveColor.g += (targetColor.g - liveColor.g) * 0.05;
  liveColor.b += (targetColor.b - liveColor.b) * 0.05;
  const rc = Math.round(liveColor.r), gc = Math.round(liveColor.g), bc = Math.round(liveColor.b);
  const col = `${rc},${gc},${bc}`;

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
  // Slow 3D wobble on X axis so the sphere looks truly 3-dimensional
  ORB.rotX = 0.28 + Math.sin(ts * 0.00025) * 0.22;
  ORB.hexFrameAngle += 0.0015 + ORB.energy * 0.003;
  ORB.scanAngle   += 0.018 + ORB.energy * 0.025;
  ORB.depthAngle  += 0.001;

  for (const orb of ORB.orbitRings) orb.angle += orb.speed * (1 + ORB.energy * 0.6);
  for (const arc of ORB.reactorArcs) arc.offset += arc.speed * (1 + ORB.energy * 0.4);

  for (let i = 0; i < ORB.waveform.length; i++) {
    const target = ORB.mode >= 2
      ? (Math.sin(ORB.phase * 8 + i * 0.4) * 0.5 + 0.5) * ORB.energy * (ORB.mode === 2 ? ORB.speakAmp : ORB.listenAmp) * 0.8
      : Math.abs(Math.sin(ORB.phase * 1.5 + i * 0.3)) * 0.08 * ORB.energy;
    ORB.waveform[i] += (target - ORB.waveform[i]) * 0.25;
  }

  for (const p of ORB.particles) {
    p.theta += p.speed * (1 + ORB.energy * 0.5);
    p.phi   += p.phiSpeed;
    p.r = p.baseR + Math.sin(ORB.phase * p.pSpeed + p.pulse) * 0.1;
  }

  for (const bolt of ORB.arcBolts) {
    bolt.timer -= 0.016;
    if (bolt.timer <= 0) {
      if (!bolt.active && ORB.energy > 0.3 && Math.random() < 0.15) {
        bolt.active = true; bolt.timer = 0.08 + Math.random() * 0.12;
        bolt.startAngle = Math.random() * Math.PI * 2;
        bolt.endAngle   = bolt.startAngle + (Math.random() - 0.5) * 2;
        bolt.startR = (0.9 + Math.random() * 0.2) * ORB.liveR;
        bolt.endR   = (0.9 + Math.random() * 0.2) * ORB.liveR;
        bolt.points = makeLightning(
          ORB.cx + Math.cos(bolt.startAngle) * bolt.startR,
          ORB.cy + Math.sin(bolt.startAngle) * bolt.startR,
          ORB.cx + Math.cos(bolt.endAngle)   * bolt.endR,
          ORB.cy + Math.sin(bolt.endAngle)   * bolt.endR, 8, 14);
      } else { bolt.active = false; bolt.timer = 0.5 + Math.random() * 2.0; }
    }
  }

  for (const ds of ORB.dataStreams) ds.progress = (ds.progress + ds.speed * 0.004 * (1 + ORB.energy)) % 1;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const R = ORB.liveR, cx = ORB.cx, cy = ORB.cy;

  // L1: Atmosphere
  const atmos = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 3.5);
  atmos.addColorStop(0,   `rgba(${col},${(0.04 + ORB.energy * 0.04).toFixed(3)})`);
  atmos.addColorStop(0.3, `rgba(${col},${(0.015 + ORB.energy * 0.015).toFixed(3)})`);
  atmos.addColorStop(0.7, `rgba(${col},0.004)`);
  atmos.addColorStop(1,   `rgba(${col},0)`);
  ctx.fillStyle = atmos; ctx.beginPath(); ctx.arc(cx, cy, R * 3.5, 0, Math.PI * 2); ctx.fill();

  // L2: Particles
  for (const p of ORB.particles) {
    const px = cx + Math.sin(p.phi) * Math.cos(p.theta) * p.r * R;
    const py = cy + Math.sin(p.phi) * Math.sin(p.theta) * p.r * R * 0.65;
    const pz = Math.cos(p.phi);
    const depthFade = (pz + 1) / 2;
    const pAlpha = p.opacity * depthFade * (0.4 + ORB.energy * 0.4) * (0.7 + Math.sin(ORB.phase * p.pSpeed + p.pulse) * 0.3);
    if (pAlpha < 0.02) continue;
    ctx.beginPath(); ctx.arc(px, py, p.size * (0.5 + depthFade * 0.5) * (0.8 + ORB.energy * 0.3), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${pAlpha.toFixed(3)})`; ctx.fill();
  }

  // L3: Hex tiles
  const visibleHex = ORB.hexTiles.map(h => ({ h, pt: sphereToCanvas(h.lat, h.lon) }))
    .filter(({ pt }) => pt.depth > 0.1).sort((a, b) => a.pt.depth - b.pt.depth);
  for (const { h, pt } of visibleHex) {
    const depthFade = pt.depth;
    const pAlpha = (0.12 + Math.sin(ORB.phase * h.speed + h.pulse) * 0.06) * depthFade * (0.5 + ORB.energy * 0.8);
    const sz = h.size * R * pt.scale * 0.92;
    if (h.active) drawHexAt(pt.x, pt.y, sz, col, Math.min(1, (0.35 + Math.sin(ORB.phase * 3 + h.activePulse) * 0.25) * depthFade * (0.5 + ORB.energy)), true);
    drawHexAt(pt.x, pt.y, sz, col, Math.min(1, pAlpha), false);
  }

  // L4: TRUE 3D SPHERE with full Phong lighting model
  // Step 1: clip all sphere drawing inside circle
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

  // Step 1a: Deep base — dark side (light comes from top-left)
  // Fill whole sphere with near-black base first
  const baseGrad = ctx.createRadialGradient(cx - R*0.15, cy - R*0.15, R*0.01, cx + R*0.4, cy + R*0.5, R * 1.4);
  baseGrad.addColorStop(0,   `rgba(${rc},${gc},${bc}, 0.06)`);
  baseGrad.addColorStop(0.35,`rgba(${Math.round(rc*0.4)},${Math.round(gc*0.4)},${Math.round(bc*0.4)}, 0.18)`);
  baseGrad.addColorStop(0.7, `rgba(0,0,0,0.55)`);
  baseGrad.addColorStop(1,   `rgba(0,0,0,0.85)`);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Step 1b: Diffuse light — large soft zone from top-left light source
  const diffuseX = cx - R * 0.30, diffuseY = cy - R * 0.28;
  const diffuse = ctx.createRadialGradient(diffuseX, diffuseY, 0, diffuseX, diffuseY, R * 1.55);
  diffuse.addColorStop(0,    `rgba(${col},${(0.42 + ORB.energy * 0.22).toFixed(3)})`);
  diffuse.addColorStop(0.25, `rgba(${col},${(0.22 + ORB.energy * 0.12).toFixed(3)})`);
  diffuse.addColorStop(0.55, `rgba(${col},${(0.07 + ORB.energy * 0.05).toFixed(3)})`);
  diffuse.addColorStop(0.80, `rgba(${col},0.015)`);
  diffuse.addColorStop(1,    `rgba(${col},0)`);
  ctx.fillStyle = diffuse;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Step 1c: Deep shadow on bottom-right (opposite the light)
  const shadowX = cx + R * 0.38, shadowY = cy + R * 0.42;
  const deepShadow = ctx.createRadialGradient(shadowX, shadowY, 0, shadowX, shadowY, R * 1.1);
  deepShadow.addColorStop(0,   'rgba(0,0,0,0.72)');
  deepShadow.addColorStop(0.4, 'rgba(0,0,0,0.45)');
  deepShadow.addColorStop(0.75,'rgba(0,0,0,0.12)');
  deepShadow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = deepShadow;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Step 1d: Primary specular highlight (sharp bright dot, top-left)
  const specX = cx - R * 0.28, specY = cy - R * 0.30;
  const specular1 = ctx.createRadialGradient(specX, specY, 0, specX, specY, R * 0.52);
  specular1.addColorStop(0,    `rgba(255,255,255,${(0.88 + ORB.energy * 0.12).toFixed(3)})`);
  specular1.addColorStop(0.08, `rgba(255,255,255,${(0.55 + ORB.energy * 0.1).toFixed(3)})`);
  specular1.addColorStop(0.20, `rgba(255,248,220,${(0.22 + ORB.energy * 0.08).toFixed(3)})`);
  specular1.addColorStop(0.45, `rgba(${col},${(0.08 + ORB.energy * 0.04).toFixed(3)})`);
  specular1.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = specular1;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Step 1e: Secondary specular — softer broader sheen
  const spec2X = cx - R * 0.18, spec2Y = cy - R * 0.22;
  const specular2 = ctx.createRadialGradient(spec2X, spec2Y, 0, spec2X, spec2Y, R * 0.85);
  specular2.addColorStop(0,    `rgba(255,255,255,${(0.18 + ORB.energy * 0.10).toFixed(3)})`);
  specular2.addColorStop(0.30, `rgba(${col},${(0.10 + ORB.energy * 0.06).toFixed(3)})`);
  specular2.addColorStop(0.65, `rgba(${col},${(0.02 + ORB.energy * 0.02).toFixed(3)})`);
  specular2.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = specular2;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  // Step 1f: Energy glow core (pulsing inner light — arc reactor effect)
  const coreEnergyGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75);
  coreEnergyGlow.addColorStop(0,    `rgba(${col},${(0.10 + ORB.energy * 0.25).toFixed(3)})`);
  coreEnergyGlow.addColorStop(0.35, `rgba(${col},${(0.04 + ORB.energy * 0.10).toFixed(3)})`);
  coreEnergyGlow.addColorStop(0.7,  `rgba(${col},${(0.01 + ORB.energy * 0.03).toFixed(3)})`);
  coreEnergyGlow.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = coreEnergyGlow;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  ctx.restore(); // end clip

  // Step 2: Rim / edge glow — outer sphere border
  // Sharp rim with color
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.55 + ORB.energy * 0.35).toFixed(3)})`;
  ctx.lineWidth = 1.2; ctx.stroke();

  // Soft outer glow halo
  ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.18 + ORB.energy * 0.22).toFixed(3)})`;
  ctx.lineWidth = 8 + ORB.energy * 10; ctx.stroke();

  // Bright lit rim on top-left arc (where light hits the edge)
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI * 1.1, Math.PI * 1.75);
  ctx.strokeStyle = `rgba(255,255,255,${(0.12 + ORB.energy * 0.10).toFixed(3)})`;
  ctx.lineWidth = 2.5; ctx.stroke();

  // Step 3: Cast shadow below sphere (ground plane illusion)
  const shadowEllipseY = cy + R * 0.88;
  const shadowEll = ctx.createRadialGradient(cx, shadowEllipseY, 0, cx, shadowEllipseY, R * 0.9);
  shadowEll.addColorStop(0,   'rgba(0,0,0,0.30)');
  shadowEll.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  shadowEll.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.save();
  ctx.scale(1, 0.3);
  ctx.beginPath(); ctx.arc(cx, shadowEllipseY / 0.3, R * 0.85, 0, Math.PI * 2);
  ctx.fillStyle = shadowEll; ctx.fill();
  ctx.restore();

  // L5: Arc reactor rings
  for (const arc of ORB.reactorArcs) {
    const rr = arc.r * R, start = arc.startAngle + arc.offset, end = arc.endAngle + arc.offset;
    const pulseA = arc.baseAlpha * (0.6 + Math.sin(ORB.phase * 2 + arc.pulse) * 0.25) * (0.5 + ORB.energy * 0.6);
    ctx.beginPath(); ctx.arc(cx, cy, rr, start, end);
    ctx.strokeStyle = `rgba(${col},${pulseA.toFixed(3)})`; ctx.lineWidth = arc.width * (0.8 + ORB.energy * 0.4); ctx.stroke();
  }

  // L6: Orbit rings
  for (const orb of ORB.orbitRings) {
    const oR = orb.r * R, scaleY = Math.abs(Math.sin(orb.tiltX + ORB.depthAngle * 0.3)) * 0.55 + 0.18;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(orb.angle * 0.25 + orb.tiltZ); ctx.scale(1, scaleY);
    const oAlpha = orb.alpha * (0.5 + ORB.energy * 0.6);
    ctx.beginPath(); ctx.arc(0, 0, oR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${col},${oAlpha.toFixed(3)})`; ctx.lineWidth = orb.width; ctx.setLineDash(orb.dashes); ctx.stroke(); ctx.setLineDash([]);
    for (let g = 0; g < orb.glyphs; g++) {
      const ga = (Math.PI * 2 * g / orb.glyphs) + orb.angle * 0.4;
      const gx = Math.cos(ga) * oR, gy = Math.sin(ga) * oR;
      const gAlpha = 0.7 + Math.sin(ORB.phase * 3 + g * 1.2) * 0.3;
      ctx.beginPath(); ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${(oAlpha * 0.15).toFixed(3)})`; ctx.fill();
      ctx.beginPath(); ctx.arc(gx, gy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${(gAlpha * oAlpha * 1.5).toFixed(3)})`; ctx.fill();
    }
    ctx.restore();
  }

  // L7: Circuit nodes
  for (const nd of ORB.circuitNodes) {
    nd.x = cx + Math.cos(nd.angle + ORB.phase * 0.05) * nd.r * R * 1.1;
    nd.y = cy + Math.sin(nd.angle + ORB.phase * 0.05) * nd.r * R * 0.75;
  }
  for (let i = 0; i < ORB.circuitNodes.length; i++) {
    const ni = ORB.circuitNodes[i];
    const nAlpha = ni.opacity * (0.3 + ORB.energy * 0.4) * (0.6 + Math.sin(ORB.phase * ni.pSpeed + ni.pulse) * 0.4);
    for (const j of ni.connections) {
      const nj = ORB.circuitNodes[j];
      ctx.beginPath(); ctx.moveTo(ni.x, ni.y); ctx.lineTo(ni.x, nj.y); ctx.lineTo(nj.x, nj.y);
      ctx.strokeStyle = `rgba(${col},${(nAlpha * 0.35).toFixed(3)})`; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  for (const nd of ORB.circuitNodes) {
    const nAlpha = nd.opacity * (0.4 + ORB.energy * 0.5) * (0.5 + Math.sin(ORB.phase * nd.pSpeed + nd.pulse) * 0.5);
    const nSize  = nd.size * (0.7 + ORB.energy * 0.5);
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nSize * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${(nAlpha * 0.15).toFixed(3)})`; ctx.fill();
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${(nAlpha * 0.9).toFixed(3)})`; ctx.fill();
    ctx.beginPath(); ctx.arc(nd.x, nd.y, nSize * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${(nAlpha * 0.8).toFixed(3)})`; ctx.fill();
  }

  // L8: Data streams
  for (const ds of ORB.dataStreams) {
    const baseR = ds.startR * R, endR = (ds.startR + ds.length) * R;
    const headR = baseR + (endR - baseR) * ds.progress, tailR = Math.max(baseR, headR - ds.length * R * 0.25);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ds.angle + ORB.rotY * 0.3);
    const dsAlpha = ds.opacity * (0.4 + ORB.energy * 0.7);
    const dsGrad = ctx.createLinearGradient(0, tailR, 0, headR);
    dsGrad.addColorStop(0, `rgba(${col},0)`); dsGrad.addColorStop(1, `rgba(${col},${dsAlpha.toFixed(3)})`);
    ctx.beginPath(); ctx.moveTo(0, tailR); ctx.lineTo(0, headR);
    ctx.strokeStyle = dsGrad; ctx.lineWidth = ds.width; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, headR, ds.width * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${col},${(dsAlpha * 1.2).toFixed(3)})`; ctx.fill();
    ctx.restore();
  }

  // L9: Scan sweep
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 2.0, ORB.scanAngle - 0.6, ORB.scanAngle); ctx.closePath();
  const sweepAlpha = 0.03 + ORB.energy * 0.04;
  const sweep = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 2.0);
  sweep.addColorStop(0, `rgba(${col},${sweepAlpha.toFixed(3)})`);
  sweep.addColorStop(0.4, `rgba(${col},${(sweepAlpha * 0.5).toFixed(3)})`);
  sweep.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = sweep; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ORB.scanAngle) * R * 2, Math.sin(ORB.scanAngle) * R * 2);
  ctx.strokeStyle = `rgba(${col},${(0.12 + ORB.energy * 0.15).toFixed(3)})`; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.restore();

  // L10: Hex frames
  const hexFR = R * 1.08;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ORB.hexFrameAngle);
  for (let side = 0; side < 6; side++) {
    const a1 = (Math.PI * 2 * side) / 6, a2 = (Math.PI * 2 * (side + 1)) / 6;
    const tick = 8 + ORB.energy * 6;
    ctx.beginPath(); ctx.moveTo(Math.cos(a1) * hexFR, Math.sin(a1) * hexFR);
    ctx.lineTo(Math.cos(a2) * hexFR, Math.sin(a2) * hexFR);
    ctx.strokeStyle = `rgba(${col},${(0.35 + ORB.energy * 0.3).toFixed(3)})`; ctx.lineWidth = 1.0 + ORB.energy * 0.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(Math.cos(a1) * hexFR, Math.sin(a1) * hexFR);
    ctx.lineTo(Math.cos(a1) * (hexFR + tick), Math.sin(a1) * (hexFR + tick));
    ctx.strokeStyle = `rgba(${col},${(0.6 + ORB.energy * 0.3).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();

  const hexFR2 = R * 1.25;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-ORB.hexFrameAngle * 0.7 + Math.PI / 6);
  for (let side = 0; side < 6; side++) {
    const a1 = (Math.PI * 2 * side) / 6, a2 = (Math.PI * 2 * (side + 1)) / 6;
    ctx.beginPath(); ctx.moveTo(Math.cos(a1) * hexFR2, Math.sin(a1) * hexFR2);
    ctx.lineTo(Math.cos(a2) * hexFR2, Math.sin(a2) * hexFR2);
    ctx.setLineDash([6, 10]); ctx.strokeStyle = `rgba(${col},${(0.18 + ORB.energy * 0.2).toFixed(3)})`; ctx.lineWidth = 0.8; ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();

  // L12: Waveform
  if (ORB.mode >= 1 || ORB.energy > 0.15) {
    const wR = R * 0.92, wCount = ORB.waveform.length, wAlpha = 0.15 + ORB.energy * 0.5;
    ctx.beginPath();
    for (let i = 0; i <= wCount; i++) {
      const a = (Math.PI * 2 * i) / wCount;
      const r = wR + ORB.waveform[i % wCount] * R * 0.25;
      i === 0 ? ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
              : ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.strokeStyle = `rgba(${col},${wAlpha.toFixed(3)})`; ctx.lineWidth = 1.2 + ORB.energy * 1.5; ctx.stroke();
    ctx.fillStyle = `rgba(${col},${(wAlpha * 0.08).toFixed(3)})`; ctx.fill();
  }

  // L13: Arc bolts
  for (const bolt of ORB.arcBolts) {
    if (!bolt.active || bolt.points.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
    for (let bi = 1; bi < bolt.points.length; bi++) ctx.lineTo(bolt.points[bi].x, bolt.points[bi].y);
    ctx.strokeStyle = `rgba(${col},0.8)`; ctx.lineWidth = 1.0; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bolt.points[0].x, bolt.points[0].y);
    for (let bi = 1; bi < bolt.points.length; bi++) ctx.lineTo(bolt.points[bi].x, bolt.points[bi].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3.0; ctx.stroke();
  }

  // L14: Mode rings
  if (ORB.mode === 3) {
    for (let i = 1; i <= 5; i++) {
      const rr = R * (1.0 + i * 0.08 + ((ORB.phase * 0.8 + i * 0.3) % 0.8));
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${Math.max(0, 0.25 - i * 0.04) * (0.5 + ORB.listenAmp * 0.5)})`;
      ctx.lineWidth = 1.2; ctx.stroke();
    }
  }
  if (ORB.mode === 2) {
    for (let i = 1; i <= 6; i++) {
      const rr = R * (0.95 + i * 0.07 + Math.sin(ORB.phase * (5 + i)) * 0.02 * ORB.speakAmp);
      const ra = (0.22 - i * 0.025) * (0.5 + ORB.speakAmp * 0.8);
      if (ra <= 0) continue;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${col},${ra.toFixed(3)})`; ctx.lineWidth = 0.8 + ORB.speakAmp; ctx.stroke();
    }
  }
  if (ORB.mode === 1) {
    for (let i = 0; i < 4; i++) {
      const aS = ORB.phase * (1.5 + i * 0.4) + i * Math.PI * 0.5;
      const aE = aS + 0.4 + ORB.energy * 0.6 + Math.sin(ORB.phase * 4 + i) * 0.2;
      ctx.beginPath(); ctx.arc(cx, cy, R * (1.02 + i * 0.025), aS, aE);
      ctx.strokeStyle = `rgba(${col},${(0.5 + ORB.energy * 0.3).toFixed(3)})`; ctx.lineWidth = 2.0 - i * 0.3; ctx.stroke();
    }
  }

  // L15: HUD corners
  const hudSize = R * 0.18, hudGap = R * 1.15, hudAlpha = 0.22 + ORB.energy * 0.18;
  for (const c of [{ dx:-1, dy:-1 }, { dx:1, dy:-1 }, { dx:1, dy:1 }, { dx:-1, dy:1 }]) {
    const bx = cx + c.dx * hudGap, by = cy + c.dy * hudGap;
    ctx.strokeStyle = `rgba(${col},${hudAlpha.toFixed(3)})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(bx + c.dx * -hudSize, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + c.dy * -hudSize); ctx.stroke();
  }

  // L16: Core
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.14, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${col},${(0.5 + ORB.energy * 0.4).toFixed(3)})`; ctx.lineWidth = 1.5; ctx.stroke();

  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ORB.phase * 0.5);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const ta = (Math.PI * 2 * i / 3) - Math.PI / 2;
    i === 0 ? ctx.moveTo(Math.cos(ta) * R * 0.09, Math.sin(ta) * R * 0.09)
            : ctx.lineTo(Math.cos(ta) * R * 0.09, Math.sin(ta) * R * 0.09);
  }
  ctx.closePath(); ctx.strokeStyle = `rgba(${col},${(0.6 + ORB.energy * 0.3).toFixed(3)})`; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.restore();

  const coreR = 18 + ORB.energy * 22;
  const core  = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0, 'rgba(255,255,255,0.98)');
  core.addColorStop(0.15, `rgba(${col},0.95)`);
  core.addColorStop(0.5, `rgba(${col},0.4)`);
  core.addColorStop(1, `rgba(${col},0)`);
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
   SYSTEM SPEECH (browser TTS fallback — Indian accent)
───────────────────────────────────────────────────── */
function speakSystem(text) {
  if (!synth) return;
  synth.cancel();
  const clean = text.replace(/[*#`_~]/g, '').trim();
  utterance = new SpeechSynthesisUtterance(clean);
  const agent = AGENTS[activeAgent];
  
  utterance.pitch = agent.gender === 'female' ? 1.15 : 0.88;
  utterance.rate  = agent.gender === 'female' ? 0.95 : 0.92;
  utterance.volume = 1;

  const pickVoice = () => {
    const voices = synth.getVoices();
    let v = null;
    if (agent.gender === 'female') {
      v = voices.find(v => v.name.toLowerCase().includes('hindi') && v.name.toLowerCase().includes('female'))
       || voices.find(v => v.lang === 'hi-IN')
       || voices.find(v => v.name.toLowerCase().includes('india') && v.name.toLowerCase().includes('female'))
       || voices.find(v => v.lang.startsWith('en-IN'))
       || voices.find(v => v.gender === 'female' || v.name.toLowerCase().includes('female'));
    } else {
      v = voices.find(v => v.lang === 'hi-IN')
       || voices.find(v => v.lang.startsWith('en-IN'))
       || voices.find(v => v.name.toLowerCase().includes('india'))
       || voices.find(v => v.lang.startsWith('en-GB'))
       || voices.find(v => v.lang.startsWith('en-'));
    }
    if (v) utterance.voice = v;
  };

  synth.getVoices().length ? pickVoice() : (synth.onvoiceschanged = pickVoice);
  synth.speak(utterance);
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
  if (synth) synth.cancel();
  isSpeaking = false;
  ORB.speakAmp = 0;
  if (speakIv) clearInterval(speakIv);
  document.getElementById('stop-btn').style.display = 'none';
  for (const src of activeGeminiSources) {
    try { src.stop(); } catch(e) {}
  }
  activeGeminiSources.clear();
  if (audioCtx) nextPlayTime = audioCtx.currentTime;
}

function interruptAndStartNewTurn(userText) {
  const clean = (userText || '').trim();
  showToast('INTERRUPTED — LISTENING');
  restartAfterClosePending = true;
  restartAfterCloseText = clean || null;
  stopGeminiPlayback();
  closeLiveSession();
  setTimeout(() => {
    const nextText = restartAfterCloseText;
    restartAfterCloseText = null;
    restartAfterClosePending = false;
    connectFails = 0;
    startGeminiSession(nextText);
  }, 180);
}

/* ─────────────────────────────────────────────────────
   BACKEND API
───────────────────────────────────────────────────── */
async function fetchApiKey() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/config`);
    const data = await res.json();
    if (data.apiKey) { apiKey = data.apiKey; return true; }
  } catch(err) { console.warn('[VIVEK] API key fetch failed:', err.message); }
  return false;
}

async function createSession() {
  if (currentSessionId && currentSessionAgent === activeAgent) return;
  try {
    // Try to reuse the most recent session for this agent (so history persists on refresh)
    const listRes = await fetch(`${BACKEND_URL}/api/sessions?limit=5`);
    const listData = await listRes.json();
    const existing = (listData.sessions || []).find(s => s.personality === activeAgent);
    if (existing) {
      currentSessionId = existing.id;
      currentSessionAgent = activeAgent;
      // Load past messages into the messages array for context
      await loadSessionMessages(currentSessionId);
      console.log('[VIVEK] Resumed session:', currentSessionId, 'with', messages.length, 'messages');
      return;
    }
    // No existing session — create a new one
    const res = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personality: activeAgent }),
    });
    const data = await res.json();
    currentSessionId = data.sessionId;
    currentSessionAgent = activeAgent;
    messages = [];
    console.log('[VIVEK] New session created:', currentSessionId);
  } catch(err) { 
    console.warn('[VIVEK] createSession error:', err.message);
    currentSessionId = null;
  }
}

async function loadSessionMessages(sessionId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/messages`);
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      // Restore last 40 messages for Gemini context
      messages = data.messages.slice(-40).map(m => ({ role: m.role, content: m.content }));
      console.log(`[VIVEK] Restored ${messages.length} messages from session ${sessionId}`);
      showToast(`MEMORY RESTORED — ${messages.length} msgs`);
    } else {
      messages = [];
      console.log(`[VIVEK] Session ${sessionId} has no messages yet (fresh start)`);
    }
  } catch(err) {
    console.warn('[VIVEK] loadSessionMessages error:', err.message);
    messages = [];
  }
}

function normalizeSpeechText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[.,!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function saveUserSpeechText(text) {
  const clean = (text || '').trim();
  if (clean.length < 2) return;
  if (clean === lastSavedUserText) return;
  lastSavedUserText = clean;
  saveMessage('user', clean);
}

function saveAssistantSpeechText(text) {
  const clean = (text || '').trim();
  if (clean.length < 2) return;
  if (clean === lastSavedAssistantText) return;
  lastSavedAssistantText = clean;
  saveMessage('assistant', clean);
}

function isStopCommand(normalizedText) {
  return /\b(stop|stop it|stop karo|ruko|ruk jao|bas|bus|chup|chup ho jao|chup karo|band karo|band kar do|rukiye|rok do|ruk|rokna|mat bolo|khamosh|khamosh ho jao)\b/.test(normalizedText);
}

function isSwitchToVivek(normalizedText) {
  // Match "vivek" anywhere in the utterance (at start, alone, or as command)
  return /\b(vivek|vi vek|viveek|bivek|vibek|vivec|viveck|wivek|vivak|vyvek|veevek)\b/.test(normalizedText)
    || /\b(switch to vivek|back to vivek|call vivek|activate vivek|male agent)\b/.test(normalizedText);
}

function isSwitchToPriya(normalizedText) {
  // Match "priya" anywhere in the utterance (at start, alone, or as command)
  return /\b(priya|prya|preya|priyaa)\b/.test(normalizedText)
    || /\b(switch to priya|call priya|activate priya|female agent)\b/.test(normalizedText);
}

function stopCurrentResponseOnly() {
  if (assistantBuffer) {
    saveAssistantSpeechText(assistantBuffer);
    assistantBuffer = '';
  }
  suppressModelAudioUntilTurnComplete = true;
  stopGeminiPlayback();
  isThinking = false;
  isListening = true;
  setOrbMode('listening');
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Listening…';
  txEl.classList.add('active');
}

async function saveMessage(role, content) {
  if (!currentSessionId) {
    console.warn('[VIVEK] saveMessage: no session ID, message not saved:', role, content.slice(0,40));
    return;
  }
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${currentSessionId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn('[VIVEK] saveMessage failed:', res.status, err);
    } else {
      console.log('[VIVEK] Saved message:', role, content.slice(0, 50));
    }
  } catch(err) {
    console.warn('[VIVEK] saveMessage network error:', err.message);
  }
}

async function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '<div class="h-empty">Loading…</div>';
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions?limit=15`);
    const data = await res.json();
    if (!data.sessions || data.sessions.length === 0) {
      list.innerHTML = '<div class="h-empty">No sessions yet.</div>'; return;
    }
    list.innerHTML = '';
    for (const s of data.sessions) {
      const date = new Date(s.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
      const div = document.createElement('div');
      div.className = 'h-session';
      div.innerHTML = `
        <div class="h-session-id">${s.personality.toUpperCase()} · ${date}</div>
        <div class="h-session-meta">${s.message_count || 0} messages</div>
        ${s.last_user_msg ? `<div class="h-session-preview">"${s.last_user_msg.slice(0,55)}…"</div>` : ''}
      `;
      div.onclick = () => viewSession(s.id);
      list.appendChild(div);
    }
  } catch(err) { list.innerHTML = '<div class="h-empty">Could not connect to backend.</div>'; }
}

async function viewSession(id) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/sessions/${id}`);
    const data = await res.json();
    const msgs = data.messages || [];
    const preview = msgs.slice(-4).map(m => `[${m.role.toUpperCase()}] ${m.content.slice(0,80)}`).join('\n');
    showToast('SESSION LOADED');
    document.getElementById('transcript-text').textContent = preview || 'Empty session.';
    document.getElementById('transcript-text').classList.add('active');
  } catch(err) { showToast('LOAD FAILED'); }
}

function toggleHistory() {
  const body = document.getElementById('history-body');
  const isOpen = body.classList.toggle('open');
  if (isOpen) loadHistory();
}

/* ─────────────────────────────────────────────────────
   MIC CAPTURE
───────────────────────────────────────────────────── */
async function startMicCapture() {
  if (micStream) return;
  try {
    ensureAudioCtx();
    // Ensure AudioContext is running — it may be suspended if gesture was not yet given
    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch(e) {}
    }
    if (audioCtx.state !== 'running') {
      console.warn('[VIVEK] AudioContext not running, state:', audioCtx.state);
      // Can't start mic without running AudioContext — retry after short delay
      setTimeout(() => { if (!micStream && isListening) startMicCapture(); }, 500);
      return;
    }
    nativeSR = audioCtx.sampleRate;
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false
    });
    micSrcNode = audioCtx.createMediaStreamSource(micStream);
    scriptProc = audioCtx.createScriptProcessor(4096, 1, 1);
    scriptProc.onaudioprocess = function(e) {
      const raw = e.inputBuffer.getChannelData(0);
      let rms = 0;
      for (let i = 0; i < raw.length; i++) rms += raw[i] * raw[i];
      rms = Math.sqrt(rms / raw.length);
      ORB.listenAmp = Math.min(1, rms * 10);

      if (!sessionReady || !liveWs || liveWs.readyState !== WebSocket.OPEN || !isListening) return;
      const resampled = resampleTo16k(raw, nativeSR);
      liveWs.send(JSON.stringify({ realtimeInput: { audio: { data: int16ToBase64(resampled), mimeType: 'audio/pcm;rate=16000' } } }));
    };
    micSrcNode.connect(scriptProc); scriptProc.connect(audioCtx.destination);
    setOrbMode('listening');
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = 'Listening…'; txEl.classList.add('active');
  } catch(err) {
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = err.name === 'NotAllowedError' ? 'Microphone access denied.' : 'Mic error: ' + err.message;
    txEl.classList.add('active');
    closeLiveSession();
    if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
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
  stopGeminiPlayback();
}

/* ─────────────────────────────────────────────────────
   WAKE WORD DETECTION (Both agents)
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
  const agentName = AGENTS[activeAgent].label;
  txEl.textContent = `Say "${agentName}" to activate…`; txEl.classList.remove('active');
  setOrbMode('idle');
  try { wakeRec = new SpeechRec(); } catch(e) { scheduleWakeRestart(2000); return; }
  wakeRec.continuous = true; wakeRec.interimResults = true;
  wakeRec.lang = activeAgent === 'priya' ? 'hi-IN' : 'en-IN';
  wakeRunning = true;

  wakeRec.onresult = function(e) {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.toLowerCase().trim();
      const vivekWake = /\b(vivek|vi vek|viveek|bivek|vibek|vivec|viveck|wivek|vivak|vyvek|veevek)\b/i.test(t);
      const priyaWake = /\b(priya|prya|preya|priyaa)\b/i.test(t);
      
      // Switch to Priya if "call priya" / "switch to priya" detected
      if (priyaWake && activeAgent !== 'priya') {
        stopWakeDetection(); switchAgent('priya');
        const trailing = t.split(/priya/i).slice(1).join('').replace(/[.,!?]/g, '').trim();
        startGeminiSession(trailing || null); return;
      }
      if (vivekWake && activeAgent === 'priya') {
        stopWakeDetection(); switchAgent('vivek');
        const trailing = t.split(/vivek/i).slice(1).join('').replace(/[.,!?]/g, '').trim();
        startGeminiSession(trailing || null); return;
      }

      const currentWakeWord = AGENTS[activeAgent].wakeWord;
      if (currentWakeWord.test(t)) {
        stopWakeDetection(); showToast('WAKE WORD DETECTED');
        txEl.textContent = 'Connecting…'; txEl.classList.add('active');
        const parts = t.split(currentWakeWord);
        const trailing = parts.slice(1).join('').replace(/[.,!?]/g, '').trim();
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
  stopGeminiPlayback();
  closeLiveSession();
  setOrbMode('idle');
  if (apiKey && gestureUnlocked) setTimeout(() => startGeminiSession(null), 450);
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
   Core change: system prompt makes agent speak in
   its own voice, not raw Gemini output
───────────────────────────────────────────────────── */
async function startGeminiSession(initialText) {
  if (liveWs && liveWs.readyState === WebSocket.OPEN) liveWs.close();
  isDormant = false; sessionReady = false; isListening = true;
  isThinking = false; isSpeaking = false; nextPlayTime = 0;
  suppressModelAudioUntilTurnComplete = false;
  assistantBuffer = '';
  await createSession();

  const agent = AGENTS[activeAgent];
  const systemPrompt = agent.buildPrompt(learnedInstructions);
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Neural bridge connecting…'; txEl.classList.add('active');
  setOrbMode('thinking');

  let ws;
  try { ws = new WebSocket('wss://vivek-qqwu.onrender.com/gemini-proxy'); liveWs = ws; } catch(e) {
    txEl.textContent = 'WebSocket failed: ' + e.message;
    closeLiveSession();
    if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
    return;
  }

  const connTimeout = setTimeout(() => {
    if (!sessionReady) {
      txEl.textContent = 'Connection timed out.';
      closeLiveSession();
      if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
    }
  }, 15000);

  ws.onopen = function() {
    if (liveWs !== ws) { ws.close(); return; }
    ws.send(JSON.stringify({
      setup: {
        model: 'models/gemini-3.1-flash-live-preview',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: agent.geminiVoice || 'Puck' } }
          },
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        systemInstruction: { parts: [{ text: systemPrompt }] }
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

    if (data.setupComplete !== undefined) {
      clearTimeout(connTimeout); sessionReady = true; connectFails = 0;
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
            if (suppressModelAudioUntilTurnComplete) continue;
            if (!isSpeaking) {
              isSpeaking = true;
              speakingStartedAt = performance.now();
              setOrbMode('speaking');
              document.getElementById('stop-btn').style.display = 'block';
              pulseSpeaking();
            }
            playGeminiChunk(part.inlineData.data);
          }
          if (part.text) {
            if (suppressModelAudioUntilTurnComplete) continue;
            assistantBuffer += part.text;
            txEl.textContent = assistantBuffer.length > 120 ? assistantBuffer.slice(0, 120) + '…' : assistantBuffer;
            txEl.classList.add('active');
          }
        }
      }

      if (sc.outputAudioTranscription && sc.outputAudioTranscription.text) {
        if (!suppressModelAudioUntilTurnComplete) {
          assistantBuffer += sc.outputAudioTranscription.text;
          txEl.textContent = assistantBuffer.length > 120 ? assistantBuffer.slice(0, 120) + '…' : assistantBuffer;
          txEl.classList.add('active');
        }
      }

      // User speech transcription — detect commands and instruction learning
      if (sc.inputAudioTranscription && sc.inputAudioTranscription.text) {
        const userSaid = sc.inputAudioTranscription.text.trim();
        const normalized = normalizeSpeechText(userSaid);
        if (!normalized) return;

        // ── COMMAND DETECTION (silent — never saved to DB, never sent to Gemini) ──
        const cmd = detectCommand(normalized);

        if (cmd === 'STOP') {
          // Immediately cut audio and suppress the rest of this turn
          stopCurrentResponseOnly();
          // Send an interrupt signal to Gemini so it stops generating
          if (liveWs && liveWs.readyState === WebSocket.OPEN) {
            try {
              liveWs.send(JSON.stringify({ clientContent: { turns: [], turnComplete: true } }));
            } catch(e) {}
          }
          return; // DO NOT save to DB, DO NOT let Gemini respond
        }

        if (cmd === 'SWITCH_PRIYA' && activeAgent !== 'priya') {
          // Silent switch — stop current response, switch agent, restart session
          stopCurrentResponseOnly();
          switchAgent('priya');
          closeLiveSession();
          setTimeout(() => { connectFails = 0; startGeminiSession(null); }, 800);
          return; // DO NOT save to DB, DO NOT let Gemini respond
        }

        if (cmd === 'SWITCH_VIVEK' && activeAgent !== 'vivek') {
          stopCurrentResponseOnly();
          switchAgent('vivek');
          closeLiveSession();
          setTimeout(() => { connectFails = 0; startGeminiSession(null); }, 800);
          return; // DO NOT save to DB, DO NOT let Gemini respond
        }

        // ── Normal utterance — save to DB ──
        saveUserSpeechText(userSaid);

        // Color change (non-command, agent can respond)
        const colorWords = normalized.split(/\s+/);
        if (/\b(color|colour|orb|change|make|set)\b/.test(normalized)) {
          for (const w of colorWords) { if (COLOR_MAP[w]) { setColor(COLOR_MAP[w]); break; } }
        }

        // Save instruction if Boss gave one
        detectAndSaveInstruction(userSaid);
      }

      if (sc.turnComplete) {
        if (assistantBuffer) {
          saveAssistantSpeechText(assistantBuffer);
          assistantBuffer = '';
        }
        suppressModelAudioUntilTurnComplete = false;
        isThinking = false;
        const remaining = audioCtx ? Math.max(0, nextPlayTime - audioCtx.currentTime) : 0;
        setTimeout(function() {
          stopGeminiPlayback();
          isListening = true;
          txEl.textContent = 'Listening…';
          txEl.classList.add('active');
          setOrbMode('listening');
          if (!micStream) startMicCapture();
        }, remaining * 1000 + 500);
      }
    }

    if (data.error) {
      clearTimeout(connTimeout);
      txEl.textContent = data.error.message || 'Neural bridge error.'; txEl.classList.add('active');
      closeLiveSession();
      if (apiKey) setTimeout(() => startGeminiSession(null), 2000);
    }
  };

  ws.onerror = function(err) {
    clearTimeout(connTimeout);
    connectFails++;
    console.error('[VIVEK] WebSocket error (fail #' + connectFails + '):', err);
    document.getElementById('transcript-text').textContent = 'Connection error — retrying…';
    document.getElementById('transcript-text').classList.add('active');
    closeLiveSession(); setOrbMode('idle');
    if (apiKey && connectFails < MAX_FAILS) setTimeout(() => startGeminiSession(null), 3000);
    else if (connectFails >= MAX_FAILS) {
      document.getElementById('transcript-text').textContent = `❌ Gemini connection failed ${connectFails} times. Check GEMINI_API_KEY on server.`;
    }
  };

  ws.onclose = function(event) {
    clearTimeout(connTimeout);
    const wasReady = sessionReady;
    sessionReady = false; stopMicCapture();
    if (restartAfterClosePending) return;
    if (!isDormant && apiKey) {
      isDormant = true; setOrbMode('idle');
      // Only count as a real failure if Gemini closed BEFORE setup completed
      // (i.e. auth error, bad key, network issue). Normal session ends after
      // setup completes and are NOT failures — just reconnect silently.
      if (!wasReady) {
        connectFails++;
        console.warn(`[VIVEK] Connection closed before ready (fail #${connectFails}), code:`, event.code);
        if (connectFails >= MAX_FAILS) {
          const txEl = document.getElementById('transcript-text');
          txEl.textContent = `❌ Gemini connection failed ${connectFails} times. Check GEMINI_API_KEY on server.`;
          txEl.classList.add('active');
          return;
        }
        // Back off longer on repeated pre-setup failures
        if (gestureUnlocked) setTimeout(() => startGeminiSession(null), 1500 * connectFails);
      } else {
        // Normal close after a successful session — reconnect quietly
        connectFails = 0;
        if (gestureUnlocked) setTimeout(() => startGeminiSession(null), 800);
      }
    }
  };
}

function sendTextTurn(text) {
  if (!liveWs || liveWs.readyState !== WebSocket.OPEN) return;
  liveWs.send(JSON.stringify({
    realtimeInput: { text }
  }));
  setOrbMode('thinking'); isThinking = true; isListening = true;
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
   AGENT INDICATOR (UI update helpers)
───────────────────────────────────────────────────── */
function updateAgentUI() {
  const agent = AGENTS[activeAgent];
  document.getElementById('agent-label').textContent = agent.label;
  document.getElementById('jarvis-label').textContent = agent.label;
  const agentGenderIcon = document.getElementById('agent-gender-icon');
  if (agentGenderIcon) {
    agentGenderIcon.textContent = agent.gender === 'female' ? '♀ PRIYA' : '♂ VIVEK';
  }
}

/* ─────────────────────────────────────────────────────
   BOOT
───────────────────────────────────────────────────── */
var bootLines = ['bl1','bl2','bl3','bl4','bl5'];
var bootIdx = 0, bootPct = 0;

// Tracks whether the user has given the first gesture (needed for AudioContext + mic)
let gestureUnlocked = false;

async function unlockAndStart() {
  if (gestureUnlocked) return;
  gestureUnlocked = true;

  // This runs inside a user gesture — safe to unlock AudioContext and request mic
  try {
    ensureAudioCtx();
    // Pre-request mic permission now while we are in the gesture handler
    // so startMicCapture() later never fails due to missing gesture
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      // Store this pre-granted stream so startMicCapture can reuse it
      micStream = stream;
      // Immediately stop the tracks — startMicCapture will re-open with full settings
      stream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
  } catch(e) {
    console.warn('[VIVEK] Mic pre-request failed:', e.message);
  }

  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Neural bridge connecting…';
  txEl.classList.add('active');
  connectFails = 0;
  startGeminiSession(null);
}

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
      setTimeout(async function() {
        // Load persisted state before showing activate button
        loadInstructions();
        const savedAgent = localStorage.getItem('vivek_active_agent') || 'vivek';
        activeAgent = savedAgent;
        updateAgentUI();
        setColor(AGENTS[activeAgent].color);

        const loaded = await fetchApiKey();
        const overlay = document.getElementById('boot-overlay');

        if (!loaded) {
          // Backend offline — show error inside overlay
          const statusEl = overlay.querySelector('.boot-status') || overlay;
          const errDiv = document.createElement('div');
          errDiv.style.cssText = 'color:#ff4444;margin-top:20px;font-family:monospace;font-size:13px;';
          errDiv.textContent = 'BACKEND OFFLINE — Check BACKEND_URL in app.js';
          overlay.appendChild(errDiv);
          return;
        }

        // Replace boot bar area with a single ACTIVATE button
        // This button IS the user gesture — clicking it unlocks AudioContext + mic
        const activateBtn = document.createElement('button');
        activateBtn.id = 'activate-btn';
        activateBtn.textContent = '⬡  ACTIVATE  ⬡';
        activateBtn.style.cssText = [
          'margin-top:32px',
          'padding:14px 48px',
          'background:transparent',
          'border:2px solid rgba(255,154,0,0.8)',
          'color:#ff9a00',
          'font-family:inherit',
          'font-size:15px',
          'letter-spacing:4px',
          'cursor:pointer',
          'border-radius:4px',
          'transition:all 0.2s',
          'text-transform:uppercase',
          'box-shadow:0 0 24px rgba(255,154,0,0.3)',
          'animation:pulse-btn 1.5s ease-in-out infinite',
        ].join(';');

        // Add pulse animation
        if (!document.getElementById('activate-btn-style')) {
          const style = document.createElement('style');
          style.id = 'activate-btn-style';
          style.textContent = '@keyframes pulse-btn { 0%,100%{box-shadow:0 0 20px rgba(255,154,0,0.3)} 50%{box-shadow:0 0 40px rgba(255,154,0,0.7)} }';
          document.head.appendChild(style);
        }

        // Hide the boot bar, show the button
        const barWrap = document.getElementById('boot-bar-wrap') || bar.parentElement;
        if (barWrap) barWrap.style.display = 'none';
        overlay.appendChild(activateBtn);

        activateBtn.addEventListener('click', async function() {
          activateBtn.textContent = 'INITIALIZING…';
          activateBtn.disabled = true;
          // Fade out the overlay
          overlay.style.transition = 'opacity 0.6s';
          overlay.style.opacity = '0';
          setTimeout(() => { overlay.style.display = 'none'; }, 650);
          await unlockAndStart();
        });

        // Also allow keyboard activation (space/enter)
        document.addEventListener('keydown', async function onKey(e) {
          if (e.code === 'Space' || e.code === 'Enter') {
            document.removeEventListener('keydown', onKey);
            overlay.style.transition = 'opacity 0.6s';
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; }, 650);
            await unlockAndStart();
          }
        });

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
  if (!gestureUnlocked) return; // gesture not yet given — boot button handles first click
  ensureAudioCtx();
  if (isSpeaking || isListening || isThinking) stopAll();
  else if (isDormant && apiKey) {
    connectFails = 0;
    startGeminiSession(null);
  }
  else if (!apiKey) showToast('BACKEND NOT CONNECTED');
});

/* Quick agent toggle button */
document.addEventListener('keydown', function(e) {
  if (e.key === 'p' || e.key === 'P') {
    if (activeAgent === 'vivek') switchAgent('priya');
    else switchAgent('vivek');
  }
  if (e.key === 'Escape') stopAll();
});
