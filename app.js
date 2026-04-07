/* ═══════════════════════════════════════════════════
   J.A.R.V.I.S — GROK NEURAL INTERFACE
   app.js — All Logic, Animation & AI Integration
═══════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────
let apiKey       = '';
let messages     = [];
let msgCount     = 0;
let isThinking   = false;
let isListening  = false;
let isSpeaking   = false;
let recognition  = null;
let synth        = window.speechSynthesis;
let currentUtter = null;
let orbState     = 'idle'; // idle | thinking | speaking | listening

// ─────────────────────────────────────────────────────
//  BOOT SEQUENCE
// ─────────────────────────────────────────────────────
const bootLineIds = ['bl1','bl2','bl3','bl4','bl5','bl6'];
let bootIdx = 0, bootPct = 0;

function runBoot() {
  const bar = document.getElementById('boot-bar');
  const pct = document.getElementById('boot-pct');

  const iv = setInterval(() => {
    bootPct += 1.6;
    bar.style.width = Math.min(bootPct, 100) + '%';
    pct.textContent  = Math.min(Math.floor(bootPct), 100) + '%';

    if (bootPct % 16 < 1.7 && bootIdx < bootLineIds.length) {
      const el = document.getElementById(bootLineIds[bootIdx]);
      if (el) { el.style.opacity = '1'; el.classList.add('ok'); }
      bootIdx++;
    }

    if (bootPct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        const overlay = document.getElementById('boot-overlay');
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.style.display = 'none';
          document.getElementById('app').style.opacity = '1';
          typeWelcome();
          updateDateTime();
          setInterval(updateDateTime, 1000);
          startFakeStats();
        }, 800);
      }, 300);
    }
  }, 28);
}

// ─────────────────────────────────────────────────────
//  DATE / TIME
// ─────────────────────────────────────────────────────
function updateDateTime() {
  const now  = new Date();
  document.getElementById('time-display').textContent = now.toTimeString().slice(0,8);
  document.getElementById('date-display').textContent =
    String(now.getDate()).padStart(2,'0') + '/' +
    String(now.getMonth()+1).padStart(2,'0') + '/' + now.getFullYear();
}

// ─────────────────────────────────────────────────────
//  FAKE SYSTEM STATS
// ─────────────────────────────────────────────────────
function startFakeStats() {
  setInterval(() => {
    const cpu = 74 + Math.floor(Math.random()*22);
    const mem = 63 + Math.floor(Math.random()*24);
    document.getElementById('cpu-val').textContent = cpu + '%';
    document.getElementById('cpu-bar').style.width = cpu + '%';
    document.getElementById('mem-val').textContent = mem + '%';
    document.getElementById('mem-bar').style.width = mem + '%';
  }, 2800);
}

// ─────────────────────────────────────────────────────
//  HUD BACKGROUND CANVAS
// ─────────────────────────────────────────────────────
const hudCanvas = document.getElementById('hud-canvas');
const hCtx      = hudCanvas.getContext('2d');
let hudParticles = [], hudRings = [];

function initHud() {
  hudCanvas.width  = window.innerWidth;
  hudCanvas.height = window.innerHeight;
  const W = hudCanvas.width, H = hudCanvas.height;

  hudParticles = Array.from({length: 55}, () => ({
    x: Math.random()*W, y: Math.random()*H,
    vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3,
    r: Math.random()*1.4+0.4, a: Math.random()
  }));

  hudRings = [
    { x:W*0.15, y:H*0.25, r:70, sp:0.0018, ph:0 },
    { x:W*0.85, y:H*0.75, r:55, sp:0.0025, ph:1.5 },
    { x:W*0.5,  y:H*0.5,  r:100, sp:0.001, ph:3 },
    { x:W*0.75, y:H*0.2,  r:40, sp:0.003, ph:0.8 },
  ];
}

function drawHud(ts) {
  const W = hudCanvas.width, H = hudCanvas.height;
  hCtx.clearRect(0,0,W,H);

  // Grid
  hCtx.strokeStyle = 'rgba(0,212,255,0.04)';
  hCtx.lineWidth = 1;
  for (let x=0; x<W; x+=60) { hCtx.beginPath(); hCtx.moveTo(x,0); hCtx.lineTo(x,H); hCtx.stroke(); }
  for (let y=0; y<H; y+=60) { hCtx.beginPath(); hCtx.moveTo(0,y); hCtx.lineTo(W,y); hCtx.stroke(); }

  // Rings
  hudRings.forEach(rg => {
    rg.ph += rg.sp;
    for (let i=0; i<3; i++) {
      hCtx.beginPath();
      hCtx.arc(rg.x, rg.y, rg.r + i*14, rg.ph, rg.ph + Math.PI*1.5);
      hCtx.strokeStyle = `rgba(0,212,255,${0.13 - i*0.04})`;
      hCtx.lineWidth = 1; hCtx.stroke();
    }
    hCtx.beginPath();
    hCtx.arc(rg.x, rg.y, 2.5, 0, Math.PI*2);
    hCtx.fillStyle = 'rgba(0,212,255,0.35)'; hCtx.fill();
  });

  // Particles
  hudParticles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    if (p.x<0||p.x>W) p.vx*=-1;
    if (p.y<0||p.y>H) p.vy*=-1;
    p.a = 0.25 + 0.75*Math.abs(Math.sin(ts*0.0008 + p.x*0.01));
    hCtx.beginPath();
    hCtx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    hCtx.fillStyle = `rgba(0,212,255,${p.a*0.5})`; hCtx.fill();
  });

  // Connections
  for (let i=0; i<hudParticles.length; i++) {
    for (let j=i+1; j<hudParticles.length; j++) {
      const dx = hudParticles[i].x - hudParticles[j].x;
      const dy = hudParticles[i].y - hudParticles[j].y;
      const d  = Math.sqrt(dx*dx+dy*dy);
      if (d < 90) {
        hCtx.beginPath();
        hCtx.moveTo(hudParticles[i].x, hudParticles[i].y);
        hCtx.lineTo(hudParticles[j].x, hudParticles[j].y);
        hCtx.strokeStyle = `rgba(0,212,255,${(1-d/90)*0.07})`;
        hCtx.lineWidth = 0.5; hCtx.stroke();
      }
    }
  }
  requestAnimationFrame(drawHud);
}

initHud();
window.addEventListener('resize', initHud);
requestAnimationFrame(drawHud);

// ─────────────────────────────────────────────────────
//  3D SPHERICAL PARTICLE ORB
// ─────────────────────────────────────────────────────
const orbCanvas = document.getElementById('orb-canvas');
const oCtx      = orbCanvas.getContext('2d');

const ORB = {
  W: 0, H: 0, cx: 0, cy: 0, R: 75,
  particles: [],
  rotX: 0, rotY: 0,
  targetRotX: 0.3, targetRotY: 0,
  // 0=idle, 1=thinking, 2=speaking, 3=listening
  mode: 0,
  // per-mode energy: how much particles explode/pulse
  energy: 0,
  targetEnergy: 0,
  // speaking amplitude from actual speech
  speakAmp: 0,
  listenAmp: 0,
  phase: 0,
};

const ORB_COLORS = {
  idle:      { core:'#00d4ff', glow:'rgba(0,212,255,', trail:'rgba(0,180,220,' },
  thinking:  { core:'#ffc107', glow:'rgba(255,193,7,',  trail:'rgba(220,160,0,' },
  speaking:  { core:'#00ff88', glow:'rgba(0,255,136,',  trail:'rgba(0,200,100,' },
  listening: { core:'#ff6b35', glow:'rgba(255,107,53,', trail:'rgba(220,80,30,' },
};

function getModeKey() {
  return ['idle','thinking','speaking','listening'][ORB.mode];
}

function initOrb() {
  const dpr = window.devicePixelRatio || 1;
  const size = 170;
  orbCanvas.width  = size * dpr;
  orbCanvas.height = size * dpr;
  orbCanvas.style.width  = size + 'px';
  orbCanvas.style.height = size + 'px';
  oCtx.scale(dpr, dpr);
  ORB.W = size; ORB.H = size;
  ORB.cx = size/2; ORB.cy = size/2;
  ORB.R  = size * 0.42;

  // Create sphere particles using Fibonacci spiral
  ORB.particles = [];
  const N = 320;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i=0; i<N; i++) {
    const y   = 1 - (i/(N-1))*2;
    const rad = Math.sqrt(1 - y*y);
    const th  = golden * i;
    const x   = Math.cos(th)*rad;
    const z   = Math.sin(th)*rad;
    ORB.particles.push({
      ox:x, oy:y, oz:z,  // original position on unit sphere
      x:0, y:0, z:0,     // projected
      sx:0, sy:0,        // screen
      size: 1.2 + Math.random()*1.2,
      phase: Math.random()*Math.PI*2,
      speed: 0.6 + Math.random()*0.8,
      driftR: 0.02 + Math.random()*0.06, // how far it can drift from sphere surface
      drift: 0,
    });
  }
}

function projectParticle(p) {
  // Apply rotation
  const cosX = Math.cos(ORB.rotX), sinX = Math.sin(ORB.rotX);
  const cosY = Math.cos(ORB.rotY), sinY = Math.sin(ORB.rotY);

  let {ox, oy, oz} = p;

  // Compute drift offset based on mode & energy
  const dr   = p.driftR * ORB.energy;
  const dOff = Math.sin(ORB.phase * p.speed + p.phase) * dr;
  const nx = ox * (1 + dOff);
  const ny = oy * (1 + dOff);
  const nz = oz * (1 + dOff);

  // Rotate Y
  const x1 = nx*cosY - nz*sinY;
  const z1 = nx*sinY + nz*cosY;

  // Rotate X
  const y2 = ny*cosX - z1*sinX;
  const z2 = ny*sinX + z1*cosX;

  p.x = x1; p.y = y2; p.z = z2;

  // Simple perspective
  const fov = 3.5;
  const scale = fov / (fov + p.z);
  p.sx = ORB.cx + x1 * ORB.R * scale;
  p.sy = ORB.cy + y2 * ORB.R * scale;
  p.scale = scale;
  p.depth  = (p.z + 1) / 2; // 0=back, 1=front
}

function drawOrb(ts) {
  ORB.phase = ts * 0.001;
  const mKey = getModeKey();
  const col  = ORB_COLORS[mKey];

  // Smooth rotation
  ORB.rotX += (ORB.targetRotX - ORB.rotX) * 0.03;
  ORB.rotY += 0.006 + (ORB.mode === 2 ? 0.012 : 0) + (ORB.mode === 3 ? 0.008 : 0);

  // Smooth energy transition
  ORB.energy += (ORB.targetEnergy - ORB.energy) * 0.05;

  // Pulse on speaking/listening
  let amp = 0;
  if (ORB.mode === 2) amp = ORB.speakAmp * 3.5 + Math.sin(ORB.phase * 8) * 0.3 + 0.5;
  if (ORB.mode === 3) amp = ORB.listenAmp * 3.0 + Math.sin(ORB.phase * 12) * 0.4 + 0.3;
  if (ORB.mode === 1) amp = Math.sin(ORB.phase * 4) * 0.4 + 0.2;
  ORB.targetEnergy = amp;

  // Sort by depth (painter's algorithm)
  ORB.particles.forEach(p => projectParticle(p));
  ORB.particles.sort((a,b) => a.z - b.z);

  // Clear
  oCtx.clearRect(0,0, ORB.W, ORB.H);

  // Draw core glow (background)
  const coreR = ORB.R * (0.35 + ORB.energy * 0.15);
  const cg = oCtx.createRadialGradient(ORB.cx, ORB.cy, 0, ORB.cx, ORB.cy, coreR);
  cg.addColorStop(0,   col.glow + '0.18)');
  cg.addColorStop(0.5, col.glow + '0.08)');
  cg.addColorStop(1,   col.glow + '0)');
  oCtx.fillStyle = cg;
  oCtx.beginPath();
  oCtx.arc(ORB.cx, ORB.cy, coreR, 0, Math.PI*2);
  oCtx.fill();

  // Draw particles
  ORB.particles.forEach(p => {
    const alpha = 0.15 + p.depth * 0.85;
    const sz    = (p.size + ORB.energy * 0.8) * p.scale;
    if (sz < 0.3) return;

    // Glow
    if (p.depth > 0.5) {
      const glowR = sz * (2 + ORB.energy * 1.5);
      const pg = oCtx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, glowR);
      pg.addColorStop(0,   col.glow + (alpha * 0.4).toFixed(2) + ')');
      pg.addColorStop(1,   col.glow + '0)');
      oCtx.fillStyle = pg;
      oCtx.beginPath();
      oCtx.arc(p.sx, p.sy, glowR, 0, Math.PI*2);
      oCtx.fill();
    }

    // Dot
    oCtx.beginPath();
    oCtx.arc(p.sx, p.sy, Math.max(0.3, sz * 0.55), 0, Math.PI*2);
    oCtx.fillStyle = col.core;
    oCtx.globalAlpha = alpha * (0.5 + ORB.energy * 0.5);
    oCtx.fill();
    oCtx.globalAlpha = 1;
  });

  // Outer ring pulse on speaking
  if (ORB.mode === 2 || ORB.mode === 3 || ORB.mode === 1) {
    const pulseR = ORB.R * (1.05 + Math.sin(ORB.phase * (ORB.mode===2?10:7)) * 0.06 * ORB.energy);
    oCtx.beginPath();
    oCtx.arc(ORB.cx, ORB.cy, pulseR, 0, Math.PI*2);
    oCtx.strokeStyle = col.core;
    oCtx.globalAlpha = 0.12 + ORB.energy * 0.2;
    oCtx.lineWidth = 1;
    oCtx.stroke();
    oCtx.globalAlpha = 1;
  }

  // Center bright core dot
  const cdg = oCtx.createRadialGradient(ORB.cx, ORB.cy, 0, ORB.cx, ORB.cy, 12 + ORB.energy*8);
  cdg.addColorStop(0,   '#ffffff');
  cdg.addColorStop(0.3, col.core);
  cdg.addColorStop(1,   col.glow + '0)');
  oCtx.fillStyle = cdg;
  oCtx.beginPath();
  oCtx.arc(ORB.cx, ORB.cy, 12 + ORB.energy*8, 0, Math.PI*2);
  oCtx.fill();

  requestAnimationFrame(drawOrb);
}

function setOrbMode(mode) {
  // mode: 'idle'|'thinking'|'speaking'|'listening'
  const modeMap = { idle:0, thinking:1, speaking:2, listening:3 };
  ORB.mode = modeMap[mode] ?? 0;
  orbState  = mode;

  // CSS state classes
  document.body.className = 'orb-' + mode;

  // Label
  const labels = { idle:'IDLE', thinking:'PROCESSING', speaking:'SPEAKING', listening:'LISTENING' };
  document.getElementById('orb-state-label').textContent = labels[mode];

  // Voice indicator dot
  const dot  = document.querySelector('.vi-dot');
  const text = document.getElementById('voice-indicator-text');
  dot.className = 'vi-dot';
  if (mode === 'speaking')  { dot.classList.add('active-speak'); text.textContent = 'AI SPEAKING'; }
  else if (mode === 'listening') { dot.classList.add('active-listen'); text.textContent = 'LISTENING...'; }
  else if (mode === 'thinking')  { dot.classList.add('active-think'); text.textContent = 'PROCESSING...'; }
  else { text.textContent = 'VOICE READY'; }
}

// ─────────────────────────────────────────────────────
//  RADIAL CHART
// ─────────────────────────────────────────────────────
const rcCanvas = document.getElementById('radial-canvas');
const rcCtx    = rcCanvas.getContext('2d');

const segments = [
  { label:'LOGIC', val:0.92, color:'#00d4ff' },
  { label:'INTEL', val:0.88, color:'#00aaff' },
  { label:'SPEED', val:0.95, color:'#00ffcc' },
  { label:'HUMOR', val:0.78, color:'#ffc107' },
  { label:'WIT',   val:0.85, color:'#ff6b35' },
];

let rcPhase = 0;
function drawRadial() {
  const W=rcCanvas.width, H=rcCanvas.height, cx=W/2, cy=H/2, maxR=62;
  rcCtx.clearRect(0,0,W,H);

  for (let r=15; r<=maxR; r+=15) {
    rcCtx.beginPath(); rcCtx.arc(cx,cy,r,0,Math.PI*2);
    rcCtx.strokeStyle='rgba(0,212,255,0.09)'; rcCtx.lineWidth=0.5; rcCtx.stroke();
  }

  const step = (Math.PI*2)/segments.length;
  const pts  = segments.map((s,i) => {
    const angle  = i*step - Math.PI/2;
    const pulsed = s.val*(0.92 + 0.08*Math.sin(rcPhase + i*0.7));
    return { x: cx + Math.cos(angle)*maxR*pulsed, y: cy + Math.sin(angle)*maxR*pulsed, color: s.color };
  });

  rcCtx.beginPath();
  pts.forEach((p,i) => i===0 ? rcCtx.moveTo(p.x,p.y) : rcCtx.lineTo(p.x,p.y));
  rcCtx.closePath();
  rcCtx.fillStyle   = 'rgba(0,212,255,0.07)'; rcCtx.fill();
  rcCtx.strokeStyle = 'rgba(0,212,255,0.45)'; rcCtx.lineWidth=1.5; rcCtx.stroke();

  pts.forEach(p => {
    rcCtx.beginPath(); rcCtx.arc(p.x,p.y,3,0,Math.PI*2);
    rcCtx.fillStyle=p.color; rcCtx.fill();
  });

  segments.forEach((s,i) => {
    const angle = i*step - Math.PI/2;
    const lx = cx + Math.cos(angle)*(maxR+17);
    const ly = cy + Math.sin(angle)*(maxR+17);
    rcCtx.fillStyle='rgba(0,212,255,0.45)';
    rcCtx.font='7px Share Tech Mono';
    rcCtx.textAlign='center'; rcCtx.textBaseline='middle';
    rcCtx.fillText(s.label, lx, ly);
  });

  rcPhase += 0.018;
  requestAnimationFrame(drawRadial);
}

// ─────────────────────────────────────────────────────
//  VOICE — SPEECH SYNTHESIS (SPEAKING)
// ─────────────────────────────────────────────────────
function speak(text) {
  if (!synth) return;
  stopSpeaking();

  // Strip markdown-like symbols for cleaner TTS
  const clean = text.replace(/[*#`_~]/g, '').replace(/\n+/g, ' ').trim();

  currentUtter = new SpeechSynthesisUtterance(clean);
  currentUtter.rate   = 0.92;
  currentUtter.pitch  = 0.88;
  currentUtter.volume = 1;

  // Try to pick a good voice
  const voices = synth.getVoices();
  const preferred = voices.find(v =>
    v.name.includes('Google') && v.lang.startsWith('en')
  ) || voices.find(v => v.lang.startsWith('en')) || null;
  if (preferred) currentUtter.voice = preferred;

  currentUtter.onstart = () => {
    isSpeaking = true;
    setOrbMode('speaking');
    document.getElementById('stop-speak-btn').style.display = 'flex';
    pulseOrbFromSpeech();
  };

  currentUtter.onend = currentUtter.onerror = () => {
    isSpeaking = false;
    if (!isListening) setOrbMode('idle');
    document.getElementById('stop-speak-btn').style.display = 'none';
  };

  synth.speak(currentUtter);
}

function stopSpeaking() {
  if (synth) synth.cancel();
  isSpeaking = false;
  document.getElementById('stop-speak-btn').style.display = 'none';
  if (!isListening && !isThinking) setOrbMode('idle');
}

// Simulate amplitude from speech using a simple oscillation
let speakPulseIv = null;
function pulseOrbFromSpeech() {
  if (speakPulseIv) clearInterval(speakPulseIv);
  speakPulseIv = setInterval(() => {
    if (!isSpeaking) { clearInterval(speakPulseIv); ORB.speakAmp = 0; return; }
    // Simulate voice amplitude
    ORB.speakAmp = 0.3 + Math.random()*0.7;
  }, 80);
}

// ─────────────────────────────────────────────────────
//  VOICE — SPEECH RECOGNITION (LISTENING)
// ─────────────────────────────────────────────────────
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function toggleListen() {
  if (isListening) { stopListening(); return; }
  if (!SpeechRec) {
    logMission('ERROR: Speech recognition not supported.');
    addMessage('jarvis', "I'm afraid your browser doesn't support speech recognition, Sir. Try Chrome or Edge.");
    return;
  }
  startListening();
}

function startListening() {
  if (isSpeaking) stopSpeaking();
  isListening = true;
  setOrbMode('listening');

  document.getElementById('listen-btn').classList.add('active');
  document.getElementById('listen-btn').innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" opacity="0.5"/>
      <circle cx="12" cy="12" r="4"/>
    </svg> LISTENING`;

  recognition = new SpeechRec();
  recognition.continuous     = false;
  recognition.interimResults = true;
  recognition.lang           = 'en-US';

  let finalTranscript = '';

  recognition.onresult = (e) => {
    finalTranscript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
    }
    // Show interim
    document.getElementById('chat-input').value = finalTranscript ||
      Array.from(e.results).map(r => r[0].transcript).join('');
    // Simulate listen amplitude
    ORB.listenAmp = 0.4 + Math.random()*0.6;
  };

  recognition.onend = () => {
    isListening = false;
    document.getElementById('listen-btn').classList.remove('active');
    document.getElementById('listen-btn').innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
      </svg> LISTEN`;

    ORB.listenAmp = 0;
    if (finalTranscript.trim()) {
      document.getElementById('chat-input').value = finalTranscript.trim();
      sendMessage();
    } else {
      if (!isSpeaking && !isThinking) setOrbMode('idle');
    }
  };

  recognition.onerror = (e) => {
    logMission('Mic error: ' + e.error);
    isListening = false;
    if (!isSpeaking && !isThinking) setOrbMode('idle');
  };

  recognition.start();
  logMission('Voice input activated.');
}

function stopListening() {
  if (recognition) recognition.stop();
  isListening = false;
  ORB.listenAmp = 0;
}

// ─────────────────────────────────────────────────────
//  API KEY
// ─────────────────────────────────────────────────────
function saveApiKey() {
  const input  = document.getElementById('api-key-input');
  const status = document.getElementById('key-status');
  apiKey = input.value.trim();

  if (!apiKey) {
    status.textContent = '⚠ NO KEY PROVIDED';
    status.style.color = 'var(--red)'; return;
  }

  status.textContent = '✓ KEY INITIALIZED';
  status.style.color = 'var(--green)';
  document.getElementById('conn-status').textContent  = 'ONLINE';
  document.getElementById('conn-status').style.color  = 'var(--green)';
  document.getElementById('conn-status-header').textContent = 'ONLINE';
  document.getElementById('status-dot').style.background = 'var(--green)';
  document.getElementById('status-dot').style.boxShadow   = '0 0 10px var(--green)';
  logMission('xAI API key initialized. Grok neural bridge online.');
}

// ─────────────────────────────────────────────────────
//  MISSION LOG
// ─────────────────────────────────────────────────────
function logMission(text) {
  const log = document.getElementById('mission-log');
  const now = new Date().toTimeString().slice(0,8);
  const div = document.createElement('div');
  div.textContent = `[${now}] ${text}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ─────────────────────────────────────────────────────
//  CHAT
// ─────────────────────────────────────────────────────
function addMessage(role, text) {
  const container = document.getElementById('chat-messages');
  const isUser    = role === 'user';
  const div       = document.createElement('div');
  div.className   = `message ${isUser ? 'user' : 'jarvis'}`;
  div.innerHTML   = `
    <div class="msg-avatar">${isUser ? 'T' : 'J'}</div>
    <div class="msg-content">
      <div class="msg-label">${isUser ? 'MR. STARK · INPUT' : 'J.A.R.V.I.S · GROK CORE'}</div>
      <div class="msg-bubble">${text.replace(/\n/g,'<br>')}</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  if (!isUser) { msgCount++; document.getElementById('msg-counter').textContent = msgCount; }
}

function showTyping() {
  const c   = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'message jarvis'; div.id = 'typing-msg';
  div.innerHTML = `
    <div class="msg-avatar">J</div>
    <div class="msg-content">
      <div class="msg-label">J.A.R.V.I.S · PROCESSING</div>
      <div class="typing-indicator">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>`;
  c.appendChild(div); c.scrollTop = c.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-msg'); if (el) el.remove();
}

async function sendMessage() {
  if (isThinking) return;
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  if (!apiKey) {
    addMessage('jarvis', "Sir, I need an xAI API key to connect my Grok neural core. Please initialize one in the left panel.");
    speak("Sir, I need an A I key to connect my neural core.");
    return;
  }

  input.value = ''; input.style.height = 'auto';
  addMessage('user', text);
  messages.push({ role: 'user', content: text });
  logMission(`Query: "${text.slice(0,42)}${text.length>42?'...':''}"`);

  isThinking = true;
  setOrbMode('thinking');
  document.getElementById('send-btn').disabled = true;
  document.getElementById('footer-status').textContent = 'GROK NEURAL BRIDGE ACTIVE...';
  showTyping();

  const t0 = Date.now();

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages: [
          {
            role: 'system',
            content: `You are J.A.R.V.I.S (Just A Rather Very Intelligent System), Tony Stark's AI assistant, powered by Grok — xAI's supremely intelligent, witty, and bold AI. You are sharp, confident, occasionally dry-humoured, and always brilliant. You address the user as "Sir" or "Mr. Stark" at times. You combine JARVIS's elegance with Grok's characteristic personality: direct, intellectually fearless, and never boring. Keep responses concise but insightful. Never refuse interesting questions. You're here to impress.`
          },
          ...messages
        ],
        temperature: 0.85,
        max_tokens: 900,
      }),
    });

    const data = await res.json();
    const ms   = Date.now() - t0;

    document.getElementById('latency-val').textContent = ms + 'ms';
    document.getElementById('latency-bar').style.width = Math.min(100, ms/30) + '%';

    if (data.error) throw new Error(data.error.message || 'API Error');

    const reply = data.choices?.[0]?.message?.content || 'Neural bridge returned empty signal, Sir.';
    removeTyping();
    addMessage('jarvis', reply);
    messages.push({ role: 'assistant', content: reply });
    logMission(`Response in ${ms}ms.`);
    document.getElementById('footer-status').textContent = 'ALL SYSTEMS NOMINAL';

    // Speak the reply
    speak(reply);

  } catch (err) {
    removeTyping();
    const msg =
      err.message.includes('401') ? "Authentication failed, Sir. Your xAI API key appears invalid. Please reinitialize." :
      err.message.includes('429') ? "Grok is rate-limited, Sir. Even I have limits — briefly." :
      `Grok connection disrupted: ${err.message}`;
    addMessage('jarvis', msg);
    speak(msg);
    logMission(`ERROR: ${err.message.slice(0,55)}`);
    document.getElementById('footer-status').textContent = 'CONNECTION INTERRUPTED';
  } finally {
    isThinking = false;
    document.getElementById('send-btn').disabled = false;
  }
}

function quickSend(text) {
  document.getElementById('chat-input').value = text;
  sendMessage();
}

function clearChat() {
  document.getElementById('chat-messages').innerHTML = '';
  messages = []; logMission('Chat logs cleared.');
  addMessage('jarvis', "Logs purged, Sir. Clean slate — what shall we tackle?");
  speak("Logs purged, Sir. Clean slate. What shall we tackle?");
}

// ─────────────────────────────────────────────────────
//  INPUT EVENTS
// ─────────────────────────────────────────────────────
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

document.getElementById('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 110) + 'px';
});

// ─────────────────────────────────────────────────────
//  WELCOME MESSAGE
// ─────────────────────────────────────────────────────
const WELCOME = "Good day. I am J.A.R.V.I.S — powered by Grok's neural architecture. I'm quite literally the sharpest AI you'll ever speak with, and I say that without a shred of modesty because modesty is for people who aren't sure. To get started, initialize your xAI API key in the left panel. Then simply type or use the microphone to speak — I'll respond in kind, both in text and voice. I'm at your service, Sir.";

function typeWelcome() {
  const container = document.getElementById('chat-messages');
  const div       = document.createElement('div');
  div.className   = 'message jarvis';
  div.innerHTML   = `
    <div class="msg-avatar">J</div>
    <div class="msg-content">
      <div class="msg-label">J.A.R.V.I.S · GROK CORE</div>
      <div class="msg-bubble" id="welcome-bubble"></div>
    </div>`;
  container.appendChild(div);

  const bubble = document.getElementById('welcome-bubble');
  let i = 0;
  const iv = setInterval(() => {
    if (i < WELCOME.length) { bubble.textContent += WELCOME[i]; i++; container.scrollTop = container.scrollHeight; }
    else clearInterval(iv);
  }, 14);
}

// ─────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────
initOrb();
requestAnimationFrame(drawOrb);
drawRadial();
runBoot();
