import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger,
    EventType,
    type EventHandler
} from '@elizaos/core';
import { HyperfyService } from '../service';
import { AgentControls } from '../controls'; // Import AgentControls type
// Import THREE types if needed, e.g., for metadata typing
// import type * as THREE from 'three';

export const hyperfyGotoEntityAction: Action = {
    name: 'HYPERFY_GOTO_ENTITY',
    similes: ['GO_TO_ENTITY_IN_WORLD', 'MOVE_TO_ENTITY', 'NAVIGATE_TO_ENTITY'],
    description: 'Navigates the agent to the specified entity ID within the connected Hyperfy world using the AgentControls system.',
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      // Check if connected and if controls are available
      return !!service && service.isConnected() && !!service.getWorld()?.controls;
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
      options: { entityId?: string },
      callback: HandlerCallback
    ) => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      const world = service?.getWorld(); // Use the getter
      const controls = world?.controls as AgentControls | undefined; // Get controls and cast type

      if (!service || !world || !controls) {
        logger.error('Hyperfy service, world, or controls not found for HYPERFY_GOTO_ENTITY action.');
        await callback({ text: "Error: Cannot navigate. Hyperfy connection/controls unavailable." });
        return;
      }

      const targetEntityId = options?.entityId || (message.content?.metadata as { targetEntityId?: string })?.targetEntityId;

      if (!targetEntityId) {
          logger.warn('HYPERFY_GOTO_ENTITY: No entity ID provided.');
          await callback({ text: "Action failed: No target entity ID specified.", metadata: { error: 'missing_entity_id' } });
          return;
      }

       // Skip self-check for now as getAgentPlayerId is not implemented
       /*
       const selfId = service.getAgentPlayerId();
       if (targetEntityId === selfId && selfId !== null) {
           logger.info('HYPERFY_GOTO_ENTITY: Target entity is self. Stopping any current movement.');
           controls.stopNavigation("target is self"); // Call controls method
           await callback({ text: "Already at the target location (it's me!)." });
           return;
       }
       */

      try {
        const targetPosition = service.getEntityPosition(targetEntityId);

        if (!targetPosition) {
            const targetName = service.getEntityName(targetEntityId);
            const errorMsg = `Error: Cannot navigate. Could not find location for entity ${targetName || targetEntityId}.`;
            logger.error(`HYPERFY_GOTO_ENTITY: ${errorMsg}`);
            await callback({ text: errorMsg, metadata: { error: 'entity_not_found', targetEntityId: targetEntityId } });
            return;
        }

        // Tell the controls system to start navigating
        const targetName = service.getEntityName(targetEntityId);
        logger.info(`HYPERFY_GOTO_ENTITY: Requesting navigation via controls to entity ${targetName || targetEntityId} at (${targetPosition.x.toFixed(2)}, ${targetPosition.z.toFixed(2)})`);
        controls.navigateTo(targetPosition.x, targetPosition.z); // Use controls method

        // Provide initial confirmation
        await callback({
           text: `Navigating towards ${targetName || `entity ${targetEntityId}`}...`,
           actions: ['HYPERFY_GOTO_ENTITY'],
           source: 'hyperfy',
           metadata: {
               targetEntityId: targetEntityId,
               targetPosition: targetPosition.toArray(),
               status: 'navigation_started'
           }
        });

        // Event listener logic remains the same (assuming runtime.on/off exist)
        let navigationCompleteListener: EventHandler<any> | null = null;
        navigationCompleteListener = async (eventData) => {
            if (eventData.eventName === 'HYPERFY_NAVIGATION_COMPLETE') {
                 const completedTargetPos = eventData.data?.target;
                 if (completedTargetPos && targetPosition && completedTargetPos[0] === targetPosition.x && completedTargetPos[2] === targetPosition.z) {
                    logger.info(`HYPERFY_GOTO_ENTITY: Received navigation complete event for target ${targetEntityId}.`);
                 } else {
                    logger.debug(`HYPERFY_GOTO_ENTITY: Received navigation complete event, but target position didn't match or was missing.`);
                 }
                 if (navigationCompleteListener) {
                    runtime.off(EventType.ACTION_COMPLETED, navigationCompleteListener);
                    logger.debug('HYPERFY_GOTO_ENTITY: Removed navigation complete listener.');
                    navigationCompleteListener = null;
                 }
            }
        };
        runtime.on(EventType.ACTION_COMPLETED, navigationCompleteListener);

      } catch (error: any) {
        logger.error(`Error during HYPERFY_GOTO_ENTITY for ID ${targetEntityId}:`, error);
        await callback({ text: `Error starting navigation: ${error.message}`, metadata: { error: 'navigation_start_failed' } });
      }
    },
     examples: [
      // Example assumes an entity "Bob" exists with ID "entity123"
      [
        { name: '{{name1}}', content: { text: 'Go to Bob' } }, // LLM should infer/find ID or user provides via options
        { name: '{{name2}}', content: { text: 'Navigating towards Bob...', actions: ['HYPERFY_GOTO_ENTITY'], source: 'hyperfy' } } // Removed metadata
      ],
       [
        { name: '{{name1}}', content: { text: 'Find entity abcdef' } }, // Assuming entity abcdef exists
        { name: '{{name2}}', content: { text: 'Navigating towards entity abcdef...', actions: ['HYPERFY_GOTO_ENTITY'], source: 'hyperfy' } } // Removed metadata
      ],
      // Example for failure (entity not found)
      [
        { name: '{{name1}}', content: { text: 'Go to the missing chair' } }, // User might specify ID in options
        { name: '{{name2}}', content: { text: 'Error: Cannot navigate. Could not find location for entity chair999.' } } // Assuming ID was chair999
      ]
     ]
  }; 