/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — BACKEND SERVER v3.0
   - Groq LLaMA 3.3 70b for AI responses
   - Google Search scraping for live/real-time data
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
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      max_tokens: 300,
      temperature: 0.7,
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
    if (!reply) return res.status(500).json({ error: 'Empty response from Groq' });
    res.json({ reply });

  } catch (err) {
    console.error('[VIVEK] Groq error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ─────────────────────────────────────────────────────
   GOOGLE SEARCH SCRAPING — live/real-time data
   Scrapes Google search results page and extracts text
───────────────────────────────────────────────────── */
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'q parameter required' });

  try {
    const result = await googleSearch(query);
    res.json({ result });
  } catch (err) {
    console.error('[VIVEK] Search error:', err.message);
    res.json({ result: '' }); // return empty so agent still responds
  }
});

async function googleSearch(query) {
  const encoded = encodeURIComponent(query);
  const url     = `https://www.google.com/search?q=${encoded}&num=5&hl=en&gl=in`;

  const html = await fetchHTML(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9,hi;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
    }
  });

  // Extract useful text from Google's HTML
  const snippets = [];

  // Featured snippet / answer box
  const featuredMatch = html.match(/class="[^"]*ILfuVd[^"]*"[^>]*>([\s\S]{0,600}?)<\/div>/i);
  if (featuredMatch) {
    const clean = stripHTML(featuredMatch[1]).trim();
    if (clean.length > 20) snippets.push(clean);
  }

  // Knowledge panel / scores (BNeawe class used by Google for rich results)
  const bneaweMatches = [...html.matchAll(/class="[^"]*BNeawe[^"]*"[^>]*>([\s\S]{0,400}?)<\/(?:div|span)>/gi)];
  for (const m of bneaweMatches.slice(0, 8)) {
    const clean = stripHTML(m[1]).trim();
    if (clean.length > 15 && clean.length < 400 && !snippets.includes(clean)) snippets.push(clean);
  }

  // Regular search result snippets
  const snippetMatches = [...html.matchAll(/class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]{0,400}?)<\/div>/gi)];
  for (const m of snippetMatches.slice(0, 5)) {
    const clean = stripHTML(m[1]).trim();
    if (clean.length > 30 && !snippets.includes(clean)) snippets.push(clean);
  }

  // Also try to get any score-like numbers near IPL/cricket keywords
  if (/ipl|cricket|score|match/i.test(query)) {
    const scoreMatch = html.match(/(\d{1,3}\/\d{1,2}|\d{1,3}-\d{1,2})[^<]{0,100}/g);
    if (scoreMatch) snippets.push(...scoreMatch.slice(0, 3).map(s => s.trim()));
  }

  // Combine, deduplicate, limit
  const combined = [...new Set(snippets)]
    .filter(s => s.length > 10)
    .slice(0, 6)
    .join(' | ');

  return combined.slice(0, 1200); // max 1200 chars to Groq
}

function stripHTML(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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
