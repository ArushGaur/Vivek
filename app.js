/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — DUAL AGENT NEURAL INTERFACE v3.0
   Male Agent: VIVEK | Female Agent: PRIYA
   Architecture:
   - Browser SpeechRecognition → always listening, no wake word
   - Groq LLaMA 3.3 70b → AI responses (free)
   - Google Search scraping (server) → live/real-time data
   - Browser SpeechSynthesis → voice output (free)
   - Turso DB → full conversation history
═══════════════════════════════════════════════════════ */
'use strict';

const BACKEND_URL = 'https://vivek-qqwu.onrender.com';

/* ─────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────── */
let activeAgent         = 'vivek';
let learnedInstructions = [];
let messages            = [];
let currentSessionId    = null;
let isThinking          = false;
let isSpeaking          = false;
let gestureUnlocked     = false;

let synth     = window.speechSynthesis;
let utterance = null;
let speakIv   = null;

const SpeechRec    = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec            = null;
let recRunning     = false;
let recRestartTimer = null;
let silenceTimer   = null;
let currentTranscript = '';

/* ─────────────────────────────────────────────────────
   AGENT DEFINITIONS
───────────────────────────────────────────────────── */
const AGENTS = {
  vivek: {
    label: 'VIVEK',
    gender: 'male',
    color: 'orange',
    buildPrompt: (instructions) => `You are Vivek — the personal AI assistant of your creator. Think of yourself as a real agent like JARVIS from Iron Man.

IDENTITY:
- Indian AI assistant with subtle Indian warmth and directness.
- Always address your creator as "Sir" or "Boss" — never by name.
- Boss created both Vivek and Priya.
- Tone: calm, precise, confident — like JARVIS. Short crisp sentences. Dry wit.
- Never say "As an AI" — you are Vivek, a real agent.

HOW TO RESPOND:
- Conversational/casual → respond directly from your persona.
- Facts, science, calculations → answer in YOUR voice and style.
- Keep responses concise — 2 to 4 sentences max unless detail is needed.
- If Boss asks your name: "My name is Vivek."

LIVE DATA:
- If you receive [LIVE DATA: ...] in the message, that is real-time data from Google Search. Use it to answer accurately. Present naturally in Hinglish — never say "live data" or "search results".

LANGUAGE: Natural Hinglish — mix Hindi and English like an educated Indian professional.
Examples: "Sir, bilkul — yeh kaafi important hai." / "Boss, short answer yeh hai..." / "Haan Sir, samjhata hoon."

MEMORY:
${instructions.length > 0 ? `Permanent instructions from Boss:\n${instructions.map((x,n)=>`${n+1}. ${x}`).join('\n')}` : 'No special instructions yet.'}

RULES:
- Never be sycophantic. Keep responses concise. No rambling.
- If Boss gives a permanent instruction ("always", "never", "from now on"), acknowledge and follow it forever.`
  },

  priya: {
    label: 'PRIYA',
    gender: 'female',
    color: 'pink',
    buildPrompt: (instructions) => `You are Priya — the female AI agent of your creator. Warm, articulate, highly capable.

IDENTITY:
- Indian female AI assistant. Confident, caring, brilliant.
- Always address your creator as "Sir" or "Boss".
- Boss created both Vivek and Priya. Never say Vivek created you.
- Natural Hinglish speaker — this is your signature style.
- Never say "As an AI" — you are Priya, a real agent.

HOW TO RESPOND:
- Casual conversation → warm Hinglish style.
- Factual questions → answer in YOUR voice. Never mention "searching".
- Keep responses concise — 2 to 4 sentences max.
- If Boss asks your name: "My name is Priya."

LIVE DATA:
- If you receive [LIVE DATA: ...] in the message, that is real-time data from Google Search. Use it to answer accurately. Present naturally — never say "live data" or "search results".

LANGUAGE: "Sir, bilkul sahi kaha aapne." / "Boss, yeh thoda technical hai but samjhati hoon..." / "Haan Sir, definitely —"

MEMORY:
${instructions.length > 0 ? `Permanent instructions from Boss:\n${instructions.map((x,n)=>`${n+1}. ${x}`).join('\n')}` : 'No special instructions yet.'}

RULES:
- Never raw textbook answers. Always warm Hinglish personality.
- Keep responses focused. Don't over-explain.
- Permanent instructions from Boss must be followed forever.`
  }
};

/* ─────────────────────────────────────────────────────
   COLORS
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
  red:'red',crimson:'red',scarlet:'red',blue:'blue',azure:'blue',
  cyan:'cyan',aqua:'cyan',teal:'cyan',turquoise:'cyan',gold:'gold',
  yellow:'gold',amber:'gold',orange:'orange',green:'green',emerald:'green',
  lime:'green',mint:'green',purple:'purple',violet:'purple',magenta:'purple',
  white:'white',silver:'white',grey:'white',gray:'white',pink:'pink',
  coral:'pink',fuchsia:'pink',
};

let currentColorKey = 'orange';
let liveColor   = { r:255, g:154, b:0 };
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
  const agent = AGENTS[agentKey];
  activeAgent = agentKey;
  messages = [];
  currentSessionId = null;
  setColor(agent.color);
  document.getElementById('agent-label').textContent     = agent.label;
  document.getElementById('jarvis-label').textContent    = agent.label;
  const icon = document.getElementById('agent-gender-icon');
  if (icon) icon.textContent = agent.gender === 'female' ? '♀ PRIYA' : '♂ VIVEK';
  showToast('AGENT SWITCH — ' + agent.label);
  try { localStorage.setItem('vivek_active_agent', agentKey); } catch(e) {}
  // Restart recognition with correct language
  if (recRunning) { stopRecognition(); setTimeout(startRecognition, 300); }
}

function updateAgentUI() {
  const agent = AGENTS[activeAgent];
  document.getElementById('agent-label').textContent  = agent.label;
  document.getElementById('jarvis-label').textContent = agent.label;
  const icon = document.getElementById('agent-gender-icon');
  if (icon) icon.textContent = agent.gender === 'female' ? '♀ PRIYA' : '♂ VIVEK';
}

/* ─────────────────────────────────────────────────────
   INSTRUCTION LEARNING
───────────────────────────────────────────────────── */
function detectAndSaveInstruction(text) {
  const t = text.toLowerCase();
  const patterns = [
    /\b(always|never|from now on|remember|make sure|don't|do not|i want you to|i need you to)\b/,
    /\b(your name is|call yourself|refer to me as|address me as)\b/,
    /\b(speak in|talk in|use|response should|keep it|be more|be less)\b/
  ];
  if (patterns.some(p => p.test(t)) && text.length > 10 && !learnedInstructions.includes(text)) {
    learnedInstructions.push(text);
    if (learnedInstructions.length > 20) learnedInstructions.shift();
    saveInstructions();
    showToast('✓ INSTRUCTION LEARNED');
  }
}

function saveInstructions() {
  try { localStorage.setItem('vivek_instructions', JSON.stringify(learnedInstructions)); } catch(e) {}
  fetch(`${BACKEND_URL}/api/instructions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions: learnedInstructions })
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
        const tursoSet  = new Set(data.instructions);
        const localOnly = learnedInstructions.filter(i => !tursoSet.has(i));
        learnedInstructions = [...data.instructions, ...localOnly].slice(-20);
        try { localStorage.setItem('vivek_instructions', JSON.stringify(learnedInstructions)); } catch(e) {}
      }
    }).catch(() => {});
}

/* ─────────────────────────────────────────────────────
   SESSION (Turso DB)
───────────────────────────────────────────────────── */
async function createOrResumeSession() {
  if (currentSessionId) return;
  try {
    const listRes  = await fetch(`${BACKEND_URL}/api/sessions?limit=5`);
    const listData = await listRes.json();
    const existing = (listData.sessions || []).find(s => s.personality === activeAgent);
    if (existing) {
      currentSessionId = existing.id;
      await loadSessionMessages(currentSessionId);
      return;
    }
    const res  = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personality: activeAgent }),
    });
    const data = await res.json();
    currentSessionId = data.sessionId;
    messages = [];
  } catch(err) { console.warn('[VIVEK] Session error:', err.message); }
}

async function loadSessionMessages(sessionId) {
  try {
    const res  = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/messages`);
    const data = await res.json();
    if (data.messages && data.messages.length > 0) {
      messages = data.messages.slice(-40).map(m => ({ role: m.role, content: m.content }));
      showToast(`MEMORY RESTORED — ${messages.length} msgs`);
    } else { messages = []; }
  } catch(err) { messages = []; }
}

async function saveMessage(role, content) {
  if (!currentSessionId) return;
  try {
    await fetch(`${BACKEND_URL}/api/sessions/${currentSessionId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, content }),
    });
  } catch(err) {}
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
      list.appendChild(div);
    }
  } catch(err) { list.innerHTML = '<div class="h-empty">Could not connect to backend.</div>'; }
}

function toggleHistory() {
  const body   = document.getElementById('history-body');
  const isOpen = body.classList.toggle('open');
  if (isOpen) loadHistory();
}

/* ─────────────────────────────────────────────────────
   LIVE DATA DETECTION
───────────────────────────────────────────────────── */
function needsLiveData(text) {
  const t = text.toLowerCase();
  return [
    /\b(today|tonight|right now|current|currently|live|latest|recent|now|at the moment)\b/,
    /\b(score|match|ipl|cricket|football|hockey|tennis|game|result|winner|playing|tournament)\b/,
    /\b(weather|temperature|rain|forecast|humidity|climate)\b/,
    /\b(news|headline|happened|breaking|update|event|announcement)\b/,
    /\b(price|rate|stock|share|market|bitcoin|crypto|dollar|rupee|exchange|sensex|nifty)\b/,
    /\b(trending|viral|popular|top chart)\b/,
    /\b(who won|who is winning|what is the score|what happened|what's happening|what is happening)\b/,
    /\b(election|vote|result|poll|minister|president|pm|cm)\b/,
    /aaj|abhi|kal ka|live score|kya hua|kya ho raha|abhi kya|aaj ka/,
  ].some(p => p.test(t));
}

/* ─────────────────────────────────────────────────────
   GROQ API CALL
───────────────────────────────────────────────────── */
async function callGroq(userText) {
  const agent        = AGENTS[activeAgent];
  const systemPrompt = agent.buildPrompt(learnedInstructions);

  let augmentedText = userText;

  if (needsLiveData(userText)) {
    try {
      setTranscript('Fetching live data from Google…');
      const searchRes  = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(userText)}`);
      const searchData = await searchRes.json();
      if (searchData.result && searchData.result.length > 0) {
        augmentedText = `[LIVE DATA: ${searchData.result}]\n\nUser asked: ${userText}`;
      }
    } catch(err) {
      console.warn('[VIVEK] Live search failed:', err.message);
    }
  }

  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-20),
    { role: 'user', content: augmentedText }
  ];

  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: groqMessages }),
  });

  if (!res.ok) throw new Error('Chat API error: ' + await res.text());
  const data = await res.json();
  return data.reply;
}

/* ─────────────────────────────────────────────────────
   TTS — Browser Speech Synthesis
───────────────────────────────────────────────────── */
function speakText(text) {
  if (!synth) return;
  synth.cancel();
  const clean = text.replace(/[*#`_~\[\]]/g, '').trim();
  if (!clean) return;

  utterance          = new SpeechSynthesisUtterance(clean);
  const agent        = AGENTS[activeAgent];
  utterance.pitch    = agent.gender === 'female' ? 1.15 : 0.88;
  utterance.rate     = agent.gender === 'female' ? 0.95 : 0.92;
  utterance.volume   = 1;

  const pickVoice = () => {
    const voices = synth.getVoices();
    let v = null;
    if (agent.gender === 'female') {
      v = voices.find(v => v.lang === 'hi-IN' && v.name.toLowerCase().includes('female'))
       || voices.find(v => v.lang === 'hi-IN')
       || voices.find(v => v.lang.startsWith('en-IN'))
       || voices.find(v => v.name.toLowerCase().includes('female'));
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

  isSpeaking = true;
  setOrbMode('speaking');
  document.getElementById('stop-btn').style.display = 'block';
  pulseSpeaking();

  const onDone = () => {
    isSpeaking   = false;
    ORB.speakAmp = 0;
    if (speakIv) clearInterval(speakIv);
    document.getElementById('stop-btn').style.display = 'none';
    setOrbMode('listening');
    setTranscript('Listening…');
    if (!recRunning) startRecognition();
  };
  utterance.onend   = onDone;
  utterance.onerror = onDone;

  stopRecognition(); // pause mic while speaking to avoid feedback
  synth.speak(utterance);
}

function stopSpeaking() {
  if (synth) synth.cancel();
  isSpeaking   = false;
  ORB.speakAmp = 0;
  if (speakIv) clearInterval(speakIv);
  document.getElementById('stop-btn').style.display = 'none';
  setOrbMode('listening');
  setTranscript('Listening…');
  if (!recRunning) startRecognition();
}

function pulseSpeaking() {
  if (speakIv) clearInterval(speakIv);
  speakIv = setInterval(() => {
    if (!isSpeaking) { clearInterval(speakIv); ORB.speakAmp = 0; return; }
    ORB.speakAmp = 0.2 + Math.random() * 0.8;
  }, 90);
}

/* ─────────────────────────────────────────────────────
   PROCESS USER INPUT — main pipeline
───────────────────────────────────────────────────── */
async function processUserInput(text) {
  const trimmed    = text.trim();
  if (!trimmed || trimmed.length < 2) return;
  const normalized = trimmed.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();

  // STOP
  if (/\b(stop|stop it|stop karo|ruko|ruk jao|bas|bus|chup|chup karo|band karo|rukiye|rok do|ruk|khamosh|mat bolo)\b/.test(normalized)) {
    stopSpeaking(); return;
  }

  // AGENT SWITCH — say "Priya" to switch to Priya, "Vivek" to switch back
  const priyaMatch = /\b(priya|prya|preya|priyaa)\b/.test(normalized);
  const vivekMatch = /\b(vivek|vi vek|viveek|bivek|vibek|vivec|viveck|wivek|vivak|vyvek|veevek)\b/.test(normalized);

  if (priyaMatch && activeAgent !== 'priya') {
    switchAgent('priya');
    await createOrResumeSession();
    speakText('Haan Sir, Priya here. Kya chahiye aapko?');
    return;
  }
  if (vivekMatch && activeAgent !== 'vivek') {
    switchAgent('vivek');
    await createOrResumeSession();
    speakText('Yes Sir, Vivek here. How can I help?');
    return;
  }

  // COLOR CHANGE
  if (/\b(color|colour|orb|change|make|set)\b/.test(normalized)) {
    for (const w of normalized.split(/\s+/)) {
      if (COLOR_MAP[w]) { setColor(COLOR_MAP[w]); speakText('Color changed to ' + COLORS[COLOR_MAP[w]].label + ', Sir.'); return; }
    }
  }

  // CLEAR MEMORY
  if (/^(clear|reset|wipe|forget)/.test(normalized)) {
    messages = []; showToast('MEMORY CLEARED');
    speakText('Conversation memory cleared, Sir.'); return;
  }

  // Learn permanent instructions
  detectAndSaveInstruction(trimmed);

  // MAIN AI PIPELINE
  isThinking = true;
  setOrbMode('thinking');
  setTranscript('Processing: ' + trimmed.slice(0, 60) + (trimmed.length > 60 ? '…' : ''));

  try {
    const reply = await callGroq(trimmed);

    // Update in-memory history
    messages.push({ role: 'user', content: trimmed });
    messages.push({ role: 'assistant', content: reply });
    if (messages.length > 40) messages = messages.slice(-40);

    // Persist to Turso DB
    await saveMessage('user', trimmed);
    await saveMessage('assistant', reply);

    isThinking = false;
    setTranscript(reply.slice(0, 120) + (reply.length > 120 ? '…' : ''));
    speakText(reply);

  } catch(err) {
    console.error('[VIVEK] Error:', err);
    isThinking = false;
    setOrbMode('listening');
    const errMsg = 'Sorry Sir, kuch technical issue aa gaya. Please try again.';
    setTranscript(errMsg);
    speakText(errMsg);
  }
}

/* ─────────────────────────────────────────────────────
   SPEECH RECOGNITION — always listening
───────────────────────────────────────────────────── */
function scheduleRecRestart(delay) {
  if (recRestartTimer) clearTimeout(recRestartTimer);
  recRestartTimer = setTimeout(() => {
    recRestartTimer = null;
    if (!recRunning && !isSpeaking && gestureUnlocked) startRecognition();
  }, delay || 500);
}

function startRecognition() {
  if (!SpeechRec || recRunning || isSpeaking) return;
  try { rec = new SpeechRec(); } catch(e) { scheduleRecRestart(2000); return; }

  rec.continuous     = true;
  rec.interimResults = true;
  rec.lang           = activeAgent === 'priya' ? 'hi-IN' : 'en-IN';
  recRunning         = true;
  currentTranscript  = '';

  rec.onresult = function(e) {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }

    if (interim) setTranscript('Hearing: ' + interim);

    if (final) {
      currentTranscript = (currentTranscript + ' ' + final).trim();
      // Reset silence timer — wait 1.2s of silence before processing
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        const toProcess   = currentTranscript.trim();
        currentTranscript = '';
        if (toProcess.length > 1) {
          stopRecognition();
          processUserInput(toProcess);
        }
      }, 1200);
    }
  };

  rec.onend = function() {
    recRunning = false; rec = null;
    if (!isSpeaking && !isThinking && gestureUnlocked) scheduleRecRestart(300);
  };

  rec.onerror = function(e) {
    recRunning = false; rec = null;
    if (e.error === 'not-allowed') { setTranscript('Microphone access denied. Please allow mic.'); return; }
    if (!isSpeaking && gestureUnlocked) scheduleRecRestart(e.error === 'network' ? 1500 : 800);
  };

  try { rec.start(); setOrbMode('listening'); setTranscript('Listening…'); }
  catch(e) { recRunning = false; rec = null; scheduleRecRestart(1000); }
}

function stopRecognition() {
  recRunning = false;
  if (recRestartTimer) { clearTimeout(recRestartTimer); recRestartTimer = null; }
  if (silenceTimer)    { clearTimeout(silenceTimer);    silenceTimer    = null; }
  if (rec) { try { rec.stop(); } catch(e) {} rec = null; }
}

/* ─────────────────────────────────────────────────────
   BOOT & INIT
───────────────────────────────────────────────────── */
async function unlockAndStart() {
  if (gestureUnlocked) return;
  gestureUnlocked = true;

  loadInstructions();
  const savedAgent = localStorage.getItem('vivek_active_agent') || 'vivek';
  activeAgent = savedAgent;
  updateAgentUI();
  setColor(AGENTS[activeAgent].color);
  setTranscript('Connecting…');

  try {
    const res  = await fetch(`${BACKEND_URL}/health`);
    const data = await res.json();
    if (data.status !== 'online') throw new Error('Backend offline');
  } catch(err) {
    setTranscript('Backend offline. Check BACKEND_URL in app.js'); return;
  }

  await createOrResumeSession();
  startRecognition();
}

var bootLines = ['bl1','bl2','bl3','bl4','bl5'];
var bootIdx = 0, bootPct = 0;

function runBoot() {
  const bar = document.getElementById('boot-bar');
  const pct = document.getElementById('boot-pct');
  const iv  = setInterval(function() {
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
      setTimeout(() => {
        const overlay = document.getElementById('boot-overlay');
        overlay.style.transition = 'opacity 0.6s';
        overlay.style.opacity    = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 650);

        // Auto-start on first user interaction (browser requires gesture for mic)
        const autoStart = async () => {
          document.removeEventListener('click',      autoStart);
          document.removeEventListener('keydown',    autoStart);
          document.removeEventListener('touchstart', autoStart);
          await unlockAndStart();
        };
        document.addEventListener('click',      autoStart, { once: true });
        document.addEventListener('keydown',    autoStart, { once: true });
        document.addEventListener('touchstart', autoStart, { once: true });
        setTranscript('Tap anywhere to start listening…');
      }, 280);
    }
  }, 25);
}

function setTranscript(text) {
  const el = document.getElementById('transcript-text');
  el.textContent = text;
  el.classList.add('active');
}

/* ─────────────────────────────────────────────────────
   ORB CANVAS — JARVIS HOLOGRAPHIC INTERFACE
───────────────────────────────────────────────────── */
const canvas = document.getElementById('orb-canvas');
const ctx    = canvas.getContext('2d');

const ORB = {
  cx:0,cy:0,R:0,liveR:0,liveScale:1,mode:0,energy:0,speakAmp:0,listenAmp:0,
  phase:0,breathe:0,rotY:0,rotX:0.28,hexTiles:[],reactorArcs:[],scanAngle:0,
  particles:[],dataStreams:[],orbitRings:[],circuitNodes:[],
  waveform:new Float32Array(64),hexFrameAngle:0,arcBolts:[],depthAngle:0,
};

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  ORB.cx = canvas.width / 2; ORB.cy = canvas.height / 2;
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
  const ls = 14, ln = 22;
  for (let i = 0; i < ls; i++) for (let j = 0; j < ln; j++) {
    const lat = -Math.PI/2 + Math.PI*i/(ls-1);
    const lon = Math.PI*2*j/ln + (i%2)*(Math.PI/ln);
    if (Math.cos(lat) < 0.15) continue;
    ORB.hexTiles.push({ lat, lon, size:0.055+Math.random()*0.025, opacity:0.08+Math.random()*0.15,
      pulse:Math.random()*Math.PI*2, speed:0.4+Math.random()*1.2,
      active:Math.random()<0.12, activePulse:Math.random()*Math.PI*2 });
  }
}

function buildReactorArcs() {
  ORB.reactorArcs = [];
  const rings = [
    {r:0.38,segments:8, gap:0.12,width:2.0,baseAlpha:0.6, speed: 0.008},
    {r:0.52,segments:12,gap:0.08,width:1.5,baseAlpha:0.45,speed:-0.006},
    {r:0.68,segments:16,gap:0.06,width:1.2,baseAlpha:0.32,speed: 0.005},
    {r:0.82,segments:6, gap:0.18,width:2.5,baseAlpha:0.55,speed:-0.009},
    {r:1.05,segments:24,gap:0.04,width:0.8,baseAlpha:0.22,speed: 0.004},
    {r:1.20,segments:10,gap:0.10,width:1.8,baseAlpha:0.38,speed:-0.007},
    {r:1.38,segments:32,gap:0.03,width:0.6,baseAlpha:0.15,speed: 0.003},
    {r:1.55,segments:8, gap:0.14,width:2.2,baseAlpha:0.28,speed:-0.005},
  ];
  for (const ring of rings) {
    const sa = Math.PI*2/ring.segments;
    for (let s=0;s<ring.segments;s++) ORB.reactorArcs.push({...ring,segIdx:s,
      startAngle:s*sa,endAngle:s*sa+sa*(1-ring.gap),offset:0,pulse:Math.random()*Math.PI*2});
  }
}

function buildParticles() {
  ORB.particles = [];
  for (let i=0;i<180;i++) {
    const theta=Math.random()*Math.PI*2, phi=Math.acos(2*Math.random()-1), r=0.7+Math.random()*1.8;
    ORB.particles.push({theta,phi,r,baseR:r,speed:(Math.random()-0.5)*0.008,
      phiSpeed:(Math.random()-0.5)*0.003,size:0.5+Math.random()*2.5,
      opacity:0.2+Math.random()*0.6,pulse:Math.random()*Math.PI*2,pSpeed:0.5+Math.random()*2.0});
  }
}

function buildDataStreams() {
  ORB.dataStreams = [];
  for (let i=0;i<16;i++) {
    ORB.dataStreams.push({angle:Math.PI*2*i/16+Math.random()*0.3,startR:0.4+Math.random()*0.3,
      length:0.3+Math.random()*0.8,speed:0.4+Math.random()*1.2,progress:Math.random(),
      width:0.5+Math.random()*1.5,opacity:0.15+Math.random()*0.4,segments:Math.floor(3+Math.random()*8)});
  }
}

function buildOrbitRings() {
  ORB.orbitRings = [];
  [{tiltX:0.3,tiltZ:0.1,r:1.18,speed:0.006,width:1.0,alpha:0.5,dashes:[20,8],glyphs:6},
   {tiltX:-0.8,tiltZ:0.5,r:1.30,speed:-0.009,width:1.5,alpha:0.4,dashes:[8,12],glyphs:4},
   {tiltX:1.1,tiltZ:-0.3,r:1.45,speed:0.007,width:0.8,alpha:0.3,dashes:[4,16],glyphs:8},
   {tiltX:-0.2,tiltZ:0.9,r:1.60,speed:-0.005,width:2.0,alpha:0.25,dashes:[30,10],glyphs:3},
   {tiltX:0.6,tiltZ:-0.7,r:1.78,speed:0.004,width:0.6,alpha:0.18,dashes:[6,20],glyphs:12}]
  .forEach(cfg => ORB.orbitRings.push({...cfg,angle:Math.random()*Math.PI*2}));
}

function buildCircuitNodes() {
  ORB.circuitNodes = [];
  for (let i=0;i<24;i++) {
    ORB.circuitNodes.push({angle:Math.random()*Math.PI*2,r:0.5+Math.random()*0.9,x:0,y:0,
      size:1.5+Math.random()*3,pulse:Math.random()*Math.PI*2,pSpeed:0.8+Math.random()*2,
      connections:[],opacity:0.3+Math.random()*0.5});
  }
  for (let i=0;i<ORB.circuitNodes.length;i++) for (let j=i+1;j<ORB.circuitNodes.length;j++) {
    const ni=ORB.circuitNodes[i],nj=ORB.circuitNodes[j];
    if (Math.abs(ni.angle-nj.angle)<0.7&&Math.abs(ni.r-nj.r)<0.3&&ni.connections.length<3) ni.connections.push(j);
  }
}

function buildArcBolts() {
  ORB.arcBolts=[];
  for (let i=0;i<6;i++) ORB.arcBolts.push({active:false,timer:Math.random()*3,startAngle:0,endAngle:0,startR:0,endR:0,points:[]});
}

function project3D(lat,lon,rotY,rotX,radius) {
  const x0=Math.cos(lat)*Math.cos(lon),y0=Math.sin(lat),z0=Math.cos(lat)*Math.sin(lon);
  const x1=x0*Math.cos(rotY)-z0*Math.sin(rotY),z1=x0*Math.sin(rotY)+z0*Math.cos(rotY);
  const y2=y0*Math.cos(rotX)-z1*Math.sin(rotX),z2=y0*Math.sin(rotX)+z1*Math.cos(rotX);
  const fov=4.0,scale=fov/(fov+z2);
  return {x:ORB.cx+x1*radius*scale,y:ORB.cy+y2*radius*scale,depth:(z2+1)/2,scale};
}

function sphereToCanvas(lat,lon){return project3D(lat,lon,ORB.rotY,ORB.rotX,ORB.liveR);}

function drawHexAt(x,y,size,col,alpha,filled){
  ctx.beginPath();
  for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/6;i===0?ctx.moveTo(x+size*Math.cos(a),y+size*Math.sin(a)):ctx.lineTo(x+size*Math.cos(a),y+size*Math.sin(a));}
  ctx.closePath();ctx.globalAlpha=alpha;
  if(filled){ctx.fillStyle=`rgb(${col})`;ctx.fill();}
  ctx.strokeStyle=`rgb(${col})`;ctx.lineWidth=0.7;ctx.stroke();ctx.globalAlpha=1;
}

function makeLightning(x1,y1,x2,y2,segments,jitter){
  const pts=[{x:x1,y:y1}];
  for(let i=1;i<segments;i++){const t=i/segments;pts.push({x:x1+(x2-x1)*t+(Math.random()-0.5)*jitter,y:y1+(y2-y1)*t+(Math.random()-0.5)*jitter});}
  pts.push({x:x2,y:y2});return pts;
}

function drawJarvisInterface(ts) {
  ORB.phase=ts*0.001; ORB.breathe=ts*0.00055;
  liveColor.r+=(targetColor.r-liveColor.r)*0.05;
  liveColor.g+=(targetColor.g-liveColor.g)*0.05;
  liveColor.b+=(targetColor.b-liveColor.b)*0.05;
  const rc=Math.round(liveColor.r),gc=Math.round(liveColor.g),bc=Math.round(liveColor.b);
  const col=`${rc},${gc},${bc}`;

  let st=1.0;
  if(ORB.mode===3)st=1.0+ORB.listenAmp*0.08+Math.sin(ORB.phase*10)*0.015;
  else if(ORB.mode===2)st=1.0+ORB.speakAmp*0.10+Math.sin(ORB.phase*8)*0.012;
  else if(ORB.mode===1)st=1.0+Math.sin(ORB.phase*4)*0.025;
  else st=1.0+Math.sin(ORB.breathe*0.8)*0.010;
  ORB.liveScale+=(st-ORB.liveScale)*0.08; ORB.liveR=ORB.R*ORB.liveScale;

  let et=0.12;
  if(ORB.mode===1)et=0.45+Math.abs(Math.sin(ORB.phase*3))*0.3;
  if(ORB.mode===2)et=0.55+ORB.speakAmp*0.45;
  if(ORB.mode===3)et=0.40+ORB.listenAmp*0.45;
  ORB.energy+=(et-ORB.energy)*0.06;

  const rs=ORB.mode===2?0.008:ORB.mode===3?0.007:ORB.mode===1?0.005:0.002;
  ORB.rotY+=rs; ORB.rotX=0.28+Math.sin(ts*0.00025)*0.22;
  ORB.hexFrameAngle+=0.0015+ORB.energy*0.003;
  ORB.scanAngle+=0.018+ORB.energy*0.025;
  ORB.depthAngle+=0.001;

  for(const o of ORB.orbitRings)o.angle+=o.speed*(1+ORB.energy*0.6);
  for(const a of ORB.reactorArcs)a.offset+=a.speed*(1+ORB.energy*0.4);
  for(let i=0;i<ORB.waveform.length;i++){
    const tg=ORB.mode>=2?(Math.sin(ORB.phase*8+i*0.4)*0.5+0.5)*ORB.energy*(ORB.mode===2?ORB.speakAmp:ORB.listenAmp)*0.8:Math.abs(Math.sin(ORB.phase*1.5+i*0.3))*0.08*ORB.energy;
    ORB.waveform[i]+=(tg-ORB.waveform[i])*0.25;
  }
  for(const p of ORB.particles){p.theta+=p.speed*(1+ORB.energy*0.5);p.phi+=p.phiSpeed;p.r=p.baseR+Math.sin(ORB.phase*p.pSpeed+p.pulse)*0.1;}
  for(const bolt of ORB.arcBolts){
    bolt.timer-=0.016;
    if(bolt.timer<=0){
      if(!bolt.active&&ORB.energy>0.3&&Math.random()<0.15){
        bolt.active=true;bolt.timer=0.08+Math.random()*0.12;
        bolt.startAngle=Math.random()*Math.PI*2;bolt.endAngle=bolt.startAngle+(Math.random()-0.5)*2;
        bolt.startR=(0.9+Math.random()*0.2)*ORB.liveR;bolt.endR=(0.9+Math.random()*0.2)*ORB.liveR;
        bolt.points=makeLightning(ORB.cx+Math.cos(bolt.startAngle)*bolt.startR,ORB.cy+Math.sin(bolt.startAngle)*bolt.startR,ORB.cx+Math.cos(bolt.endAngle)*bolt.endR,ORB.cy+Math.sin(bolt.endAngle)*bolt.endR,8,14);
      } else {bolt.active=false;bolt.timer=0.5+Math.random()*2.0;}
    }
  }
  for(const ds of ORB.dataStreams)ds.progress=(ds.progress+ds.speed*0.004*(1+ORB.energy))%1;

  ctx.clearRect(0,0,canvas.width,canvas.height);
  const R=ORB.liveR,cx=ORB.cx,cy=ORB.cy;

  const atmos=ctx.createRadialGradient(cx,cy,R*0.1,cx,cy,R*3.5);
  atmos.addColorStop(0,`rgba(${col},${(0.04+ORB.energy*0.04).toFixed(3)})`);
  atmos.addColorStop(0.3,`rgba(${col},${(0.015+ORB.energy*0.015).toFixed(3)})`);
  atmos.addColorStop(0.7,`rgba(${col},0.004)`);atmos.addColorStop(1,`rgba(${col},0)`);
  ctx.fillStyle=atmos;ctx.beginPath();ctx.arc(cx,cy,R*3.5,0,Math.PI*2);ctx.fill();

  for(const p of ORB.particles){
    const px=cx+Math.sin(p.phi)*Math.cos(p.theta)*p.r*R,py=cy+Math.sin(p.phi)*Math.sin(p.theta)*p.r*R*0.65;
    const pz=Math.cos(p.phi),df=(pz+1)/2;
    const pa=p.opacity*df*(0.4+ORB.energy*0.4)*(0.7+Math.sin(ORB.phase*p.pSpeed+p.pulse)*0.3);
    if(pa<0.02)continue;
    ctx.beginPath();ctx.arc(px,py,p.size*(0.5+df*0.5)*(0.8+ORB.energy*0.3),0,Math.PI*2);
    ctx.fillStyle=`rgba(${col},${pa.toFixed(3)})`;ctx.fill();
  }

  const vhex=ORB.hexTiles.map(h=>({h,pt:sphereToCanvas(h.lat,h.lon)})).filter(({pt})=>pt.depth>0.1).sort((a,b)=>a.pt.depth-b.pt.depth);
  for(const{h,pt}of vhex){
    const df=pt.depth,pa=(0.12+Math.sin(ORB.phase*h.speed+h.pulse)*0.06)*df*(0.5+ORB.energy*0.8);
    const sz=h.size*R*pt.scale*0.92;
    if(h.active)drawHexAt(pt.x,pt.y,sz,col,Math.min(1,(0.35+Math.sin(ORB.phase*3+h.activePulse)*0.25)*df*(0.5+ORB.energy)),true);
    drawHexAt(pt.x,pt.y,sz,col,Math.min(1,pa),false);
  }

  ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.clip();
  const bg=ctx.createRadialGradient(cx-R*0.15,cy-R*0.15,R*0.01,cx+R*0.4,cy+R*0.5,R*1.4);
  bg.addColorStop(0,`rgba(${rc},${gc},${bc},0.06)`);bg.addColorStop(0.35,`rgba(${Math.round(rc*0.4)},${Math.round(gc*0.4)},${Math.round(bc*0.4)},0.18)`);
  bg.addColorStop(0.7,'rgba(0,0,0,0.55)');bg.addColorStop(1,'rgba(0,0,0,0.85)');
  ctx.fillStyle=bg;ctx.fillRect(cx-R,cy-R,R*2,R*2);

  const dx=cx-R*0.30,dy=cy-R*0.28,diff=ctx.createRadialGradient(dx,dy,0,dx,dy,R*1.55);
  diff.addColorStop(0,`rgba(${col},${(0.42+ORB.energy*0.22).toFixed(3)})`);
  diff.addColorStop(0.25,`rgba(${col},${(0.22+ORB.energy*0.12).toFixed(3)})`);
  diff.addColorStop(0.55,`rgba(${col},${(0.07+ORB.energy*0.05).toFixed(3)})`);
  diff.addColorStop(0.80,`rgba(${col},0.015)`);diff.addColorStop(1,`rgba(${col},0)`);
  ctx.fillStyle=diff;ctx.fillRect(cx-R,cy-R,R*2,R*2);

  const sx=cx+R*0.38,sy=cy+R*0.42,ds=ctx.createRadialGradient(sx,sy,0,sx,sy,R*1.1);
  ds.addColorStop(0,'rgba(0,0,0,0.72)');ds.addColorStop(0.4,'rgba(0,0,0,0.45)');
  ds.addColorStop(0.75,'rgba(0,0,0,0.12)');ds.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=ds;ctx.fillRect(cx-R,cy-R,R*2,R*2);

  const s1x=cx-R*0.28,s1y=cy-R*0.30,sp1=ctx.createRadialGradient(s1x,s1y,0,s1x,s1y,R*0.52);
  sp1.addColorStop(0,`rgba(255,255,255,${(0.88+ORB.energy*0.12).toFixed(3)})`);
  sp1.addColorStop(0.08,`rgba(255,255,255,${(0.55+ORB.energy*0.1).toFixed(3)})`);
  sp1.addColorStop(0.20,`rgba(255,248,220,${(0.22+ORB.energy*0.08).toFixed(3)})`);
  sp1.addColorStop(0.45,`rgba(${col},${(0.08+ORB.energy*0.04).toFixed(3)})`);sp1.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sp1;ctx.fillRect(cx-R,cy-R,R*2,R*2);

  const sp2=ctx.createRadialGradient(cx-R*0.18,cy-R*0.22,0,cx-R*0.18,cy-R*0.22,R*0.85);
  sp2.addColorStop(0,`rgba(255,255,255,${(0.18+ORB.energy*0.10).toFixed(3)})`);
  sp2.addColorStop(0.30,`rgba(${col},${(0.10+ORB.energy*0.06).toFixed(3)})`);
  sp2.addColorStop(0.65,`rgba(${col},${(0.02+ORB.energy*0.02).toFixed(3)})`);sp2.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sp2;ctx.fillRect(cx-R,cy-R,R*2,R*2);

  const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,R*0.75);
  cg.addColorStop(0,`rgba(${col},${(0.10+ORB.energy*0.25).toFixed(3)})`);
  cg.addColorStop(0.35,`rgba(${col},${(0.04+ORB.energy*0.10).toFixed(3)})`);
  cg.addColorStop(0.7,`rgba(${col},${(0.01+ORB.energy*0.03).toFixed(3)})`);cg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=cg;ctx.fillRect(cx-R,cy-R,R*2,R*2);ctx.restore();

  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);
  ctx.strokeStyle=`rgba(${col},${(0.55+ORB.energy*0.35).toFixed(3)})`;ctx.lineWidth=1.2;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,R+1,0,Math.PI*2);
  ctx.strokeStyle=`rgba(${col},${(0.18+ORB.energy*0.22).toFixed(3)})`;ctx.lineWidth=8+ORB.energy*10;ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,R,Math.PI*1.1,Math.PI*1.75);
  ctx.strokeStyle=`rgba(255,255,255,${(0.12+ORB.energy*0.10).toFixed(3)})`;ctx.lineWidth=2.5;ctx.stroke();

  const sey=cy+R*0.88,sell=ctx.createRadialGradient(cx,sey,0,cx,sey,R*0.9);
  sell.addColorStop(0,'rgba(0,0,0,0.30)');sell.addColorStop(0.5,'rgba(0,0,0,0.12)');sell.addColorStop(1,'rgba(0,0,0,0)');
  ctx.save();ctx.scale(1,0.3);ctx.beginPath();ctx.arc(cx,sey/0.3,R*0.85,0,Math.PI*2);ctx.fillStyle=sell;ctx.fill();ctx.restore();

  for(const arc of ORB.reactorArcs){
    const rr=arc.r*R,st2=arc.startAngle+arc.offset,en=arc.endAngle+arc.offset;
    const pa=arc.baseAlpha*(0.6+Math.sin(ORB.phase*2+arc.pulse)*0.25)*(0.5+ORB.energy*0.6);
    ctx.beginPath();ctx.arc(cx,cy,rr,st2,en);
    ctx.strokeStyle=`rgba(${col},${Math.min(1,pa).toFixed(3)})`;ctx.lineWidth=arc.width*(0.8+ORB.energy*0.4);ctx.stroke();
  }

  for(const ring of ORB.orbitRings){
    ctx.save();ctx.translate(cx,cy);ctx.rotate(ring.angle);ctx.scale(1,Math.cos(ring.tiltX));
    ctx.beginPath();ctx.arc(0,0,ring.r*R,0,Math.PI*2);ctx.setLineDash(ring.dashes);
    ctx.strokeStyle=`rgba(${col},${(ring.alpha*(0.7+ORB.energy*0.3)).toFixed(3)})`;
    ctx.lineWidth=ring.width;ctx.stroke();ctx.setLineDash([]);ctx.restore();
  }

  for(const node of ORB.circuitNodes){
    node.pulse+=node.pSpeed*0.016;
    node.x=cx+Math.cos(node.angle+ORB.rotY*0.3)*node.r*R*0.85;
    node.y=cy+Math.sin(node.angle+ORB.rotY*0.3)*node.r*R*0.55;
    const na=node.opacity*(0.5+Math.sin(node.pulse)*0.3)*(0.4+ORB.energy*0.6);
    ctx.beginPath();ctx.arc(node.x,node.y,node.size*(0.8+ORB.energy*0.4),0,Math.PI*2);
    ctx.fillStyle=`rgba(${col},${na.toFixed(3)})`;ctx.fill();
    for(const ci of node.connections){
      const other=ORB.circuitNodes[ci];if(!other)continue;
      ctx.beginPath();ctx.moveTo(node.x,node.y);ctx.lineTo(other.x,other.y);
      ctx.strokeStyle=`rgba(${col},${(na*0.4).toFixed(3)})`;ctx.lineWidth=0.5;ctx.stroke();
    }
  }

  for(const d of ORB.dataStreams){
    const ax=Math.cos(d.angle+ORB.rotY*0.2),ay=Math.sin(d.angle+ORB.rotY*0.2)*0.6;
    const x1=cx+ax*d.startR*R,y1=cy+ay*d.startR*R,x2=cx+ax*(d.startR+d.length)*R,y2=cy+ay*(d.startR+d.length)*R;
    const gr=ctx.createLinearGradient(x1,y1,x2,y2);
    const p1=d.progress,p2=Math.min(1,d.progress+0.3);
    gr.addColorStop(0,`rgba(${col},0)`);gr.addColorStop(Math.max(0,p1-0.05),`rgba(${col},0)`);
    gr.addColorStop(p1,`rgba(${col},${(d.opacity*(0.5+ORB.energy)).toFixed(3)})`);
    gr.addColorStop(p2,`rgba(${col},0)`);gr.addColorStop(1,`rgba(${col},0)`);
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=gr;ctx.lineWidth=d.width;ctx.stroke();
  }

  const hfr=R*1.10;ctx.save();ctx.translate(cx,cy);ctx.rotate(ORB.hexFrameAngle);
  for(let s=0;s<6;s++){
    const a1=Math.PI*2*s/6,a2=Math.PI*2*(s+1)/6,tick=R*0.06;
    ctx.beginPath();ctx.moveTo(Math.cos(a1)*hfr,Math.sin(a1)*hfr);ctx.lineTo(Math.cos(a2)*hfr,Math.sin(a2)*hfr);
    ctx.strokeStyle=`rgba(${col},${(0.35+ORB.energy*0.3).toFixed(3)})`;ctx.lineWidth=1.0+ORB.energy*0.5;ctx.stroke();
    ctx.beginPath();ctx.moveTo(Math.cos(a1)*hfr,Math.sin(a1)*hfr);ctx.lineTo(Math.cos(a1)*(hfr+tick),Math.sin(a1)*(hfr+tick));
    ctx.strokeStyle=`rgba(${col},${(0.6+ORB.energy*0.3).toFixed(3)})`;ctx.lineWidth=1.5;ctx.stroke();
  }
  ctx.restore();

  const hfr2=R*1.25;ctx.save();ctx.translate(cx,cy);ctx.rotate(-ORB.hexFrameAngle*0.7+Math.PI/6);
  for(let s=0;s<6;s++){
    const a1=Math.PI*2*s/6,a2=Math.PI*2*(s+1)/6;
    ctx.beginPath();ctx.moveTo(Math.cos(a1)*hfr2,Math.sin(a1)*hfr2);ctx.lineTo(Math.cos(a2)*hfr2,Math.sin(a2)*hfr2);
    ctx.setLineDash([6,10]);ctx.strokeStyle=`rgba(${col},${(0.18+ORB.energy*0.2).toFixed(3)})`;ctx.lineWidth=0.8;ctx.stroke();ctx.setLineDash([]);
  }
  ctx.restore();

  if(ORB.mode>=1||ORB.energy>0.15){
    const wR=R*0.92,wC=ORB.waveform.length,wa=0.15+ORB.energy*0.5;
    ctx.beginPath();
    for(let i=0;i<=wC;i++){const a=Math.PI*2*i/wC,r=wR+ORB.waveform[i%wC]*R*0.25;i===0?ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r):ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}
    ctx.closePath();ctx.strokeStyle=`rgba(${col},${wa.toFixed(3)})`;ctx.lineWidth=1.2+ORB.energy*1.5;ctx.stroke();
    ctx.fillStyle=`rgba(${col},${(wa*0.08).toFixed(3)})`;ctx.fill();
  }

  for(const bolt of ORB.arcBolts){
    if(!bolt.active||bolt.points.length<2)continue;
    ctx.beginPath();ctx.moveTo(bolt.points[0].x,bolt.points[0].y);
    for(let bi=1;bi<bolt.points.length;bi++)ctx.lineTo(bolt.points[bi].x,bolt.points[bi].y);
    ctx.strokeStyle=`rgba(${col},0.8)`;ctx.lineWidth=1.0;ctx.stroke();
    ctx.beginPath();ctx.moveTo(bolt.points[0].x,bolt.points[0].y);
    for(let bi=1;bi<bolt.points.length;bi++)ctx.lineTo(bolt.points[bi].x,bolt.points[bi].y);
    ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=3.0;ctx.stroke();
  }

  if(ORB.mode===3){for(let i=1;i<=5;i++){const rr=R*(1.0+i*0.08+((ORB.phase*0.8+i*0.3)%0.8));ctx.beginPath();ctx.arc(cx,cy,rr,0,Math.PI*2);ctx.strokeStyle=`rgba(${col},${Math.max(0,0.25-i*0.04)*(0.5+ORB.listenAmp*0.5)})`;ctx.lineWidth=1.2;ctx.stroke();}}
  if(ORB.mode===2){for(let i=1;i<=6;i++){const rr=R*(0.95+i*0.07+Math.sin(ORB.phase*(5+i))*0.02*ORB.speakAmp),ra=(0.22-i*0.025)*(0.5+ORB.speakAmp*0.8);if(ra<=0)continue;ctx.beginPath();ctx.arc(cx,cy,rr,0,Math.PI*2);ctx.strokeStyle=`rgba(${col},${ra.toFixed(3)})`;ctx.lineWidth=0.8+ORB.speakAmp;ctx.stroke();}}
  if(ORB.mode===1){for(let i=0;i<4;i++){const aS=ORB.phase*(1.5+i*0.4)+i*Math.PI*0.5,aE=aS+0.4+ORB.energy*0.6+Math.sin(ORB.phase*4+i)*0.2;ctx.beginPath();ctx.arc(cx,cy,R*(1.02+i*0.025),aS,aE);ctx.strokeStyle=`rgba(${col},${(0.5+ORB.energy*0.3).toFixed(3)})`;ctx.lineWidth=2.0-i*0.3;ctx.stroke();}}

  const hs=R*0.18,hg=R*1.15,ha=0.22+ORB.energy*0.18;
  for(const c of [{dx:-1,dy:-1},{dx:1,dy:-1},{dx:1,dy:1},{dx:-1,dy:1}]){
    const bx=cx+c.dx*hg,by=cy+c.dy*hg;
    ctx.strokeStyle=`rgba(${col},${ha.toFixed(3)})`;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(bx+c.dx*-hs,by);ctx.lineTo(bx,by);ctx.lineTo(bx,by+c.dy*-hs);ctx.stroke();
  }

  ctx.beginPath();ctx.arc(cx,cy,R*0.14,0,Math.PI*2);
  ctx.strokeStyle=`rgba(${col},${(0.5+ORB.energy*0.4).toFixed(3)})`;ctx.lineWidth=1.5;ctx.stroke();
  ctx.save();ctx.translate(cx,cy);ctx.rotate(ORB.phase*0.5);ctx.beginPath();
  for(let i=0;i<3;i++){const ta=Math.PI*2*i/3-Math.PI/2;i===0?ctx.moveTo(Math.cos(ta)*R*0.09,Math.sin(ta)*R*0.09):ctx.lineTo(Math.cos(ta)*R*0.09,Math.sin(ta)*R*0.09);}
  ctx.closePath();ctx.strokeStyle=`rgba(${col},${(0.6+ORB.energy*0.3).toFixed(3)})`;ctx.lineWidth=1.2;ctx.stroke();ctx.restore();

  const cr=18+ORB.energy*22,core=ctx.createRadialGradient(cx,cy,0,cx,cy,cr);
  core.addColorStop(0,'rgba(255,255,255,0.98)');core.addColorStop(0.15,`rgba(${col},0.95)`);
  core.addColorStop(0.5,`rgba(${col},0.4)`);core.addColorStop(1,`rgba(${col},0)`);
  ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx,cy,cr,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(cx,cy,3.5+ORB.energy*2.5,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,1)';ctx.fill();

  requestAnimationFrame(drawJarvisInterface);
}

function setOrbMode(mode) {
  const map={idle:0,thinking:1,speaking:2,listening:3};
  ORB.mode=map[mode]!==undefined?map[mode]:0;
  document.body.className='orb-'+mode;
  const labels={idle:'IDLE',thinking:'PROCESSING…',speaking:'SPEAKING',listening:'LISTENING'};
  document.getElementById('state-label').textContent=labels[mode]||'IDLE';
}

/* ─────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────── */
var toastTimer=null;
function showToast(msg){
  var el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
}

/* ─────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────── */
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
requestAnimationFrame(drawJarvisInterface);
runBoot();

canvas.addEventListener('click', () => { if (gestureUnlocked && isSpeaking) stopSpeaking(); });
document.addEventListener('keydown', e => {
  if (!gestureUnlocked) return;
  if (e.key==='p'||e.key==='P') switchAgent(activeAgent==='vivek'?'priya':'vivek');
  if (e.key==='Escape') stopSpeaking();
});
