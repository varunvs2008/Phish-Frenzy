import { SoundEngine } from './audio';
import {
  applyPacketZap,
  applyPickupEffect,
  circleIntersects,
  clampDt,
  computeRank,
  DECOY_TRAP_TEMPLATES,
  EDGE_POPUP_TEMPLATES,
  LEGIT_KEY_TEMPLATES,
  MARAUDER_TAUNTS,
  PACKET_SHIELD_LOSS,
  POPUP_ZAP_SCORE,
  POPUP_ZAP_VAULT_GAIN,
  PULSE_COOLDOWN,
  PULSE_RADIUS,
  SCAM_PACKET_TEMPLATES,
  SEEKER_ZAP_SCORE,
  SEEKER_ZAP_VAULT_GAIN,
  shouldSpawnRecoveryKey,
  shouldTriggerStorm,
} from './rules';
import type {
  ComicCallout,
  DeviceKind,
  EdgePopupThreat,
  GameState,
  HudSnapshot,
  MarauderState,
  MatchOutcome,
  Particle,
  PickupItem,
  PlayerState,
  PulseRing,
  RunSummary,
  ScamPacket,
  SeekerBot,
  SpectatorSnapshot,
} from './types';

const MAX_PARTICLES = 220;

interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onMatchEnd: (summary: RunSummary) => void;
  onStateChange?: (state: GameState) => void;
  onSpectatorSnapshot?: (snapshot: SpectatorSnapshot) => void;
}

export class PhishFrenzyEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sound: SoundEngine;
  private callbacks: EngineCallbacks;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private resizeObserver: ResizeObserver | null = null;
  private viewW = 1200;
  private viewH = 800;
  private arenaW = 1040;
  private arenaH = 680;
  private dpr = 1;

  private gameState: GameState = 'title';
  private mode: 'play' | 'spectate' = 'play';
  private matchId = '';
  private handle = 'AGENT-01';
  private device: DeviceKind = 'desktop';

  // Input state
  private keysHeld = new Set<string>();
  private joystickVec = { x: 0, y: 0 };
  private pointerDragActive = false;
  private pointerWorld = { x: 0, y: 0 };
  private pulseBufferedTimer = 0;

  // Sim timers & juice
  private hitstopTimer = 0;
  private shakeTrauma = 0;
  private crimsonFlashAlpha = 0;
  private stormBannerTimer = 0;
  private vaultSlamTimer = 0;
  private defeatBeatTimer = 0;
  private endingOutcome: MatchOutcome | null = null;
  private spectateSendAccum = 0;
  private hudSyncAccum = 0;

  // Gameplay counters
  private vaultSeal = 0;
  private score = 0;
  private elapsedSec = 0;
  private stormActive = false;
  private trapsDodged = 0;
  private trapsHit = 0;
  private packetsZapped = 0;
  private keysCollected = 0;

  // Spawners
  private nextEntityId = 1;
  private pickupSpawnTimer = 1.2;
  private decoySpawnTimer = 2.6;
  private seekerSpawnTimer = 6.5;
  private popupSpawnTimer = 4.0;
  private recoveryCooldownTimer = 0;

  // Entities
  private player!: PlayerState;
  private marauder!: MarauderState;
  private seekers: SeekerBot[] = [];
  private packets: ScamPacket[] = [];
  private pickups: PickupItem[] = [];
  private popups: EdgePopupThreat[] = [];
  private callouts: ComicCallout[] = [];
  private pulses: PulseRing[] = [];
  private particles: Particle[] = [];
  private particleCursor = 0;

  // Spectator state
  private spectatorSnapshot: SpectatorSnapshot | null = null;
  private spectatorAnimTime = 0;

  constructor(
    canvas: HTMLCanvasElement,
    sound: SoundEngine,
    callbacks: EngineCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D Canvas context unavailable');
    }
    this.ctx = context;
    this.sound = sound;
    this.callbacks = callbacks;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        color: '#00F5D4',
        ttl: 0,
        maxTtl: 0.4,
      });
    }

    this.updateViewportSize();
    this.resetWorldEntities();
    this.bindEvents();
  }

  private updateViewportSize() {
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(320, rect.width || window.innerWidth);
    this.viewH = Math.max(320, rect.height || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);

    // Responsive logical arena dimensions so both landscape laptops and portrait phones fill screen
    const isPortrait = this.viewH > this.viewW * 1.05;
    if (isPortrait) {
      this.arenaW = 640;
      this.arenaH = 920;
    } else {
      this.arenaW = 1080;
      this.arenaH = 680;
    }
  }

  private getArenaTransform() {
    const padX = this.viewW < 640 ? 12 : 28;
    const padTop = this.viewW < 640 ? 78 : 84;
    const padBottom = this.viewW < 640 ? 112 : 34;

    const availW = Math.max(200, this.viewW - padX * 2);
    const availH = Math.max(200, this.viewH - padTop - padBottom);

    const targetW = this.mode === 'spectate' && this.spectatorSnapshot
      ? this.spectatorSnapshot.arenaW
      : this.arenaW;
    const targetH = this.mode === 'spectate' && this.spectatorSnapshot
      ? this.spectatorSnapshot.arenaH
      : this.arenaH;

    const scale = Math.min(availW / targetW, availH / targetH);
    const drawW = targetW * scale;
    const drawH = targetH * scale;
    const offsetX = (this.viewW - drawW) * 0.5;
    const offsetY = padTop + (availH - drawH) * 0.5;

    return { scale, offsetX, offsetY, targetW, targetH };
  }

  public screenToWorld(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = this.getArenaTransform();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - offsetX) / scale,
      y: (sy - offsetY) / scale,
    };
  }

  private resetWorldEntities() {
    this.player = {
      x: this.arenaW * 0.5,
      y: this.arenaH * 0.55,
      vx: 0,
      vy: 0,
      radius: 19,
      shield: 100,
      ghostShield: 100,
      pulseCooldown: 0,
      pulseMaxCooldown: PULSE_COOLDOWN,
      invulnTimer: 0,
      hitFlashTimer: 0,
      scaleX: 1,
      scaleY: 1,
      facingAngle: -Math.PI / 2,
      trail: [],
    };

    this.marauder = {
      x: this.arenaW * 0.5,
      y: 44,
      angle: -Math.PI / 2,
      orbitDirection: 1,
      fireTimer: 1.4,
      telegraphTimer: 0,
      aimAngle: Math.PI / 2,
      tauntText: MARAUDER_TAUNTS[0],
      tauntTimer: 2.8,
      glitchPhase: 0,
      hitFlashTimer: 0,
    };

    this.seekers = [];
    this.packets = [];
    this.pickups = [];
    this.popups = [];
    this.callouts = [];
    this.pulses = [];
    for (const p of this.particles) p.active = false;

    this.vaultSeal = 0;
    this.score = 0;
    this.elapsedSec = 0;
    this.stormActive = false;
    this.stormBannerTimer = 0;
    this.vaultSlamTimer = 0;
    this.defeatBeatTimer = 0;
    this.endingOutcome = null;
    this.hitstopTimer = 0;
    this.shakeTrauma = 0;
    this.crimsonFlashAlpha = 0;
    this.trapsDodged = 0;
    this.trapsHit = 0;
    this.packetsZapped = 0;
    this.keysCollected = 0;

    this.pickupSpawnTimer = 0.8;
    this.decoySpawnTimer = 2.4;
    this.seekerSpawnTimer = 6.0;
    this.popupSpawnTimer = 3.0;
    this.recoveryCooldownTimer = 0;
    this.pulseBufferedTimer = 0;

    // Spawn an immediate starter 2FA Gold Key so player has a clear objective on frame 1
    this.spawnPickup('key');
  }

  private bindEvents() {
    this.resizeObserver = new ResizeObserver(() => {
      this.updateViewportSize();
    });
    this.resizeObserver.observe(this.canvas);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  public destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private onWindowBlur = () => {
    this.clearInputs();
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.clearInputs();
    }
  };

  public clearInputs() {
    this.keysHeld.clear();
    this.pointerDragActive = false;
    this.joystickVec.x = 0;
    this.joystickVec.y = 0;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const code = e.code;
    if (
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'Space'
    ) {
      e.preventDefault();
    }

    if (this.mode === 'spectate') return;

    if (this.gameState === 'playing') {
      this.sound.unlock();
      if (!this.keysHeld.has(code) && code === 'Space') {
        this.triggerFirewallPulse();
      }
      this.keysHeld.add(code);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  public handleCanvasPointerDown = (clientX: number, clientY: number, isTouch: boolean) => {
    if (this.mode !== 'play' || this.gameState !== 'playing') return;
    this.sound.unlock();
    if (!isTouch) {
      // Desktop click anywhere fires Firewall Pulse immediately
      this.triggerFirewallPulse();
    } else {
      this.pointerWorld = this.screenToWorld(clientX, clientY);
      this.pointerDragActive = true;
    }
  };

  public handleCanvasPointerMove = (clientX: number, clientY: number) => {
    if (!this.pointerDragActive || this.mode !== 'play' || this.gameState !== 'playing') return;
    this.pointerWorld = this.screenToWorld(clientX, clientY);
  };

  public handleCanvasPointerUp = () => {
    this.pointerDragActive = false;
  };

  public setJoystickVector(dx: number, dy: number) {
    this.joystickVec.x = dx;
    this.joystickVec.y = dy;
  }

  public triggerFirewallPulse() {
    if (this.mode !== 'play' || this.gameState !== 'playing' || this.endingOutcome) return;
    this.sound.unlock();
    if (this.player.pulseCooldown <= 0) {
      this.executeFirewallPulse();
    } else {
      // 120ms input buffering
      this.pulseBufferedTimer = 0.12;
    }
  }

  private executeFirewallPulse() {
    this.player.pulseCooldown = this.player.pulseMaxCooldown;
    this.pulseBufferedTimer = 0;
    this.player.scaleX = 1.26;
    this.player.scaleY = 0.78;
    this.sound.playPulse();

    this.pulses.push({
      x: this.player.x,
      y: this.player.y,
      radius: 16,
      maxRadius: PULSE_RADIUS,
      alpha: 1,
      color: '#00F5D4',
    });

    this.emitParticles(this.player.x, this.player.y, 12, '#00F5D4', 240);

    // Zap scam packets inside PULSE_RADIUS
    let zappedPackets = 0;
    const remainingPackets: ScamPacket[] = [];
    for (const pkt of this.packets) {
      if (circleIntersects(this.player.x, this.player.y, PULSE_RADIUS, pkt.x, pkt.y, pkt.radius)) {
        zappedPackets += 1;
        this.emitParticles(pkt.x, pkt.y, 10, '#00F5D4', 210);
      } else {
        remainingPackets.push(pkt);
      }
    }
    this.packets = remainingPackets;

    if (zappedPackets > 0) {
      const updated = applyPacketZap(
        {
          vaultSeal: this.vaultSeal,
          score: this.score,
          packetsZapped: this.packetsZapped,
        },
        zappedPackets,
        this.stormActive ? 1.25 : 1
      );
      this.vaultSeal = updated.vaultSeal;
      this.score = updated.score;
      this.packetsZapped = updated.packetsZapped;
      this.sound.playZapPacket(zappedPackets);
      this.addCallout(
        this.player.x,
        this.player.y - 38,
        zappedPackets > 1 ? `MULTI-ZAP x${zappedPackets}! +${zappedPackets * 3}%` : 'ZAPPED! +3% SEAL',
        'good'
      );
      this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.18);
    }

    // Zap nearby Phish-Seeker bots
    for (const bot of this.seekers) {
      if (bot.state !== 'ko' && circleIntersects(this.player.x, this.player.y, PULSE_RADIUS, bot.x, bot.y, bot.radius)) {
        bot.state = 'ko';
        bot.koTimer = 0.35;
        bot.hitFlashTimer = 0.08;
        this.vaultSeal = Math.min(100, this.vaultSeal + SEEKER_ZAP_VAULT_GAIN);
        this.score += SEEKER_ZAP_SCORE;
        this.packetsZapped += 1;
        this.emitParticles(bot.x, bot.y, 16, '#FFD166', 260);
        this.sound.playZapPacket(3);
        this.addCallout(bot.x, bot.y - 24, 'BOT FIREWALLED! +6%', 'gold');
        this.hitstopTimer = Math.max(this.hitstopTimer, 0.035);
      }
    }

    // Zap edge popup threats during Phishing Storm
    for (const pop of this.popups) {
      if (!pop.zapped) {
        const cx = pop.x + pop.w * 0.5;
        const cy = pop.y + pop.h * 0.5;
        if (circleIntersects(this.player.x, this.player.y, PULSE_RADIUS, cx, cy, pop.w * 0.45)) {
          pop.zapped = true;
          this.vaultSeal = Math.min(100, this.vaultSeal + POPUP_ZAP_VAULT_GAIN);
          this.score += POPUP_ZAP_SCORE;
          this.packetsZapped += 1;
          this.emitParticles(cx, cy, 14, '#00F5D4', 240);
          this.addCallout(cx, cy - 22, 'POPUP BLOCKED! +5%', 'good');
        }
      }
    }
    this.popups = this.popups.filter((p) => !p.zapped);

    this.checkStormAndOutcome();
  }

  private frozenFrameRendered = false;

  public startLoop() {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = clampDt(rawDt);

      const isFrozen =
        this.mode === 'play' &&
        (this.gameState === 'paused' || this.gameState === 'gameover');

      if (!isFrozen) {
        this.frozenFrameRendered = false;
        this.update(dt);
        this.render();
      } else if (!this.frozenFrameRendered) {
        this.render();
        this.frozenFrameRendered = true;
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public startNewGame(handle: string, device: DeviceKind, matchId: string) {
    this.mode = 'play';
    this.spectatorSnapshot = null;
    this.handle = handle;
    this.device = device;
    this.matchId = matchId;
    this.updateViewportSize();
    this.resetWorldEntities();
    this.clearInputs();
    this.gameState = 'playing';
    document.body.dataset.state = 'playing';
    this.callbacks.onStateChange?.('playing');
    this.syncHudImmediate();
  }

  public setMatchId(matchId: string) {
    this.matchId = matchId;
  }

  public setPaused(paused: boolean) {
    if (this.mode !== 'play') return;
    if (paused && this.gameState === 'playing' && !this.endingOutcome) {
      this.gameState = 'paused';
      document.body.dataset.state = 'paused';
      this.clearInputs();
      this.callbacks.onStateChange?.('paused');
    } else if (!paused && this.gameState === 'paused') {
      this.gameState = 'playing';
      document.body.dataset.state = 'playing';
      this.clearInputs();
      this.callbacks.onStateChange?.('playing');
    }
  }

  public returnToTitle() {
    this.mode = 'play';
    this.spectatorSnapshot = null;
    this.gameState = 'title';
    document.body.dataset.state = 'title';
    this.resetWorldEntities();
    this.clearInputs();
    this.callbacks.onStateChange?.('title');
  }

  public enterSpectatorMode(snapshot: SpectatorSnapshot | null) {
    this.mode = 'spectate';
    this.spectatorSnapshot = snapshot;
    this.gameState = 'playing';
    document.body.dataset.state = 'playing';
    this.clearInputs();
  }

  public applySpectatorSnapshot(snapshot: SpectatorSnapshot) {
    if (this.mode !== 'spectate') return;
    this.spectatorSnapshot = snapshot;
  }

  public getGameState(): GameState {
    return this.gameState;
  }

  private syncHudImmediate() {
    this.callbacks.onHudUpdate({
      shield: Math.round(this.player.shield),
      ghostShield: Math.round(this.player.ghostShield),
      vaultSeal: Math.round(this.vaultSeal),
      score: Math.round(this.score),
      elapsedSec: Math.floor(this.elapsedSec),
      pulseCooldown: this.player.pulseCooldown,
      pulseMaxCooldown: this.player.pulseMaxCooldown,
      stormActive: this.stormActive,
      stormBannerTimer: this.stormBannerTimer,
      trapsDodged: this.trapsDodged,
      trapsHit: this.trapsHit,
      packetsZapped: this.packetsZapped,
      keysCollected: this.keysCollected,
      comebackActive: shouldSpawnRecoveryKey(this.player.shield),
    });
  }

  private update(dt: number) {
    if (this.mode === 'spectate') {
      this.spectatorAnimTime += dt;
      return;
    }

    if (this.gameState === 'title') {
      this.updateTitleShowcase(dt);
      return;
    }

    if (this.gameState !== 'playing') {
      return;
    }

    // Visual-only effects always tick in real dt even during hitstop
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.6);
    this.crimsonFlashAlpha = Math.max(0, this.crimsonFlashAlpha - dt * 3.1);
    this.stormBannerTimer = Math.max(0, this.stormBannerTimer - dt);
    this.player.ghostShield += (this.player.shield - this.player.ghostShield) * Math.min(1, dt * 4.5);
    this.updateParticles(dt);
    this.updatePulses(dt);
    this.updateCallouts(dt);

    // Victory Vault Slam cinematic sequence
    if (this.endingOutcome === 'victory') {
      this.vaultSlamTimer += dt;
      this.broadcastSpectatorSnapshot();
      if (this.vaultSlamTimer >= 0.95) {
        this.finalizeMatch('victory');
      }
      return;
    }

    // Defeat shatter beat
    if (this.endingOutcome === 'defeat') {
      this.defeatBeatTimer += dt;
      this.broadcastSpectatorSnapshot();
      if (this.defeatBeatTimer >= 0.55) {
        this.finalizeMatch('defeat');
      }
      return;
    }

    // Sim hitstop freeze
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    this.elapsedSec += dt;
    this.sound.tickBgm(dt, this.stormActive, true);

    this.updatePlayer(dt);
    this.updateMarauder(dt);
    this.updateSeekers(dt);
    this.updatePackets(dt);
    this.updatePickups(dt);
    this.updateEdgePopups(dt);

    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.08) {
      this.hudSyncAccum = 0;
      this.syncHudImmediate();
    }

    this.spectateSendAccum += dt;
    if (this.spectateSendAccum >= 0.066) {
      this.spectateSendAccum = 0;
      this.broadcastSpectatorSnapshot();
    }
  }

  private updateTitleShowcase(dt: number) {
    this.marauder.angle += dt * 0.55;
    this.marauder.glitchPhase += dt * 7;
    const rx = this.arenaW * 0.42;
    const ry = this.arenaH * 0.41;
    this.marauder.x = this.arenaW * 0.5 + Math.cos(this.marauder.angle) * rx;
    this.marauder.y = this.arenaH * 0.5 + Math.sin(this.marauder.angle) * ry;

    const t = performance.now() / 1000;
    this.player.x = this.arenaW * 0.5 + Math.cos(t * 1.1) * 48;
    this.player.y = this.arenaH * 0.54 + Math.sin(t * 1.7) * 26;
    this.player.facingAngle = Math.atan2(Math.cos(t * 1.7) * 26, -Math.sin(t * 1.1) * 48);
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.pulseCooldown = Math.max(0, p.pulseCooldown - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);

    if (this.pulseBufferedTimer > 0) {
      this.pulseBufferedTimer = Math.max(0, this.pulseBufferedTimer - dt);
      if (p.pulseCooldown <= 0) {
        this.executeFirewallPulse();
      }
    }

    let ix = this.joystickVec.x;
    let iy = this.joystickVec.y;

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) iy -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) iy += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) ix -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) ix += 1;

    if (this.pointerDragActive && Math.abs(ix) < 0.05 && Math.abs(iy) < 0.05) {
      const dx = this.pointerWorld.x - p.x;
      const dy = this.pointerWorld.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        ix = dx / dist;
        iy = dy / dist;
      }
    }

    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }

    const maxSpeed = 395;
    const accel = 2500;
    const friction = 11;

    if (mag > 0.05) {
      p.vx += ix * accel * dt;
      p.vy += iy * accel * dt;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }
      p.facingAngle = Math.atan2(p.vy, p.vx);
    } else {
      const damp = Math.exp(-friction * dt);
      p.vx *= damp;
      p.vy *= damp;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const margin = 38;
    p.x = Math.max(margin, Math.min(this.arenaW - margin, p.x));
    p.y = Math.max(margin, Math.min(this.arenaH - margin, p.y));

    // Squash & stretch recovery
    p.scaleX += (1 - p.scaleX) * Math.min(1, dt * 14);
    p.scaleY += (1 - p.scaleY) * Math.min(1, dt * 14);

    // Thruster ribbon trail
    if (Math.hypot(p.vx, p.vy) > 45) {
      p.trail.unshift({ x: p.x, y: p.y, alpha: 0.75 });
      if (p.trail.length > 10) p.trail.pop();
    }
    for (const t of p.trail) {
      t.alpha *= Math.exp(-8 * dt);
    }
    p.trail = p.trail.filter((t) => t.alpha > 0.05);
  }

  private updateMarauder(dt: number) {
    const m = this.marauder;
    const difficultyRamp = Math.min(1, this.elapsedSec / 65);
    const orbitSpeed = (this.stormActive ? 1.05 : 0.64 + difficultyRamp * 0.25) * m.orbitDirection;
    m.angle += orbitSpeed * dt;
    m.glitchPhase += dt * (this.stormActive ? 18 : 9);
    m.hitFlashTimer = Math.max(0, m.hitFlashTimer - dt);

    const rx = this.arenaW * 0.45;
    const ry = this.arenaH * 0.44;
    m.x = this.arenaW * 0.5 + Math.cos(m.angle) * rx;
    m.y = this.arenaH * 0.5 + Math.sin(m.angle) * ry;

    m.tauntTimer -= dt;
    if (m.tauntTimer <= 0) {
      m.tauntTimer = this.stormActive ? 2.8 : 4.2;
      m.tauntText = MARAUDER_TAUNTS[Math.floor(Math.random() * MARAUDER_TAUNTS.length)];
    }

    if (m.telegraphTimer > 0) {
      m.telegraphTimer -= dt;
      m.aimAngle = Math.atan2(this.player.y - m.y, this.player.x - m.x);
      if (m.telegraphTimer <= 0) {
        this.fireMarauderVolley();
      }
      return;
    }

    m.fireTimer -= dt;
    if (m.fireTimer <= 0) {
      m.telegraphTimer = this.stormActive ? 0.28 : 0.4;
      m.aimAngle = Math.atan2(this.player.y - m.y, this.player.x - m.x);
      const baseInterval = this.stormActive ? 0.85 : Math.max(1.15, 2.0 - difficultyRamp * 0.65);
      m.fireTimer = baseInterval;
    }
  }

  private fireMarauderVolley() {
    const m = this.marauder;
    const baseAngle = Math.atan2(this.player.y - m.y, this.player.x - m.x);
    const speed = this.stormActive ? 315 : 225 + Math.min(65, this.elapsedSec * 1.1);

    const angles = this.stormActive
      ? [baseAngle - 0.26, baseAngle, baseAngle + 0.26]
      : this.elapsedSec > 18
      ? [baseAngle - 0.14, baseAngle + 0.14]
      : [baseAngle];

    for (const ang of angles) {
      const tpl = SCAM_PACKET_TEMPLATES[Math.floor(Math.random() * SCAM_PACKET_TEMPLATES.length)];
      this.packets.push({
        id: this.nextEntityId++,
        x: m.x,
        y: m.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        radius: 13,
        label: tpl.label,
        callout: tpl.callout,
        kind: this.stormActive ? 'crossfire' : 'packet',
        age: 0,
        hitFlash: 0,
      });
    }
    this.emitParticles(m.x, m.y, 6, '#FF2A5F', 130);
  }

  private updateSeekers(dt: number) {
    // Spawn Phish-Seeker Drones (distinct chaser/dasher archetype) after 7s
    if (this.elapsedSec > 7) {
      this.seekerSpawnTimer -= dt;
      const maxSeekers = this.stormActive ? 3 : 2;
      const activeSeekers = this.seekers.filter((s) => s.state !== 'ko').length;
      if (this.seekerSpawnTimer <= 0 && activeSeekers < maxSeekers) {
        this.seekerSpawnTimer = this.stormActive ? 5.0 : 8.5;
        const side = Math.floor(Math.random() * 4);
        let x = 40;
        let y = 40;
        if (side === 0) {
          x = Math.random() * this.arenaW;
          y = 26;
        } else if (side === 1) {
          x = this.arenaW - 26;
          y = Math.random() * this.arenaH;
        } else if (side === 2) {
          x = Math.random() * this.arenaW;
          y = this.arenaH - 26;
        } else {
          x = 26;
          y = Math.random() * this.arenaH;
        }
        this.seekers.push({
          id: this.nextEntityId++,
          x,
          y,
          vx: 0,
          vy: 0,
          radius: 15,
          state: 'approach',
          stateTimer: 2.2,
          dashAngle: 0,
          hitFlashTimer: 0,
          koTimer: 0,
        });
      }
    }

    for (const bot of this.seekers) {
      bot.hitFlashTimer = Math.max(0, bot.hitFlashTimer - dt);
      if (bot.state === 'ko') {
        bot.koTimer -= dt;
        continue;
      }

      const dx = this.player.x - bot.x;
      const dy = this.player.y - bot.y;
      const dist = Math.hypot(dx, dy) || 1;
      const toPlayer = Math.atan2(dy, dx);

      if (bot.state === 'approach') {
        const moveSpeed = this.stormActive ? 155 : 118;
        bot.vx = (dx / dist) * moveSpeed;
        bot.vy = (dy / dist) * moveSpeed;
        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;
        bot.stateTimer -= dt;
        if (dist < 220 || bot.stateTimer <= 0) {
          bot.state = 'telegraph';
          bot.stateTimer = 0.5;
          bot.dashAngle = toPlayer;
        }
      } else if (bot.state === 'telegraph') {
        bot.dashAngle = toPlayer;
        bot.stateTimer -= dt;
        if (bot.stateTimer <= 0) {
          bot.state = 'dash';
          bot.stateTimer = 0.45;
          const dashSpeed = this.stormActive ? 450 : 370;
          bot.vx = Math.cos(bot.dashAngle) * dashSpeed;
          bot.vy = Math.sin(bot.dashAngle) * dashSpeed;
        }
      } else if (bot.state === 'dash') {
        bot.x += bot.vx * dt;
        bot.y += bot.vy * dt;
        bot.stateTimer -= dt;
        if (bot.stateTimer <= 0) {
          bot.state = 'approach';
          bot.stateTimer = 2.0;
        }
      }

      if (
        this.player.invulnTimer <= 0 &&
        circleIntersects(this.player.x, this.player.y, this.player.radius, bot.x, bot.y, bot.radius)
      ) {
        this.hurtPlayer(PACKET_SHIELD_LOSS, bot.x, bot.y, 'BOT HIT! Seeker ambush!');
        bot.state = 'ko';
        bot.koTimer = 0.3;
      }
    }

    this.seekers = this.seekers.filter((s) => !(s.state === 'ko' && s.koTimer <= 0));
  }

  private updatePackets(dt: number) {
    const remaining: ScamPacket[] = [];
    for (const pkt of this.packets) {
      pkt.x += pkt.vx * dt;
      pkt.y += pkt.vy * dt;
      pkt.age += dt;

      if (
        pkt.x < -40 ||
        pkt.x > this.arenaW + 40 ||
        pkt.y < -40 ||
        pkt.y > this.arenaH + 40
      ) {
        continue;
      }

      if (
        this.player.invulnTimer <= 0 &&
        circleIntersects(this.player.x, this.player.y, this.player.radius, pkt.x, pkt.y, pkt.radius)
      ) {
        this.hurtPlayer(PACKET_SHIELD_LOSS, pkt.x, pkt.y, pkt.callout);
        continue;
      }

      remaining.push(pkt);
    }
    this.packets = remaining;
  }

  private updatePickups(dt: number) {
    this.pickupSpawnTimer -= dt;
    if (this.pickupSpawnTimer <= 0) {
      this.pickupSpawnTimer = this.stormActive ? 2.5 : 3.1;
      const legitCount = this.pickups.filter((p) => p.kind !== 'trap').length;
      if (legitCount < 3) {
        // 70% 2FA Gold Key, 30% Legit Shield Verification Orb
        this.spawnPickup(Math.random() < 0.68 ? 'key' : 'shield');
      }
    }

    // Guaranteed Comeback Loop: spawn emergency Recovery Key when Shield < 25%
    this.recoveryCooldownTimer = Math.max(0, this.recoveryCooldownTimer - dt);
    if (
      shouldSpawnRecoveryKey(this.player.shield) &&
      this.recoveryCooldownTimer <= 0 &&
      !this.pickups.some((p) => p.kind === 'recovery')
    ) {
      this.spawnPickup('recovery');
      this.recoveryCooldownTimer = 5.5;
    }

    // Decoy Traps with subtle red flags
    this.decoySpawnTimer -= dt;
    if (this.decoySpawnTimer <= 0) {
      this.decoySpawnTimer = this.stormActive ? 2.8 : 4.2;
      const trapCount = this.pickups.filter((p) => p.kind === 'trap').length;
      if (trapCount < (this.stormActive ? 3 : 2)) {
        this.spawnPickup('trap');
      }
    }

    const alive: PickupItem[] = [];
    for (const item of this.pickups) {
      item.ttl -= dt;
      item.bobPhase += dt * 3.5;

      if (item.ttl <= 0) {
        if (item.kind === 'trap') {
          this.trapsDodged += 1;
        }
        continue;
      }

      if (
        circleIntersects(
          this.player.x,
          this.player.y,
          this.player.radius + 4,
          item.x,
          item.y,
          item.radius
        )
      ) {
        const res = applyPickupEffect(
          {
            shield: this.player.shield,
            vaultSeal: this.vaultSeal,
            score: this.score,
            trapsHit: this.trapsHit,
            trapsDodged: this.trapsDodged,
            keysCollected: this.keysCollected,
          },
          item.kind
        );

        if (res.event === 'trap') {
          this.hurtPlayer(20, item.x, item.y, item.callout, true);
        } else {
          this.player.shield = res.shield;
          this.vaultSeal = res.vaultSeal;
          this.score = res.score;
          this.keysCollected = res.keysCollected;
          this.player.scaleX = 1.2;
          this.player.scaleY = 0.84;

          if (res.event === 'key') {
            this.sound.playKeyPickup();
            this.emitParticles(item.x, item.y, 14, '#FFD166', 200);
            this.addCallout(item.x, item.y - 26, '+12% VAULT SEAL!', 'gold');
          } else if (res.event === 'recovery') {
            this.sound.playKeyPickup();
            this.emitParticles(item.x, item.y, 18, '#00F5D4', 220);
            this.addCallout(item.x, item.y - 26, 'RECOVERY! +18% SHIELD', 'good');
          } else {
            this.sound.playShieldPickup();
            this.emitParticles(item.x, item.y, 12, '#00F5D4', 180);
            this.addCallout(item.x, item.y - 26, '+15% SHIELD VERIFIED', 'good');
          }
          this.checkStormAndOutcome();
        }
        continue;
      }

      alive.push(item);
    }
    this.pickups = alive;
  }

  private spawnPickup(kind: PickupItem['kind']) {
    const padX = 88;
    const padY = 88;
    let x = padX + Math.random() * (this.arenaW - padX * 2);
    let y = padY + Math.random() * (this.arenaH - padY * 2);

    // Keep away from immediate overlap on player
    if (Math.hypot(x - this.player.x, y - this.player.y) < 110) {
      x = x < this.arenaW * 0.5 ? this.arenaW * 0.72 : this.arenaW * 0.28;
    }

    if (kind === 'key') {
      const tpl = LEGIT_KEY_TEMPLATES[Math.floor(Math.random() * LEGIT_KEY_TEMPLATES.length)];
      this.pickups.push({
        id: this.nextEntityId++,
        x,
        y,
        radius: 22,
        kind: 'key',
        label: tpl.label,
        subLabel: tpl.subLabel,
        callout: '+12% VAULT SEAL!',
        ttl: 11,
        maxTtl: 11,
        bobPhase: Math.random() * Math.PI * 2,
        jitterOffset: 0,
      });
    } else if (kind === 'shield') {
      this.pickups.push({
        id: this.nextEntityId++,
        x,
        y,
        radius: 21,
        kind: 'shield',
        label: 'SSO VERIFIED: .edu',
        subLabel: '+15% ACCOUNT SHIELD',
        callout: '+15% SHIELD!',
        ttl: 10,
        maxTtl: 10,
        bobPhase: Math.random() * Math.PI * 2,
        jitterOffset: 0,
      });
    } else if (kind === 'recovery') {
      this.pickups.push({
        id: this.nextEntityId++,
        x,
        y,
        radius: 23,
        kind: 'recovery',
        label: 'RECOVERY: campus.edu',
        subLabel: 'EMERGENCY 2FA BACKUP',
        callout: 'RECOVERY KEY!',
        ttl: 12,
        maxTtl: 12,
        bobPhase: 0,
        jitterOffset: 0,
      });
    } else {
      const tpl = DECOY_TRAP_TEMPLATES[Math.floor(Math.random() * DECOY_TRAP_TEMPLATES.length)];
      this.pickups.push({
        id: this.nextEntityId++,
        x,
        y,
        radius: 22,
        kind: 'trap',
        label: tpl.label,
        subLabel: tpl.subLabel,
        callout: tpl.callout,
        ttl: 8.5,
        maxTtl: 8.5,
        bobPhase: Math.random() * Math.PI * 2,
        jitterOffset: 1,
      });
    }
  }

  private updateEdgePopups(dt: number) {
    if (!this.stormActive) return;

    this.popupSpawnTimer -= dt;
    if (this.popupSpawnTimer <= 0 && this.popups.length < 3) {
      this.popupSpawnTimer = 2.6;
      const tpl = EDGE_POPUP_TEMPLATES[Math.floor(Math.random() * EDGE_POPUP_TEMPLATES.length)];
      const edges: EdgePopupThreat['edge'][] = ['left', 'right', 'top', 'bottom'];
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const w = 166;
      const h = 62;
      let targetX = this.arenaW * 0.5 - w * 0.5;
      let targetY = 34;
      let startX = targetX;
      let startY = -h;

      if (edge === 'top') {
        targetX = 80 + Math.random() * (this.arenaW - w - 160);
        targetY = 30;
        startX = targetX;
        startY = -h - 10;
      } else if (edge === 'bottom') {
        targetX = 80 + Math.random() * (this.arenaW - w - 160);
        targetY = this.arenaH - h - 30;
        startX = targetX;
        startY = this.arenaH + 10;
      } else if (edge === 'left') {
        targetX = 28;
        targetY = 90 + Math.random() * (this.arenaH - h - 180);
        startX = -w - 10;
        startY = targetY;
      } else {
        targetX = this.arenaW - w - 28;
        targetY = 90 + Math.random() * (this.arenaH - h - 180);
        startX = this.arenaW + 10;
        startY = targetY;
      }

      this.popups.push({
        id: this.nextEntityId++,
        edge,
        x: startX,
        y: startY,
        targetX,
        targetY,
        w,
        h,
        title: tpl.title,
        cta: tpl.cta,
        callout: tpl.callout,
        ttl: 5.5,
        zapped: false,
      });
    }

    const activePopups: EdgePopupThreat[] = [];
    for (const pop of this.popups) {
      pop.ttl -= dt;
      pop.x += (pop.targetX - pop.x) * Math.min(1, dt * 7);
      pop.y += (pop.targetY - pop.y) * Math.min(1, dt * 7);

      if (pop.ttl <= 0) {
        this.trapsDodged += 1;
        continue;
      }

      const cx = pop.x + pop.w * 0.5;
      const cy = pop.y + pop.h * 0.5;
      if (
        this.player.invulnTimer <= 0 &&
        this.player.x + this.player.radius > pop.x &&
        this.player.x - this.player.radius < pop.x + pop.w &&
        this.player.y + this.player.radius > pop.y &&
        this.player.y - this.player.radius < pop.y + pop.h
      ) {
        this.hurtPlayer(PACKET_SHIELD_LOSS, cx, cy, pop.callout);
        continue;
      }

      activePopups.push(pop);
    }
    this.popups = activePopups;
  }

  private hurtPlayer(
    damage: number,
    impactX: number,
    impactY: number,
    calloutText: string,
    isTrap = false
  ) {
    this.player.shield = Math.max(0, this.player.shield - damage);
    this.player.invulnTimer = 0.65;
    this.player.hitFlashTimer = 0.14;
    this.player.scaleX = 0.76;
    this.player.scaleY = 1.28;

    if (isTrap) {
      this.trapsHit += 1;
      this.sound.playTrapBuzz();
    } else {
      this.sound.playPacketHit();
    }

    this.hitstopTimer = 0.05;
    this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.62);
    this.crimsonFlashAlpha = 0.42;

    this.emitParticles(impactX, impactY, 18, '#FF2A5F', 280);
    this.addCallout(impactX, Math.max(46, impactY - 24), calloutText, 'danger');
    this.syncHudImmediate();
    this.checkStormAndOutcome();
  }

  private checkStormAndOutcome() {
    if (shouldTriggerStorm(this.vaultSeal, this.stormActive)) {
      this.stormActive = true;
      this.stormBannerTimer = 3.2;
      this.sound.playStormAlert();
      this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.45);
      this.addCallout(this.arenaW * 0.5, 92, 'PHISHING STORM DETECTED!', 'storm');
    }

    if (this.vaultSeal >= 100 && !this.endingOutcome) {
      this.vaultSeal = 100;
      this.endingOutcome = 'victory';
      this.vaultSlamTimer = 0;
      this.sound.playVaultSlamVictory();
      this.shakeTrauma = 0.85;
      this.syncHudImmediate();
      return;
    }

    if (this.player.shield <= 0 && !this.endingOutcome) {
      this.player.shield = 0;
      this.endingOutcome = 'defeat';
      this.defeatBeatTimer = 0;
      this.sound.playDefeat();
      this.shakeTrauma = 0.9;
      this.syncHudImmediate();
    }
  }

  private finalizeMatch(outcome: MatchOutcome) {
    this.gameState = 'gameover';
    document.body.dataset.state = 'gameover';
    this.clearInputs();
    this.broadcastSpectatorSnapshot();

    const shieldRemaining = Math.round(this.player.shield);
    const timeBonus = outcome === 'victory' ? Math.max(0, Math.round((120 - this.elapsedSec) * 10)) : 0;
    const shieldBonus = outcome === 'victory' ? shieldRemaining * 8 : 0;
    const finalScore = Math.round(this.score + timeBonus + shieldBonus);
    const clearTimeSec = Math.max(1, Math.round(this.elapsedSec));
    const rank = computeRank({
      outcome,
      score: finalScore,
      clearTimeSec,
      trapsHit: this.trapsHit,
      shieldRemaining,
    });

    const summary: RunSummary = {
      outcome,
      score: finalScore,
      clearTimeSec,
      vaultSeal: Math.round(this.vaultSeal),
      shieldRemaining,
      trapsDodged: this.trapsDodged,
      trapsHit: this.trapsHit,
      packetsZapped: this.packetsZapped,
      keysCollected: this.keysCollected,
      rankCode: rank.code,
      rankTitle: rank.title,
      handle: this.handle,
      device: this.device,
    };

    this.callbacks.onStateChange?.('gameover');
    this.callbacks.onMatchEnd(summary);
  }

  private addCallout(
    x: number,
    y: number,
    text: string,
    tone: ComicCallout['tone']
  ) {
    const clampedX = Math.max(115, Math.min(this.arenaW - 115, x));
    const clampedY = Math.max(46, Math.min(this.arenaH - 46, y));
    this.callouts.push({
      id: this.nextEntityId++,
      x: clampedX,
      y: clampedY,
      text,
      tone,
      ttl: 1.15,
      maxTtl: 1.15,
    });
    if (this.callouts.length > 5) {
      this.callouts.shift();
    }
  }

  private emitParticles(x: number, y: number, count: number, color: string, speed: number) {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.35 + Math.random() * 0.75);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.size = 2.2 + Math.random() * 3.5;
      p.color = color;
      p.maxTtl = 0.28 + Math.random() * 0.25;
      p.ttl = p.maxTtl;
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.ttl -= dt;
      if (p.ttl <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-4.5 * dt);
      p.vy *= Math.exp(-4.5 * dt);
    }
  }

  private updatePulses(dt: number) {
    const next: PulseRing[] = [];
    for (const ring of this.pulses) {
      ring.radius += (ring.maxRadius - ring.radius) * Math.min(1, dt * 15);
      ring.alpha -= dt * 3.4;
      if (ring.alpha > 0.03) next.push(ring);
    }
    this.pulses = next;
  }

  private updateCallouts(dt: number) {
    const next: ComicCallout[] = [];
    for (const c of this.callouts) {
      c.ttl -= dt;
      c.y -= 18 * dt;
      if (c.ttl > 0) next.push(c);
    }
    this.callouts = next;
  }

  private broadcastSpectatorSnapshot() {
    if (!this.matchId || !this.callbacks.onSpectatorSnapshot) return;
    const snapshot: SpectatorSnapshot = {
      matchId: this.matchId,
      handle: this.handle,
      arenaW: this.arenaW,
      arenaH: this.arenaH,
      elapsedSec: Math.floor(this.elapsedSec),
      shield: Math.round(this.player.shield),
      ghostShield: Math.round(this.player.ghostShield),
      vaultSeal: Math.round(this.vaultSeal),
      score: Math.round(this.score),
      stormActive: this.stormActive,
      vaultSlamProgress:
        this.endingOutcome === 'victory' ? Math.min(1, this.vaultSlamTimer / 0.75) : 0,
      outcome: this.endingOutcome,
      player: {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        vx: Math.round(this.player.vx),
        vy: Math.round(this.player.vy),
        facingAngle: Number(this.player.facingAngle.toFixed(2)),
        pulseCooldown: Number(this.player.pulseCooldown.toFixed(2)),
        hitFlash: this.player.hitFlashTimer > 0,
      },
      marauder: {
        x: Math.round(this.marauder.x),
        y: Math.round(this.marauder.y),
        angle: Number(this.marauder.angle.toFixed(2)),
        telegraph: Number(this.marauder.telegraphTimer.toFixed(2)),
        aimAngle: Number(this.marauder.aimAngle.toFixed(2)),
        tauntText: this.marauder.tauntText,
        tauntTimer: Number(this.marauder.tauntTimer.toFixed(1)),
      },
      seekers: this.seekers.map((s) => ({
        x: Math.round(s.x),
        y: Math.round(s.y),
        state: s.state,
        dashAngle: Number(s.dashAngle.toFixed(2)),
      })),
      packets: this.packets.slice(0, 36).map((p) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        label: p.label,
        kind: p.kind,
      })),
      pickups: this.pickups.map((pk) => ({
        x: Math.round(pk.x),
        y: Math.round(pk.y),
        kind: pk.kind,
        label: pk.label,
        subLabel: pk.subLabel,
      })),
      popups: this.popups.map((pp) => ({
        x: Math.round(pp.x),
        y: Math.round(pp.y),
        w: pp.w,
        h: pp.h,
        title: pp.title,
        cta: pp.cta,
      })),
      pulses: this.pulses.map((pl) => ({
        x: Math.round(pl.x),
        y: Math.round(pl.y),
        radius: Math.round(pl.radius),
        maxRadius: pl.maxRadius,
        alpha: Number(pl.alpha.toFixed(2)),
        color: pl.color,
      })),
      callouts: this.callouts.map((c) => ({
        x: Math.round(c.x),
        y: Math.round(c.y),
        text: c.text,
        tone: c.tone,
        ttl: Number(c.ttl.toFixed(2)),
      })),
    };
    this.callbacks.onSpectatorSnapshot(snapshot);
  }

  private render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Obsidian deep background
    ctx.fillStyle = '#070B14';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    if (this.mode === 'spectate') {
      this.renderSpectatorView(ctx);
      ctx.restore();
      return;
    }

    const { scale, offsetX, offsetY, targetW, targetH } = this.getArenaTransform();
    const shakeMag = this.shakeTrauma * this.shakeTrauma * 14;
    const shakeX = (Math.random() * 2 - 1) * shakeMag;
    const shakeY = (Math.random() * 2 - 1) * shakeMag;

    ctx.save();
    ctx.translate(offsetX + shakeX, offsetY + shakeY);
    ctx.scale(scale, scale);

    this.drawArenaGrid(ctx, targetW, targetH, this.stormActive, performance.now() / 1000);

    // Draw pickups (Legit Keys, Shield Orbs, Recovery Keys, Decoy Traps)
    if (this.gameState !== 'title') {
      for (const item of this.pickups) {
        this.drawPickup(ctx, item.x, item.y, item.kind, item.label, item.subLabel, item.bobPhase, item.ttl);
      }
    }

    // Draw Edge Popups
    for (const pop of this.popups) {
      this.drawEdgePopup(ctx, pop.x, pop.y, pop.w, pop.h, pop.title, pop.cta);
    }

    // Draw Firewall Pulse rings
    for (const ring of this.pulses) {
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = ring.alpha;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = ring.alpha * 0.22;
      ctx.fillStyle = ring.color;
      ctx.fill();
      ctx.restore();
    }

    // Draw Scam Packets
    for (const pkt of this.packets) {
      this.drawScamPacket(ctx, pkt.x, pkt.y, pkt.label, pkt.kind);
    }

    // Draw Phish-Seekers
    for (const bot of this.seekers) {
      this.drawSeekerBot(ctx, bot);
    }

    // Draw Player Drone
    this.drawPlayerDrone(
      ctx,
      this.player.x,
      this.player.y,
      this.player.facingAngle,
      this.player.scaleX,
      this.player.scaleY,
      this.player.pulseCooldown,
      this.player.pulseMaxCooldown,
      this.player.hitFlashTimer > 0,
      this.player.trail
    );

    // Draw Malware Marauder Boss
    this.drawMarauder(
      ctx,
      this.marauder.x,
      this.marauder.y,
      this.marauder.telegraphTimer,
      this.marauder.aimAngle,
      this.marauder.glitchPhase,
      this.marauder.tauntText,
      this.marauder.tauntTimer,
      this.stormActive
    );

    // Draw Pooled Particles
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.ttl / p.maxTtl);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw "Gotcha!" Comic Callouts
    for (const c of this.callouts) {
      this.drawComicCallout(ctx, c.x, c.y, c.text, c.tone, Math.min(1, c.ttl / 0.25));
    }

    // Animated Vault Slam Victory Door
    if (this.endingOutcome === 'victory') {
      const slamProgress = Math.min(1, this.vaultSlamTimer / 0.55);
      this.drawVaultSlam(ctx, targetW, targetH, slamProgress);
    }

    ctx.restore();

    // Crimson hit flash vignette
    if (this.crimsonFlashAlpha > 0.01) {
      ctx.fillStyle = `rgba(255, 42, 95, ${this.crimsonFlashAlpha})`;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    // Critical low-shield peripheral warning vignette
    if (this.gameState === 'playing' && this.player.shield > 0 && this.player.shield < 25) {
      const pulse = 0.14 + Math.sin(performance.now() * 0.008) * 0.06;
      const grad = ctx.createRadialGradient(
        this.viewW * 0.5,
        this.viewH * 0.5,
        this.viewW * 0.25,
        this.viewW * 0.5,
        this.viewH * 0.5,
        this.viewW * 0.65
      );
      grad.addColorStop(0, 'rgba(255,42,95,0)');
      grad.addColorStop(1, `rgba(255,42,95,${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    ctx.restore();
  }

  private renderSpectatorView(ctx: CanvasRenderingContext2D) {
    const snap = this.spectatorSnapshot;
    if (!snap) {
      this.drawArenaGrid(ctx, this.viewW, this.viewH, false, this.spectatorAnimTime);
      return;
    }

    const { scale, offsetX, offsetY } = this.getArenaTransform();
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    this.drawArenaGrid(ctx, snap.arenaW, snap.arenaH, snap.stormActive, this.spectatorAnimTime);

    for (const pk of snap.pickups) {
      this.drawPickup(ctx, pk.x, pk.y, pk.kind, pk.label, pk.subLabel, this.spectatorAnimTime * 3, 5);
    }

    for (const pp of snap.popups) {
      this.drawEdgePopup(ctx, pp.x, pp.y, pp.w, pp.h, pp.title, pp.cta);
    }

    for (const ring of snap.pulses) {
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = ring.alpha;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const pkt of snap.packets) {
      this.drawScamPacket(ctx, pkt.x, pkt.y, pkt.label, pkt.kind);
    }

    for (const bot of snap.seekers) {
      this.drawSeekerBot(ctx, {
        id: 0,
        x: bot.x,
        y: bot.y,
        vx: 0,
        vy: 0,
        radius: 15,
        state: bot.state,
        stateTimer: 0.25,
        dashAngle: bot.dashAngle,
        hitFlashTimer: 0,
        koTimer: 0,
      });
    }

    this.drawPlayerDrone(
      ctx,
      snap.player.x,
      snap.player.y,
      snap.player.facingAngle,
      1,
      1,
      snap.player.pulseCooldown,
      PULSE_COOLDOWN,
      snap.player.hitFlash,
      []
    );

    this.drawMarauder(
      ctx,
      snap.marauder.x,
      snap.marauder.y,
      snap.marauder.telegraph,
      snap.marauder.aimAngle,
      this.spectatorAnimTime * 10,
      snap.marauder.tauntText,
      snap.marauder.tauntTimer,
      snap.stormActive
    );

    for (const c of snap.callouts) {
      this.drawComicCallout(ctx, c.x, c.y, c.text, c.tone, Math.min(1, c.ttl / 0.25));
    }

    if (snap.vaultSlamProgress > 0) {
      this.drawVaultSlam(ctx, snap.arenaW, snap.arenaH, snap.vaultSlamProgress);
    }

    ctx.restore();
  }

  private drawArenaGrid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    stormActive: boolean,
    timeSec: number
  ) {
    // Arena floor
    ctx.fillStyle = stormActive ? '#0C0818' : '#09101D';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    const step = 48;
    const pulseAlpha = stormActive ? 0.14 + Math.sin(timeSec * 8) * 0.06 : 0.09;
    ctx.strokeStyle = stormActive
      ? `rgba(255, 42, 95, ${pulseAlpha})`
      : `rgba(0, 245, 212, ${pulseAlpha})`;
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // Central Campus Vault emblem ring on the arena floor
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.strokeStyle = stormActive ? 'rgba(255, 42, 95, 0.22)' : 'rgba(0, 245, 212, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, 82, timeSec * 0.25, timeSec * 0.25 + Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Arena Perimeter Border
    ctx.strokeStyle = stormActive ? '#FF2A5F' : 'rgba(0, 245, 212, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  private drawPlayerDrone(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facingAngle: number,
    scaleX: number,
    scaleY: number,
    pulseCooldown: number,
    pulseMaxCooldown: number,
    hitFlash: boolean,
    trail: Array<{ x: number; y: number; alpha: number }>
  ) {
    // Thruster ribbon trail
    for (let i = 0; i < trail.length; i++) {
      const t = trail[i];
      const r = Math.max(3, 12 - i * 1.1);
      ctx.fillStyle = `rgba(0, 245, 212, ${t.alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(x, y);

    // Embedded cooldown arc around player
    if (pulseCooldown > 0) {
      const readyRatio = 1 - pulseCooldown / pulseMaxCooldown;
      ctx.strokeStyle = 'rgba(0, 245, 212, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#FFD166';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 28, -Math.PI / 2, -Math.PI / 2 + readyRatio * Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(0, 245, 212, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.rotate(facingAngle);
    ctx.scale(scaleX, scaleY);

    // Outer cyber-shield hex silhouette
    ctx.fillStyle = hitFlash ? '#FFFFFF' : '#08262B';
    ctx.strokeStyle = hitFlash ? '#FFFFFF' : '#00F5D4';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(21, 0);
    ctx.lineTo(6, -17);
    ctx.lineTo(-15, -13);
    ctx.lineTo(-19, 0);
    ctx.lineTo(-15, 13);
    ctx.lineTo(6, 17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner glowing shield visor
    ctx.fillStyle = hitFlash ? '#FF2A5F' : '#00F5D4';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(1, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(1, 8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawMarauder(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    telegraphTimer: number,
    aimAngle: number,
    glitchPhase: number,
    tauntText: string,
    tauntTimer: number,
    stormActive: boolean
  ) {
    // Laser aim telegraph line
    if (telegraphTimer > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 42, 95, 0.55)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(aimAngle) * 420, y + Math.sin(aimAngle) * 420);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);

    // Menacing skull-bot octagon
    const jitterX = stormActive ? Math.sin(glitchPhase * 3.1) * 2.5 : 0;
    ctx.translate(jitterX, 0);

    ctx.fillStyle = '#230612';
    ctx.strokeStyle = telegraphTimer > 0 ? '#FFD166' : '#FF2A5F';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-22, -16);
    ctx.lineTo(0, -25);
    ctx.lineTo(22, -16);
    ctx.lineTo(25, 6);
    ctx.lineTo(14, 21);
    ctx.lineTo(-14, 21);
    ctx.lineTo(-25, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Animated glitch eyes
    const eyeH = Math.abs(Math.sin(glitchPhase)) > 0.18 ? 7 : 2;
    ctx.fillStyle = telegraphTimer > 0 ? '#FFD166' : '#FF2A5F';
    ctx.fillRect(-13, -6, 9, eyeH);
    ctx.fillRect(4, -6, 9, eyeH);

    // Skull teeth grille
    ctx.fillStyle = '#FF7A9E';
    for (let tx = -10; tx <= 6; tx += 8) {
      ctx.fillRect(tx, 9, 4, 7);
    }

    ctx.restore();

    // Floating taunt speech bubble (kept compact so it never blocks center)
    if (tauntTimer > 0.2 && this.gameState === 'playing') {
      ctx.save();
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(tauntText).width + 16;
      const bx = Math.max(10, Math.min(this.arenaW - tw - 10, x - tw * 0.5));
      const by = y < this.arenaH * 0.35 ? y + 32 : y - 52;

      ctx.fillStyle = 'rgba(26, 6, 16, 0.92)';
      ctx.strokeStyle = '#FF2A5F';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 22, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FFD9E2';
      ctx.fillText(tauntText, bx + 8, by + 15);
      ctx.restore();
    }
  }

  private drawSeekerBot(ctx: CanvasRenderingContext2D, bot: SeekerBot) {
    ctx.save();
    ctx.translate(bot.x, bot.y);

    if (bot.state === 'telegraph') {
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.75)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(bot.dashAngle) * 200, Math.sin(bot.dashAngle) * 200);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (bot.state === 'ko') {
      ctx.globalAlpha = Math.max(0, bot.koTimer / 0.35);
      ctx.rotate(bot.koTimer * 16);
      ctx.scale(0.7, 0.7);
    }

    ctx.fillStyle = bot.hitFlashTimer > 0 ? '#FFFFFF' : '#2D0717';
    ctx.strokeStyle = bot.state === 'telegraph' ? '#FFD166' : '#FF2A5F';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(16, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-16, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = bot.state === 'telegraph' ? '#FFD166' : '#FF2A5F';
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawScamPacket(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    kind: ScamPacket['kind']
  ) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = kind === 'crossfire' ? '#360417' : '#260512';
    ctx.strokeStyle = '#FF2A5F';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-13, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FF2A5F';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 10px monospace';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(18, 4, 12, 0.88)';
    ctx.fillRect(-w * 0.5, 16, w, 15);
    ctx.fillStyle = '#FF9BB5';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, 27);
    ctx.restore();
  }

  private drawPickup(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    kind: PickupItem['kind'],
    label: string,
    subLabel: string,
    bobPhase: number,
    ttl: number
  ) {
    const isTrap = kind === 'trap';
    const bobY = Math.sin(bobPhase) * 3.5;
    const jitterX = isTrap ? (Math.random() - 0.5) * 3.2 : 0;
    const jitterY = isTrap ? (Math.random() - 0.5) * 2.2 : 0;

    ctx.save();
    ctx.translate(x + jitterX, y + bobY + jitterY);
    if (ttl < 2 && Math.floor(ttl * 8) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    const accent =
      kind === 'key'
        ? '#FFD166'
        : kind === 'shield'
        ? '#00F5D4'
        : kind === 'recovery'
        ? '#00F5D4'
        : '#FFD166'; // Decoy trap mimics gold/cyan to test split-second reading!

    const bg =
      kind === 'trap'
        ? '#15121F'
        : kind === 'key'
        ? '#1C1709'
        : '#081D21';

    // Outer beacon ring
    ctx.strokeStyle = isTrap ? 'rgba(255, 209, 102, 0.55)' : accent;
    ctx.lineWidth = isTrap ? 2 : 2.5;
    if (isTrap) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, 21, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // Vector emblem inside pickup
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 2;
    if (kind === 'key' || kind === 'recovery') {
      // Key icon
      ctx.beginPath();
      ctx.arc(-5, 0, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.5, 0);
      ctx.lineTo(11, 0);
      ctx.moveTo(7, 0);
      ctx.lineTo(7, 5);
      ctx.moveTo(10.5, 0);
      ctx.lineTo(10.5, 4);
      ctx.stroke();
    } else if (kind === 'shield') {
      // Shield icon
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(9, -6);
      ctx.lineTo(7, 4);
      ctx.lineTo(0, 10);
      ctx.lineTo(-7, 4);
      ctx.lineTo(-9, -6);
      ctx.closePath();
      ctx.stroke();
    } else {
      // Decoy bolt/trophy mimic
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(-6, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-2, 10);
      ctx.lineTo(6, -1);
      ctx.lineTo(0, -1);
      ctx.closePath();
      ctx.fill();
    }

    // Badge label below
    ctx.font = 'bold 11px monospace';
    const w1 = ctx.measureText(label).width;
    const w2 = ctx.measureText(subLabel).width;
    const boxW = Math.max(w1, w2) + 16;

    ctx.fillStyle = 'rgba(7, 11, 20, 0.92)';
    ctx.strokeStyle = isTrap ? 'rgba(255, 42, 95, 0.65)' : accent;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, 25, boxW, 30, 5);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = isTrap ? '#FFE399' : '#FFFFFF';
    ctx.fillText(label, 0, 38);
    ctx.font = '10px monospace';
    ctx.fillStyle = isTrap ? '#FF87A5' : '#96E6DA';
    ctx.fillText(subLabel, 0, 50);

    ctx.restore();
  }

  private drawEdgePopup(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    cta: string
  ) {
    ctx.save();
    ctx.fillStyle = '#1E0814';
    ctx.strokeStyle = '#FF2A5F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    // Fake window titlebar
    ctx.fillStyle = '#FF2A5F';
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('SYSTEM ALERT [X]', x + 8, y + 13);

    ctx.fillStyle = '#FFE4EC';
    ctx.font = 'bold 11px monospace';
    ctx.fillText(title, x + 8, y + 35);

    ctx.fillStyle = '#FFD166';
    ctx.fillRect(x + 8, y + 41, 76, 15);
    ctx.fillStyle = '#15060C';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(cta, x + 13, y + 52);
    ctx.restore();
  }

  private drawComicCallout(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    tone: ComicCallout['tone'],
    alpha: number
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 13px sans-serif';
    const w = ctx.measureText(text).width + 22;

    const border =
      tone === 'danger'
        ? '#FF2A5F'
        : tone === 'gold'
        ? '#FFD166'
        : tone === 'storm'
        ? '#FF2A5F'
        : '#00F5D4';

    const bg = tone === 'danger' || tone === 'storm' ? '#260613' : '#081F26';

    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.roundRect(x - w * 0.5, y - 16, w, 30, 7);
    ctx.fill();
    ctx.stroke();

    // Speech pointer
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 14);
    ctx.lineTo(x, y + 22);
    ctx.lineTo(x + 6, y + 14);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 3);
    ctx.restore();
  }

  private drawVaultSlam(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    progress: number
  ) {
    // Ease-out slam
    const eased = 1 - Math.pow(1 - progress, 3);
    const halfW = (w * 0.5) * eased;

    ctx.save();
    // Left armored steel door
    ctx.fillStyle = '#0D1726';
    ctx.fillRect(0, 0, halfW, h);
    ctx.strokeStyle = '#00F5D4';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, h);
    ctx.stroke();

    // Right armored steel door
    ctx.fillStyle = '#0D1726';
    ctx.fillRect(w - halfW, 0, halfW, h);
    ctx.beginPath();
    ctx.moveTo(w - halfW, 0);
    ctx.lineTo(w - halfW, h);
    ctx.stroke();

    // Center locking seal when doors meet
    if (progress > 0.72) {
      const lockAlpha = (progress - 0.72) / 0.28;
      ctx.globalAlpha = lockAlpha;
      ctx.translate(w * 0.5, h * 0.5);
      ctx.fillStyle = '#07131E';
      ctx.strokeStyle = '#00F5D4';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 76, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#00F5D4';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VAULT LOCKED', 0, 7);
    }
    ctx.restore();
  }
}
