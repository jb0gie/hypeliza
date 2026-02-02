import { logger } from '@elizaos/core';
import { HyperfyService } from '../service';
import * as THREE from 'three';
import type { IAgentRuntime } from '@elizaos/core';

interface CLETAGState {
    isActive: boolean;
    isIt: boolean; // Is Cleetus "it"?
    lastTaggedBy: string | null; // Player ID who tagged Cleetus
    lastTaggedAt: number;
    continuousMovement: boolean;
    jumpInterval: NodeJS.Timeout | null;
    movementInterval: NodeJS.Timeout | null;
    collisionCheckInterval: NodeJS.Timeout | null;
}

const TAGGING_DISTANCE = 3.0; // Meters
const MOVEMENT_SPEED = 15.0; // Faster for CLETAG
const JUMP_INTERVAL_MIN = 1000; // Minimum time between jumps (ms)
const JUMP_INTERVAL_MAX = 3000; // Maximum time between jumps (ms)
const COLLISION_CHECK_INTERVAL = 100; // Check collisions every 100ms
const ANGLE_VARIATION = 0.15; // ±15% angular variation to prevent wall clipping

export class CLETAGGameManager {
    private state: CLETAGState = {
        isActive: false,
        isIt: true, // Cleetus starts as "it" (seeker)
        lastTaggedBy: null,
        lastTaggedAt: 0,
        continuousMovement: false,
        jumpInterval: null,
        movementInterval: null,
        collisionCheckInterval: null,
    };

    constructor(
        private runtime: IAgentRuntime,
        private hyperfyService: HyperfyService
    ) {}

    /**
     * Start CLETAG game mode
     */
    async startGame(): Promise<void> {
        if (this.state.isActive) {
            logger.info("[CLETAG] Game already active");
            return;
        }

        logger.info("[CLETAG] Starting CLETAG game mode!");
        this.state.isActive = true;
        this.state.isIt = true; // Cleetus starts as "it"
        this.state.continuousMovement = true;

        // Start continuous movement
        this.startContinuousMovement();

        // Start random jumping
        this.startRandomJumping();

        // Start collision detection for tagging
        this.startCollisionDetection();

        logger.info("[CLETAG] Game started - Cleetus is it and running wild!");
    }

    /**
     * Stop CLETAG game mode
     */
    async stopGame(): Promise<void> {
        if (!this.state.isActive) {
            return;
        }

        logger.info("[CLETAG] Stopping CLETAG game mode");
        this.state.isActive = false;
        this.state.continuousMovement = false;

        // Clear all intervals
        if (this.state.jumpInterval) {
            clearInterval(this.state.jumpInterval);
            this.state.jumpInterval = null;
        }
        if (this.state.movementInterval) {
            clearInterval(this.state.movementInterval);
            this.state.movementInterval = null;
        }
        if (this.state.collisionCheckInterval) {
            clearInterval(this.state.collisionCheckInterval);
            this.state.collisionCheckInterval = null;
        }

        // Stop movement
        const world = this.hyperfyService.getWorld();
        const controls = world?.controls;
        if (controls) {
            controls.stopAllActions("CLETAG game ended");
        }

        logger.info("[CLETAG] Game stopped");
    }

    /**
     * Tag Cleetus (when player collides with him)
     */
    async tagCleetus(playerId: string, playerName: string): Promise<void> {
        if (!this.state.isActive || !this.state.isIt) {
            return; // Can't tag if not active or not "it"
        }

        logger.info(`[CLETAG] Cleetus tagged by ${playerName} (${playerId})!`);

        // Stop the game temporarily
        await this.stopGame();

        // Update state
        this.state.isIt = false; // Cleetus is no longer "it"
        this.state.lastTaggedBy = playerId;
        this.state.lastTaggedAt = Date.now();

        // Send message to the player who tagged him
        const message = `YOOO! You tagged me! ${playerName} is the new CLETAG champion! I was searching for Schwepe but you found ME first!`;

        // Use runtime to send message (this will be handled by the message manager)
        logger.info(`[CLETAG] Sending tag message: ${message}`);

        // Store the tag event for the agent to respond to
        (this.runtime as any).cletagLastTag = {
            playerId,
            playerName,
            timestamp: Date.now()
        };

        // Notify the character to speak
        this.runtime.emitEvent('CLETAG_TAGGED', {
            playerId,
            playerName,
            message
        });
    }

    /**
     * Start CLETAG again (when another player says CLETAG)
     */
    async restartGame(): Promise<void> {
        logger.info("[CLETAG] Restarting game!");
        await this.stopGame();
        this.state.isIt = true; // Cleetus is "it" again
        await this.startGame();
    }

    /**
     * Start continuous random movement
     */
    private startContinuousMovement(): void {
        if (!this.state.continuousMovement) return;

        const world = this.hyperfyService.getWorld();
        const controls = world?.controls;
        if (!controls) {
            logger.error("[CLETAG] Controls not available for continuous movement");
            return;
        }

        const move = async () => {
            if (!this.state.continuousMovement || !this.state.isActive) return;

            try {
                // Pick a random direction with angular variation
                const directions = ['forward', 'backward', 'left', 'right'];
                const direction = directions[Math.floor(Math.random() * directions.length)];

                // Add random angular variation to prevent wall clipping
                const angleVariation = (Math.random() - 0.5) * ANGLE_VARIATION;

                // Get current position
                const player = world.entities.player;
                if (!player?.base?.position) {
                    logger.warn("[CLETAG] Player position not available");
                    return;
                }

                // Calculate target position with angular variation
                const currentPos = player.base.position;
                const distance = 5 + Math.random() * 10; // Random distance 5-15m
                const baseAngle = {
                    forward: 0,
                    backward: Math.PI,
                    left: Math.PI / 2,
                    right: -Math.PI / 2
                }[direction] || 0;

                const finalAngle = baseAngle + angleVariation;
                const targetX = currentPos.x + Math.sin(finalAngle) * distance;
                const targetZ = currentPos.z + Math.cos(finalAngle) * distance;

                logger.debug(`[CLETAG] Moving ${direction} with angle variation ${angleVariation.toFixed(2)} to ${targetX.toFixed(1)}, ${targetZ.toFixed(1)}`);

                // Enable sprint (shift) for super speed
                controls.enableSprint(true);

                // Simple navigation without spatial awareness
                // NOTE: Spatial awareness temporarily disabled for basic locomotion
                await controls.goto(targetX, targetZ);

                // Wait a bit before next move
                await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

            } catch (error) {
                logger.error("[CLETAG] Error in continuous movement:", error);
            }

            // Schedule next movement if still active
            if (this.state.continuousMovement && this.state.isActive) {
                setTimeout(move, 100);
            }
        };

        // Start movement loop
        this.state.movementInterval = setTimeout(move, 0);
    }

    /**
     * Start random jumping
     */
    private startRandomJumping(): void {
        const world = this.hyperfyService.getWorld();
        const controls = world?.controls;
        if (!controls) {
            logger.error("[CLETAG] Controls not available for jumping");
            return;
        }

        const jump = async () => {
            if (!this.state.isActive || !this.state.isIt) return;

            try {
                logger.debug("[CLETAG] Random jump!");

                // Quick jump
                controls.setKey('space', true);
                await new Promise(resolve => setTimeout(resolve, 300));
                controls.setKey('space', false);

            } catch (error) {
                logger.error("[CLETAG] Error in jump:", error);
            }
        };

        // Schedule random jumps
        this.state.jumpInterval = setInterval(() => {
            if (this.state.isActive && this.state.isIt) {
                jump();
            }
        }, JUMP_INTERVAL_MIN + Math.random() * (JUMP_INTERVAL_MAX - JUMP_INTERVAL_MIN));
    }

    /**
     * Start collision detection for tagging
     */
    private startCollisionDetection(): void {
        this.state.collisionCheckInterval = setInterval(() => {
            if (!this.state.isActive || !this.state.isIt) return;

            try {
                this.checkForTagCollisions();
            } catch (error) {
                logger.error("[CLETAG] Error in collision detection:", error);
            }
        }, COLLISION_CHECK_INTERVAL);
    }

    /**
     * Check if any player is within tagging distance
     */
    private checkForTagCollisions(): void {
        const world = this.hyperfyService.getWorld();
        const player = world?.entities?.player;
        if (!player?.base?.position) return;

        const cleetusPos = player.base.position;

        // Check all entities for players
        world.entities.items.forEach((entity: any) => {
            if (entity?.data?.id === player.data.id) return; // Skip self
            if (!entity?.base?.position) return;

            // Check if this is a player (not an object)
            const isPlayer = entity.data.type === 'player' || entity.data.id?.startsWith('player-');
            if (!isPlayer) return;

            // Calculate distance
            const distance = cleetusPos.distanceTo(entity.base.position);

            // Simple distance check for tagging (spatial awareness disabled)
            // NOTE: Spatial awareness temporarily disabled for basic locomotion

            if (distance <= TAGGING_DISTANCE) {
                // Tag collision detected!
                const playerId = entity.data.id;
                const playerName = entity.data.name || 'Unknown Player';

                logger.info(`[CLETAG] Tag collision! ${playerName} is ${distance.toFixed(2)}m away`);

                // Tag Cleetus
                this.tagCleetus(playerId, playerName);
            }
        });
    }

    /**
     * Get current CLETAG state
     */
    getState(): CLETAGState {
        return { ...this.state };
    }

    /**
     * Check if CLETAG is active
     */
    isActive(): boolean {
        return this.state.isActive;
    }

    /**
     * Check if Cleetus is "it"
     */
    isIt(): boolean {
        return this.state.isIt;
    }

    /**
     * Get last player who tagged Cleetus
     */
    getLastTag(): { playerId: string; playerName: string; timestamp: number } | null {
        if (!this.state.lastTaggedBy) return null;

        return {
            playerId: this.state.lastTaggedBy,
            playerName: "Unknown", // Would need to map from player ID
            timestamp: this.state.lastTaggedAt
        };
    }
}

export default CLETAGGameManager;
