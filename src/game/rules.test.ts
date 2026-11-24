import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPacketZap,
  applyPickupEffect,
  circleIntersects,
  clampDt,
  computeRank,
  formatDuration,
  KEY_SCORE,
  KEY_VAULT_GAIN,
  PACKET_ZAP_SCORE,
  PACKET_ZAP_VAULT_GAIN,
  RECOVERY_KEY_SHIELD_GAIN,
  RECOVERY_KEY_VAULT_GAIN,
  sanitizeHandle,
  SHIELD_ORB_GAIN,
  SHIELD_ORB_VAULT_GAIN,
  shouldSpawnRecoveryKey,
  shouldTriggerStorm,
  TRAP_SHIELD_LOSS,
} from './rules';

test('clampDt clamps negative, NaN, and oversized frame deltas', () => {
  assert.equal(clampDt(-0.2), 0);
  assert.equal(clampDt(Number.NaN), 0);
  assert.equal(clampDt(0.016), 0.016);
  assert.equal(clampDt(0.5), 0.05);
});

test('circleIntersects detects overlap accurately', () => {
  assert.equal(circleIntersects(0, 0, 10, 15, 0, 10), true);
  assert.equal(circleIntersects(0, 0, 10, 20, 0, 10), true);
  assert.equal(circleIntersects(0, 0, 10, 21, 0, 10), false);
});

test('applyPickupEffect updates Vault Seal, Shield, Score, and Traps properly', () => {
  const base = {
    shield: 60,
    vaultSeal: 40,
    score: 100,
    trapsHit: 0,
    trapsDodged: 2,
    keysCollected: 0,
  };

  const afterKey = applyPickupEffect(base, 'key');
  assert.equal(afterKey.vaultSeal, 40 + KEY_VAULT_GAIN);
  assert.equal(afterKey.score, 100 + KEY_SCORE);
  assert.equal(afterKey.keysCollected, 1);
  assert.equal(afterKey.event, 'key');

  const afterShield = applyPickupEffect(base, 'shield');
  assert.equal(afterShield.shield, 60 + SHIELD_ORB_GAIN);
  assert.equal(afterShield.vaultSeal, 40 + SHIELD_ORB_VAULT_GAIN);
  assert.equal(afterShield.event, 'shield');

  const afterRecovery = applyPickupEffect({ ...base, shield: 15 }, 'recovery');
  assert.equal(afterRecovery.shield, 15 + RECOVERY_KEY_SHIELD_GAIN);
  assert.equal(afterRecovery.vaultSeal, 40 + RECOVERY_KEY_VAULT_GAIN);
  assert.equal(afterRecovery.event, 'recovery');

  const afterTrap = applyPickupEffect(base, 'trap');
  assert.equal(afterTrap.shield, 60 - TRAP_SHIELD_LOSS);
  assert.equal(afterTrap.trapsHit, 1);
  assert.equal(afterTrap.event, 'trap');
});

test('applyPacketZap grants comeback Vault Seal and score clamped at 100%', () => {
  const res = applyPacketZap({ vaultSeal: 96, score: 500, packetsZapped: 4 }, 3);
  assert.equal(res.vaultSeal, 100);
  assert.equal(res.score, 500 + 3 * PACKET_ZAP_SCORE);
  assert.equal(res.packetsZapped, 7);

  const single = applyPacketZap({ vaultSeal: 50, score: 0, packetsZapped: 0 }, 1);
  assert.equal(single.vaultSeal, 50 + PACKET_ZAP_VAULT_GAIN);
});

test('Phishing Storm and Recovery Key thresholds trigger cleanly', () => {
  assert.equal(shouldTriggerStorm(74, false), false);
  assert.equal(shouldTriggerStorm(75, false), true);
  assert.equal(shouldTriggerStorm(90, true), false);

  assert.equal(shouldSpawnRecoveryKey(26), false);
  assert.equal(shouldSpawnRecoveryKey(24), true);
  assert.equal(shouldSpawnRecoveryKey(0), false);
});

test('computeRank assigns S, A, B, and defeat ranks properly', () => {
  assert.equal(
    computeRank({
      outcome: 'victory',
      score: 3200,
      clearTimeSec: 52,
      trapsHit: 0,
      shieldRemaining: 80,
    }).title,
    'S-RANK CYBER LEGEND'
  );
  assert.equal(
    computeRank({
      outcome: 'victory',
      score: 2100,
      clearTimeSec: 80,
      trapsHit: 2,
      shieldRemaining: 40,
    }).title,
    'A-RANK FIREWALL PRO'
  );
  assert.equal(
    computeRank({
      outcome: 'victory',
      score: 1200,
      clearTimeSec: 95,
      trapsHit: 4,
      shieldRemaining: 10,
    }).title,
    'B-RANK SURVIVOR'
  );
  assert.equal(
    computeRank({
      outcome: 'defeat',
      score: 1900,
      clearTimeSec: 44,
      trapsHit: 5,
      shieldRemaining: 0,
    }).title,
    'BREACH DETECTED'
  );
});

test('sanitizeHandle and formatDuration sanitize and format cleanly', () => {
  assert.equal(sanitizeHandle('  <script>neo_99! '), 'SCRIPTNEO_99');
  assert.equal(sanitizeHandle('   '), 'AGENT-01');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(9), '0:09');
});
