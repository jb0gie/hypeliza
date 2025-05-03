import {
    logger,
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State
} from '@elizaos/core';
import * as THREE from 'three'; // Need THREE for Vector3
import { AgentControls } from '../controls'; // Import AgentControls type
import { HyperfyService } from '../service';

// --- Constants --- >
const RANDOM_WALK_INTERVAL = 5000; // ms, how often to pick a new random point (e.g., 5 seconds)
const RANDOM_WALK_MAX_DISTANCE = 7; // meters, max distance for random points from current location
// <------------------

// State to manage the random walk interval for this specific action instance
// NOTE: This is simple in-memory state. A more robust implementation might store
// active loops/intervals in the runtime state or a dedicated manager.
let randomWalkIntervalId: NodeJS.Timeout | null = null;
let isActionWalkingRandomly = false; // Flag specific to this action

export const hyperfyWalkRandomlyAction: Action = {
    name: 'HYPERFY_WALK_RANDOMLY',
    similes: ['WANDER', 'PACE_AROUND', 'WALK_AROUND', 'MOVE_RANDOMLY'],
    description: 'Makes the agent continuously walk to random nearby points until stopped.',
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      // Valid only if connected and controls are available
      return !!service && service.isConnected() && !!service.getWorld()?.controls;
    },
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
      options: { interval?: number, distance?: number, command?: 'start' | 'stop' }, // interval(secs), distance(m), command
      callback: HandlerCallback
    ) => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      const world = service?.getWorld();
      const controls = world?.controls as AgentControls | undefined;

      if (!service || !world || !controls) {
        logger.error('Hyperfy service, world, or controls not found for HYPERFY_WALK_RANDOMLY action.');
        await callback({ text: "Error: Cannot wander. Hyperfy connection/controls unavailable." });
        return;
      }

      const command = options?.command || 'start'; // Default to starting
      const intervalMs = options?.interval ? options.interval * 1000 : RANDOM_WALK_INTERVAL;
      const maxDistance = options?.distance || RANDOM_WALK_MAX_DISTANCE;

      // --- Stop Command --- >
      if (command === 'stop') {
          if (randomWalkIntervalId) {
              clearInterval(randomWalkIntervalId);
              randomWalkIntervalId = null;
              logger.info('[Walk Randomly Action] Cleared random walk interval.');
          }
          if (isActionWalkingRandomly) {
               controls.stopNavigation("random walk action stopped"); // Stop current navigation leg
               isActionWalkingRandomly = false;
               await callback({ text: "Stopped wandering.", actions: ['HYPERFY_WALK_RANDOMLY'], source: 'hyperfy', metadata: { status: 'stopped' } });
          } else {
               await callback({ text: "Was not wandering.", source: 'hyperfy' });
          }
          return;
      }
      // <---------------------

      // --- Start Command --- >
      if (isActionWalkingRandomly) {
          logger.warn('[Walk Randomly Action] Already walking randomly. Restarting with new parameters if provided.');
          if (randomWalkIntervalId) clearInterval(randomWalkIntervalId); // Clear old interval
      }

      isActionWalkingRandomly = true;
      logger.info(`[Walk Randomly Action] Starting random walk. Interval: ${intervalMs}ms, Max Distance: ${maxDistance}m`);

      // Function to pick and navigate
      const pickAndGo = () => {
           if (!isActionWalkingRandomly) return; // Stop if flag was turned off

           const player = world?.entities?.player;
           if (!player?.base?.position || !(player.base.position instanceof THREE.Vector3)) {
               logger.warn("[Walk Randomly Action] Cannot pick point: Player position unavailable/invalid. Stopping wander.");
               if(randomWalkIntervalId) clearInterval(randomWalkIntervalId); randomWalkIntervalId = null;
               isActionWalkingRandomly = false;
               controls.stopNavigation("wander error - player pos invalid");
               return;
           }
           const currentPos = player.base.position as THREE.Vector3;

           // Generate random offset
           const randomAngle = Math.random() * Math.PI * 2;
           const randomDistance = Math.random() * maxDistance;
           const offsetX = Math.cos(randomAngle) * randomDistance;
           const offsetZ = Math.sin(randomAngle) * randomDistance;
           const targetX = currentPos.x + offsetX;
           const targetZ = currentPos.z + offsetZ;

           logger.info(`[Walk Randomly Action] New target: (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
           controls.navigateTo(targetX, targetZ); // Tell controls to go there
      };

      // Start the first leg immediately
      pickAndGo();

      // Set interval for subsequent legs
      randomWalkIntervalId = setInterval(pickAndGo, intervalMs);

      await callback({
         text: `Starting to wander randomly... (New target every ~${(intervalMs / 1000).toFixed(1)}s)`,
         actions: ['HYPERFY_WALK_RANDOMLY'],
         source: 'hyperfy',
         metadata: { status: 'started', intervalMs: intervalMs, maxDistance: maxDistance }
      });

      // Note: No automatic stop condition here. Requires explicit HYPERFY_STOP_MOVING or
      // HYPERFY_WALK_RANDOMLY { command: 'stop' }
    },
     examples: [
      [
        { name: '{{name1}}', content: { text: 'Wander around for a bit.' } },
        { name: '{{name2}}', content: { text: 'Starting to wander randomly... (New target every ~5.0s)', actions: ['HYPERFY_WALK_RANDOMLY'], source: 'hyperfy' } }
      ],
       [
        { name: '{{name1}}', content: { text: 'Just pace around here.' } },
        { name: '{{name2}}', content: { text: 'Starting to wander randomly... (New target every ~5.0s)', actions: ['HYPERFY_WALK_RANDOMLY'], source: 'hyperfy' } }
      ],
      [
        { name: '{{name1}}', content: { text: 'Stop wandering.' } }, // Assumes it was wandering
        { name: '{{name2}}', content: { text: 'Stopped wandering.', actions: ['HYPERFY_WALK_RANDOMLY'], source: 'hyperfy' } }
      ]
     ]
  }; 