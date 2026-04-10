/* ═══════════════════════════════════════════════════════
   V.I.V.E.K — BACKEND SERVER
   Turso DB for conversation storage + API key proxy
   Deploy on Render — set env vars in Render dashboard
═══════════════════════════════════════════════════════ */
'use strict';

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@libsql/client');
const { createServer } = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────
//  CORS — allow your frontend origin
//  On Render, set FRONTEND_URL in environment variables
// ─────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));

// ─────────────────────────────────────────────────────
//  TURSO DATABASE CLIENT
//  On Render, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
// ─────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────
//  INIT DATABASE SCHEMA
// ─────────────────────────────────────────────────────
async function initDB() {
  if (!db) { console.warn('[VIVEK] No DB client, skipping schema init'); return; }
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        personality TEXT NOT NULL DEFAULT 'vivek',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      )
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id          TEXT PRIMARY KEY,
        session_id  TEXT NOT NULL,
        role        TEXT NOT NULL,
        content     TEXT NOT NULL,
        timestamp   INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_messages_session 
      ON messages(session_id, timestamp)
    `);
    // Instructions table — persistent boss instructions
    await db.execute(`
      CREATE TABLE IF NOT EXISTS boss_instructions (
        id          TEXT PRIMARY KEY,
        instruction TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      )
    `);
    console.log('[VIVEK] Database schema ready');
  } catch (err) {
    console.error('[VIVEK] Schema init error:', err.message);
  }
}

// ─────────────────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'online', service: 'V.I.V.E.K Neural Core', timestamp: Date.now() });
});

// ─────────────────────────────────────────────────────
//  GET GEMINI API KEY  (never exposed in frontend code)
// ─────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured on server' });
  }
  res.json({ apiKey: key });
});

// ─────────────────────────────────────────────────────
//  SESSION ROUTES
// ─────────────────────────────────────────────────────

// Create new session
app.post('/api/sessions', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const id  = uuidv4();
    const now = Date.now();
    const personality = req.body.personality || 'vivek';
    await db.execute({
      sql: 'INSERT INTO sessions (id, personality, created_at, updated_at) VALUES (?,?,?,?)',
      args: [id, personality, now, now],
    });
    res.json({ sessionId: id, personality, created_at: now });
  } catch (err) {
    console.error('[VIVEK] Create session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all sessions (most recent first)
app.get('/api/sessions', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await db.execute({
      sql: `SELECT s.id, s.personality, s.created_at, s.updated_at,
                   COUNT(m.id) as message_count,
                   (SELECT content FROM messages
                    WHERE session_id = s.id AND role = 'user'
                    ORDER BY timestamp DESC LIMIT 1) as last_user_msg
            FROM sessions s
            LEFT JOIN messages m ON m.session_id = s.id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
            LIMIT ?`,
      args: [limit],
    });
    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('[VIVEK] List sessions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get single session with messages
app.get('/api/sessions/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const sessResult = await db.execute({
      sql: 'SELECT * FROM sessions WHERE id = ?',
      args: [req.params.id],
    });
    if (sessResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    const msgResult = await db.execute({
      sql: 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
      args: [req.params.id],
    });
    res.json({ session: sessResult.rows[0], messages: msgResult.rows });
  } catch (err) {
    console.error('[VIVEK] Get session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete session
app.delete('/api/sessions/:id', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [req.params.id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
//  MESSAGE ROUTES
// ─────────────────────────────────────────────────────

// Save a message to a session
app.post('/api/sessions/:sessionId/messages', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { role, content } = req.body;
    if (!role || !content) return res.status(400).json({ error: 'role and content required' });
    if (!['user','assistant'].includes(role)) return res.status(400).json({ error: 'role must be user or assistant' });

    const sessionId = req.params.sessionId;

    // Verify session exists before inserting — avoids silent FK failures
    const sessionCheck = await db.execute({
      sql: 'SELECT id FROM sessions WHERE id = ?',
      args: [sessionId],
    });
    if (sessionCheck.rows.length === 0) {
      console.warn('[VIVEK] Save message: session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    const id  = uuidv4();
    const now = Date.now();

    await db.execute({
      sql: 'INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?,?,?,?,?)',
      args: [id, sessionId, role, content, now],
    });
    await db.execute({
      sql: 'UPDATE sessions SET updated_at = ? WHERE id = ?',
      args: [now, sessionId],
    });
    res.json({ messageId: id, sessionId, role, content, timestamp: now });
  } catch (err) {
    console.error('[VIVEK] Save message error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Save full conversation batch (end-of-session bulk save)
app.post('/api/sessions/:sessionId/messages/batch', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const sessionId = req.params.sessionId;
    const now = Date.now();
    const statements = messages.map((m, i) => ({
      sql: 'INSERT OR IGNORE INTO messages (id, session_id, role, content, timestamp) VALUES (?,?,?,?,?)',
      args: [uuidv4(), sessionId, m.role, m.content, now + i],
    }));
    statements.push({
      sql: 'UPDATE sessions SET updated_at = ? WHERE id = ?',
      args: [now, sessionId],
    });
    await db.batch(statements);
    res.json({ success: true, saved: messages.length });
  } catch (err) {
    console.error('[VIVEK] Batch save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get all messages for a session
app.get('/api/sessions/:sessionId/messages', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
      args: [req.params.sessionId],
    });
    res.json({ messages: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
//  BOSS INSTRUCTIONS — Persistent learning
// ─────────────────────────────────────────────────────

// Get all instructions
app.get('/api/instructions', async (req, res) => {
  if (!db) return res.json({ instructions: [] });
  try {
    const result = await db.execute('SELECT instruction FROM boss_instructions ORDER BY created_at ASC');
    res.json({ instructions: result.rows.map(r => r.instruction) });
  } catch(err) { res.json({ instructions: [] }); }
});

// Save instructions (replaces all)
app.post('/api/instructions', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { instructions } = req.body;
    if (!Array.isArray(instructions)) return res.status(400).json({ error: 'instructions array required' });
    // Clear old, insert new
    await db.execute('DELETE FROM boss_instructions');
    const now = Date.now();
    for (let i = 0; i < instructions.length; i++) {
      await db.execute({
        sql: 'INSERT INTO boss_instructions (id, instruction, created_at) VALUES (?,?,?)',
        args: [uuidv4(), instructions[i], now + i]
      });
    }
    res.json({ success: true, saved: instructions.length });
  } catch(err) {
    console.error('[VIVEK] Instructions save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add single instruction
app.post('/api/instructions/add', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { instruction } = req.body;
    if (!instruction) return res.status(400).json({ error: 'instruction required' });
    await db.execute({
      sql: 'INSERT INTO boss_instructions (id, instruction, created_at) VALUES (?,?,?)',
      args: [uuidv4(), instruction, Date.now()]
    });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────
//  LIVE DATA ROUTES (Cricket & News)
// ─────────────────────────────────────────────────────

// Cache for live data
let liveDataCache = { cricket: null, news: null, lastFetch: 0 };
const CACHE_TTL = 30000; // 30 seconds

// Cricbuzz API (no API key needed)
app.get('/api/live/cricket', async (req, res) => {
  try {
    const now = Date.now();
    if (liveDataCache.cricket && now - liveDataCache.lastFetch < CACHE_TTL) {
      return res.json(liveDataCache.cricket);
    }
    // Using Cricbuzz API for live matches
    const response = await fetch('https://api.cricbuzz.com/api/json/v3/match/全部', {
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();
    liveDataCache.cricket = data;
    liveDataCache.lastFetch = now;
    res.json(data);
  } catch(err) {
    res.json({ matches: [], error: err.message });
  }
});

// News API (using GNews.io - get free key at https://gnews.io)
const GNEWS_KEY = process.env.GNEWS_API_KEY || '';
app.get('/api/live/news', async (req, res) => {
  try {
    const now = Date.now();
    if (liveDataCache.news && now - liveDataCache.lastFetch < CACHE_TTL) {
      return res.json(liveDataCache.news);
    }
    if (!GNEWS_KEY) {
      // Fallback: use a public RSS-to-JSON proxy
      const response = await fetch('https://api.rss2json.com/v1/api.json?rss=https://timesofindia.indiatimes.com/rssfeedstop.cms');
      const data = await response.json();
      liveDataCache.news = data;
      liveDataCache.lastFetch = now;
      return res.json(data);
    }
    const response = await fetch(`https://gnews.io/api/v4/top-headlines?country=in&lang=en&max=10&apikey=${GNEWS_KEY}`);
    const data = await response.json();
    liveDataCache.news = data;
    liveDataCache.lastFetch = now;
    res.json(data);
  } catch(err) {
    res.json({ articles: [], error: err.message });
  }
});

// ─────────────────────────────────────────────────────
//  STATS ROUTE
// ─────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const [sessCount, msgCount] = await Promise.all([
      db.execute('SELECT COUNT(*) as count FROM sessions'),
      db.execute('SELECT COUNT(*) as count FROM messages'),
    ]);
    res.json({
      total_sessions:  sessCount.rows[0].count,
      total_messages:  msgCount.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ─────────────────────────────────────────────────────
//  DESMOS GRAPH PAGE — served from our own domain
//  so it loads in iframe without X-Frame-Options block
// ─────────────────────────────────────────────────────
app.get('/graph', (req, res) => {
  const eq = req.query.eq || '';
  const safeEq = eq.replace(/[<>"'&]/g, ''); // basic sanitize
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>VIVEK Graph</title>
  <script src="https://www.desmos.com/api/v1.9/calculator.js?apiKey=003d4029b0d741db8dfa66ddd9bc6983"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #1a1a2e; }
    #calculator { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="calculator"></div>
  <script>
    var elt = document.getElementById('calculator');
    var calculator = Desmos.GraphingCalculator(elt, {
      keypad: true,
      expressions: true,
      settingsMenu: true,
      zoomButtons: true,
      border: false,
    });
    var eq = decodeURIComponent("${safeEq}");
    if (eq) {
      if (!/^[a-zA-Z]\s*=/.test(eq)) eq = 'y=' + eq;
      calculator.setExpression({ id: 'g1', latex: eq });
    }
  </script>
</body>
</html>`);
});

// ─────────────────────────────────────────────────────
//  SPOTIFY OAUTH + PLAYBACK ROUTES
//  Set in Render env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
//  Redirect URI registered in Spotify Dashboard:
//  https://vivek-qqwu.onrender.com/callback
// ─────────────────────────────────────────────────────

const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI  = 'https://vivek-qqwu.onrender.com/callback';
const SPOTIFY_SCOPES        = 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state';

let spotifyTokens = { access_token: null, refresh_token: null, expires_at: 0 };

// Step 1 — redirect to Spotify login
app.get('/auth/spotify', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     SPOTIFY_CLIENT_ID,
    scope:         SPOTIFY_SCOPES,
    redirect_uri:  SPOTIFY_REDIRECT_URI,
  });
  res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

// Step 2 — Spotify sends code here, exchange for tokens
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code received from Spotify.');
  try {
    const creds = Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + creds,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(400).send('Spotify error: ' + data.error_description);
    spotifyTokens.access_token  = data.access_token;
    spotifyTokens.refresh_token = data.refresh_token;
    spotifyTokens.expires_at    = Date.now() + (data.expires_in - 60) * 1000;
    console.log('[VIVEK] Spotify auth successful');
    res.send('<html><body style="background:#000;color:#ff9a00;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><h2>✅ Spotify Connected! You can close this tab and return to VIVEK.</h2></body></html>');
  } catch(err) {
    console.error('[VIVEK] Spotify callback error:', err);
    res.status(500).send('Token exchange failed: ' + err.message);
  }
});

// Auto-refresh access token using refresh token
async function refreshSpotifyToken() {
  if (!spotifyTokens.refresh_token) return false;
  try {
    const creds = Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + creds,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: spotifyTokens.refresh_token,
      }),
    });
    const data = await response.json();
    if (data.access_token) {
      spotifyTokens.access_token = data.access_token;
      spotifyTokens.expires_at   = Date.now() + (data.expires_in - 60) * 1000;
      console.log('[VIVEK] Spotify token refreshed');
      return true;
    }
    return false;
  } catch(err) {
    console.error('[VIVEK] Spotify refresh error:', err);
    return false;
  }
}

// Ensure token is valid before use
async function ensureSpotifyToken() {
  if (!spotifyTokens.access_token) return false;
  if (Date.now() >= spotifyTokens.expires_at) {
    return await refreshSpotifyToken();
  }
  return true;
}

// Step 3 — frontend gets access token for Web Playback SDK
app.get('/api/spotify/token', async (req, res) => {
  const ok = await ensureSpotifyToken();
  if (!ok) return res.status(401).json({ error: 'Spotify not authenticated. Visit /auth/spotify first.' });
  res.json({ access_token: spotifyTokens.access_token });
});

// Step 4 — search for a track and return its URI
app.get('/api/spotify/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'q param required' });
  const ok = await ensureSpotifyToken();
  if (!ok) return res.status(401).json({ error: 'Spotify not authenticated' });
  try {
    const url = 'https://api.spotify.com/v1/search?' + new URLSearchParams({ q: query, type: 'track', limit: 1, market: 'IN' });
    const response = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + spotifyTokens.access_token }
    });
    const data = await response.json();
    const track = data.tracks && data.tracks.items && data.tracks.items[0];
    if (!track) return res.status(404).json({ error: 'Track not found' });
    res.json({
      uri:     track.uri,
      name:    track.name,
      artist:  track.artists.map(a => a.name).join(', '),
      album:   track.album.name,
      image:   track.album.images[0] ? track.album.images[0].url : null,
    });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────
//  WEBSOCKET PROXY — forwards browser <-> Gemini Live
// ─────────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/gemini-proxy' });

wss.on('connection', function(clientWs) {
  console.log('[VIVEK] WebSocket client connected');
  // gemini-3.1-flash-live-preview requires v1beta endpoint
  const geminiUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + process.env.GEMINI_API_KEY;
  const geminiWs = new WebSocket(geminiUrl); // ← this line was missing!

  const messageQueue = [];
  const MAX_QUEUE = 200; // cap at ~8 seconds of audio to prevent memory exhaustion
  let geminiReady = false;

  clientWs.on('message', (msg) => {
    if (geminiReady && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(msg);
    } else {
      if (messageQueue.length < MAX_QUEUE) {
        messageQueue.push(msg);
      } else {
        // Queue full — drop oldest chunk (ring-buffer behaviour)
        messageQueue.shift();
        messageQueue.push(msg);
      }
    }
  });

  geminiWs.on('open', () => {
    console.log('[VIVEK] Gemini WebSocket connected');
    geminiReady = true;
    while (messageQueue.length > 0) {
      geminiWs.send(messageQueue.shift());
    }
  });

  geminiWs.on('message', (msg) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(msg);
  });

  geminiWs.on('close', (code, reason) => {
    const reasonStr = reason ? reason.toString() : 'no reason';
    console.log(`[VIVEK] Gemini WebSocket closed — code: ${code}, reason: ${reasonStr}`);
    const isAuthError = (code === 1008 || code === 4001 || code === 4003);
    const isAbnormal  = (code !== 1000 && code !== 1001);
    if (isAuthError) {
      console.error('[VIVEK] ❌ Gemini auth/permission error — check GEMINI_API_KEY and that Gemini Live API is enabled for your project.');
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      // Only propagate error to frontend on actual error closes, NOT normal session ends.
      // Normal close (1000/1001) means the turn finished — frontend handles reconnect itself.
      if (isAuthError) {
        try {
          clientWs.send(JSON.stringify({ error: { message: `Gemini auth error (code ${code}): ${reasonStr}. Check GEMINI_API_KEY.` } }));
        } catch(e) {}
      } else if (isAbnormal) {
        try {
          clientWs.send(JSON.stringify({ error: { message: `Gemini connection dropped (code ${code}): ${reasonStr}` } }));
        } catch(e) {}
      }
      // Always close the client WS so frontend reconnects
      clientWs.close();
    }
  });

  geminiWs.on('error', (err) => {
    console.error('[VIVEK] Gemini WebSocket error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      try {
        clientWs.send(JSON.stringify({ error: { message: 'Gemini connection error: ' + err.message } }));
      } catch(e) {}
      clientWs.close();
    }
  });

  clientWs.on('close', () => {
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  clientWs.on('error', (err) => {
    console.error('[VIVEK] Client WebSocket error:', err.message);
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });
});

// ─────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────
initDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`[VIVEK] Neural Core backend running on port ${PORT}`);
    console.log(`[VIVEK] Turso DB: ${process.env.TURSO_DATABASE_URL ? 'CONNECTED' : 'NOT CONFIGURED'}`);
    console.log(`[VIVEK] Gemini Key: ${process.env.GEMINI_API_KEY ? 'SET ✓' : 'MISSING ✗'}`);

    // ── Keep-alive self-ping for Render free tier (sleeps after 15min inactivity)
    // Pings every 10 minutes so the server stays warm
    const SELF_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    setInterval(() => {
      const http = require('http');
      const https = require('https');
      const mod = SELF_URL.startsWith('https') ? https : http;
      mod.get(`${SELF_URL}/health`, (res) => {
        console.log(`[VIVEK] Self-ping OK — status ${res.statusCode}`);
      }).on('error', (err) => {
        console.warn('[VIVEK] Self-ping failed:', err.message);
      });
    }, 10 * 60 * 1000); // every 10 minutes
  });
});
