import {
    type Action, 
    type ActionExample, 
    type HandlerCallback, 
    type IAgentRuntime, 
    type Memory, 
    type State,
    logger,
} from '@elizaos/core';
// import { HyperfyService } from '../../plugin-hyperfy/service'; // Hypothetical import

export const interactAction: Action = {
  name: 'INTERACT',
  similes: ['USE', 'TRIGGER', 'ACTIVATE', 'PRESS_BUTTON', 'INTERACT_WITH_OBJECT'],
  description:
    'Interacts with the closest interactable object/action node in the Hyperfy world (usually simulates pressing the "E" key).',
  validate: async (_runtime: IAgentRuntime) => {
    // Could add validation to check if Hyperfy service is running
    return true;
  },
  handler: async (
    runtime: IAgentRuntime,
    _message: Memory, // Original message that led to this action
    _state: State, // State context
    _options: any, // Options passed to the action (e.g., target action ID)
    callback: HandlerCallback,
    _responses?: Memory[] // Previous responses/actions in the chain
  ) => {
    try {
        const hyperfyService = runtime.getService<any>('hyperfy');
        if (!hyperfyService || typeof hyperfyService.triggerUseAction !== 'function') {
            logger.error('[Interact Action] Hyperfy service not found or triggerUseAction method is missing.');
            await callback({ thought: 'Could not interact: Hyperfy service unavailable.', error: 'Service unavailable' });
            return;
        }

        // TODO: Add logic to select a specific interactable if multiple are nearby and options specify one?
        // For now, it just triggers the generic use action.

        logger.info('[Interact Action] Triggering Hyperfy use action...');
        await hyperfyService.triggerUseAction(); // Assuming default duration is fine

        const responseContent = {
            thought: 'Successfully triggered the interaction (usednearby object). ',
            text: '[Interacted with nearby object]', // Optional confirmation text
            actions: ['INTERACT'], 
        };

        await callback(responseContent);
        logger.info('[Interact Action] Interaction triggered successfully.');

    } catch (error) {
        logger.error(`[Interact Action] Error triggering interaction: ${error}`);
        await callback({ thought: `Failed to interact: ${error.message}`, error: error.message });
    }
  },
  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'There is a button here.',
        },
      },
      {
        name: '{{name2}}',
        content: {
          thought: 'I should press the button.',
          actions: ['INTERACT'],
        },
      },
       {
        name: 'SYSTEM', // Simulate result of interaction
        content: {
            text: '[Button Pressed]'
        }
      }
    ],
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Can you open this door for me?',
        },
      },
      {
        name: '{{name2}}',
        content: {
          thought: 'The door nearby probably opens with the use key. I will interact with it.',
          actions: ['INTERACT'],
        },
      },
      {
        name: 'SYSTEM', // Simulate result of interaction
        content: {
            text: '[Door Opened]'
        }
      }
    ],
  ] as ActionExample[][],
}; 