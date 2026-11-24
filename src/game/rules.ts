import type { DeviceKind, MatchOutcome, PickupKind } from './types';

export const VAULT_STORM_THRESHOLD = 75;
export const PULSE_COOLDOWN = 1.2;
export const PULSE_RADIUS = 152;
export const KEY_VAULT_GAIN = 12;
export const KEY_SCORE = 250;
export const SHIELD_ORB_GAIN = 15;
export const SHIELD_ORB_VAULT_GAIN = 5;
export const SHIELD_ORB_SCORE = 150;
export const RECOVERY_KEY_VAULT_GAIN = 14;
export const RECOVERY_KEY_SHIELD_GAIN = 18;
export const RECOVERY_KEY_SCORE = 300;
export const TRAP_SHIELD_LOSS = 20;
export const PACKET_SHIELD_LOSS = 20;
export const PACKET_ZAP_VAULT_GAIN = 3;
export const PACKET_ZAP_SCORE = 50;
export const POPUP_ZAP_VAULT_GAIN = 5;
export const POPUP_ZAP_SCORE = 120;
export const SEEKER_ZAP_VAULT_GAIN = 6;
export const SEEKER_ZAP_SCORE = 180;
export const RECOVERY_SHIELD_THRESHOLD = 25;

export const ALLOWED_CHEERS = ['CLUTCH!', 'WATCH OUT!', 'ZAP IT!', 'GG!'] as const;

export const MARAUDER_TAUNTS = [
  'CLICK FOR FREE A+!',
  'URGENT: ACCOUNT SUSPENDED!',
  'CLAIM $500 TUITION REFUND!',
  'IT DESK: RESET PASSWORD NOW!',
  'FREE EXAM KEY INSIDE!!',
  'YOUR GPA DROPPED—VERIFY!',
];

export const SCAM_PACKET_TEMPLATES: Array<{ label: string; callout: string }> = [
  { label: 'g00gle-campus.xyz', callout: "FAKE! 'g00gle' spoof link!" },
  { label: 'free-exam-key.exe', callout: "BAIT! '.exe' malware trap!" },
  { label: 'campus-l0gin.xyz', callout: "TRAP! Misspelled 'l0gin' domain!" },
  { label: 'urgent-wire.pdf', callout: "BAIT! Urgent invoice scam!" },
  { label: 'tuition-refvnd.co', callout: "FAKE! Typo 'refvnd' URL!" },
  { label: 'free-gpa-b00st.ru', callout: "SCAM! Suspicious .ru lure!" },
];

export const DECOY_TRAP_TEMPLATES: Array<{ label: string; subLabel: string; callout: string }> = [
  { label: 'FREE +500 SPEED!!', subLabel: 'claim-b00st.xyz', callout: "SCAM! Fake 'FREE SPEED!!' lure!" },
  { label: 'campus-l0gin.xyz', subLabel: 'SSO BONUS +25%', callout: "TRAP! Misspelled 'l0gin' domain!" },
  { label: 'URGENT: RESET NOW!', subLabel: 'admin-helpdesk.co', callout: "BAIT! Fake urgency panic trap!" },
  { label: 'FREE EXAM KEY!!', subLabel: 'finals-vault.exe', callout: "BAIT! 'Free Exam' urgency scam!" },
  { label: 'g00gle-campus.xyz', subLabel: '2FA BYPASS +500', callout: "FAKE! Unverified .xyz link!" },
];

export const LEGIT_KEY_TEMPLATES: Array<{ label: string; subLabel: string }> = [
  { label: '2FA KEY: campus.edu', subLabel: 'VERIFIED HARDWARE TOKEN' },
  { label: 'SSO PASS: auth.campus.edu', subLabel: 'SIGNED EDU CERTIFICATE' },
  { label: 'VAULT KEY: it.campus.edu', subLabel: 'ZERO-TRUST VERIFIED' },
];

export const EDGE_POPUP_TEMPLATES: Array<{ title: string; cta: string; callout: string }> = [
  { title: 'ACCOUNT SUSPENDED!!', cta: 'VERIFY NOW', callout: "BAIT! Fake suspension popup!" },
  { title: 'VIRUS DETECTED (9)', cta: 'SCAN FREE', callout: "SCAM! Rogue scareware popup!" },
  { title: 'GRANT EXPIRES IN 5s', cta: 'CLAIM $900', callout: "TRAP! Countdown panic bait!" },
];

export function clampDt(rawDt: number): number {
  if (!Number.isFinite(rawDt) || rawDt <= 0) return 0;
  return Math.min(rawDt, 0.05);
}

export function circleIntersects(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

export function shouldTriggerStorm(vaultSeal: number, alreadyActive: boolean): boolean {
  return !alreadyActive && vaultSeal >= VAULT_STORM_THRESHOLD;
}

export function shouldSpawnRecoveryKey(shield: number): boolean {
  return shield > 0 && shield < RECOVERY_SHIELD_THRESHOLD;
}

export interface GameplayCounters {
  shield: number;
  vaultSeal: number;
  score: number;
  trapsHit: number;
  trapsDodged: number;
  keysCollected: number;
}

export function applyPickupEffect(
  state: GameplayCounters,
  kind: PickupKind
): GameplayCounters & { event: 'key' | 'shield' | 'recovery' | 'trap' } {
  if (kind === 'key') {
    return {
      ...state,
      vaultSeal: Math.min(100, state.vaultSeal + KEY_VAULT_GAIN),
      score: state.score + KEY_SCORE,
      keysCollected: state.keysCollected + 1,
      event: 'key',
    };
  }
  if (kind === 'shield') {
    return {
      ...state,
      shield: Math.min(100, state.shield + SHIELD_ORB_GAIN),
      vaultSeal: Math.min(100, state.vaultSeal + SHIELD_ORB_VAULT_GAIN),
      score: state.score + SHIELD_ORB_SCORE,
      event: 'shield',
    };
  }
  if (kind === 'recovery') {
    return {
      ...state,
      shield: Math.min(100, state.shield + RECOVERY_KEY_SHIELD_GAIN),
      vaultSeal: Math.min(100, state.vaultSeal + RECOVERY_KEY_VAULT_GAIN),
      score: state.score + RECOVERY_KEY_SCORE,
      keysCollected: state.keysCollected + 1,
      event: 'recovery',
    };
  }
  // decoy trap
  return {
    ...state,
    shield: Math.max(0, state.shield - TRAP_SHIELD_LOSS),
    trapsHit: state.trapsHit + 1,
    event: 'trap',
  };
}

export function applyPacketZap(
  state: { vaultSeal: number; score: number; packetsZapped: number },
  packetCount: number,
  bonusMultiplier = 1
): { vaultSeal: number; score: number; packetsZapped: number } {
  if (packetCount <= 0) return state;
  const vaultGain = packetCount * PACKET_ZAP_VAULT_GAIN;
  const scoreGain = Math.round(packetCount * PACKET_ZAP_SCORE * bonusMultiplier);
  return {
    vaultSeal: Math.min(100, state.vaultSeal + vaultGain),
    score: state.score + scoreGain,
    packetsZapped: state.packetsZapped + packetCount,
  };
}

export function computeRank(params: {
  outcome: MatchOutcome;
  score: number;
  clearTimeSec: number;
  trapsHit: number;
  shieldRemaining: number;
}): { code: 'S' | 'A' | 'B' | 'C'; title: string } {
  if (params.outcome === 'defeat') {
    return { code: 'C', title: 'BREACH DETECTED' };
  }
  if (
    params.score >= 2800 &&
    params.trapsHit <= 1 &&
    params.shieldRemaining >= 50 &&
    params.clearTimeSec <= 75
  ) {
    return { code: 'S', title: 'S-RANK CYBER LEGEND' };
  }
  if (params.score >= 1800 && params.trapsHit <= 3 && params.shieldRemaining >= 25) {
    return { code: 'A', title: 'A-RANK FIREWALL PRO' };
  }
  return { code: 'B', title: 'B-RANK SURVIVOR' };
}

export function sanitizeHandle(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .slice(0, 16);
  return cleaned.length > 0 ? cleaned.toUpperCase() : 'AGENT-01';
}

export function formatDuration(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function detectDeviceKind(width: number, coarsePointer: boolean): DeviceKind {
  return coarsePointer || width < 768 ? 'mobile' : 'desktop';
}
