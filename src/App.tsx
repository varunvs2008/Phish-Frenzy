import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EndMatchModal } from './components/EndMatchModal';
import { GameHud } from './components/GameHud';
import { GameTitleOverlay } from './components/GameTitleOverlay';
import { LeaderboardModal } from './components/LeaderboardModal';
import { PauseModal } from './components/PauseModal';
import { SpectatorHud } from './components/SpectatorHud';
import { SpectatorModal } from './components/SpectatorModal';
import { SoundEngine } from './game/audio';
import { PhishFrenzyEngine } from './game/engine';
import { RealtimeClient } from './game/realtime';
import { detectDeviceKind, PULSE_COOLDOWN, sanitizeHandle } from './game/rules';
import type {
  CheerKind,
  CrowdCheerEvent,
  GameState,
  HudSnapshot,
  LeaderboardEntry,
  LiveMatchSummary,
  RunSummary,
  SpectatorSnapshot,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  shield: 100,
  ghostShield: 100,
  vaultSeal: 0,
  score: 0,
  elapsedSec: 0,
  pulseCooldown: 0,
  pulseMaxCooldown: PULSE_COOLDOWN,
  stormActive: false,
  stormBannerTimer: 0,
  trapsDodged: 0,
  trapsHit: 0,
  packetsZapped: 0,
  keysCollected: 0,
  comebackActive: false,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<PhishFrenzyEngine | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const activeMatchIdRef = useRef<string>('');
  const lastSnapshotRef = useRef<SpectatorSnapshot | null>(null);

  const [handle, setHandle] = useState<string>(() => {
    try {
      return localStorage.getItem('phish_frenzy_handle') || 'AGENT-01';
    } catch {
      return 'AGENT-01';
    }
  });

  const [gameState, setGameState] = useState<GameState>('title');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState<boolean>(false);
  const [isTouchLayout, setIsTouchLayout] = useState<boolean>(false);

  // Leaderboard & Modals
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(true);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [runPlacement, setRunPlacement] = useState<number | null>(null);
  const [submittingScore, setSubmittingScore] = useState(false);

  // Live Match & Spectator state
  const [liveMatches, setLiveMatches] = useState<LiveMatchSummary[]>([]);
  const [showSpectateModal, setShowSpectateModal] = useState(false);
  const [spectateError, setSpectateError] = useState<string | null>(null);
  const [hostMatchId, setHostMatchId] = useState('');
  const [hostSpectatorCount, setHostSpectatorCount] = useState(0);
  const [cheers, setCheers] = useState<CrowdCheerEvent[]>([]);
  const [toastText, setToastText] = useState<string | null>(null);

  // Active Spectating mode
  const [spectating, setSpectating] = useState<{
    matchId: string;
    handle: string;
    spectatorCount: number;
    snapshot: SpectatorSnapshot | null;
    endedReason: string | null;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastText(msg);
    setTimeout(() => {
      setToastText((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(Array.isArray(data.entries) ? data.entries : []);
      }
    } catch {
      // ignore offline fetch failures
    } finally {
      setLoadingLeaderboard(false);
    }
  }, []);

  // Detect touch/mobile viewport for virtual thumbstick & Pulse button
  useEffect(() => {
    const checkLayout = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
      setIsTouchLayout(coarse || window.innerWidth < 768);
    };
    checkLayout();
    window.addEventListener('resize', checkLayout);
    return () => window.removeEventListener('resize', checkLayout);
  }, []);

  const submitScoreToServer = useCallback(async (summary: RunSummary) => {
    setSubmittingScore(true);
    setRunPlacement(null);
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.entries)) {
          setLeaderboard(data.entries);
        }
        if (typeof data.placement === 'number') {
          setRunPlacement(data.placement);
        }
      }
    } catch {
      // ignore network error
    } finally {
      setSubmittingScore(false);
    }
  }, []);

  const startShift = useCallback(() => {
    const engine = engineRef.current;
    const sound = soundRef.current;
    const rt = realtimeRef.current;
    if (!engine || !sound) return;

    sound.unlock();
    const cleanHandle = sanitizeHandle(handle);
    setHandle(cleanHandle);
    try {
      localStorage.setItem('phish_frenzy_handle', cleanHandle);
    } catch {
      // ignore storage error
    }

    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const device = detectDeviceKind(window.innerWidth, coarse);

    setSpectating(null);
    setShowSpectateModal(false);
    setShowLeaderboard(false);
    setRunSummary(null);
    setRunPlacement(null);
    setCheers([]);
    setHostSpectatorCount(0);
    setHostMatchId('');
    activeMatchIdRef.current = '';

    engine.startNewGame(cleanHandle, device, '');
    rt?.createMatch(cleanHandle, device);
  }, [handle]);

  // Initialize Canvas Engine, Web Audio, and WebSocket Realtime Client once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sound = new SoundEngine();
    soundRef.current = sound;
    setMuted(sound.isMuted());

    const rt = new RealtimeClient();
    realtimeRef.current = rt;

    const engine = new PhishFrenzyEngine(canvas, sound, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onStateChange: (next) => {
        setGameState(next);
      },
      onSpectatorSnapshot: (snap) => {
        lastSnapshotRef.current = snap;
        if (activeMatchIdRef.current) {
          rt.sendMatchState(activeMatchIdRef.current, snap);
        }
      },
      onMatchEnd: (summary) => {
        setRunSummary(summary);
        if (activeMatchIdRef.current && lastSnapshotRef.current) {
          rt.endMatch(activeMatchIdRef.current, summary.outcome, {
            ...lastSnapshotRef.current,
            outcome: summary.outcome,
            vaultSlamProgress: summary.outcome === 'victory' ? 1 : 0,
            score: summary.score,
          });
        }
        submitScoreToServer(summary);
      },
    });
    engineRef.current = engine;
    engine.startLoop();

    rt.connect({
      onLobbyMatches: (matches) => setLiveMatches(matches),
      onLeaderboardUpdated: (entries) => setLeaderboard(entries),
      onMatchCreated: (matchId) => {
        activeMatchIdRef.current = matchId;
        setHostMatchId(matchId);
        engine.setMatchId(matchId);
      },
      onHostSpectatorCount: (count) => setHostSpectatorCount(count),
      onSpectateJoined: ({ matchId, handle: hostName, spectatorCount, snapshot }) => {
        setShowSpectateModal(false);
        setSpectateError(null);
        setCheers([]);
        setSpectating({
          matchId,
          handle: hostName,
          spectatorCount,
          snapshot,
          endedReason: null,
        });
        engine.enterSpectatorMode(snapshot);
      },
      onSpectateState: ({ matchId, snapshot, spectatorCount }) => {
        setSpectating((prev) =>
          prev && prev.matchId === matchId
            ? { ...prev, snapshot, spectatorCount }
            : prev
        );
        engine.applySpectatorSnapshot(snapshot);
      },
      onSpectateEnded: ({ matchId, reason }) => {
        setSpectating((prev) =>
          prev && prev.matchId === matchId ? { ...prev, endedReason: reason } : prev
        );
      },
      onSpectateError: ({ error }) => {
        setSpectateError(error);
      },
      onCheer: (event) => {
        setCheers((prev) => [...prev.slice(-5), event]);
      },
    });

    fetchLeaderboard();

    // Check URL params (?autostart=1 or ?spectate=VLT-XXXX)
    const params = new URLSearchParams(window.location.search);
    const spectateCode = params.get('spectate');
    if (spectateCode) {
      rt.joinSpectate(spectateCode.trim().toUpperCase());
    } else if (params.get('autostart') === '1') {
      const clean = sanitizeHandle(localStorage.getItem('phish_frenzy_handle') || 'AGENT-01');
      const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
      const device = detectDeviceKind(window.innerWidth, coarse);
      engine.startNewGame(clean, device, '');
      rt.createMatch(clean, device);
    }

    return () => {
      engine.destroy();
      rt.destroy();
    };
  }, [fetchLeaderboard, submitScoreToServer]);

  // Global keyboard shortcuts (Enter/Space on Title/GameOver, Esc/P Pause, M Mute, R Restart)
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Enter' && gameState === 'title' && !showSpectateModal && !showLeaderboard) {
          e.preventDefault();
          startShift();
        }
        return;
      }

      if (showLeaderboard || showSpectateModal) {
        if (e.key === 'Escape') {
          setShowLeaderboard(false);
          setShowSpectateModal(false);
        }
        return;
      }

      if (spectating) return;

      if (gameState === 'title' && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startShift();
        return;
      }

      if (gameState === 'gameover' && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        startShift();
        return;
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (gameState === 'playing') {
          engineRef.current?.setPaused(true);
        } else if (gameState === 'paused') {
          engineRef.current?.setPaused(false);
        }
      } else if (e.key === 'm' || e.key === 'M') {
        if (soundRef.current) {
          setMuted(soundRef.current.toggleMute());
        }
      } else if ((e.key === 'r' || e.key === 'R') && (gameState === 'playing' || gameState === 'paused')) {
        startShift();
      }
    };

    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, [gameState, showLeaderboard, showSpectateModal, spectating, startShift]);

  const handleToggleMute = () => {
    if (!soundRef.current) return;
    soundRef.current.unlock();
    setMuted(soundRef.current.toggleMute());
  };

  const handleShareSpectateLink = async () => {
    if (!hostMatchId) return;
    const url = `${window.location.origin}/?spectate=${encodeURIComponent(hostMatchId)}`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Watch me play PHISH FRENZY: Campus Vault Live!',
          text: `Watch my live Campus Vault defense (Code: ${hostMatchId})`,
          url,
        });
        return;
      } catch {
        // fallback to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Live Spectate Link Copied (${hostMatchId})`);
    } catch {
      showToast(`Match Code: ${hostMatchId}`);
    }
  };

  const handleReturnTitle = () => {
    if (spectating) {
      realtimeRef.current?.leaveSpectate(spectating.matchId);
      setSpectating(null);
    }
    setRunSummary(null);
    engineRef.current?.returnToTitle();
  };

  const handleSendCheer = (cheer: CheerKind) => {
    if (!spectating) return;
    realtimeRef.current?.sendCheer(spectating.matchId, cheer, handle);
  };

  return (
    <main className="relative w-screen h-[100dvh] overflow-hidden bg-[#070B14]">
      {/* Isolated Full-Viewport 2D Canvas Container */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            engineRef.current?.handleCanvasPointerDown(
              e.clientX,
              e.clientY,
              e.pointerType === 'touch'
            );
          }}
          onPointerMove={(e) => {
            engineRef.current?.handleCanvasPointerMove(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            engineRef.current?.handleCanvasPointerUp();
          }}
          onPointerCancel={() => {
            engineRef.current?.handleCanvasPointerUp();
          }}
          className="block w-full h-full"
        />
      </div>

      {/* Title Screen */}
      {gameState === 'title' && !spectating && (
        <GameTitleOverlay
          handle={handle}
          onHandleChange={setHandle}
          onStart={startShift}
          onOpenLeaderboard={() => {
            fetchLeaderboard();
            setShowLeaderboard(true);
          }}
          onOpenSpectate={() => {
            setSpectateError(null);
            setShowSpectateModal(true);
          }}
          liveMatchCount={liveMatches.length}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Active Playing HUD */}
      {gameState === 'playing' && !spectating && (
        <GameHud
          hud={hud}
          matchId={hostMatchId}
          spectatorCount={hostSpectatorCount}
          muted={muted}
          isTouchLayout={isTouchLayout}
          cheers={cheers}
          onToggleMute={handleToggleMute}
          onPause={() => engineRef.current?.setPaused(true)}
          onShareSpectate={handleShareSpectateLink}
          onJoystickMove={(dx, dy) => engineRef.current?.setJoystickVector(dx, dy)}
          onPulseTrigger={() => engineRef.current?.triggerFirewallPulse()}
        />
      )}

      {/* Live Spectator HUD */}
      {spectating && (
        <SpectatorHud
          matchId={spectating.matchId}
          hostHandle={spectating.handle}
          spectatorCount={spectating.spectatorCount}
          snapshot={spectating.snapshot}
          endedReason={spectating.endedReason}
          cheers={cheers}
          onSendCheer={handleSendCheer}
          onLeave={handleReturnTitle}
          onPlayOwnShift={startShift}
        />
      )}

      {/* Pause Modal */}
      {gameState === 'paused' && !spectating && (
        <PauseModal
          muted={muted}
          onResume={() => engineRef.current?.setPaused(false)}
          onRestart={startShift}
          onToggleMute={handleToggleMute}
          onExitTitle={handleReturnTitle}
        />
      )}

      {/* Victory / Game Over Modal */}
      {gameState === 'gameover' && runSummary && !spectating && (
        <EndMatchModal
          summary={runSummary}
          placement={runPlacement}
          submittingScore={submittingScore}
          onPlayAgain={startShift}
          onOpenLeaderboard={() => {
            fetchLeaderboard();
            setShowLeaderboard(true);
          }}
          onReturnTitle={handleReturnTitle}
        />
      )}

      {/* Global Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          entries={leaderboard}
          loading={loadingLeaderboard}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {/* Live Spectator Lobby Modal */}
      {showSpectateModal && (
        <SpectatorModal
          matches={liveMatches}
          errorText={spectateError}
          onJoinMatch={(matchId) => {
            setSpectateError(null);
            realtimeRef.current?.joinSpectate(matchId);
          }}
          onStartOwnShift={startShift}
          onClose={() => setShowSpectateModal(false)}
        />
      )}

      {/* Non-intrusive inline Toast Feedback */}
      {toastText && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#0B1424] border border-[#00F5D4] text-xs font-mono-num text-[#E6F4F1] shadow-lg"
        >
          {toastText}
        </div>
      )}
    </main>
  );
}
