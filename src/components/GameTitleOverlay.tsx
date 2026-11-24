import React from 'react';
import { Trophy, Tv, Volume2, VolumeX } from 'lucide-react';

interface GameTitleOverlayProps {
  handle: string;
  onHandleChange: (next: string) => void;
  onStart: () => void;
  onOpenLeaderboard: () => void;
  onOpenSpectate: () => void;
  liveMatchCount: number;
  muted: boolean;
  onToggleMute: () => void;
}

export const GameTitleOverlay: React.FC<GameTitleOverlayProps> = ({
  handle,
  onHandleChange,
  onStart,
  onOpenLeaderboard,
  onOpenSpectate,
  liveMatchCount,
  muted,
  onToggleMute,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-4 sm:p-8 pointer-events-none">
      {/* Top-right mute control */}
      <div className="flex justify-end pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="min-h-[44px] min-w-[44px] px-3 flex items-center gap-2 rounded-lg bg-[#0B1220]/95 border border-[#00F5D4]/30 text-[#E6F4F1] hover:border-[#00F5D4] transition-colors text-xs font-semibold whitespace-nowrap shrink-0"
        >
          {muted ? <VolumeX className="w-4 h-4 text-[#FF2A5F]" /> : <Volume2 className="w-4 h-4 text-[#00F5D4]" />}
          <span className="hidden sm:inline">{muted ? 'Muted' : 'Sound On'}</span>
        </button>
      </div>

      {/* Centered Translucent Arcade Panel */}
      <div className="my-auto mx-auto w-full max-w-xl rounded-2xl bg-[#070B14]/90 border border-[#00F5D4]/35 shadow-[0_0_50px_rgba(0,0,0,0.85)] p-5 sm:p-8 pointer-events-auto">
        {/* Bespoke inline SVG Title Emblem */}
        <div className="mb-5">
          <svg
            viewBox="0 0 520 112"
            className="w-full h-auto max-h-24"
            role="img"
            aria-label="PHISH FRENZY: Campus Vault"
          >
            <defs>
              <linearGradient id="cyberTitleGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#00F5D4" />
                <stop offset="65%" stopColor="#E6F4F1" />
                <stop offset="100%" stopColor="#FFD166" />
              </linearGradient>
            </defs>
            {/* Shield Crest Icon */}
            <path
              d="M42 16 L72 28 V54 C72 74 58 90 42 97 C26 90 12 74 12 54 V28 Z"
              fill="#0B1B24"
              stroke="#00F5D4"
              strokeWidth="3"
            />
            <path
              d="M42 32 L57 42 L42 68 L27 42 Z"
              fill="#00F5D4"
              opacity="0.9"
            />
            <circle cx="42" cy="46" r="4.5" fill="#070B14" />

            {/* Main Wordmark */}
            <text
              x="92"
              y="56"
              fill="url(#cyberTitleGrad)"
              fontFamily="Bahnschrift, DIN Alternate, Segoe UI, sans-serif"
              fontWeight="800"
              fontSize="44"
              letterSpacing="1.5"
            >
              PHISH FRENZY
            </text>
            <rect x="92" y="68" width="410" height="2" fill="#00F5D4" opacity="0.35" />
            <text
              x="92"
              y="94"
              fill="#FFD166"
              fontFamily="Cascadia Mono, SFMono-Regular, monospace"
              fontWeight="700"
              fontSize="20"
              letterSpacing="4"
            >
              CAMPUS VAULT
            </text>
          </svg>
        </div>

        {/* 3-Bullet Visual Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6 text-left">
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#0D1626] border border-[#FFD166]/30">
            <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
              <circle cx="8" cy="12" r="4.5" fill="none" stroke="#FFD166" strokeWidth="2.2" />
              <path d="M12.5 12 H21 M17 12 V16 M20 12 V15" stroke="#FFD166" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <div className="text-xs leading-snug">
              <div className="font-semibold text-[#FFD166]">Gold 2FA Keys</div>
              <div className="text-[#9CB3C9]">+12% Vault Seal</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#0D1626] border border-[#FF2A5F]/35">
            <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
              <path d="M12 3 L21 19 H3 Z" fill="none" stroke="#FF2A5F" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M12 9 V13 M12 16 V16.5" stroke="#FF2A5F" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
            <div className="text-xs leading-snug">
              <div className="font-semibold text-[#FF7A9E]">Spot Red Flags</div>
              <div className="text-[#9CB3C9]">Dodge .xyz &amp; !! traps</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#0D1626] border border-[#00F5D4]/35">
            <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="8" fill="none" stroke="#00F5D4" strokeWidth="2" strokeDasharray="4 2" />
              <circle cx="12" cy="12" r="3.5" fill="#00F5D4" />
            </svg>
            <div className="text-xs leading-snug">
              <div className="font-semibold text-[#00F5D4]">Firewall Pulse</div>
              <div className="text-[#9CB3C9]">Zap scam packets</div>
            </div>
          </div>
        </div>

        {/* Agent Callsign Input */}
        <div className="mb-5">
          <label
            htmlFor="agent-handle-input"
            className="block text-xs font-semibold uppercase tracking-wider text-[#9CB3C9] mb-1.5"
          >
            Agent Callsign (for Global Leaderboard &amp; Live Broadcast)
          </label>
          <input
            id="agent-handle-input"
            type="text"
            maxLength={16}
            value={handle}
            onChange={(e) => onHandleChange(e.target.value)}
            placeholder="AGENT-01"
            className="w-full min-h-[44px] px-3.5 py-2 rounded-lg bg-[#0D1626] border border-[#00F5D4]/30 text-[#E6F4F1] font-mono-num text-sm tracking-wider uppercase focus:outline-none focus:border-[#00F5D4]"
          />
        </div>

        {/* Primary CTA + Secondary Actions (<= 3 menu actions total) */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="w-full min-h-[52px] px-6 py-3 rounded-xl bg-[#00F5D4] hover:bg-[#33FFE3] active:scale-[0.99] text-[#051018] font-display font-extrabold text-lg tracking-wider uppercase transition-all cta-pulse whitespace-nowrap cursor-pointer"
          >
            Start Shift
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenLeaderboard();
              }}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0D1626] hover:bg-[#132036] border border-white/15 text-[#E6F4F1] text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-[#FFD166]" />
              <span>Leaderboard</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenSpectate();
              }}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0D1626] hover:bg-[#132036] border border-white/15 text-[#E6F4F1] text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Tv className="w-4 h-4 text-[#00F5D4]" />
              <span>Watch Live{liveMatchCount > 0 ? ` (${liveMatchCount})` : ''}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Single Flat Control Hint Line */}
      <div className="text-center text-xs text-[#8CA4BA] font-mono-num tracking-wide pointer-events-none">
        WASD / Arrows or Thumbstick Move · Space / Click / Tap Pulse · Esc Pause
      </div>
    </div>
  );
};
