import React, { useMemo, useState } from 'react';
import { Monitor, Smartphone, Trophy, X } from 'lucide-react';
import { formatDuration } from '../game/rules';
import type { LeaderboardEntry } from '../game/types';

interface LeaderboardModalProps {
  entries: LeaderboardEntry[];
  loading: boolean;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  entries,
  loading,
  onClose,
}) => {
  const [filter, setFilter] = useState<'all' | 'victory'>('all');

  const filtered = useMemo(() => {
    if (filter === 'victory') {
      return entries.filter((e) => e.outcome === 'victory');
    }
    return entries;
  }, [entries, filter]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-[#04070D]/85">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global Leaderboard"
        className="w-full max-w-2xl max-h-[88dvh] flex flex-col rounded-2xl bg-[#070B14] border border-[#FFD166]/40 shadow-[0_0_60px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Trophy className="w-5 h-5 text-[#FFD166]" />
            <h2 className="font-display text-xl font-extrabold text-[#FFFFFF]">
              Global Campus Leaderboard
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0D1626] hover:bg-[#15233B] border border-white/15 text-[#E6F4F1] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10 bg-[#0A101D]">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0D1626] border border-white/10">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                filter === 'all'
                  ? 'bg-[#00F5D4] text-[#051018]'
                  : 'text-[#9CB3C9] hover:text-[#E6F4F1]'
              }`}
            >
              All Runs
            </button>
            <button
              type="button"
              onClick={() => setFilter('victory')}
              className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                filter === 'victory'
                  ? 'bg-[#FFD166] text-[#051018]'
                  : 'text-[#9CB3C9] hover:text-[#E6F4F1]'
              }`}
            >
              Vault Locked Only
            </button>
          </div>

          <div className="text-xs font-mono-num text-[#8CA4BA]">
            Top {filtered.length} Defenders
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#8CA4BA]">
              Loading global rankings...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#8CA4BA]">
              No matching runs recorded yet. Start a shift to claim Rank #1!
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {filtered.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="py-3 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-7 text-center font-mono-num font-bold shrink-0 ${
                        idx === 0
                          ? 'text-[#FFD166]'
                          : idx === 1
                          ? 'text-[#00F5D4]'
                          : idx === 2
                          ? 'text-[#E6F4F1]'
                          : 'text-[#6E8599]'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num font-bold text-[#FFFFFF] truncate">
                          {entry.handle}
                        </span>
                        {entry.device === 'mobile' ? (
                          <Smartphone className="w-3.5 h-3.5 text-[#8CA4BA] shrink-0" aria-label="Mobile run" />
                        ) : (
                          <Monitor className="w-3.5 h-3.5 text-[#8CA4BA] shrink-0" aria-label="Desktop run" />
                        )}
                      </div>
                      <div className="text-xs text-[#8CA4BA] flex items-center gap-1.5 truncate">
                        <span
                          className={
                            entry.outcome === 'victory' ? 'text-[#00F5D4]' : 'text-[#FF7A9E]'
                          }
                        >
                          {entry.rankTitle}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">{entry.vaultSeal}% Seal</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">{formatDuration(entry.clearTimeSec)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono-num font-extrabold text-base text-[#00F5D4]">
                      {entry.score.toLocaleString()}
                    </div>
                    <div className="text-[11px] font-mono-num text-[#8CA4BA]">
                      {entry.packetsZapped} zapped
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
