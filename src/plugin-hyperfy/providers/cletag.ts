import { IAgentRuntime, logger, createUniqueUuid, type UUID } from '@elizaos/core';
import { HyperfyService } from '../service';
import { CLETAGGame } from '../managers/cletag-game';
import * as THREE from 'three';

let cletagGameInstance: CLETAGGame | null = null;

// Initialize CLETAG from world
export function initCLETAG(world: any): CLETAGGame | null {
  if (!world) {
    logger.warn('[CLETAG Provider] World not available');
    return null;
  }

  if (!cletagGameInstance) {
    cletagGameInstance = new CLETAGGame(world);
    logger.info('[CLETAG Provider] Game initialized via provider');
  }

  return cletagGameInstance;
}

// Get CLETAG instance
export function getCLETAG(): CLETAGGame | null {
  return cletagGameInstance;
}

// Check if sprint should be enabled
export function shouldEnableSprint(runtime: IAgentRuntime): boolean {
  const cletag = getCLETAG();
  if (!cletag) return false;

  const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
  const world = service?.getWorld();
  if (!world?.entities?.player) return false;

  // Enable sprint if being chased in CLETAG
  const myPos = world.entities.player.base.position;
  return cletag.checkBeingChased(myPos);
}

// CLETAG game state provider
export const cletagProvider = {
  get: async (runtime: IAgentRuntime, message: any) => {
    const cletag = getCLETAG();
    if (!cletag) {
      return {
        cletagStatus: "Game not initialized",
        trustLevel: 0,
        currentIt: null,
        nearbyPlayers: [],
      };
    }

    const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
    const world = service?.getWorld();

    if (!world?.entities?.player) {
      return null;
    }

    const myPos = world.entities.player.base.position;
    const nearbyPlayers = cletag.getNearbyPlayers(myPos);
    const gameStatus = cletag.getGameStatus();

    return {
      cletagStatus: gameStatus,
      trustLevel: nearbyPlayers.length,
      currentIt: cletag.currentIt,
      nearbyPlayers: nearbyPlayers.map(p => ({
        name: p.name,
        isIt: p.isIt,
        trusted: cletag.isPlayerTrusted(p.id),
      })),
    };
  },
};

// Tag action handler
export const tagPlayer = async (runtime: IAgentRuntime, targetPlayerId: string): Promise<boolean> => {
  const cletag = getCLETAG();
  if (!cletag) {
    logger.warn('[CLETAG] Game not initialized');
    return false;
  }

  const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
  const world = service?.getWorld();
  if (!world?.entities?.player) {
    logger.warn('[CLETAG] World not ready');
    return false;
  }

  const myPos = world.entities.player.base.position;
  const targetName = cletag.canTagPlayer(targetPlayerId, myPos);

  if (targetName) {
    const success = await cletag.tagPlayer(targetPlayerId, targetName);
    if (success) {
      logger.info(`[CLETAG] Tagged ${targetName} successfully!`);
      // Enable sprint after tagging
      if (world.controls) {
        world.controls.enableSprint(true);
        setTimeout(() => world.controls.enableSprint(false), 2000);
      }
    }
    return success;
  }

  return false;
};

// Flee action handler
export const attemptFlee = async (runtime: IAgentRuntime): Promise<boolean> => {
  const cletag = getCLETAG();
  if (!cletag) {
    logger.warn('[CLETAG] Game not initialized');
    return false;
  }

  const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
  const world = service?.getWorld();
  if (!world?.entities?.player || !world.controls) {
    logger.warn('[CLETAG] World or controls not ready');
    return false;
  }

  const itPlayerId = cletag.currentIt;
  if (!itPlayerId) {
    logger.info('[CLETAG] No one is currently it, no need to flee');
    return false;
  }

  const success = await cletag.attemptFlee(itPlayerId);
  if (success) {
    logger.info('[CLETAG] Successfully activated sprint to flee!');
  }
  return success;
};

// Check trust level
export const checkTrust = (playerId: string): number => {
  const cletag = getCLETAG();
  if (!cletag) return 0;
  return cletag.getTrustLevel(playerId);
};

// Is player trusted
export const isPlayerTrusted = (playerId: string): boolean => {
  const cletag = getCLETAG();
  if (!cletag) return false;
  return cletag.isPlayerTrusted(playerId);
};