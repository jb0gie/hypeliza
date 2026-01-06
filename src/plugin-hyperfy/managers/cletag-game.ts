import { System } from '../hyperfy/src/core/systems/System.js';
import { logger, createUniqueUuid, type UUID } from '@elizaos/core';
import { agentActivityLock } from './guards';
import * as THREE from 'three';
import { HyperfyService } from '../service';

const TAG_DISTANCE = 3.0; // meters - how close to tag someone
const TAG_COOLDOWN = 5000; // ms - cooldown between tags
const TRUST_POINTS_TAGGER = 10; // points earned by tagging
const TRUST_POINTS_FLEEING = 5; // points earned by fleeing successfully
const SPRINT_DURATION = 3000; // ms - how long sprint lasts
const SPRINT_COOLDOWN = 8000; // ms - cooldown between sprints

export interface CLETAGPlayer {
  id: string;
  name: string;
  position: THREE.Vector3;
  lastTagged: number;
  isIt: boolean;
  trustPoints: number;
}

export class CLETAGGame extends System {
  private players: Map<string, CLETAGPlayer> = new Map();
  private currentIt: string | null = null;
  private gameActive: boolean = false;
  private lastSprintUse: number = 0;
  private isSprinting: boolean = false;
  private sprintTimeout: NodeJS.Timeout | null = null;

  constructor(world: any) {
    super(world);
    this.gameActive = true;
    logger.info('[CLETAG!] Game initialized');
  }

  // Check if player can be tagged
  canTagPlayer(playerId: string, myPosition: THREE.Vector3): string | null {
    const agentId = this.world.entities.player?.data?.id;
    if (!agentId || playerId === agentId) return null;

    const player = this.world.entities.items.get(playerId);
    if (!player || !player.base?.position) return null;

    const playerPos = player.base.position;
    const distance = myPosition.distanceTo(playerPos);

    if (distance <= TAG_DISTANCE) {
      return player.data?.name || 'Unknown Player';
    }
    return null;
  }

  // Get all nearby players
  getNearbyPlayers(myPosition: THREE.Vector3, maxDistance: number = 20): CLETAGPlayer[] {
    const agentId = this.world.entities.player?.data?.id;
    const nearby: CLETAGPlayer[] = [];

    for (const [id, entity] of this.world.entities.items.entries()) {
      if (id === agentId || entity.data?.type !== 'player') continue;

      const pos = entity.base?.position || entity.root?.position;
      if (!pos) continue;

      const distance = myPosition.distanceTo(pos);
      if (distance <= maxDistance) {
        nearby.push({
          id,
          name: entity.data?.name || 'Unknown',
          position: pos.clone(),
          lastTagged: this.players.get(id)?.lastTagged || 0,
          isIt: this.players.get(id)?.isIt || false,
          trustPoints: this.players.get(id)?.trustPoints || 0,
        });
      }
    }

    return nearby;
  }

  // Tag another player
  async tagPlayer(targetId: string, targetName: string): Promise<boolean> {
    const service = this.getService();
    const agentPlayerId = this.world.entities.player?.data?.id;
    const agentPlayerName = service?.getEntityName(agentPlayerId) || 'Cleetus';
    const now = Date.now();

    // Check cooldown
    const targetPlayer = this.players.get(targetId);
    if (targetPlayer && (now - targetPlayer.lastTagged) < TAG_COOLDOWN) {
      logger.info(`[CLETAG!] Cannot tag ${targetName} - cooldown active`);
      return false;
    }

    // Check if already it
    if (this.currentIt === targetId) {
      logger.info(`[CLETAG!] ${targetName} is already it!`);
      return false;
    }

    // Tag the player
    if (!this.players.has(targetId)) {
      this.players.set(targetId, {
        id: targetId,
        name: targetName,
        position: new THREE.Vector3(),
        lastTagged: now,
        isIt: true,
        trustPoints: TRUST_POINTS_TAGGER,
      });
    } else {
      const player = this.players.get(targetId)!;
      player.isIt = true;
      player.lastTagged = now;
      player.trustPoints += TRUST_POINTS_TAGGER;
    }

    // Clear current it status from previous player
    if (this.currentIt && this.players.has(this.currentIt)) {
      const oldIt = this.players.get(this.currentIt)!;
      oldIt.isIt = false;
      logger.info(`[CLETAG!] ${oldIt.name} is NO LONGER it`);
    }

    this.currentIt = targetId;

    // Award trust to Cleetus for successful tag
    const cleetusPlayer = this.players.get(agentPlayerId);
    if (cleetusPlayer) {
      cleetusPlayer.trustPoints += TRUST_POINTS_TAGGER;
    }

    logger.info(`[CLETAG!] ${agentPlayerName} tagged ${targetName}! ${targetName} is now it!`);

    // Announce in chat
    await this.announceTag(agentPlayerName, targetName);

    // Update friendly players in Cleetus character
    await this.updateFriendlyPlayers();

    return true;
  }

  // Try to flee from the player who is it - FRANTIC mode
  async attemptFlee(itPlayerId: string): Promise<boolean> {
    const controls = this.world?.controls;
    const agentPlayerId = this.world.entities.player?.data?.id;
    const world = this.world;

    if (!controls || !world?.entities?.player) {
      logger.error('[CLETAG!] Controls or world not available');
      return false;
    }

    // Mark as currently fleeing
    this.isSprinting = true;
    this.lastSprintUse = Date.now();

    // Enable sprint immediately
    controls.enableSprint(true);
    logger.info(`[CLETAG!] SUPER RUN FRANTIC MODE ACTIVATED! Fleeing from it player!`);

    // FRANTIC JUMPING AND SPRINTING LOOP
    // Keep jumping and sprinting until safe distance
    const fleeInterval = setInterval(() => {
      if (!this.isSprinting) {
        clearInterval(fleeInterval);
        return;
      }

      // Check if we're safe (far enough from it player)
      const itPlayer = world.entities.items.get(itPlayerId);
      if (!itPlayer || !itPlayer.base?.position) {
        logger.warn('[CLETAG!] It player disappeared, stopping flee');
        this.stopFlee();
        return;
      }

      const myPos = world.entities.player.base.position;
      const distance = myPos.distanceTo(itPlayer.base.position);

      if (distance > TAG_DISTANCE * 3) { // Safe distance reached
        logger.info(`[CLETAG!] Safe distance reached (${distance.toFixed(1)}m from it player)`);
        this.stopFlee();
        return;
      }

      // FRANTIC: Rapid jump while sprinting
      controls.setKey('space', true); // Jump
      setTimeout(() => controls.setKey('space', false), 200); // Short jump duration

      logger.debug(`[CLETAG!] Frantic flee - distance: ${distance.toFixed(1)}m`);
    }, 300); // Check every 300ms

    // Store interval reference to clear later
    this.sprintTimeout = fleeInterval as any;

    // Award trust points for successful flee
    const cleetusPlayer = this.players.get(agentPlayerId);
    if (cleetusPlayer) {
      cleetusPlayer.trustPoints += TRUST_POINTS_FLEEING;
    }

    return true;
  }

  // Stop fleeing
  private stopFlee(): void {
    const controls = this.world?.controls;
    if (controls) {
      controls.enableSprint(false);
    }
    this.isSprinting = false;

    if (this.sprintTimeout) {
      clearInterval(this.sprintTimeout as any);
      this.sprintTimeout = null;
    }

    logger.info('[CLETAG!] Frantic flee stopped - safe or caught!');
  }

  // Check if player is being chased (someone is it and nearby)
  checkBeingChased(myPosition: THREE.Vector3): boolean {
    if (!this.currentIt) return false;

    const itPlayer = this.world.entities.items.get(this.currentIt);
    if (!itPlayer || !itPlayer.base?.position) return false;

    const distance = myPosition.distanceTo(itPlayer.base.position);
    return distance < TAG_DISTANCE * 2; // Being chased if it player is within 2x tag distance
  }

  // Announce tag in chat
  private async announceTag(taggerName: string, targetName: string): Promise<void> {
    const service = this.getService();
    const messages = [
      `CLETAG! ${targetName} is IT! ${taggerName} got 'em!`,
      `CLETAG! ${taggerName} tagged ${targetName}! You're it!`,
      `CLETAG! ${targetName}, you're it! Better run!`,
      `CLETAG! Tagged! ${targetName} is now it!`,
    ];

    const message = messages[Math.floor(Math.random() * messages.length)];
    await service?.messageManager.sendMessage(message);
  }

  // Update Cleetus's friendly players based on trust
  private async updateFriendlyPlayers(): Promise<void> {
    const service = this.getService();
    const runtime = service?.runtime;
    if (!runtime) return;

    const trustedPlayers: string[] = [];
    for (const [id, player] of this.players.entries()) {
      if (player.trustPoints >= TRUST_POINTS_TAGGER) {
        trustedPlayers.push(player.name);
      }
    }

    // Update Cleetus settings
    if (runtime.character.settings) {
      runtime.character.settings.friendlyPlayers = trustedPlayers;
      logger.info(`[CLETAG!] Updated friendly players: ${trustedPlayers.join(', ')}`);
    }
  }

  // Get player's trust level
  getTrustLevel(playerId: string): number {
    const player = this.players.get(playerId);
    return player?.trustPoints || 0;
  }

  // Check if player is trusted
  isPlayerTrusted(playerId: string): boolean {
    return this.getTrustLevel(playerId) >= TRUST_POINTS_TAGGER;
  }

  // Get game status for Cleetus's responses
  getGameStatus(): string {
    const agentPlayerId = this.world.entities.player?.data?.id;
    const cleetus = this.players.get(agentPlayerId);
    const trustedCount = Array.from(this.players.values()).filter(p => p.trustPoints >= TRUST_POINTS_TAGGER).length;

    if (!cleetus) {
      return "I'm looking for players to join CLETAG! Hold shift to super run when you're it!";
    }

    if (this.currentIt === agentPlayerId) {
      return "I'm IT in CLETAG! Better run!";
    }

    if (trustedCount > 0) {
      return `I've earned trust from ${trustedCount} players in CLETAG! They understand the hunt.`;
    }

    return "Want to earn my trust? Play CLETAG! Tag someone to prove yourself.";
  }

  // Cleanup
  destroy() {
    if (this.sprintTimeout) {
      clearTimeout(this.sprintTimeout);
    }
    this.gameActive = false;
    logger.info('[CLETAG!] Game destroyed');
  }

  private getService(): HyperfyService | null {
    try {
      const runtime = this.world?.elizaRuntime;
      if (!runtime) return null;
      return runtime.getService(HyperfyService.serviceType);
    } catch (error) {
      return null;
    }
  }
}