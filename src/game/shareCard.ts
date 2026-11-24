import { formatDuration } from './rules';
import type { RunSummary } from './types';

export function downloadShareScorecard(summary: RunSummary) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Obsidian backdrop
  ctx.fillStyle = '#070B14';
  ctx.fillRect(0, 0, 1200, 630);

  // Subtle tactical grid
  ctx.strokeStyle = 'rgba(0, 245, 212, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1200; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  for (let y = 0; y <= 630; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  const accent = summary.outcome === 'victory' ? '#00F5D4' : '#FF2A5F';
  const gold = '#FFD166';

  // Outer cyber frame
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, 1144, 574);

  // Corner brackets
  ctx.fillStyle = accent;
  ctx.fillRect(28, 28, 42, 6);
  ctx.fillRect(28, 28, 6, 42);
  ctx.fillRect(1130, 596, 42, 6);
  ctx.fillRect(1166, 560, 6, 42);

  // Brand title
  ctx.fillStyle = '#8AA4B8';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('CAMPUS CYBER DEFENSE REPORT', 68, 86);

  ctx.fillStyle = '#E6F4F1';
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText('PHISH FRENZY: CAMPUS VAULT', 68, 146);

  // Agent handle & outcome
  ctx.fillStyle = accent;
  ctx.font = 'bold 28px monospace';
  ctx.fillText(
    `AGENT: ${summary.handle}  ·  ${
      summary.outcome === 'victory' ? 'VAULT LOCKED' : 'SHIELD BREACHED'
    }`,
    68,
    196
  );

  // Rank Banner
  ctx.fillStyle = 'rgba(13, 22, 38, 0.92)';
  ctx.fillRect(68, 232, 1064, 132);
  ctx.strokeStyle = summary.outcome === 'victory' ? gold : '#FF2A5F';
  ctx.lineWidth = 2;
  ctx.strokeRect(68, 232, 1064, 132);

  ctx.fillStyle = summary.outcome === 'victory' ? gold : '#FF2A5F';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('FINAL CLEARANCE RANK', 98, 274);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(summary.rankTitle, 98, 334);

  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.font = 'bold 62px monospace';
  ctx.fillText(summary.score.toLocaleString(), 1100, 326);
  ctx.fillStyle = '#8AA4B8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('FINAL SCORE', 1100, 266);
  ctx.textAlign = 'left';

  // 4 Stat Tiles
  const stats = [
    { label: 'VAULT SEAL', val: `${Math.round(summary.vaultSeal)}%` },
    { label: 'CLEAR TIME', val: formatDuration(summary.clearTimeSec) },
    { label: 'TRAPS DODGED', val: `${summary.trapsDodged}` },
    { label: 'PACKETS ZAPPED', val: `${summary.packetsZapped}` },
  ];

  stats.forEach((st, idx) => {
    const x = 68 + idx * 270;
    const y = 398;
    ctx.fillStyle = '#0D1626';
    ctx.fillRect(x, y, 250, 128);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, 250, 128);

    ctx.fillStyle = '#8AA4B8';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(st.label, x + 22, y + 40);

    ctx.fillStyle = '#E6F4F1';
    ctx.font = 'bold 42px monospace';
    ctx.fillText(st.val, x + 22, y + 98);
  });

  // Footer
  ctx.fillStyle = '#6E8599';
  ctx.font = '18px monospace';
  ctx.fillText('DEFEND CAMPUS.EDU · SPOT THE RED FLAG · ZAP THE SCAM', 68, 572);

  const link = document.createElement('a');
  link.download = `phish-frenzy-${summary.handle.toLowerCase()}-${summary.score}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function buildShareText(summary: RunSummary): string {
  const status =
    summary.outcome === 'victory'
      ? `locked the Campus Vault (${summary.rankTitle})`
      : `held ${Math.round(summary.vaultSeal)}% Vault Seal against the Malware Marauder`;
  return `I just ${status} in PHISH FRENZY: Campus Vault with ${summary.score.toLocaleString()} pts (${formatDuration(summary.clearTimeSec)}, ${summary.packetsZapped} scam packets zapped)! Think you can beat my run?`;
}
