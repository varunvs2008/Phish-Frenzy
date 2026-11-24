import React, { useRef, useState } from 'react';
import { Eye, Pause, Share2, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from '../game/rules';
import type { CrowdCheerEvent, HudSnapshot } from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  matchId: string;
  spectatorCount: number;
  muted: boolean;
  isTouchLayout: boolean;
  cheers: CrowdCheerEvent[];
  onToggleMute: () => void;
  onPause: () => void;
  onShareSpectate: () => void;
  onJoystickMove: (dx: number, dy: number) => void;
  onPulseTrigger: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  matchId,
  spectatorCount,
  muted,
  isTouchLayout,
  cheers,
  onToggleMute,
  onPause,
  onShareSpectate,
  onJoystickMove,
  onPulseTrigger,
}) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const activePointerId = useRef<number | null>(null);

  const handleStickStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerId.current = e.pointerId;
    updateStick(e.clientX, e.clientY);
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    updateStick(e.clientX, e.clientY);
  };

  const handleStickEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerId.current !== e.pointerId) return;
    e.stopPropagation();
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onJoystickMove(0, 0);
  };

  const updateStick = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxRadius = rect.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    onJoystickMove(dx / maxRadius, dy / maxRadius);
  };

  const pulseReady = hud.pulseCooldown <= 0.02;
  const pulseProgress = Math.max(0, Math.min(1, 1 - hud.pulseCooldown / hud.pulseMaxCooldown));

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4">
      {/* Top Perimeter HUD Bar (3 compact clusters) */}
      <div className="flex items-start justify-between gap-1.5 sm:gap-4 w-full">
        {/* Top-Left: Account Shield */}
        <div className="w-[104px] sm:w-[230px] shrink-0 rounded-xl bg-[#070B14]/90 border border-white/15 px-2 py-1.5 sm:px-3.5 sm:py-2.5">
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold tracking-wider uppercase mb-1 whitespace-nowrap">
            <span className="text-[#9CB3C9]">
              <span className="sm:hidden">Shield</span>
              <span className="hidden sm:inline">Account Shield</span>
            </span>
            <span
              className={`font-mono-num font-bold ${
                hud.shield <= 25 ? 'text-[#FF2A5F]' : 'text-[#00F5D4]'
              }`}
            >
              {hud.shield}%
            </span>
          </div>
          <div className="relative h-2.5 sm:h-3 w-full rounded-full bg-[#131C2E] overflow-hidden">
            {/* Ghost drain trail */}
            <div
              className="absolute inset-y-0 left-0 bg-[#FF2A5F]/55 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, hud.ghostShield))}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 transition-all duration-100"
              style={{
                width: `${Math.max(0, Math.min(100, hud.shield))}%`,
                backgroundColor: hud.shield <= 25 ? '#FF2A5F' : '#00F5D4',
              }}
            />
          </div>
          {hud.comebackActive && (
            <div className="mt-1 text-[9px] sm:text-[10px] font-semibold text-[#FFD166] tracking-wide truncate">
              RECOVERY KEYS
            </div>
          )}
        </div>

        {/* Top-Center: Vault Security Seal & Score */}
        <div className="flex-1 min-w-0 max-w-[340px] rounded-xl bg-[#070B14]/90 border border-[#FFD166]/35 px-2 py-1.5 sm:px-4 sm:py-2.5">
          <div className="flex items-center justify-between gap-1.5 text-[10px] sm:text-xs font-semibold tracking-wider uppercase mb-1 whitespace-nowrap">
            <span className="text-[#FFD166] truncate">
              <span className="sm:hidden">Vault</span>
              <span className="hidden sm:inline">Vault Seal</span>
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 font-mono-num shrink-0">
              <span className="text-[#E6F4F1] font-bold">{hud.vaultSeal}%</span>
              <span className="text-[#6E8599]">·</span>
              <span className="text-[#00F5D4] font-bold">{hud.score.toLocaleString()}</span>
              <span className="hidden sm:inline text-[#6E8599]">·</span>
              <span className="hidden sm:inline text-[#9CB3C9]">{formatDuration(hud.elapsedSec)}</span>
            </div>
          </div>
          <div className="relative h-2.5 sm:h-3 w-full rounded-full bg-[#131C2E] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 transition-all duration-150"
              style={{
                width: `${Math.max(0, Math.min(100, hud.vaultSeal))}%`,
                backgroundColor: hud.stormActive ? '#FF2A5F' : '#FFD166',
              }}
            />
          </div>
        </div>

        {/* Top-Right: Utility Controls + Share Spectate */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
          {matchId && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onShareSpectate();
              }}
              aria-label="Share live spectate link"
              title={`Match ${matchId} — Copy Spectate Link`}
              className="min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-[#070B14]/90 border border-[#00F5D4]/30 hover:border-[#00F5D4] text-[#E6F4F1] flex items-center gap-1.5 text-xs font-mono-num font-semibold whitespace-nowrap cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-[#00F5D4]" />
              <span className="hidden md:inline">{matchId}</span>
              {spectatorCount > 0 && (
                <span className="flex items-center gap-1 text-[#FFD166]">
                  <Eye className="w-3.5 h-3.5" />
                  {spectatorCount}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#070B14]/90 border border-white/15 hover:border-[#00F5D4] text-[#E6F4F1] flex items-center justify-center cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#FF2A5F]" /> : <Volume2 className="w-4 h-4 text-[#00F5D4]" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause game"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#070B14]/90 border border-white/15 hover:border-[#00F5D4] text-[#E6F4F1] flex items-center justify-center cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Phishing Storm Alert Banner (Top-center non-blocking) */}
      {hud.stormBannerTimer > 0 && (
        <div className="mx-auto mt-2 px-4 py-2 rounded-lg bg-[#2A0614]/95 border-2 border-[#FF2A5F] text-[#FFFFFF] font-display font-extrabold text-sm sm:text-base tracking-widest uppercase storm-banner-anim">
          PHISHING STORM DETECTED — CROSSFIRE ACTIVE
        </div>
      )}

      {/* Live Spectator Crowd Cheers Ticker */}
      {cheers.length > 0 && (
        <div className="self-end mr-2 mt-auto mb-2 flex flex-col items-end gap-1">
          {cheers.slice(-3).map((c) => (
            <div
              key={c.id}
              className="px-3 py-1 rounded-lg bg-[#0B1424]/90 border border-[#FFD166]/45 text-xs font-mono-num text-[#FFD166]"
            >
              {c.sender}: {c.cheer}
            </div>
          ))}
        </div>
      )}

      {/* Bottom Zone: Mobile Touch Controls OR Desktop Minimal Cooldown Clue */}
      {isTouchLayout ? (
        <div className="mt-auto flex items-end justify-between w-full px-1 pb-1 pointer-events-auto">
          {/* Left Thumb Virtual Joystick */}
          <div
            ref={padRef}
            onPointerDown={handleStickStart}
            onPointerMove={handleStickMove}
            onPointerUp={handleStickEnd}
            onPointerCancel={handleStickEnd}
            aria-label="Movement thumbstick"
            style={{ touchAction: 'none' }}
            className="relative w-28 h-28 rounded-full bg-[#0B1220]/75 border-2 border-[#00F5D4]/40 flex items-center justify-center"
          >
            <div
              className="w-12 h-12 rounded-full bg-[#00F5D4]/85 border-2 border-white/70 shadow-[0_0_16px_rgba(0,245,212,0.5)]"
              style={{
                transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
              }}
            />
          </div>

          {/* Right Thumb Tactile PULSE Button */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
              onPulseTrigger();
            }}
            aria-label="Firewall Pulse"
            style={{ touchAction: 'none' }}
            className={`relative w-20 h-20 rounded-full font-display font-extrabold text-sm tracking-wider uppercase flex flex-col items-center justify-center border-2 transition-transform active:scale-95 ${
              pulseReady
                ? 'bg-[#00F5D4] text-[#051018] border-white shadow-[0_0_24px_rgba(0,245,212,0.55)]'
                : 'bg-[#0D1626]/90 text-[#9CB3C9] border-[#FFD166]/50'
            }`}
          >
            <span>PULSE</span>
            {!pulseReady && (
              <span className="text-[11px] font-mono-num text-[#FFD166]">
                {hud.pulseCooldown.toFixed(1)}s
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="mt-auto flex items-center justify-between text-xs font-mono-num text-[#8CA4BA]">
          <div className="px-3 py-1.5 rounded-lg bg-[#070B14]/85 border border-white/10">
            Firewall Pulse [Space / Click]:{' '}
            <span className={pulseReady ? 'text-[#00F5D4] font-bold' : 'text-[#FFD166] font-bold'}>
              {pulseReady ? 'READY' : `${Math.round(pulseProgress * 100)}%`}
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#070B14]/85 border border-white/10">
            Dodged: <span className="text-[#E6F4F1] font-bold">{hud.trapsDodged}</span> · Zapped:{' '}
            <span className="text-[#00F5D4] font-bold">{hud.packetsZapped}</span>
          </div>
        </div>
      )}
    </div>
  );
};
