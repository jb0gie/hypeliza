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
    similes: ['JUMP', 'HOP', 'LEAP', 'BOUNCE', 'JUMP LEFT', 'JUMP RIGHT', 'JUMP BACK'],
    description: 'Makes the agent perform a single jump. For double jumps, use HYPERFY_DOUBLE_JUMP action.',
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
                content: { text: 'do a double jump' },
            },
            {
                user: '{{user2}}',
                content: { text: 'Double jump!', actions: ['HYPERFY_JUMP'], source: 'hyperfy' },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'jump left' },
            },
            {
                user: '{{user2}}',
                content: { text: 'Jumping left!', actions: ['HYPERFY_JUMP'], source: 'hyperfy' },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'jump right' },
            },
            {
                user: '{{user2}}',
                content: { text: 'Jumping right!', actions: ['HYPERFY_JUMP'], source: 'hyperfy' },
            },
        ],
        [
            {
                user: '{{user1}}',
                content: { text: 'jump back' },
            },
            {
                user: '{{user2}}',
                content: { text: 'Jumping back!', actions: ['HYPERFY_JUMP'], source: 'hyperfy' },
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
        message: Memory,
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

        // Parse the message to determine jump type
        const text = message.content.text?.toLowerCase() || '';
        const isDoubleJump = text.includes('double') || (text.match(/jump/g) || []).length > 1;
        let directionKey: string | null = null;

        if (text.includes('left')) {
            directionKey = 'keyA';
        } else if (text.includes('right')) {
            directionKey = 'keyD';
        } else if (text.includes('back') || text.includes('backward')) {
            directionKey = 'keyS';
        } else if (text.includes('forward') || text.includes('front')) {
            directionKey = 'keyW';
        }

        // Helper to wait and let physics update
        const waitFrames = (frames: number) =>
            new Promise(resolve => setTimeout(resolve, frames * 100));

        try {
            // Check if this is a CLETAG hyper mode activation
            const isCLETAGMode = text.includes('cletag');

            if (isCLETAGMode) {
                logger.info('[Jump Action] CLETAG MODE ACTIVATED! Going crazy with movement!');

                // Run CLETAG mode in background
                (async () => {
                    const directions = ['keyW', 'keyA', 'keyS', 'keyD'];
                    const numJumps = 5;

                    for (let i = 0; i < numJumps; i++) {
                        const randomDir = directions[Math.floor(Math.random() * directions.length)];

                        // Press and hold for 3 frames (300ms)
                        controls.setKey(randomDir, true);
                        controls.setKey('space', true);
                        logger.info(`[CLETAG Mode] Jump ${i + 1}/${numJumps}`);

                        await waitFrames(3);

                        // Release
                        controls.setKey('space', false);
                        controls.setKey(randomDir, false);

                        // Wait 2 frames between jumps
                        await waitFrames(2);
                    }
                    logger.info('[CLETAG Mode] Completed!');
                })();

                await callback?.({
                    text: 'CLETAG MODE ACTIVATED! Champion moves engaged!',
                    actions: ['HYPERFY_JUMP'],
                    source: 'hyperfy',
                });
                return;
            }

            // Handle directional jump
            if (directionKey) {
                logger.info(`[Jump Action] Executing directional jump: ${directionKey}`);

                controls.setKey(directionKey, true);
                controls.setKey('space', true);
                await waitFrames(3);
                controls.setKey('space', false);
                controls.setKey(directionKey, false);
                await waitFrames(2);

                await callback?.({
                    text: `Jumping ${text.includes('left') ? 'left' : text.includes('right') ? 'right' : text.includes('back') ? 'backward' : 'forward'}!`,
                    actions: ['HYPERFY_JUMP'],
                    source: 'hyperfy',
                });
                return;
            }

            // Standard jump
            logger.info('[Jump Action] Executing standard jump');
            controls.setKey('space', true);
            await waitFrames(3);
            controls.setKey('space', false);
            await waitFrames(2);

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