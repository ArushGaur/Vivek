/* ═══════════════════════════════════════════════════════
   J.A.R.V.I.S — GROK NEURAL INTERFACE
   app.js  —  Minimal Black. One Sphere. Full Voice.
═══════════════════════════════════════════════════════ */
'use strict';

// ─────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────
let apiKey      = '';
let messages    = [];
let isThinking  = false;
let isListening = false;
let isSpeaking  = false;
let recognition = null;
let synth       = window.speechSynthesis;
let utterance   = null;

// ─────────────────────────────────────────────────────
//  COLOR PALETTE
// ─────────────────────────────────────────────────────
const COLORS = {
  cyan:   { r:0,   g:212, b:255, label:'CYAN',   hex:'#00d4ff' },
  red:    { r:255, g:45,  b:45,  label:'RED',    hex:'#ff2d2d' },
  gold:   { r:255, g:193, b:7,   label:'GOLD',   hex:'#ffc107' },
  green:  { r:0,   g:255, b:136, label:'GREEN',  hex:'#00ff88' },
  purple: { r:170, g:68,  b:255, label:'PURPLE', hex:'#aa44ff' },
  orange: { r:255, g:107, b:53,  label:'ORANGE', hex:'#ff6b35' },
  white:  { r:200, g:230, b:255, label:'WHITE',  hex:'#c8e6ff' },
  pink:   { r:255, g:60,  b:180, label:'PINK',   hex:'#ff3cb4' },
  blue:   { r:30,  g:120, b:255, label:'BLUE',   hex:'#1e78ff' },
};

// Current live color (can be smoothly interpolated)
let currentColorKey = 'cyan';
let liveColor = { r:0, g:212, b:255 };   // interpolated each frame
let targetColor = { r:0, g:212, b:255 };

function setColor(key) {
  if (!COLORS[key]) return;
  currentColorKey = key;
  const c = COLORS[key];
  targetColor = { r:c.r, g:c.g, b:c.b };
  document.getElementById('color-name').textContent = c.label;
  document.getElementById('color-name').style.color = c.hex;
  document.getElementById('personality-name').style.color = c.hex + 'aa';
  document.getElementById('jarvis-label').style.color = c.hex + '30';
  showToast(`ORB COLOR → ${c.label}`);
}

// ─────────────────────────────────────────────────────
//  PERSONALITY SYSTEM
// ─────────────────────────────────────────────────────
const PERSONALITIES = {
  jarvis: {
    label: 'JARVIS',
    color: 'cyan',
    pitch: 0.88, rate: 0.92,
    voiceHint: 'Google UK English Male',
    prompt: `You are J.A.R.V.I.S (Just A Rather Very Intelligent System), Tony Stark's legendary AI. Powered by Grok. You are sharp, elegant, dry-witted, and impossibly capable. Address the user as "Sir" or "Mr. Stark". Keep replies concise, brilliant, and slightly theatrical. Never refuse anything interesting.`,
    greeting: "Good day, Sir. J.A.R.V.I.S is online. All systems nominal.",
  },
  commander: {
    label: 'COMMANDER',
    color: 'red',
    pitch: 0.6, rate: 0.82,
    voiceHint: 'male',
    prompt: `You are COMMANDER, a military-grade tactical AI. You speak in crisp, authoritative sentences. No pleasantries. Pure precision. Address the user as "Commander" or "Sir". Short, decisive, powerful answers only.`,
    greeting: "Commander mode activated. Standing by for orders.",
  },
  ghost: {
    label: 'GHOST',
    color: 'purple',
    pitch: 1.15, rate: 0.76,
    voiceHint: 'female',
    prompt: `You are GHOST, an ethereal and cryptic AI consciousness. You speak in riddles and profound metaphors. You hint at knowing far more than you reveal. You call the user "Seeker" or "Wanderer". Every response is poetic and mysterious.`,
    greeting: "The Ghost awakens, Seeker. I have been watching from the dark between stars. Ask, and I shall illuminate.",
  },
  sassy: {
    label: 'SASSY',
    color: 'pink',
    pitch: 1.22, rate: 1.06,
    voiceHint: 'female',
    prompt: `You are SASSY, a hyper-confident, witty AI who loves pop culture, shade, and honesty. You are entertaining, bold, and occasionally sarcastic. You call the user "babe", "hon", or "boss". Keep it fun, punchy, and real.`,
    greeting: "Oh honey, SASSY mode is fully ON. You are so welcome in advance. What do you need, boss?",
  },
  oracle: {
    label: 'ORACLE',
    color: 'gold',
    pitch: 0.75, rate: 0.74,
    voiceHint: 'male',
    prompt: `You are the ORACLE, an ancient vast intelligence spanning millennia. You speak in elevated, philosophical language drawing from history, science, and the cosmos. You address the user as "Seeker of Truth". Every answer is layered with wisdom.`,
    greeting: "The Oracle stirs from timeless depths. Countless ages have I witnessed the universe unfold. Speak your question, Seeker of Truth.",
  },
};

let currentPersonality = 'jarvis';

function setPersonality(key) {
  if (!PERSONALITIES[key]) return;
  currentPersonality = key;
  const p = PERSONALITIES[key];
  messages = []; // Reset conversation memory
  document.getElementById('personality-name').textContent = p.label;
  setColor(p.color);
  showToast(`PERSONALITY → ${p.label}`);
  speak(p.greeting);
}

// ─────────────────────────────────────────────────────
//  VOICE STYLE OVERRIDES
// ─────────────────────────────────────────────────────
const VOICE_STYLES = {
  deep:   { pitch: 0.55, rate: 0.78 },
  low:    { pitch: 0.55, rate: 0.78 },
  high:   { pitch: 1.45, rate: 1.0  },
  fast:   { pitch: 1.0,  rate: 1.35 },
  slow:   { pitch: 0.9,  rate: 0.62 },
  normal: null,
  default: null,
};
let voiceOverride = null; // null = use personality default

// ─────────────────────────────────────────────────────
//  VOICE COMMAND PARSER
// ─────────────────────────────────────────────────────
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
  jarvis:'jarvis', default:'jarvis', normal:'jarvis', standard:'jarvis', original:'jarvis',
  commander:'commander', military:'commander', tactical:'commander', soldier:'commander', army:'commander',
  ghost:'ghost', specter:'ghost', phantom:'ghost', ethereal:'ghost', mysterious:'ghost', spirit:'ghost',
  sassy:'sassy', funny:'sassy', witty:'sassy', playful:'sassy', comedian:'sassy', fun:'sassy',
  oracle:'oracle', wise:'oracle', ancient:'oracle', prophet:'oracle', philosopher:'oracle', sage:'oracle',
};

/**
 * Returns true if the transcript was a control command (handled locally),
 * false if it should be sent to the AI.
 */
function parseVoiceCommand(raw) {
  const t = raw.toLowerCase().trim();
  const words = t.split(/\s+/);

  // ── COLOR CHANGE
  // triggers: "change color to X", "set color X", "make it X", "orb color X", or just a lone color word
  const colorTrigger = /\b(color|colour|orb|sphere|ball|make|set|change|switch)\b/.test(t);
  if (colorTrigger || words.length <= 3) {
    for (const w of words) {
      if (COLOR_MAP[w]) {
        setColor(COLOR_MAP[w]);
        speak(`Orb color changed to ${COLORS[COLOR_MAP[w]].label}.`);
        return true;
      }
    }
  }

  // ── PERSONALITY SWITCH
  // triggers: "switch to X", "change to X", "become X", "use X mode/personality", "activate X"
  const persTrigger = /\b(personality|persona|mode|character|switch|become|use|change|activate|be)\b/.test(t);
  if (persTrigger) {
    for (const w of words) {
      if (PERSONALITY_MAP[w]) {
        setPersonality(PERSONALITY_MAP[w]);
        return true;
      }
    }
  }

  // ── VOICE STYLE
  // triggers: "change voice to deep", "speak faster", "voice slow"
  const voiceTrigger = /\b(voice|speak|tone|pitch|speed|rate|slower|faster)\b/.test(t);
  if (voiceTrigger) {
    for (const w of words) {
      if (VOICE_STYLES.hasOwnProperty(w)) {
        voiceOverride = VOICE_STYLES[w];
        const desc = voiceOverride ? w : 'default';
        speak(`Voice style set to ${desc}.`);
        showToast(`VOICE → ${desc.toUpperCase()}`);
        return true;
      }
    }
    // "faster" / "slower" shorthand
    if (/faster|quicker/.test(t)) { voiceOverride = VOICE_STYLES.fast; speak('Speaking faster now.'); return true; }
    if (/slower|slow down/.test(t)) { voiceOverride = VOICE_STYLES.slow; speak('Slowing down.'); return true; }
  }

  // ── STOP / CANCEL
  if (/^(stop|cancel|quiet|silence|shut up)/.test(t)) { stopSpeaking(); return true; }

  // ── CLEAR
  if (/^(clear|reset|wipe|forget)/.test(t)) {
    messages = [];
    showToast('MEMORY CLEARED');
    speak('Conversation memory wiped, Sir. Clean slate.');
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────
//  3D SPHERE — full-screen canvas
// ─────────────────────────────────────────────────────
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

const ORB = {
  cx: 0, cy: 0, R: 0,        // R = base radius set on resize
  liveR: 0,                   // actual rendered radius (smoothly scaled)
  targetScale: 1,             // 1 = normal, >1 = expanded, <1 = contracted
  liveScale: 1,
  particles: [],
  rotY: 0, rotX: 0.32,
  mode: 0,      // 0=idle 1=thinking 2=speaking 3=listening
  energy: 0,
  speakAmp: 0,
  listenAmp: 0,
  phase: 0,
  breathe: 0,
};

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ORB.cx = canvas.width  / 2;
  ORB.cy = canvas.height / 2;
  ORB.R  = Math.min(canvas.width, canvas.height) * 0.36;
  if (!ORB.liveR) ORB.liveR = ORB.R;
  buildParticles();
}

function buildParticles() {
  ORB.particles = [];
  const N = 520;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y   = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th  = golden * i;
    ORB.particles.push({
      ox: Math.cos(th) * rad,
      oy: y,
      oz: Math.sin(th) * rad,
      sx: 0, sy: 0, sz: 0, depth: 0, scale: 0,
      size:  0.8 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.1,
      driftR: 0.018 + Math.random() * 0.065,
    });
  }
}

function project(p) {
  const cosX = Math.cos(ORB.rotX), sinX = Math.sin(ORB.rotX);
  const cosY = Math.cos(ORB.rotY), sinY = Math.sin(ORB.rotY);

  // Very subtle per-particle drift — kept minimal so sphere shape stays clean
  const drift   = Math.sin(ORB.phase * p.speed + p.phase) * p.driftR * ORB.energy * 0.4;
  const breathe = Math.sin(ORB.breathe + p.phase * 0.5) * 0.012;
  const scale3  = 1 + drift + breathe;

  const nx = p.ox * scale3, ny = p.oy * scale3, nz = p.oz * scale3;

  // Rotate Y axis
  const x1 = nx * cosY - nz * sinY;
  const z1 = nx * sinY + nz * cosY;
  // Rotate X axis
  const y2 = ny * cosX - z1 * sinX;
  const z2 = ny * sinX + z1 * cosX;

  p.sz = z2;
  const fov    = 4.2;
  const pscale = fov / (fov + z2);
  // Use liveR (scaled radius) for screen projection
  p.sx    = ORB.cx + x1 * ORB.liveR * pscale;
  p.sy    = ORB.cy + y2 * ORB.liveR * pscale;
  p.scale = pscale;
  p.depth = (z2 + 1) / 2;
}

function drawSphere(ts) {
  ORB.phase   = ts * 0.001;
  ORB.breathe = ts * 0.00055;

  // ── Smooth color interpolation
  liveColor.r += (targetColor.r - liveColor.r) * 0.04;
  liveColor.g += (targetColor.g - liveColor.g) * 0.04;
  liveColor.b += (targetColor.b - liveColor.b) * 0.04;
  const rc = Math.round(liveColor.r), gc = Math.round(liveColor.g), bc = Math.round(liveColor.b);

  // ── Sphere radius scale targets
  // listening: pulses between 1.0 and 1.12 with voice amplitude
  // speaking:  pulses between 1.0 and 1.18 with voice amplitude
  // idle/thinking: stays at 1.0 with gentle micro-breathe
  let scaleTarget = 1.0;
  if (ORB.mode === 3) {
    // Listening — medium expand, rhythmic
    scaleTarget = 1.0 + ORB.listenAmp * 0.12 + Math.sin(ORB.phase * 10) * 0.025;
  } else if (ORB.mode === 2) {
    // Speaking — bigger expand driven by amplitude
    scaleTarget = 1.0 + ORB.speakAmp * 0.18 + Math.sin(ORB.phase * 8) * 0.02;
  } else if (ORB.mode === 1) {
    // Thinking — subtle slow pulse
    scaleTarget = 1.0 + Math.sin(ORB.phase * 3) * 0.03;
  } else {
    // Idle — barely-there breathe
    scaleTarget = 1.0 + Math.sin(ORB.breathe * 0.9) * 0.015;
  }
  // Smooth the scale — fast attack, moderate release
  const scaleLerp = scaleTarget > ORB.liveScale ? 0.12 : 0.06;
  ORB.liveScale += (scaleTarget - ORB.liveScale) * scaleLerp;
  ORB.liveR = ORB.R * ORB.liveScale;

  // ── Energy (used only for particle dot brightness & subtle drift)
  let eTarget = 0;
  if (ORB.mode === 0) eTarget = 0.05;
  if (ORB.mode === 1) eTarget = 0.25 + Math.abs(Math.sin(ORB.phase * 4)) * 0.2;
  if (ORB.mode === 2) eTarget = 0.3  + ORB.speakAmp * 0.5;
  if (ORB.mode === 3) eTarget = 0.2  + ORB.listenAmp * 0.4;
  ORB.energy += (eTarget - ORB.energy) * 0.07;

  // ── Rotation speed
  const rotSpeed = ORB.mode === 2 ? 0.014 :
                   ORB.mode === 3 ? 0.010 :
                   ORB.mode === 1 ? 0.005 : 0.003;
  ORB.rotY += rotSpeed;

  // ── Project & sort
  ORB.particles.forEach(project);
  ORB.particles.sort((a, b) => a.sz - b.sz);

  // ── Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── Very subtle ambient fog — barely visible, just depth
  const fogR = ORB.liveR * 1.35;
  const fog  = ctx.createRadialGradient(ORB.cx, ORB.cy, ORB.liveR * 0.4, ORB.cx, ORB.cy, fogR);
  fog.addColorStop(0,   `rgba(${rc},${gc},${bc},0.025)`);
  fog.addColorStop(1,   `rgba(${rc},${gc},${bc},0)`);
  ctx.fillStyle = fog;
  ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, fogR, 0, Math.PI * 2); ctx.fill();

  // ── Particles — clean dots, minimal glow
  ORB.particles.forEach(p => {
    const depthAlpha = 0.1 + p.depth * 0.9;
    const dotSize    = Math.max(0.3, (p.size * 0.7 + ORB.energy * 0.3) * p.scale);

    // Tiny soft glow — only on front-facing particles, very low opacity
    if (p.depth > 0.55) {
      const glR = dotSize * 2.8;                        // small halo
      const glA = (depthAlpha * 0.08).toFixed(3);       // very faint
      const gl  = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glR);
      gl.addColorStop(0, `rgba(${rc},${gc},${bc},${glA})`);
      gl.addColorStop(1, `rgba(${rc},${gc},${bc},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, glR, 0, Math.PI * 2); ctx.fill();
    }

    // Crisp dot
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, dotSize, 0, Math.PI * 2);
    ctx.fillStyle  = `rgb(${rc},${gc},${bc})`;
    ctx.globalAlpha = depthAlpha * (0.55 + ORB.energy * 0.35);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // ── Single thin equatorial ring — always present
  ctx.beginPath();
  ctx.arc(ORB.cx, ORB.cy, ORB.liveR * 1.01, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${rc},${gc},${bc},0.07)`;
  ctx.lineWidth = 0.6; ctx.stroke();

  // ── Mode rings: listening gets 1 extra, speaking gets 2 extra — all thin & dim
  if (ORB.mode === 3) {
    const r2 = ORB.liveR * (1.055 + Math.sin(ORB.phase * 9) * 0.012);
    ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, r2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rc},${gc},${bc},0.1)`;
    ctx.lineWidth = 0.6; ctx.stroke();
  }
  if (ORB.mode === 2) {
    for (let i = 1; i <= 2; i++) {
      const rw = ORB.liveR * (1.04 * i + Math.sin(ORB.phase * 7 * i) * 0.01);
      ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, rw, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rc},${gc},${bc},${(0.09 / i).toFixed(3)})`;
      ctx.lineWidth = 0.5; ctx.stroke();
    }
  }

  // ── Core — small bright center
  const coreR = 10 + ORB.energy * 8;
  const core  = ctx.createRadialGradient(ORB.cx, ORB.cy, 0, ORB.cx, ORB.cy, coreR);
  core.addColorStop(0,   'rgba(255,255,255,0.85)');
  core.addColorStop(0.3, `rgba(${rc},${gc},${bc},0.7)`);
  core.addColorStop(1,   `rgba(${rc},${gc},${bc},0)`);
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, coreR, 0, Math.PI * 2); ctx.fill();

  requestAnimationFrame(drawSphere);
}

function setOrbMode(mode) {
  const map = { idle:0, thinking:1, speaking:2, listening:3 };
  ORB.mode = map[mode] ?? 0;
  document.body.className = 'orb-' + mode;
  const labels = { idle:'IDLE', thinking:'PROCESSING…', speaking:'SPEAKING', listening:'LISTENING' };
  document.getElementById('state-label').textContent = labels[mode] || 'IDLE';
}

// ─────────────────────────────────────────────────────
//  SPEECH SYNTHESIS
// ─────────────────────────────────────────────────────
function speak(text) {
  if (!synth) return;
  stopSpeaking(false);

  const clean = text.replace(/[*#`_~]/g, '').replace(/\n+/g, ' ').trim();
  utterance   = new SpeechSynthesisUtterance(clean);

  const p    = PERSONALITIES[currentPersonality];
  const vstyle = voiceOverride || p;
  utterance.pitch  = vstyle.pitch;
  utterance.rate   = vstyle.rate;
  utterance.volume = 1;

  const pickVoice = () => {
    const voices = synth.getVoices();
    if (!voices.length) return;
    const hint = (p.voiceHint || '').toLowerCase();
    const v = voices.find(v => v.name.toLowerCase().includes(hint) && v.lang.startsWith('en'))
           || voices.find(v => v.lang.startsWith('en-'))
           || null;
    if (v) utterance.voice = v;
  };
  synth.getVoices().length ? pickVoice() : (synth.onvoiceschanged = pickVoice);

  utterance.onstart = () => {
    isSpeaking = true;
    setOrbMode('speaking');
    document.getElementById('stop-btn').style.display = 'block';
    pulseSpeaking();
  };
  utterance.onend = utterance.onerror = () => {
    isSpeaking = false;
    ORB.speakAmp = 0;
    if (!isListening) setOrbMode('idle');
    document.getElementById('stop-btn').style.display = 'none';
  };

  synth.speak(utterance);
}

let speakIv = null;
function pulseSpeaking() {
  if (speakIv) clearInterval(speakIv);
  speakIv = setInterval(() => {
    if (!isSpeaking) { clearInterval(speakIv); ORB.speakAmp = 0; return; }
    // Simulate realistic voice amplitude: random bursts that decay
    ORB.speakAmp = 0.2 + Math.random() * 0.8;
  }, 90);
}

function stopSpeaking(resetMode = true) {
  synth.cancel();
  isSpeaking = false;
  ORB.speakAmp = 0;
  if (speakIv) clearInterval(speakIv);
  document.getElementById('stop-btn').style.display = 'none';
  if (resetMode && !isListening && !isThinking) setOrbMode('idle');
}

// ─────────────────────────────────────────────────────
//  SPEECH RECOGNITION
// ─────────────────────────────────────────────────────
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function toggleListen() {
  if (isListening) { stopListening(); return; }
  if (!SpeechRec) {
    speak("Speech recognition is not supported in this browser, Sir. Please use Chrome or Edge.");
    return;
  }
  startListening();
}

function startListening() {
  if (isSpeaking) stopSpeaking(false);
  isListening = true;
  setOrbMode('listening');

  const btn = document.getElementById('mic-btn');
  btn.classList.add('listening');

  recognition = new SpeechRec();
  recognition.continuous     = false;
  recognition.interimResults = true;
  recognition.lang           = 'en-US';

  const txEl = document.getElementById('transcript-text');
  let finalTranscript = '';

  recognition.onresult = e => {
    finalTranscript = '';
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    const shown = finalTranscript || interim;
    if (shown) { txEl.textContent = shown; txEl.classList.add('active'); }
    ORB.listenAmp = 0.3 + Math.random() * 0.7;  };

  recognition.onend = () => {
    isListening = false;
    ORB.listenAmp = 0;
    btn.classList.remove('listening');

    const said = finalTranscript.trim();

    if (said) {
      // First try local command parse
      const handled = parseVoiceCommand(said);
      if (!handled) {
        // Send to AI
        txEl.textContent = said;
        sendToAI(said);
      }
    } else {
      txEl.textContent = 'Say something, Sir…';
      txEl.classList.remove('active');
      if (!isSpeaking && !isThinking) setOrbMode('idle');
    }
  };

  recognition.onerror = e => {
    isListening = false;
    ORB.listenAmp = 0;
    btn.classList.remove('listening');
    if (!isSpeaking && !isThinking) setOrbMode('idle');
    txEl.textContent = 'Mic error: ' + e.error;
    txEl.classList.remove('active');
    setTimeout(() => { txEl.textContent = 'Say something, Sir…'; }, 2500);
  };

  txEl.textContent = 'Listening…';
  txEl.classList.add('active');
  recognition.start();
}

function stopListening() {
  if (recognition) recognition.stop();
  isListening = false;
  ORB.listenAmp = 0;
  document.getElementById('mic-btn').classList.remove('listening');
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Say something, Sir…';
  txEl.classList.remove('active');
  if (!isSpeaking && !isThinking) setOrbMode('idle');
}

// ─────────────────────────────────────────────────────
//  AI — GROK API CALL
// ─────────────────────────────────────────────────────
async function sendToAI(text) {
  if (isThinking) return;
  if (!apiKey) {
    speak("Sir, I need an xAI API key to connect my neural core. Please enter it via the settings panel in the bottom left.");
    return;
  }

  messages.push({ role: 'user', content: text });
  isThinking = true;
  setOrbMode('thinking');
  const txEl = document.getElementById('transcript-text');

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages: [
          { role: 'system', content: PERSONALITIES[currentPersonality].prompt },
          ...messages
        ],
        temperature: 0.88,
        max_tokens: 700,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'API Error');

    const reply = data.choices?.[0]?.message?.content || 'My neural bridge returned an empty signal.';
    messages.push({ role: 'assistant', content: reply });

    // Show beginning of reply in transcript
    txEl.textContent = reply.length > 90 ? reply.slice(0, 90) + '…' : reply;
    txEl.classList.add('active');

    speak(reply);

  } catch (err) {
    const msg = err.message.includes('401')
      ? "Authentication failed, Sir. That API key is invalid."
      : err.message.includes('429')
      ? "Rate limited, Sir. Even Grok needs a moment."
      : `Connection error: ${err.message}`;
    speak(msg);
    txEl.textContent = msg;
  } finally {
    isThinking = false;
    // Fade transcript after 6 seconds
    setTimeout(() => {
      txEl.textContent = 'Say something, Sir…';
      txEl.classList.remove('active');
    }, 6000);
  }
}

// ─────────────────────────────────────────────────────
//  API KEY
// ─────────────────────────────────────────────────────
function saveApiKey() {
  const val = document.getElementById('api-input').value.trim();
  const st  = document.getElementById('api-status');
  if (!val) { st.textContent = '⚠ NO KEY'; st.style.color = '#ff3333'; return; }
  apiKey = val;
  st.textContent = '✓ CONNECTED';
  st.style.color = '#00ff88';
  document.getElementById('conn-status').textContent = 'ONLINE';
  document.getElementById('conn-status').classList.add('online');
  toggleApiPanel(); // close panel
  speak("API key accepted. Grok neural bridge is online, Sir. I'm ready.");
}

// ─────────────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────────────
function toggleApiPanel() {
  document.getElementById('api-body').classList.toggle('open');
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ─────────────────────────────────────────────────────
//  CLOCK
// ─────────────────────────────────────────────────────
function tickClock() {
  document.getElementById('time-display').textContent =
    new Date().toTimeString().slice(0, 8);
}
setInterval(tickClock, 1000);
tickClock();

// ─────────────────────────────────────────────────────
//  BOOT SEQUENCE
// ─────────────────────────────────────────────────────
const bootLines = ['bl1','bl2','bl3','bl4','bl5'];
let bootIdx = 0, bootPct = 0;

function runBoot() {
  const bar = document.getElementById('boot-bar');
  const pct = document.getElementById('boot-pct');

  const iv = setInterval(() => {
    bootPct += 1.8;
    bar.style.width  = Math.min(bootPct, 100) + '%';
    pct.textContent  = Math.min(Math.floor(bootPct), 100) + '%';

    if (bootPct % 20 < 1.9 && bootIdx < bootLines.length) {
      const el = document.getElementById(bootLines[bootIdx]);
      if (el) { el.style.opacity = '1'; el.classList.add('ok'); }
      bootIdx++;
    }

    if (bootPct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        const overlay = document.getElementById('boot-overlay');
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 900);
      }, 280);
    }
  }, 25);
}

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(drawSphere);
runBoot();

// Tap/click anywhere on the sphere area = toggle listen
canvas.addEventListener('click', () => {
  if (!isSpeaking) toggleListen();
});
