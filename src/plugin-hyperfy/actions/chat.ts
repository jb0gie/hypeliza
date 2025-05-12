import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger
} from '@elizaos/core';
import { HyperfyService } from '../service';

export const hyperfyChatAction: Action = {
    name: 'HYPERFY_CHAT',
    similes: ['HYPERFY_SEND_MESSAGE', 'CHAT_IN_WORLD', 'WORLD_CHAT'],
    description: 'Sends a chat message within the connected Hyperfy world.',
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      return !!service && service.isConnected();
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
      options: { text?: string }, // Allow passing text directly
      callback: HandlerCallback
    ) => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!service) {
        logger.error('Hyperfy service not found for HYPERFY_CHAT action.');
        // Use callback for user-facing errors if appropriate
        await callback({ text: "Error: Could not send message. Hyperfy connection unavailable." });
        return; // Stop execution
      }
  
      const textToSend = options?.text || message.content.text || '...'; // Determine text, provide default
  
      if (!textToSend || textToSend === '...') {
          logger.warn('HYPERFY_CHAT: No text provided to send.');
          await callback({ text: "Action failed: No message text specified."});
          return;
      }
  
      try {
        const messageManager = service.getMessageManager();
        await messageManager.sendMessage(textToSend);
        // Confirmation callback
        await callback({
           text: `Sent message to Hyperfy: "${textToSend}"`,
           actions: ['HYPERFY_CHAT'], // Indicate which action was performed
           source: 'hyperfy' // Mark source as hyperfy
        });
      } catch (error) {
        logger.error('Error sending Hyperfy chat message via service:', error);
        // Error callback
        await callback({ text: `Error sending message to Hyperfy: ${error.message}` });
      }
    },
     examples: [
      [
        { name: '{{name1}}', content: { text: 'Say hello in Hyperfy' } },
        // Example assumes agent decides to say "Hello there!"
        { name: '{{name2}}', content: { text: 'Sent message to Hyperfy: "Hello there!"', actions: ['HYPERFY_CHAT'], source: 'hyperfy' } }
      ],
      [
        { name: '{{name1}}', content: { text: 'Tell everyone in the world "I have arrived"' } },
        { name: '{{name2}}', content: { text: 'Sent message to Hyperfy: "I have arrived"', actions: ['HYPERFY_CHAT'], source: 'hyperfy' } }
      ]
    ]
  };