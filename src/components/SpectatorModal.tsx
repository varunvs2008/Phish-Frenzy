import React, { useState } from 'react';
import { Eye, Monitor, Play, Smartphone, Tv, X } from 'lucide-react';
import type { LiveMatchSummary } from '../game/types';

interface SpectatorModalProps {
  matches: LiveMatchSummary[];
  errorText: string | null;
  onJoinMatch: (matchId: string) => void;
  onStartOwnShift: () => void;
  onClose: () => void;
}

export const SpectatorModal: React.FC<SpectatorModalProps> = ({
  matches,
  errorText,
  onJoinMatch,
  onStartOwnShift,
  onClose,
}) => {
  const [codeInput, setCodeInput] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) return;
    onJoinMatch(trimmed);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-[#04070D]/85">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spectate Live Matches"
        className="w-full max-w-xl max-h-[88dvh] flex flex-col rounded-2xl bg-[#070B14] border border-[#00F5D4]/40 shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Tv className="w-5 h-5 text-[#00F5D4]" />
            <h2 className="font-display text-xl font-extrabold text-[#FFFFFF]">
              Live Campus Matches
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close live matches"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0D1626] hover:bg-[#15233B] border border-white/15 text-[#E6F4F1] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Join by Match Code */}
        <form onSubmit={handleJoinSubmit} className="p-4 sm:px-5 border-b border-white/10 bg-[#0A101D]">
          <label
            htmlFor="spectate-code-input"
            className="block text-xs font-semibold uppercase tracking-wider text-[#9CB3C9] mb-1.5"
          >
            Join Friend&apos;s Match Code
          </label>
          <div className="flex gap-2">
            <input
              id="spectate-code-input"
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="e.g. VLT-4821"
              className="flex-1 min-h-[44px] px-3.5 py-2 rounded-lg bg-[#0D1626] border border-[#00F5D4]/30 text-[#E6F4F1] font-mono-num text-sm uppercase focus:outline-none focus:border-[#00F5D4]"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[#00F5D4] hover:bg-[#33FFE3] text-[#051018] font-bold text-sm whitespace-nowrap cursor-pointer"
            >
              Watch
            </button>
          </div>
          {errorText && (
            <div className="mt-2 text-xs text-[#FF7A9E] font-medium">{errorText}</div>
          )}
        </form>

        {/* Live Match List */}
        <div className="flex-1 overflow-y-auto p-4 sm:px-5">
          {matches.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-sm font-semibold text-[#E6F4F1] mb-1.5">
                No active live shifts right now
              </div>
              <p className="text-xs text-[#8CA4BA] max-w-sm mx-auto mb-5">
                Start a shift and share your Match Code or Spectate Link so friends can watch your run live on desktop or mobile.
              </p>
              <button
                type="button"
                onClick={onStartOwnShift}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#00F5D4] hover:bg-[#33FFE3] text-[#051018] font-display font-bold text-sm uppercase tracking-wider inline-flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Live Shift</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {matches.map((m) => (
                <div
                  key={m.matchId}
                  className="p-3.5 rounded-xl bg-[#0D1626] border border-white/15 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono-num font-bold text-[#FFFFFF] truncate">
                        {m.handle}
                      </span>
                      <span className="text-xs font-mono-num text-[#00F5D4]">
                        {m.matchId}
                      </span>
                      {m.device === 'mobile' ? (
                        <Smartphone className="w-3.5 h-3.5 text-[#8CA4BA]" />
                      ) : (
                        <Monitor className="w-3.5 h-3.5 text-[#8CA4BA]" />
                      )}
                    </div>
                    <div className="text-xs font-mono-num text-[#9CB3C9] flex items-center gap-2">
                      <span className="text-[#FFD166]">Vault {m.vaultSeal}%</span>
                      <span>·</span>
                      <span className={m.shield <= 25 ? 'text-[#FF2A5F]' : 'text-[#00F5D4]'}>
                        Shield {m.shield}%
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {m.spectatorCount}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onJoinMatch(m.matchId)}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-[#00F5D4] hover:bg-[#33FFE3] text-[#051018] font-bold text-xs uppercase tracking-wider whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Watch Live
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
