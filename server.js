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
                   MAX(m.content) FILTER (WHERE m.role='user') as last_user_msg
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

    const id        = uuidv4();
    const now       = Date.now();
    const sessionId = req.params.sessionId;

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
//  WEBSOCKET PROXY — forwards browser <-> Gemini Live
// ─────────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/gemini-proxy' });

wss.on('connection', function(clientWs) {
  console.log('[VIVEK] WebSocket client connected');
  const geminiUrl = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' + process.env.GEMINI_API_KEY;
  const geminiWs = new WebSocket(geminiUrl); // ← this line was missing!

  const messageQueue = [];
  let geminiReady = false;

  clientWs.on('message', (msg) => {
    if (geminiReady && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(msg);
    } else {
      messageQueue.push(msg);
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
    if (code === 1008 || code === 4001 || code === 4003) {
      console.error('[VIVEK] ❌ Gemini auth/permission error — check GEMINI_API_KEY and that Gemini Live API is enabled for your project.');
    }
    if (clientWs.readyState === WebSocket.OPEN) {
      // Send error info to client before closing so it can display a message
      try {
        clientWs.send(JSON.stringify({ error: { message: `Gemini connection closed (code ${code}): ${reasonStr}` } }));
      } catch(e) {}
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
  });
});
