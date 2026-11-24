export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type MatchOutcome = 'victory' | 'defeat';

export type DeviceKind = 'desktop' | 'mobile';

export type PickupKind = 'key' | 'shield' | 'recovery' | 'trap';

export type CheerKind = 'CLUTCH!' | 'WATCH OUT!' | 'ZAP IT!' | 'GG!';

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  shield: number;
  ghostShield: number;
  pulseCooldown: number;
  pulseMaxCooldown: number;
  invulnTimer: number;
  hitFlashTimer: number;
  scaleX: number;
  scaleY: number;
  facingAngle: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
}

export interface MarauderState {
  x: number;
  y: number;
  angle: number;
  orbitDirection: 1 | -1;
  fireTimer: number;
  telegraphTimer: number;
  aimAngle: number;
  tauntText: string;
  tauntTimer: number;
  glitchPhase: number;
  hitFlashTimer: number;
}

export interface SeekerBot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  state: 'approach' | 'telegraph' | 'dash' | 'ko';
  stateTimer: number;
  dashAngle: number;
  hitFlashTimer: number;
  koTimer: number;
}

export interface ScamPacket {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  label: string;
  callout: string;
  kind: 'packet' | 'crossfire';
  age: number;
  hitFlash: number;
}

export interface PickupItem {
  id: number;
  x: number;
  y: number;
  radius: number;
  kind: PickupKind;
  label: string;
  subLabel: string;
  callout: string;
  ttl: number;
  maxTtl: number;
  bobPhase: number;
  jitterOffset: number;
}

export interface EdgePopupThreat {
  id: number;
  edge: 'top' | 'right' | 'bottom' | 'left';
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  w: number;
  h: number;
  title: string;
  cta: string;
  callout: string;
  ttl: number;
  zapped: boolean;
}

export interface ComicCallout {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: 'danger' | 'good' | 'gold' | 'storm';
  ttl: number;
  maxTtl: number;
}

export interface PulseRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  ttl: number;
  maxTtl: number;
}

export interface HudSnapshot {
  shield: number;
  ghostShield: number;
  vaultSeal: number;
  score: number;
  elapsedSec: number;
  pulseCooldown: number;
  pulseMaxCooldown: number;
  stormActive: boolean;
  stormBannerTimer: number;
  trapsDodged: number;
  trapsHit: number;
  packetsZapped: number;
  keysCollected: number;
  comebackActive: boolean;
}

export interface RunSummary {
  outcome: MatchOutcome;
  score: number;
  clearTimeSec: number;
  vaultSeal: number;
  shieldRemaining: number;
  trapsDodged: number;
  trapsHit: number;
  packetsZapped: number;
  keysCollected: number;
  rankCode: 'S' | 'A' | 'B' | 'C';
  rankTitle: string;
  handle: string;
  device: DeviceKind;
}

export interface LeaderboardEntry {
  id: string;
  handle: string;
  score: number;
  rankCode: 'S' | 'A' | 'B' | 'C';
  rankTitle: string;
  clearTimeSec: number;
  vaultSeal: number;
  trapsDodged: number;
  packetsZapped: number;
  outcome: MatchOutcome;
  device: DeviceKind;
  createdAt: string;
}

export interface LiveMatchSummary {
  matchId: string;
  handle: string;
  device: DeviceKind;
  vaultSeal: number;
  shield: number;
  score: number;
  stormActive: boolean;
  spectatorCount: number;
  startedAt: number;
  outcome: MatchOutcome | null;
}

export interface SpectatorSnapshot {
  matchId: string;
  handle: string;
  arenaW: number;
  arenaH: number;
  elapsedSec: number;
  shield: number;
  ghostShield: number;
  vaultSeal: number;
  score: number;
  stormActive: boolean;
  vaultSlamProgress: number;
  outcome: MatchOutcome | null;
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facingAngle: number;
    pulseCooldown: number;
    hitFlash: boolean;
  };
  marauder: {
    x: number;
    y: number;
    angle: number;
    telegraph: number;
    aimAngle: number;
    tauntText: string;
    tauntTimer: number;
  };
  seekers: Array<{
    x: number;
    y: number;
    state: SeekerBot['state'];
    dashAngle: number;
  }>;
  packets: Array<{
    x: number;
    y: number;
    label: string;
    kind: ScamPacket['kind'];
  }>;
  pickups: Array<{
    x: number;
    y: number;
    kind: PickupKind;
    label: string;
    subLabel: string;
  }>;
  popups: Array<{
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    cta: string;
  }>;
  pulses: Array<{
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    alpha: number;
    color: string;
  }>;
  callouts: Array<{
    x: number;
    y: number;
    text: string;
    tone: ComicCallout['tone'];
    ttl: number;
  }>;
}

export interface CrowdCheerEvent {
  id: string;
  matchId: string;
  cheer: CheerKind;
  sender: string;
  timestamp: number;
}
