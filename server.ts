import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ALLOWED_CHEERS,
  computeRank,
  sanitizeHandle,
} from './src/game/rules';
import type {
  CheerKind,
  DeviceKind,
  LeaderboardEntry,
  LiveMatchSummary,
  MatchOutcome,
  SpectatorSnapshot,
} from './src/game/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, 'data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

const SEED_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: 'seed-1',
    handle: 'CYBER_MAYA',
    score: 3640,
    rankCode: 'S',
    rankTitle: 'S-RANK CYBER LEGEND',
    clearTimeSec: 49,
    vaultSeal: 100,
    trapsDodged: 14,
    packetsZapped: 28,
    outcome: 'victory',
    device: 'desktop',
    createdAt: '2026-11-22T18:10:00.000Z',
  },
  {
    id: 'seed-2',
    handle: 'ZERO_TRUST_KAI',
    score: 3180,
    rankCode: 'S',
    rankTitle: 'S-RANK CYBER LEGEND',
    clearTimeSec: 58,
    vaultSeal: 100,
    trapsDodged: 11,
    packetsZapped: 22,
    outcome: 'victory',
    device: 'mobile',
    createdAt: '2026-11-22T19:45:00.000Z',
  },
  {
    id: 'seed-3',
    handle: 'TWO_FACTOR_SAM',
    score: 2620,
    rankCode: 'A',
    rankTitle: 'A-RANK FIREWALL PRO',
    clearTimeSec: 67,
    vaultSeal: 100,
    trapsDodged: 9,
    packetsZapped: 18,
    outcome: 'victory',
    device: 'desktop',
    createdAt: '2026-11-23T08:20:00.000Z',
  },
  {
    id: 'seed-4',
    handle: 'CAMPUS_WARDEN',
    score: 2140,
    rankCode: 'A',
    rankTitle: 'A-RANK FIREWALL PRO',
    clearTimeSec: 74,
    vaultSeal: 100,
    trapsDodged: 8,
    packetsZapped: 15,
    outcome: 'victory',
    device: 'mobile',
    createdAt: '2026-11-23T11:05:00.000Z',
  },
  {
    id: 'seed-5',
    handle: 'DEAN_FIREWALL',
    score: 1690,
    rankCode: 'B',
    rankTitle: 'B-RANK SURVIVOR',
    clearTimeSec: 88,
    vaultSeal: 100,
    trapsDodged: 6,
    packetsZapped: 11,
    outcome: 'victory',
    device: 'desktop',
    createdAt: '2026-11-23T14:30:00.000Z',
  },
];

function ensureLeaderboardStore(): LeaderboardEntry[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(SEED_LEADERBOARD, null, 2), 'utf8');
      return [...SEED_LEADERBOARD];
    }
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(SEED_LEADERBOARD, null, 2), 'utf8');
    return [...SEED_LEADERBOARD];
  } catch {
    return [...SEED_LEADERBOARD];
  }
}

let leaderboardCache: LeaderboardEntry[] = ensureLeaderboardStore();

function saveLeaderboard(entries: LeaderboardEntry[]) {
  leaderboardCache = entries
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.clearTimeSec - b.clearTimeSec;
    })
    .slice(0, 50);

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${LEADERBOARD_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(leaderboardCache, null, 2), 'utf8');
    fs.renameSync(tmpFile, LEADERBOARD_FILE);
  } catch (err) {
    console.error('Failed to persist leaderboard:', err);
  }
}

interface LiveMatchRoom {
  matchId: string;
  hostSocket: WebSocket;
  handle: string;
  device: DeviceKind;
  startedAt: number;
  lastUpdatedAt: number;
  outcome: MatchOutcome | null;
  snapshot: SpectatorSnapshot | null;
  spectators: Set<WebSocket>;
  endCleanupTimer?: ReturnType<typeof setTimeout>;
}

const activeMatches = new Map<string, LiveMatchRoom>();
const lobbySubscribers = new Set<WebSocket>();
const cheerTimestamps = new WeakMap<WebSocket, number>();

function generateMatchCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VLT-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return activeMatches.has(code) ? generateMatchCode() : code;
}

function getLiveMatchSummaries(): LiveMatchSummary[] {
  const list: LiveMatchSummary[] = [];
  for (const room of activeMatches.values()) {
    list.push({
      matchId: room.matchId,
      handle: room.handle,
      device: room.device,
      vaultSeal: room.snapshot?.vaultSeal ?? 0,
      shield: room.snapshot?.shield ?? 100,
      score: room.snapshot?.score ?? 0,
      stormActive: room.snapshot?.stormActive ?? false,
      spectatorCount: room.spectators.size,
      startedAt: room.startedAt,
      outcome: room.outcome,
    });
  }
  return list.sort((a, b) => b.startedAt - a.startedAt);
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastLobby() {
  const payload = {
    type: 'lobby:matches',
    matches: getLiveMatchSummaries(),
  };
  for (const client of lobbySubscribers) {
    sendJson(client, payload);
  }
}

function removeClientFromAll(ws: WebSocket) {
  lobbySubscribers.delete(ws);

  for (const [matchId, room] of activeMatches.entries()) {
    if (room.spectators.delete(ws)) {
      sendJson(room.hostSocket, {
        type: 'match:spectators',
        matchId,
        count: room.spectators.size,
      });
      broadcastLobby();
    }
    if (room.hostSocket === ws) {
      if (room.endCleanupTimer) clearTimeout(room.endCleanupTimer);
      for (const spec of room.spectators) {
        sendJson(spec, { type: 'spectate:ended', matchId, reason: 'host_disconnected' });
      }
      activeMatches.delete(matchId);
      broadcastLobby();
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeMatches: activeMatches.size });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: leaderboardCache.slice(0, 25) });
  });

  app.post('/api/leaderboard', (req, res) => {
    const body = req.body ?? {};
    const handle = sanitizeHandle(typeof body.handle === 'string' ? body.handle : 'AGENT-01');
    const score = Number(body.score);
    const clearTimeSec = Number(body.clearTimeSec);
    const vaultSeal = Number(body.vaultSeal);
    const trapsDodged = Number(body.trapsDodged);
    const trapsHit = Number(body.trapsHit ?? 0);
    const shieldRemaining = Number(body.shieldRemaining ?? 0);
    const packetsZapped = Number(body.packetsZapped);
    const outcome: MatchOutcome = body.outcome === 'victory' ? 'victory' : 'defeat';
    const device: DeviceKind = body.device === 'mobile' ? 'mobile' : 'desktop';

    if (
      !Number.isFinite(score) ||
      score < 0 ||
      score > 250000 ||
      !Number.isFinite(clearTimeSec) ||
      clearTimeSec < 0 ||
      clearTimeSec > 3600 ||
      !Number.isFinite(vaultSeal) ||
      vaultSeal < 0 ||
      vaultSeal > 100
    ) {
      return res.status(400).json({ error: 'Invalid run telemetry.' });
    }

    const rank = computeRank({
      outcome,
      score: Math.round(score),
      clearTimeSec: Math.round(clearTimeSec),
      trapsHit: Math.max(0, Math.round(trapsHit)),
      shieldRemaining: Math.max(0, Math.min(100, Math.round(shieldRemaining))),
    });

    const entry: LeaderboardEntry = {
      id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      handle,
      score: Math.round(score),
      rankCode: rank.code,
      rankTitle: rank.title,
      clearTimeSec: Math.max(1, Math.round(clearTimeSec)),
      vaultSeal: Math.round(vaultSeal),
      trapsDodged: Math.max(0, Math.round(Number.isFinite(trapsDodged) ? trapsDodged : 0)),
      packetsZapped: Math.max(0, Math.round(Number.isFinite(packetsZapped) ? packetsZapped : 0)),
      outcome,
      device,
      createdAt: new Date().toISOString(),
    };

    saveLeaderboard([...leaderboardCache, entry]);

    const placement = leaderboardCache.findIndex((item) => item.id === entry.id) + 1;

    // Broadcast updated leaderboard to connected lobby subscribers
    for (const client of lobbySubscribers) {
      sendJson(client, {
        type: 'leaderboard:updated',
        entries: leaderboardCache.slice(0, 25),
      });
    }

    return res.status(201).json({
      entry,
      placement: placement > 0 ? placement : null,
      entries: leaderboardCache.slice(0, 25),
    });
  });

  app.get('/api/matches', (_req, res) => {
    res.json({ matches: getLiveMatchSummaries() });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    lobbySubscribers.add(ws);
    sendJson(ws, { type: 'lobby:matches', matches: getLiveMatchSummaries() });

    ws.on('message', (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'lobby:subscribe': {
          lobbySubscribers.add(ws);
          sendJson(ws, { type: 'lobby:matches', matches: getLiveMatchSummaries() });
          break;
        }

        case 'match:create': {
          // Clean up any prior hosted match on this socket
          for (const [oldId, oldRoom] of activeMatches.entries()) {
            if (oldRoom.hostSocket === ws) {
              if (oldRoom.endCleanupTimer) clearTimeout(oldRoom.endCleanupTimer);
              activeMatches.delete(oldId);
            }
          }

          const matchId = generateMatchCode();
          const handle = sanitizeHandle(typeof msg.handle === 'string' ? msg.handle : 'AGENT-01');
          const device: DeviceKind = msg.device === 'mobile' ? 'mobile' : 'desktop';
          const room: LiveMatchRoom = {
            matchId,
            hostSocket: ws,
            handle,
            device,
            startedAt: Date.now(),
            lastUpdatedAt: Date.now(),
            outcome: null,
            snapshot: null,
            spectators: new Set(),
          };
          activeMatches.set(matchId, room);
          sendJson(ws, { type: 'match:created', matchId, handle });
          broadcastLobby();
          break;
        }

        case 'match:state': {
          const matchId = typeof msg.matchId === 'string' ? msg.matchId : '';
          const room = activeMatches.get(matchId);
          if (!room || room.hostSocket !== ws || !msg.snapshot) return;

          room.snapshot = msg.snapshot as SpectatorSnapshot;
          room.lastUpdatedAt = Date.now();
          if (room.snapshot.outcome) {
            room.outcome = room.snapshot.outcome;
          }

          for (const spec of room.spectators) {
            sendJson(spec, {
              type: 'spectate:state',
              matchId,
              snapshot: room.snapshot,
              spectatorCount: room.spectators.size,
            });
          }
          break;
        }

        case 'match:end': {
          const matchId = typeof msg.matchId === 'string' ? msg.matchId : '';
          const room = activeMatches.get(matchId);
          if (!room || room.hostSocket !== ws) return;

          room.outcome = msg.outcome === 'victory' ? 'victory' : 'defeat';
          if (msg.snapshot) {
            room.snapshot = msg.snapshot as SpectatorSnapshot;
          }
          for (const spec of room.spectators) {
            sendJson(spec, {
              type: 'spectate:state',
              matchId,
              snapshot: room.snapshot,
              spectatorCount: room.spectators.size,
            });
          }
          broadcastLobby();

          if (room.endCleanupTimer) clearTimeout(room.endCleanupTimer);
          room.endCleanupTimer = setTimeout(() => {
            const current = activeMatches.get(matchId);
            if (!current) return;
            for (const spec of current.spectators) {
              sendJson(spec, { type: 'spectate:ended', matchId, reason: 'match_finished' });
            }
            activeMatches.delete(matchId);
            broadcastLobby();
          }, 12000);
          break;
        }

        case 'spectate:join': {
          const requestedId =
            typeof msg.matchId === 'string' ? msg.matchId.trim().toUpperCase() : '';
          const room = activeMatches.get(requestedId);
          if (!room) {
            sendJson(ws, {
              type: 'spectate:error',
              matchId: requestedId,
              error: 'Live match not found or already ended.',
            });
            return;
          }

          // Leave any other spectated room first
          for (const [id, r] of activeMatches.entries()) {
            if (id !== requestedId && r.spectators.delete(ws)) {
              sendJson(r.hostSocket, {
                type: 'match:spectators',
                matchId: id,
                count: r.spectators.size,
              });
            }
          }

          room.spectators.add(ws);
          sendJson(ws, {
            type: 'spectate:joined',
            matchId: room.matchId,
            handle: room.handle,
            spectatorCount: room.spectators.size,
            snapshot: room.snapshot,
          });
          sendJson(room.hostSocket, {
            type: 'match:spectators',
            matchId: room.matchId,
            count: room.spectators.size,
          });
          broadcastLobby();
          break;
        }

        case 'spectate:leave': {
          const matchId = typeof msg.matchId === 'string' ? msg.matchId : '';
          const room = activeMatches.get(matchId);
          if (room && room.spectators.delete(ws)) {
            sendJson(room.hostSocket, {
              type: 'match:spectators',
              matchId,
              count: room.spectators.size,
            });
            broadcastLobby();
          }
          break;
        }

        case 'spectate:cheer': {
          const matchId = typeof msg.matchId === 'string' ? msg.matchId : '';
          const room = activeMatches.get(matchId);
          if (!room) return;

          const now = Date.now();
          const last = cheerTimestamps.get(ws) ?? 0;
          if (now - last < 900) return;
          cheerTimestamps.set(ws, now);

          const cheer = ALLOWED_CHEERS.includes(msg.cheer)
            ? (msg.cheer as CheerKind)
            : 'CLUTCH!';
          const sender = sanitizeHandle(
            typeof msg.sender === 'string' ? msg.sender : 'SPECTATOR'
          );

          const cheerEvent = {
            type: 'match:cheer',
            event: {
              id: `ch-${now}-${Math.random().toString(36).slice(2, 6)}`,
              matchId,
              cheer,
              sender,
              timestamp: now,
            },
          };

          sendJson(room.hostSocket, cheerEvent);
          for (const spec of room.spectators) {
            sendJson(spec, cheerEvent);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      removeClientFromAll(ws);
    });

    ws.on('error', () => {
      removeClientFromAll(ws);
    });
  });

  // Periodic lobby heartbeat (every 2s while active matches exist)
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, room] of activeMatches.entries()) {
      if (now - room.lastUpdatedAt > 25000) {
        activeMatches.delete(id);
        changed = true;
      }
    }
    if (activeMatches.size > 0 || changed) {
      broadcastLobby();
    }
  }, 2000);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PHISH FRENZY server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
