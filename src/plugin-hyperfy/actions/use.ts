import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger
} from '@elizaos/core';
import { HyperfyService } from '../service';

export const hyperfyUseNearestObjectAction: Action = {
    name: 'HYPERFY_USE_NEAREST_OBJECT',
    similes: ['USE_OBJECT', 'INTERACT_WITH_OBJECT', 'PRESS_USE_KEY'],
    description: 'Simulates pressing the "use" key (E) to interact with the nearest usable object in the Hyperfy world.',
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      // Check if connected and controls are available (needed for triggerUseAction)
      return !!service && service.isConnected() && !!service.getWorld()?.controls;
    },
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
      options: { duration?: number }, // Allow optional duration override (in milliseconds)
      callback: HandlerCallback
    ) => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!service) {
        logger.error('Hyperfy service not found for HYPERFY_USE_NEAREST_OBJECT action.');
        await callback({ text: "Error: Cannot interact. Hyperfy connection unavailable." });
        return;
      }

      const holdDuration = options?.duration; // Use provided duration if available, service has default

      try {
        // Call the service method to simulate the key press
        await service.triggerUseAction(holdDuration); // Pass duration if provided

        // Provide confirmation via callback
        // Note: We don't know *what* object was used, just that the action was attempted.
        await callback({
           text: `Attempted to use the nearest object.`,
           actions: ['HYPERFY_USE_NEAREST_OBJECT'],
           source: 'hyperfy',
           metadata: {
               status: 'action_simulated',
               simulatedKey: 'E',
               holdDurationMs: holdDuration || 600 // Report the duration used (get default from service if possible?)
           }
        });

      } catch (error: any) {
        logger.error(`Error during HYPERFY_USE_NEAREST_OBJECT:`, error);
        await callback({ text: `Error trying to use object: ${error.message}` });
      }
    },
     examples: [
      [
        { name: '{{name1}}', content: { text: 'Use the object in front of me.' } },
        { name: '{{name2}}', content: { text: 'Attempted to use the nearest object.', actions: ['HYPERFY_USE_NEAREST_OBJECT'], source: 'hyperfy' } } // Simplified example
      ],
       [
        { name: '{{name1}}', content: { text: 'Interact with the button.' } },
        { name: '{{name2}}', content: { text: 'Attempted to use the nearest object.', actions: ['HYPERFY_USE_NEAREST_OBJECT'], source: 'hyperfy' } }
      ]
     ]
  }; 