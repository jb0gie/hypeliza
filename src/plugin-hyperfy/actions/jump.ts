import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger,
} from '@elizaos/core';
import { HyperfyService } from '../service';

export const hyperfyJumpAction: Action = {
    name: 'HYPERFY_JUMP',
    similes: ['JUMP', 'HOP', 'LEAP', 'BOUNCE'],
    description: 'Makes the agent jump in the Hyperfy world',
    examples: [
        [
            {
                user: '{{user1}}',
                content: { text: 'jump' },
            },
            {
                user: '{{user2}}',
                content: { text: 'Jumping!', actions: ['HYPERFY_JUMP'], source: 'hyperfy' },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'do a jump' },
            },
            {
                user: '{{user2}}',
                content: { text: 'Here I go!', actions: ['HYPERFY_JUMP'], source: 'hyperfy' },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'can you jump?' },
            },
            {
                user: '{{user2}}',
                content: { text: 'Watch this!', actions: ['HYPERFY_JUMP'], source: 'hyperfy' },
            },
        ],
    ],
    validate: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
        const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
        if (!service || !service.isConnected()) {
            logger.warn('[Jump Action] Hyperfy service not available or not connected');
            return false;
        }
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state: State,
        _options: any,
        callback?: HandlerCallback
    ) => {
        const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
        
        if (!service || !service.isConnected()) {
            logger.error('[Jump Action] Cannot jump. Hyperfy service unavailable.');
            await callback?.({ 
                text: 'Error: Cannot jump. Hyperfy connection unavailable.',
                error: true 
            });
            return;
        }

        const world = service.getWorld();
        const controls = world?.controls;
        
        if (!controls) {
            logger.error('[Jump Action] Controls not available');
            await callback?.({ 
                text: 'Error: Cannot jump. Controls unavailable.',
                error: true 
            });
            return;
        }

        try {
            // Press and release space key to jump
            controls.setKey('space', true);
            
            // Hold for a short time then release
            setTimeout(() => {
                controls.setKey('space', false);
                logger.info('[Jump Action] Jump executed');
            }, 100);

            await callback?.({
                text: '',
                actions: ['HYPERFY_JUMP'],
                source: 'hyperfy',
            });
        } catch (error) {
            logger.error('[Jump Action] Error during jump:', error);
            await callback?.({
                text: 'Failed to jump.',
                error: true,
            });
        }
    },
};