import React from 'react';
import { ArrowLeft, Eye, Play } from 'lucide-react';
import { ALLOWED_CHEERS, formatDuration } from '../game/rules';
import type { CheerKind, CrowdCheerEvent, SpectatorSnapshot } from '../game/types';

interface SpectatorHudProps {
  matchId: string;
  hostHandle: string;
  spectatorCount: number;
  snapshot: SpectatorSnapshot | null;
  endedReason: string | null;
  cheers: CrowdCheerEvent[];
  onSendCheer: (cheer: CheerKind) => void;
  onLeave: () => void;
  onPlayOwnShift: () => void;
}

export const SpectatorHud: React.FC<SpectatorHudProps> = ({
  matchId,
  hostHandle,
  spectatorCount,
  snapshot,
  endedReason,
  cheers,
  onSendCheer,
  onLeave,
  onPlayOwnShift,
}) => {
  const shield = snapshot?.shield ?? 100;
  const vaultSeal = snapshot?.vaultSeal ?? 0;
  const score = snapshot?.score ?? 0;
  const elapsed = snapshot?.elapsedSec ?? 0;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-3 sm:p-4">
      {/* Top Bar */}
      <div className="flex items-start justify-between gap-2 sm:gap-4 w-full">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={onLeave}
            className="min-h-[44px] px-3 rounded-xl bg-[#070B14]/90 border border-white/15 hover:border-[#00F5D4] text-[#E6F4F1] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Exit Spectate</span>
          </button>
        </div>

        <div className="flex-1 max-w-md rounded-xl bg-[#070B14]/90 border border-[#00F5D4]/35 px-3.5 py-2">
          <div className="flex items-center justify-between text-xs font-mono-num mb-1">
            <span className="text-[#00F5D4] font-bold truncate">
              LIVE: {hostHandle} ({matchId})
            </span>
            <span className="flex items-center gap-1 text-[#FFD166] shrink-0">
              <Eye className="w-3.5 h-3.5" />
              {spectatorCount}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono-num text-[#9CB3C9]">
            <span>Shield: <strong className="text-[#00F5D4]">{shield}%</strong></span>
            <span>Vault: <strong className="text-[#FFD166]">{vaultSeal}%</strong></span>
            <span>Score: <strong className="text-[#FFFFFF]">{score.toLocaleString()}</strong></span>
            <span className="hidden sm:inline">{formatDuration(elapsed)}</span>
          </div>
        </div>

        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={onPlayOwnShift}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#00F5D4] hover:bg-[#33FFE3] text-[#051018] text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Play Shift</span>
          </button>
        </div>
      </div>

      {/* Ended / Outcome Banner */}
      {(endedReason || snapshot?.outcome) && (
        <div className="mx-auto my-auto max-w-sm rounded-2xl bg-[#070B14]/95 border-2 border-[#FFD166] p-5 text-center pointer-events-auto">
          <div className="text-xs font-mono-num uppercase tracking-widest text-[#00F5D4] mb-1">
            {snapshot?.outcome === 'victory'
              ? 'VAULT LOCKED'
              : snapshot?.outcome === 'defeat'
              ? 'SHIELD BREACHED'
              : 'BROADCAST ENDED'}
          </div>
          <h3 className="font-display text-xl font-extrabold text-[#FFFFFF] mb-1">
            Live Match Finished
          </h3>
          <p className="text-xs text-[#9CB3C9] mb-4">
            {hostHandle} finished with {score.toLocaleString()} pts ({vaultSeal}% Vault Seal). Jump in for your own run!
          </p>
          <button
            type="button"
            onClick={onPlayOwnShift}
            className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#00F5D4] text-[#051018] font-display font-bold uppercase text-sm cursor-pointer"
          >
            Play Your Shift
          </button>
        </div>
      )}

      {/* Cheers Ticker & Reaction Buttons */}
      <div className="mt-auto flex flex-col gap-2 items-center">
        {cheers.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {cheers.slice(-3).map((c) => (
              <span
                key={c.id}
                className="px-2.5 py-1 rounded-lg bg-[#0B1424]/90 border border-[#FFD166]/40 text-xs font-mono-num text-[#FFD166]"
              >
                {c.sender}: {c.cheer}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 pointer-events-auto">
          {ALLOWED_CHEERS.map((cheer) => (
            <button
              key={cheer}
              type="button"
              onClick={() => onSendCheer(cheer)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#070B14]/90 hover:bg-[#101C32] border border-[#00F5D4]/35 text-xs font-mono-num font-bold text-[#E6F4F1] whitespace-nowrap cursor-pointer"
            >
              {cheer}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
