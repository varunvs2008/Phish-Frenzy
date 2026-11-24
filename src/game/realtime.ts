import type {
  CheerKind,
  CrowdCheerEvent,
  DeviceKind,
  LeaderboardEntry,
  LiveMatchSummary,
  MatchOutcome,
  SpectatorSnapshot,
} from './types';

type ListenerMap = {
  onLobbyMatches?: (matches: LiveMatchSummary[]) => void;
  onLeaderboardUpdated?: (entries: LeaderboardEntry[]) => void;
  onMatchCreated?: (matchId: string) => void;
  onHostSpectatorCount?: (count: number) => void;
  onSpectateJoined?: (payload: {
    matchId: string;
    handle: string;
    spectatorCount: number;
    snapshot: SpectatorSnapshot | null;
  }) => void;
  onSpectateState?: (payload: {
    matchId: string;
    snapshot: SpectatorSnapshot;
    spectatorCount: number;
  }) => void;
  onSpectateEnded?: (payload: { matchId: string; reason: string }) => void;
  onSpectateError?: (payload: { matchId: string; error: string }) => void;
  onCheer?: (event: CrowdCheerEvent) => void;
};

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners: ListenerMap = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private pendingQueue: string[] = [];

  connect(listeners: ListenerMap) {
    this.listeners = listeners;
    this.destroyed = false;
    this.openSocket();
  }

  updateListeners(listeners: ListenerMap) {
    this.listeners = { ...this.listeners, ...listeners };
  }

  private openSocket() {
    if (this.destroyed || typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'lobby:subscribe' }));
        while (this.pendingQueue.length > 0) {
          const item = this.pendingQueue.shift();
          if (item && ws.readyState === WebSocket.OPEN) {
            ws.send(item);
          }
        }
      };

      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
          case 'lobby:matches':
            this.listeners.onLobbyMatches?.(msg.matches || []);
            break;
          case 'leaderboard:updated':
            this.listeners.onLeaderboardUpdated?.(msg.entries || []);
            break;
          case 'match:created':
            this.listeners.onMatchCreated?.(msg.matchId);
            break;
          case 'match:spectators':
            this.listeners.onHostSpectatorCount?.(Number(msg.count || 0));
            break;
          case 'spectate:joined':
            this.listeners.onSpectateJoined?.({
              matchId: msg.matchId,
              handle: msg.handle,
              spectatorCount: Number(msg.spectatorCount || 1),
              snapshot: msg.snapshot || null,
            });
            break;
          case 'spectate:state':
            if (msg.snapshot) {
              this.listeners.onSpectateState?.({
                matchId: msg.matchId,
                snapshot: msg.snapshot,
                spectatorCount: Number(msg.spectatorCount || 1),
              });
            }
            break;
          case 'spectate:ended':
            this.listeners.onSpectateEnded?.({
              matchId: msg.matchId,
              reason: msg.reason || 'ended',
            });
            break;
          case 'spectate:error':
            this.listeners.onSpectateError?.({
              matchId: msg.matchId,
              error: msg.error || 'Match not found.',
            });
            break;
          case 'match:cheer':
            if (msg.event) {
              this.listeners.onCheer?.(msg.event);
            }
            break;
        }
      };

      ws.onclose = () => {
        this.ws = null;
        if (!this.destroyed) {
          this.reconnectTimer = setTimeout(() => this.openSocket(), 1800);
        }
      };

      ws.onerror = () => {
        // close event will handle reconnect
      };
    } catch {
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), 2500);
      }
    }
  }

  private send(payload: unknown) {
    const raw = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    } else {
      if (this.pendingQueue.length < 16) {
        this.pendingQueue.push(raw);
      }
    }
  }

  createMatch(handle: string, device: DeviceKind) {
    this.send({ type: 'match:create', handle, device });
  }

  sendMatchState(matchId: string, snapshot: SpectatorSnapshot) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'match:state', matchId, snapshot }));
    }
  }

  endMatch(matchId: string, outcome: MatchOutcome, snapshot: SpectatorSnapshot) {
    this.send({ type: 'match:end', matchId, outcome, snapshot });
  }

  joinSpectate(matchId: string) {
    this.send({ type: 'spectate:join', matchId });
  }

  leaveSpectate(matchId: string) {
    this.send({ type: 'spectate:leave', matchId });
  }

  sendCheer(matchId: string, cheer: CheerKind, sender: string) {
    this.send({ type: 'spectate:cheer', matchId, cheer, sender });
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
