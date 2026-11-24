import React from 'react';
import { Home, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

interface PauseModalProps {
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onToggleMute: () => void;
  onExitTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  muted,
  onResume,
  onRestart,
  onToggleMute,
  onExitTitle,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#04070D]/80">
      <div className="w-full max-w-sm rounded-2xl bg-[#070B14]/95 border border-[#00F5D4]/40 p-6 shadow-[0_0_50px_rgba(0,0,0,0.85)]">
        <h2 className="font-display text-2xl font-extrabold text-[#FFFFFF] tracking-wide mb-1">
          Shift Paused
        </h2>
        <p className="text-xs text-[#9CB3C9] mb-5">
          Campus Vault defense frozen. Resume when ready.
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-[#00F5D4] hover:bg-[#33FFE3] text-[#051018] font-display font-extrabold text-base tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Resume</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0D1626] hover:bg-[#14223B] border border-white/15 text-sm font-semibold text-[#E6F4F1] flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-[#FFD166]" />
            <span>Restart Shift</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0D1626] hover:bg-[#14223B] border border-white/15 text-sm font-semibold text-[#E6F4F1] flex items-center justify-center gap-2 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#FF2A5F]" /> : <Volume2 className="w-4 h-4 text-[#00F5D4]" />}
            <span>{muted ? 'Unmute Audio' : 'Mute Audio'}</span>
          </button>

          <button
            type="button"
            onClick={onExitTitle}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0D1626] hover:bg-[#14223B] border border-white/15 text-sm font-semibold text-[#9CB3C9] hover:text-[#E6F4F1] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>Exit to Title</span>
          </button>
        </div>
      </div>
    </div>
  );
};
