/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — BACKEND SERVER v3.0
   - Groq LLaMA 3.3 70b for AI responses
   - DuckDuckGo + Wikipedia for live/real-time data (no key needed)
   - Gemini TTS for neural voice output
   - Turso DB for conversation history
═══════════════════════════════════════════════════════ */
'use strict';

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const https        = require('https');
const http         = require('http');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@libsql/client');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));

/* ─────────────────────────────────────────────────────
   TURSO DATABASE
───────────────────────────────────────────────────── */
let db;
try {
  db = createClient({
    url:       process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  console.log('[VIVEK] Turso client created');
} catch (err) {
  console.error('[VIVEK] Turso client error:', err.message);
}

async function initDB() {
  if (!db) return;
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, personality TEXT NOT NULL DEFAULT 'vivek',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
      content TEXT NOT NULL, timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS boss_instructions (
      id TEXT PRIMARY KEY, instruction TEXT NOT NULL, created_at INTEGER NOT NULL)`);
    console.log('[VIVEK] Database schema ready');
  } catch (err) {
    console.error('[VIVEK] Schema init error:', err.message);
  }
}

/* ─────────────────────────────────────────────────────
   HEALTH
───────────────────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.json({ status: 'online', service: 'V.I.V.E.K Neural Core v3.0', timestamp: Date.now() });
});

/* ─────────────────────────────────────────────────────
   GROQ CHAT ENDPOINT
───────────────────────────────────────────────────── */
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(503).json({ error: 'GROQ_API_KEY not configured' });

  try {
    const modelsToTry = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const body = JSON.stringify({
          model,
          messages: messages,
          max_tokens: 500,
          temperature: 0.75,
          stream: false,
        });

        const groqRes = await fetchJSON('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          body,
        });

        const reply = groqRes.choices?.[0]?.message?.content || '';
        if (reply) return res.json({ reply });
        lastError = new Error(`Empty response from Groq model: ${model}`);
      } catch (modelErr) {
        lastError = modelErr;
      }
    }

    throw lastError || new Error('All Groq models failed');

  } catch (err) {
    console.error('[VIVEK] Groq error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────
   LIVE SEARCH — DuckDuckGo Instant Answer + Wikipedia
   No API key needed, reliable, not blocked on servers
───────────────────────────────────────────────────── */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'q parameter required' });
  try {
    const result = await liveSearch(query);
    res.json({ result });
  } catch (err) {
    console.error('[VIVEK] Search error:', err.message);
    res.json({ result: '' });
  }
});

async function liveSearch(query) {
  const snippets = [];

  // 1) DuckDuckGo Instant Answer API — free, no key, JSON
  try {
    const ddgUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
    const ddg = await fetchJSON(ddgUrl);
    if (ddg.AbstractText && ddg.AbstractText.length > 20) snippets.push(ddg.AbstractText);
    if (ddg.Answer && ddg.Answer.length > 5) snippets.push(ddg.Answer);
    if (ddg.Definition && ddg.Definition.length > 10) snippets.push(ddg.Definition);
    // Related topics — good for news/current events
    for (const t of (ddg.RelatedTopics || []).slice(0, 4)) {
      if (t.Text && t.Text.length > 20) snippets.push(t.Text);
    }
    if (ddg.Infobox && ddg.Infobox.content) {
      for (const item of ddg.Infobox.content.slice(0, 4)) {
        if (item.label && item.value) snippets.push(`${item.label}: ${item.value}`);
      }
    }
  } catch(e) { console.warn('[VIVEK] DuckDuckGo failed:', e.message); }

  // 2) Wikipedia Search API — good for factual / recent event questions
  try {
    const wikiSearch = await fetchJSON(
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) + '&utf8=1&format=json&srlimit=2'
    );
    const hits = wikiSearch?.query?.search || [];
    for (const hit of hits.slice(0, 2)) {
      // Get the extract for the top result
      const extract = await fetchJSON(
        'https://en.wikipedia.org/api/rest_v1/page/summary/' +
        encodeURIComponent(hit.title.replace(/ /g, '_'))
      );
      if (extract?.extract && extract.extract.length > 30) {
        snippets.push(extract.extract.slice(0, 400));
        break; // one good Wikipedia extract is enough
      }
    }
  } catch(e) { console.warn('[VIVEK] Wikipedia failed:', e.message); }

  const combined = [...new Set(snippets)]
    .filter(s => s && s.length > 10)
    .slice(0, 6)
    .join(' | ');

  return combined.slice(0, 1200);
}

/* ─────────────────────────────────────────────────────
   GEMINI TTS — Neural voice, same as original Vivek
   Uses Gemini 2.5 Flash TTS REST endpoint
   Returns raw PCM audio as base64 (24kHz, mono, int16)
───────────────────────────────────────────────────── */
app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(503).json({ error: 'GEMINI_API_KEY not configured' });

  const voiceName = voice || 'Puck'; // Puck = Vivek, Aoede = Priya

  try {
    const body = JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        }
      }
    });

    const ttsRes = await fetchJSON(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );

    const audioData = ttsRes?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
      console.error('[VIVEK] TTS: no audio in response', JSON.stringify(ttsRes).slice(0, 300));
      return res.status(500).json({ error: 'No audio returned from Gemini TTS' });
    }
    res.json({ audio: audioData }); // base64 PCM 24kHz int16 mono
  } catch(err) {
    console.error('[VIVEK] TTS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────
   HTTP HELPERS
───────────────────────────────────────────────────── */
function fetchHTML(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    };

    const req = mod.request(reqOptions, (res2) => {
      // Handle redirect
      if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
        return fetchHTML(res2.headers.location, options).then(resolve).catch(reject);
      }

      let data = '';
      const encoding = res2.headers['content-encoding'];

      if (encoding === 'gzip' || encoding === 'br' || encoding === 'deflate') {
        const zlib = require('zlib');
        let stream;
        if (encoding === 'gzip')    stream = zlib.createGunzip();
        else if (encoding === 'br') stream = zlib.createBrotliDecompress();
        else                        stream = zlib.createInflate();
        res2.pipe(stream);
        stream.on('data', chunk => { data += chunk.toString(); });
        stream.on('end', () => resolve(data));
        stream.on('error', reject);
      } else {
        res2.setEncoding('utf8');
        res2.on('data', chunk => { data += chunk; });
        res2.on('end', () => resolve(data));
      }
    });

    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod    = url.startsWith('https') ? https : http;
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    };

    const req = mod.request(reqOptions, (res2) => {
      let data = '';
      res2.setEncoding('utf8');
      res2.on('data', chunk => { data += chunk; });
      res2.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Groq request timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

/* ─────────────────────────────────────────────────────
   SESSION ROUTES
───────────────────────────────────────────────────── */
app.post('/api/sessions', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const id  = uuidv4(), now = Date.now();
    const personality = req.body.personality || 'vivek';
    await db.execute({ sql: 'INSERT INTO sessions (id, personality, created_at, updated_at) VALUES (?,?,?,?)', args: [id, personality, now, now] });
    res.json({ sessionId: id, personality, created_at: now });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sessions', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await db.execute({
      sql: `SELECT s.id, s.personality, s.created_at, s.updated_at,
                   COUNT(m.id) as message_count,
                   (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY timestamp DESC LIMIT 1) as last_user_msg
            FROM sessions s LEFT JOIN messages m ON m.session_id = s.id
            GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ?`,
      args: [limit],
    });
    res.json({ sessions: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sessions/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const s = await db.execute({ sql: 'SELECT * FROM sessions WHERE id = ?', args: [req.params.id] });
    if (s.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const m = await db.execute({ sql: 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC', args: [req.params.id] });
    res.json({ session: s.rows[0], messages: m.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sessions/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [req.params.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─────────────────────────────────────────────────────
   MESSAGE ROUTES
───────────────────────────────────────────────────── */
app.post('/api/sessions/:sessionId/messages', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { role, content } = req.body;
    if (!role || !content) return res.status(400).json({ error: 'role and content required' });
    if (!['user','assistant'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const sessionId = req.params.sessionId;
    const check = await db.execute({ sql: 'SELECT id FROM sessions WHERE id = ?', args: [sessionId] });
    if (check.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const now = Date.now();
    await db.execute({ sql: 'INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?,?,?,?,?)', args: [uuidv4(), sessionId, role, content, now] });
    await db.execute({ sql: 'UPDATE sessions SET updated_at = ? WHERE id = ?', args: [now, sessionId] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sessions/:sessionId/messages', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const result = await db.execute({ sql: 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC', args: [req.params.sessionId] });
    res.json({ messages: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─────────────────────────────────────────────────────
   INSTRUCTIONS ROUTES
───────────────────────────────────────────────────── */
app.get('/api/instructions', async (req, res) => {
  if (!db) return res.json({ instructions: [] });
  try {
    const result = await db.execute('SELECT instruction FROM boss_instructions ORDER BY created_at ASC');
    res.json({ instructions: result.rows.map(r => r.instruction) });
  } catch(err) { res.json({ instructions: [] }); }
});

app.post('/api/instructions', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { instructions } = req.body;
    if (!Array.isArray(instructions)) return res.status(400).json({ error: 'instructions array required' });
    await db.execute('DELETE FROM boss_instructions');
    const now = Date.now();
    for (let i = 0; i < instructions.length; i++) {
      await db.execute({ sql: 'INSERT INTO boss_instructions (id, instruction, created_at) VALUES (?,?,?)', args: [uuidv4(), instructions[i], now + i] });
    }
    res.json({ success: true, saved: instructions.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

/* ─────────────────────────────────────────────────────
   START SERVER
───────────────────────────────────────────────────── */
initDB().then(() => {
  const httpServer = require('http').createServer(app);
  httpServer.listen(PORT, () => {
    console.log(`[VIVEK] Neural Core v3.0 running on port ${PORT}`);
    console.log(`[VIVEK] Groq Key:  ${process.env.GROQ_API_KEY ? 'SET ✓' : 'MISSING ✗'}`);
    console.log(`[VIVEK] Turso DB:  ${process.env.TURSO_DATABASE_URL ? 'CONNECTED' : 'NOT CONFIGURED'}`);

    // Keep-alive ping for Render free tier
    const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    setInterval(() => {
      const mod = SELF_URL.startsWith('https') ? https : http;
      mod.get(`${SELF_URL}/health`, () => {}).on('error', () => {});
    }, 10 * 60 * 1000);
  });
});
