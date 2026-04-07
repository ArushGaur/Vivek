/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — GEMINI LIVE NEURAL INTERFACE
   app.js  —  Minimal Black. One Sphere. Full Voice.
═══════════════════════════════════════════════════════ */
'use strict';

// ─────────────────────────────────────────────────────
//  GLOBAL STATE
// ─────────────────────────────────────────────────────
let apiKey       = '';
let messages     = [];
let isThinking   = false;
let isListening  = false;
let isSpeaking   = false;
let isDormant    = true;   // true = waiting for wake word "Vivek"

// Gemini Live WebSocket
let liveWs       = null;
let sessionReady = false;
let nextPlayTime = 0;

// AudioContext for mic capture + playback
let audioCtx     = null;
let micStream    = null;
let scriptProc   = null;
let micSrcNode   = null;
let nativeSR     = 48000;

// Wake word detection (Web Speech API)
let wakeRec      = null;
let wakeRunning  = false;

// Fallback TTS for system messages only
let synth        = window.speechSynthesis;
let utterance    = null;
let speakIv      = null;

const SpeechRec  = window.SpeechRecognition || window.webkitSpeechRecognition;

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

let currentColorKey = 'cyan';
let liveColor  = { r:0, g:212, b:255 };
let targetColor = { r:0, g:212, b:255 };

function setColor(key) {
  if (!COLORS[key]) return;
  currentColorKey = key;
  const c = COLORS[key];
  targetColor = { r:c.r, g:c.g, b:c.b };
  showToast('ORB COLOR — ' + c.label);
}

// ─────────────────────────────────────────────────────
//  PERSONALITY SYSTEM  (Gemini voice names added)
// ─────────────────────────────────────────────────────
const PERSONALITIES = {
  vivek: {
    label: 'VIVEK',
    color: 'cyan',
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

// ─────────────────────────────────────────────────────
//  3D SPHERE — full-screen canvas
// ─────────────────────────────────────────────────────
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

const ORB = {
  cx: 0, cy: 0, R: 0,
  liveR: 0,
  targetScale: 1,
  liveScale: 1,
  particles: [],
  rotY: 0, rotX: 0.32,
  mode: 0,
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
  ORB.R  = Math.min(canvas.width, canvas.height) * 0.44;
  if (!ORB.liveR) ORB.liveR = ORB.R;
  buildParticles();
}

function buildParticles() {
  ORB.particles = [];
  const N = 700;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y   = 1 - (i / (N - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th  = golden * i;
    ORB.particles.push({
      ox: Math.cos(th) * rad, oy: y, oz: Math.sin(th) * rad,
      sx: 0, sy: 0, sz: 0, depth: 0, scale: 0,
      size:  1.4 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.1,
      driftR: 0.018 + Math.random() * 0.065,
    });
  }
}

function project(p) {
  const cosX = Math.cos(ORB.rotX), sinX = Math.sin(ORB.rotX);
  const cosY = Math.cos(ORB.rotY), sinY = Math.sin(ORB.rotY);
  const drift   = Math.sin(ORB.phase * p.speed + p.phase) * p.driftR * ORB.energy * 0.4;
  const breathe = Math.sin(ORB.breathe + p.phase * 0.5) * 0.012;
  const scale3  = 1 + drift + breathe;
  const nx = p.ox * scale3, ny = p.oy * scale3, nz = p.oz * scale3;
  const x1 = nx * cosY - nz * sinY;
  const z1 = nx * sinY + nz * cosY;
  const y2 = ny * cosX - z1 * sinX;
  const z2 = ny * sinX + z1 * cosX;
  p.sz = z2;
  const fov    = 4.2;
  const pscale = fov / (fov + z2);
  p.sx    = ORB.cx + x1 * ORB.liveR * pscale;
  p.sy    = ORB.cy + y2 * ORB.liveR * pscale;
  p.scale = pscale;
  p.depth = (z2 + 1) / 2;
}

function drawSphere(ts) {
  ORB.phase   = ts * 0.001;
  ORB.breathe = ts * 0.00055;

  liveColor.r += (targetColor.r - liveColor.r) * 0.04;
  liveColor.g += (targetColor.g - liveColor.g) * 0.04;
  liveColor.b += (targetColor.b - liveColor.b) * 0.04;
  const rc = Math.round(liveColor.r), gc = Math.round(liveColor.g), bc = Math.round(liveColor.b);

  let scaleTarget = 1.0;
  if      (ORB.mode === 3) scaleTarget = 1.0 + ORB.listenAmp * 0.18 + Math.sin(ORB.phase * 10) * 0.03;
  else if (ORB.mode === 2) scaleTarget = 1.0 + ORB.speakAmp  * 0.22 + Math.sin(ORB.phase *  8) * 0.025;
  else if (ORB.mode === 1) scaleTarget = 1.0 + Math.sin(ORB.phase * 3) * 0.04;
  else                     scaleTarget = 1.0 + Math.sin(ORB.breathe * 0.9) * 0.015;

  ORB.liveScale += (scaleTarget - ORB.liveScale) * (scaleTarget > ORB.liveScale ? 0.12 : 0.06);
  ORB.liveR = ORB.R * ORB.liveScale;

  let eTarget = 0;
  if (ORB.mode === 0) eTarget = 0.12;
  if (ORB.mode === 1) eTarget = 0.3  + Math.abs(Math.sin(ORB.phase * 4)) * 0.25;
  if (ORB.mode === 2) eTarget = 0.4  + ORB.speakAmp * 0.55;
  if (ORB.mode === 3) eTarget = 0.35 + ORB.listenAmp * 0.45;
  ORB.energy += (eTarget - ORB.energy) * 0.07;

  const rotSpeed = ORB.mode === 2 ? 0.006 : ORB.mode === 3 ? 0.005 : ORB.mode === 1 ? 0.003 : 0.0012;
  ORB.rotY += rotSpeed;

  ORB.particles.forEach(project);
  ORB.particles.sort((a, b) => a.sz - b.sz);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const fogR = ORB.liveR * 1.5;
  const fog  = ctx.createRadialGradient(ORB.cx, ORB.cy, ORB.liveR * 0.3, ORB.cx, ORB.cy, fogR);
  fog.addColorStop(0, 'rgba(' + rc + ',' + gc + ',' + bc + ',0.06)');
  fog.addColorStop(1, 'rgba(' + rc + ',' + gc + ',' + bc + ',0)');
  ctx.fillStyle = fog;
  ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, fogR, 0, Math.PI * 2); ctx.fill();

  ORB.particles.forEach(p => {
    const depthAlpha = 0.2 + p.depth * 0.8;
    const dotSize    = Math.max(0.5, (p.size * 0.85 + ORB.energy * 0.5) * p.scale);
    if (p.depth > 0.4) {
      const glR = dotSize * 3.5;
      const glA = (depthAlpha * 0.14).toFixed(3);
      const gl  = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glR);
      gl.addColorStop(0, 'rgba(' + rc + ',' + gc + ',' + bc + ',' + glA + ')');
      gl.addColorStop(1, 'rgba(' + rc + ',' + gc + ',' + bc + ',0)');
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(p.sx, p.sy, glR, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(' + rc + ',' + gc + ',' + bc + ')';
    ctx.globalAlpha = depthAlpha * (0.7 + ORB.energy * 0.3);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  ctx.beginPath();
  ctx.arc(ORB.cx, ORB.cy, ORB.liveR * 1.01, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(' + rc + ',' + gc + ',' + bc + ',0.12)';
  ctx.lineWidth = 0.8; ctx.stroke();

  if (ORB.mode === 3) {
    const r2 = ORB.liveR * (1.06 + Math.sin(ORB.phase * 9) * 0.015);
    ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, r2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + rc + ',' + gc + ',' + bc + ',0.14)';
    ctx.lineWidth = 0.8; ctx.stroke();
  }
  if (ORB.mode === 2) {
    for (let i = 1; i <= 2; i++) {
      const rw = ORB.liveR * (1.05 * i + Math.sin(ORB.phase * 7 * i) * 0.012);
      ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, rw, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(' + rc + ',' + gc + ',' + bc + ',' + (0.12 / i).toFixed(3) + ')';
      ctx.lineWidth = 0.7; ctx.stroke();
    }
  }

  const coreR = 12 + ORB.energy * 10;
  const core  = ctx.createRadialGradient(ORB.cx, ORB.cy, 0, ORB.cx, ORB.cy, coreR);
  core.addColorStop(0,   'rgba(255,255,255,0.95)');
  core.addColorStop(0.3, 'rgba(' + rc + ',' + gc + ',' + bc + ',0.8)');
  core.addColorStop(1,   'rgba(' + rc + ',' + gc + ',' + bc + ',0)');
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(ORB.cx, ORB.cy, coreR, 0, Math.PI * 2); ctx.fill();

  requestAnimationFrame(drawSphere);
}

function setOrbMode(mode) {
  const map = { idle:0, thinking:1, speaking:2, listening:3 };
  ORB.mode = map[mode] !== undefined ? map[mode] : 0;
  document.body.className = 'orb-' + mode;
  const labels = { idle:'IDLE', thinking:'PROCESSING…', speaking:'SPEAKING', listening:'LISTENING' };
  document.getElementById('state-label').textContent = labels[mode] || 'IDLE';
}

// ─────────────────────────────────────────────────────
//  SYSTEM SPEECH  (Web Speech API for local messages only)
// ─────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────
//  AUDIO UTILITIES
// ─────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────
//  AUDIO CONTEXT
// ─────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────
//  GEMINI LIVE SESSION
// ─────────────────────────────────────────────────────
function startGeminiSession(initialText) {
  if (!apiKey) {
    speakSystem("I need a Gemini API key. Please enter it in the settings panel.");
    return;
  }
  if (liveWs && liveWs.readyState === WebSocket.OPEN) liveWs.close();

  stopWakeDetection();
  isDormant    = false;
  sessionReady = false;
  isListening  = true;
  isThinking   = false;
  isSpeaking   = false;
  nextPlayTime = 0;

  const p    = PERSONALITIES[currentPersonality];
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Connecting to Gemini Live…';
  txEl.classList.add('active');
  setOrbMode('thinking');

  const url = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.BidiGenerateContent?key=' + apiKey;
  liveWs = new WebSocket(url);

  liveWs.onopen = () => {
    liveWs.send(JSON.stringify({
      setup: {
        model: 'models/gemini-2.0-flash-live-001',
        generationConfig: {
          responseModalities: ['AUDIO', 'TEXT'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: p.geminiVoice || 'Charon' }
            }
          }
        },
        systemInstruction: { parts: [{ text: p.prompt }] }
      }
    }));
  };

  liveWs.onmessage = async (event) => {
    let data;
    try {
      const raw = (event.data instanceof Blob) ? await event.data.text() : event.data;
      data = JSON.parse(raw);
    } catch(e) { return; }

    // Setup complete → start mic (or send initial text if wake word had a query)
    if (data.setupComplete !== undefined) {
      sessionReady = true;
      setOrbMode('listening');
      txEl.textContent = 'Listening…';
      txEl.classList.add('active');
      if (initialText) {
        sendTextTurn(initialText);
      } else {
        startMicCapture();
      }
      return;
    }

    // Server content (audio + text chunks from Gemini)
    if (data.serverContent) {
      const sc = data.serverContent;

      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.indexOf('audio') !== -1) {
            if (!isSpeaking) {
              isSpeaking = true;
              stopMicCapture();
              setOrbMode('speaking');
              document.getElementById('stop-btn').style.display = 'block';
              pulseSpeaking();
            }
            playGeminiChunk(part.inlineData.data);
          }
          if (part.text) {
            const t = part.text;
            txEl.textContent = t.length > 120 ? t.slice(0, 120) + '…' : t;
            txEl.classList.add('active');
          }
        }
      }

      // Turn complete — wait for audio to finish, then go back to wake word
      if (sc.turnComplete) {
        isThinking = false;
        const remaining = audioCtx ? Math.max(0, nextPlayTime - audioCtx.currentTime) : 0;
        setTimeout(function() {
          isSpeaking = false;
          ORB.speakAmp = 0;
          if (speakIv) clearInterval(speakIv);
          document.getElementById('stop-btn').style.display = 'none';
          closeLiveSession();
          txEl.textContent = 'Say "Vivek" to activate…';
          txEl.classList.remove('active');
          setOrbMode('idle');
          startWakeDetection();
        }, remaining * 1000 + 500);
      }
    }

    if (data.error) {
      const msg = (data.error.message) || 'Neural bridge error.';
      txEl.textContent = msg;
      txEl.classList.add('active');
      speakSystem(msg);
      closeLiveSession();
      setTimeout(startWakeDetection, 2000);
    }
  };

  liveWs.onerror = function() {
    speakSystem("Connection error. Neural bridge disrupted.");
    closeLiveSession();
    setOrbMode('idle');
    setTimeout(startWakeDetection, 2000);
  };

  liveWs.onclose = function() {
    sessionReady = false;
    stopMicCapture();
  };
}

function sendTextTurn(text) {
  if (!liveWs || liveWs.readyState !== WebSocket.OPEN) return;
  liveWs.send(JSON.stringify({
    clientContent: {
      turns: [{ role: 'user', parts: [{ text: text }] }],
      turnComplete: true
    }
  }));
  setOrbMode('thinking');
  isThinking  = true;
  isListening = false;
  const txEl = document.getElementById('transcript-text');
  txEl.textContent = text.length > 90 ? text.slice(0, 90) + '…' : text;
}

function closeLiveSession() {
  stopMicCapture();
  if (liveWs) {
    try { liveWs.close(); } catch(e) {}
    liveWs = null;
  }
  sessionReady = false;
  isListening  = false;
  isSpeaking   = false;
  isThinking   = false;
  isDormant    = true;
}

// ─────────────────────────────────────────────────────
//  MIC CAPTURE  →  Gemini Live streaming
// ─────────────────────────────────────────────────────
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
      // Update orb amplitude from mic level
      var rms = 0;
      for (var i = 0; i < raw.length; i++) rms += raw[i] * raw[i];
      ORB.listenAmp = Math.min(1, Math.sqrt(rms / raw.length) * 10);
    };

    micSrcNode.connect(scriptProc);
    scriptProc.connect(audioCtx.destination);

    setOrbMode('listening');
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = 'Listening…';
    txEl.classList.add('active');

  } catch(err) {
    const txEl = document.getElementById('transcript-text');
    txEl.textContent = (err.name === 'NotAllowedError')
      ? 'Microphone access denied. Please allow mic in browser settings.'
      : 'Mic error: ' + err.message;
    txEl.classList.add('active');
    closeLiveSession();
    setTimeout(startWakeDetection, 2000);
  }
}

function stopMicCapture() {
  if (scriptProc)  { try { scriptProc.disconnect();  } catch(e) {} scriptProc  = null; }
  if (micSrcNode)  { try { micSrcNode.disconnect();  } catch(e) {} micSrcNode  = null; }
  if (micStream)   { micStream.getTracks().forEach(function(t){ t.stop(); }); micStream = null; }
  ORB.listenAmp = 0;
}

// ─────────────────────────────────────────────────────
//  WAKE WORD  —  always listening for "Vivek"
// ─────────────────────────────────────────────────────
function startWakeDetection() {
  if (!apiKey)     return;
  if (!SpeechRec)  return;
  if (wakeRunning) return;
  if (!isDormant)  return;

  const txEl = document.getElementById('transcript-text');
  txEl.textContent = 'Say "Vivek" to activate…';
  txEl.classList.remove('active');
  setOrbMode('idle');

  wakeRec = new SpeechRec();
  wakeRec.continuous     = true;
  wakeRec.interimResults = true;
  wakeRec.lang           = 'en-US';
  wakeRunning            = true;

  wakeRec.onresult = function(e) {
    for (var i = e.resultIndex; i < e.results.length; i++) {
      var t = e.results[i][0].transcript.toLowerCase().trim();
      if (t.indexOf('vivek') !== -1) {
        stopWakeDetection();
        showToast('WAKE WORD DETECTED');
        txEl.textContent = 'Connecting to Gemini…';
        txEl.classList.add('active');
        // Grab anything said after "vivek" as an initial query
        var parts    = t.split('vivek');
        var trailing = parts.slice(1).join('').replace(/[.,!?]/g, '').trim();
        startGeminiSession(trailing || null);
        return;
      }
    }
  };

  wakeRec.onend = function() {
    wakeRunning = false;
    if (isDormant && apiKey) setTimeout(startWakeDetection, 400);
  };

  wakeRec.onerror = function(e) {
    wakeRunning = false;
    if (e.error === 'not-allowed') {
      document.getElementById('transcript-text').textContent = 'Microphone access denied.';
      return;
    }
    if (isDormant && apiKey) setTimeout(startWakeDetection, 1000);
  };

  try { wakeRec.start(); } catch(e) { wakeRunning = false; }
}

function stopWakeDetection() {
  wakeRunning = false;
  if (wakeRec) { try { wakeRec.stop(); } catch(e) {} wakeRec = null; }
}

// ─────────────────────────────────────────────────────
//  STOP ALL
// ─────────────────────────────────────────────────────
function stopAll() {
  closeLiveSession();
  if (synth) synth.cancel();
  isSpeaking = false;
  ORB.speakAmp = 0;
  if (speakIv) clearInterval(speakIv);
  document.getElementById('stop-btn').style.display = 'none';
  if (audioCtx) nextPlayTime = audioCtx.currentTime;
  setOrbMode('idle');
  setTimeout(startWakeDetection, 600);
}

function stopSpeaking() { stopAll(); }  // HTML onclick alias

function pulseSpeaking() {
  if (speakIv) clearInterval(speakIv);
  speakIv = setInterval(function() {
    if (!isSpeaking) { clearInterval(speakIv); ORB.speakAmp = 0; return; }
    ORB.speakAmp = 0.2 + Math.random() * 0.8;
  }, 90);
}

// ─────────────────────────────────────────────────────
//  API KEY
// ─────────────────────────────────────────────────────
function saveApiKey() {
  var val = document.getElementById('api-input').value.trim();
  var st  = document.getElementById('api-status');
  if (!val) { st.textContent = '⚠ NO KEY'; st.style.color = '#ff3333'; return; }
  apiKey = val;
  st.textContent = '✓ CONNECTED';
  st.style.color = '#00ff88';
  toggleApiPanel();
  speakSystem("Gemini API key accepted. Neural bridge is online. Say Vivek to activate.");
  setTimeout(startWakeDetection, 1800);
}

function toggleApiPanel() {
  document.getElementById('api-body').classList.toggle('open');
}

var toastTimer = null;
function showToast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2600);
}

// ─────────────────────────────────────────────────────
//  BOOT SEQUENCE
// ─────────────────────────────────────────────────────
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
        setTimeout(function() {
          overlay.style.display = 'none';
          var txEl = document.getElementById('transcript-text');
          txEl.textContent = apiKey ? 'Say "Vivek" to activate…' : 'Enter your Gemini API key to begin.';
          txEl.classList.add('active');
          if (apiKey) startWakeDetection();
        }, 900);
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

// Click sphere: unlock audio ctx + toggle session
canvas.addEventListener('click', function() {
  ensureAudioCtx();  // Required to unlock AudioContext after user gesture
  if (isSpeaking || isListening || isThinking) {
    stopAll();
  } else if (isDormant && apiKey) {
    startGeminiSession(null);
  } else if (!apiKey) {
    toggleApiPanel();
  }
});
