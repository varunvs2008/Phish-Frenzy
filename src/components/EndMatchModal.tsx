import React, { useState } from 'react';
import { Check, Copy, Download, RotateCcw, Share2, Trophy } from 'lucide-react';
import { formatDuration } from '../game/rules';
import { buildShareText, downloadShareScorecard } from '../game/shareCard';
import type { RunSummary } from '../game/types';

interface EndMatchModalProps {
  summary: RunSummary;
  placement: number | null;
  submittingScore: boolean;
  onPlayAgain: () => void;
  onOpenLeaderboard: () => void;
  onReturnTitle: () => void;
}

export const EndMatchModal: React.FC<EndMatchModalProps> = ({
  summary,
  placement,
  submittingScore,
  onPlayAgain,
  onOpenLeaderboard,
  onReturnTitle,
}) => {
  const [copied, setCopied] = useState(false);

  const isVictory = summary.outcome === 'victory';
  const shareText = buildShareText(summary);
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const xShareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  const handleNativeOrCopyShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'PHISH FRENZY: Campus Vault',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy if user dismissed native sheet
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#04070D]/80">
      <div
        className={`w-full max-w-lg rounded-2xl bg-[#070B14]/95 border-2 p-5 sm:p-7 shadow-[0_0_60px_rgba(0,0,0,0.9)] ${
          isVictory ? 'border-[#00F5D4]' : 'border-[#FF2A5F]'
        }`}
      >
        {/* Header Status */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div
              className={`text-xs font-mono-num font-bold uppercase tracking-widest mb-1 ${
                isVictory ? 'text-[#00F5D4]' : 'text-[#FF2A5F]'
              }`}
            >
              {isVictory ? 'GRAND CAMPUS VAULT LOCKED' : 'ACCOUNT SHIELD BREACHED'}
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#FFFFFF] tracking-tight">
              {summary.rankTitle}
            </h2>
          </div>

          <div
            className={`px-3.5 py-2 rounded-xl border text-center shrink-0 ${
              isVictory
                ? 'bg-[#092226] border-[#FFD166]/60 text-[#FFD166]'
                : 'bg-[#260714] border-[#FF2A5F]/60 text-[#FF7A9E]'
            }`}
          >
            <div className="text-[10px] font-mono-num uppercase">Score</div>
            <div className="text-xl sm:text-2xl font-mono-num font-extrabold">
              {summary.score.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Global Leaderboard Placement Banner */}
        <div className="mb-4 px-3.5 py-2 rounded-lg bg-[#0D1626] border border-white/10 flex items-center justify-between text-xs font-mono-num">
          <span className="text-[#9CB3C9]">
            Agent <span className="text-[#E6F4F1] font-bold">{summary.handle}</span>
          </span>
          <span className="text-[#FFD166] font-bold">
            {submittingScore
              ? 'Saving to Global Board...'
              : placement
              ? `Global Rank #${placement}`
              : 'Synced to Global Board'}
          </span>
        </div>

        {/* 4 Mastery / Progress Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          <div className="p-3 rounded-xl bg-[#0D1626] border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-[#8CA4BA]">Vault Seal</div>
            <div className="text-lg font-mono-num font-bold text-[#FFD166]">{summary.vaultSeal}%</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0D1626] border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-[#8CA4BA]">Time</div>
            <div className="text-lg font-mono-num font-bold text-[#E6F4F1]">
              {formatDuration(summary.clearTimeSec)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#0D1626] border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-[#8CA4BA]">Traps Dodged</div>
            <div className="text-lg font-mono-num font-bold text-[#00F5D4]">{summary.trapsDodged}</div>
          </div>
          <div className="p-3 rounded-xl bg-[#0D1626] border border-white/10">
            <div className="text-[10px] uppercase tracking-wider text-[#8CA4BA]">Packets Zapped</div>
            <div className="text-lg font-mono-num font-bold text-[#00F5D4]">{summary.packetsZapped}</div>
          </div>
        </div>

        {/* Social Sharing Integration */}
        <div className="mb-5 p-3.5 rounded-xl bg-[#0B1220] border border-white/10">
          <div className="text-xs font-semibold text-[#9CB3C9] mb-2.5">
            Share Your Campus Vault Scorecard
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleNativeOrCopyShare}
              className="min-h-[44px] px-2.5 py-2 rounded-lg bg-[#111E33] hover:bg-[#172945] border border-white/15 text-xs font-semibold text-[#E6F4F1] flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#00F5D4]" /> : <Share2 className="w-3.5 h-3.5 text-[#00F5D4]" />}
              <span>{copied ? 'Copied!' : 'Share'}</span>
            </button>

            <button
              type="button"
              onClick={() => downloadShareScorecard(summary)}
              className="min-h-[44px] px-2.5 py-2 rounded-lg bg-[#111E33] hover:bg-[#172945] border border-white/15 text-xs font-semibold text-[#E6F4F1] flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#FFD166]" />
              <span>Save Card</span>
            </button>

            <a
              href={xShareHref}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-2.5 py-2 rounded-lg bg-[#111E33] hover:bg-[#172945] border border-white/15 text-xs font-semibold text-[#E6F4F1] flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5 text-[#9CB3C9]" />
              <span>Post on X</span>
            </a>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onPlayAgain();
            }}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#00F5D4] hover:bg-[#33FFE3] text-[#051018] font-display font-extrabold text-base tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Play Again</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onOpenLeaderboard}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0D1626] hover:bg-[#14223B] border border-white/15 text-xs sm:text-sm font-semibold text-[#E6F4F1] flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-[#FFD166]" />
              <span>Leaderboard</span>
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0D1626] hover:bg-[#14223B] border border-white/15 text-xs sm:text-sm font-semibold text-[#9CB3C9] hover:text-[#E6F4F1] whitespace-nowrap cursor-pointer"
            >
              Title Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
