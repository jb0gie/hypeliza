import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger
} from '@elizaos/core';
import { HyperfyService } from '../service';
import { AgentControls } from '../systems/controls'; // Import AgentControls type

export const hyperfyStopMovingAction: Action = {
    name: 'HYPERFY_STOP_MOVING',
    similes: ['STOP', 'HALT', 'STOP_WALKING', 'CANCEL_MOVEMENT', 'STOP_PATROLLING'],
    description: 'Stops any current navigation or patrol activity.',
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      const controls = service?.getWorld()?.controls as AgentControls | undefined;
      // Valid only if connected and controls are available
      // Optional: Could check if getIsNavigating() or getIsPatrolling() is true
      return !!service && service.isConnected() && !!controls;
    },
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
      options: { reason?: string }, // Optional reason for stopping
      callback: HandlerCallback
    ) => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      const controls = service?.getWorld()?.controls as AgentControls | undefined;

      if (!controls) {
        // Should not happen if validate works, but good practice
        logger.error('Hyperfy service or controls not found for HYPERFY_STOP_MOVING action.');
        await callback({ text: "Error: Cannot stop movement. Hyperfy connection/controls unavailable." });
        return;
      }

      // Check for required method
      if (typeof controls.stopAllActions !== 'function') {
           logger.error('AgentControls missing stopAllActions method.');
           await callback({ text: "Error: Stop functionality not available in controls." });
           return;
      }

      const reason = options?.reason || "stop action called";

      try {
        // Call the stop navigation method
        controls.stopAllActions(reason);

        await callback({
           text: `Stopped navigation. Reason: ${reason}`,
           actions: ['HYPERFY_STOP_MOVING'],
           source: 'hyperfy',
           metadata: { status: 'movement_stopped', reason: reason }
        });

      } catch (error: any) {
        logger.error(`Error during HYPERFY_STOP_MOVING:`, error);
        await callback({ text: `Error stopping movement: ${error.message}` });
      }
    },
     examples: [
      [
        { name: '{{name1}}', content: { text: 'Stop walking.' } }, // Assumes agent is moving via GOTO
        { name: '{{name2}}', content: { text: 'Stopped current movement. Reason: stop action called', actions: ['HYPERFY_STOP_MOVING'], source: 'hyperfy' } }
      ],
       [
        { name: '{{name1}}', content: { text: 'Halt!' } }, // Assumes agent is moving via GOTO
        { name: '{{name2}}', content: { text: 'Stopped current movement. Reason: stop action called', actions: ['HYPERFY_STOP_MOVING'], source: 'hyperfy' } }
      ]
     ]
  }; 