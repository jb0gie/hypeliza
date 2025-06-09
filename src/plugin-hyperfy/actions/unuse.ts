import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger
  } from '@elizaos/core';
  import { HyperfyService } from '../service';
  import { AgentActions } from '../systems/actions';
  
  export const hyperfyUnuseItemAction: Action = {
    name: 'HYPERFY_UNUSE_ITEM',
    similes: ['RELEASE_ITEM', 'DROP_ITEM', 'CANCEL_INTERACTION'],
    description: `Drops or stops interacting with the currently held item; use when a player tells you to release it or you're done using it.`,
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      const world = service?.getWorld();
      return !!service && service.isConnected() && !!world?.actions;
    },
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State,
      _options: {},
      callback: HandlerCallback
    ) => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      const world = service?.getWorld();
      const actions = world?.actions as AgentActions | undefined;
  
      if (!service || !world || !actions) {
        logger.error('[UNUSE ITEM] Hyperfy service, world, or actions system not found.');
        await callback({ text: "Error: Cannot unuse item. Required systems are unavailable." });
        return;
      }
  
      logger.info('[UNUSE ITEM] Attempting to release current action.');
      actions.releaseAction();
  
      
      await callback({
        text: 'Item released.',
        actions: ['HYPERFY_UNUSE_ITEM'],
        source: 'hyperfy',
        metadata: { status: 'released' }
      });
    },
    examples: [
      [
        { name: '{{name1}}', content: { text: 'Drop it now.' } },
        { name: '{{name2}}', content: { text: 'Item released.', actions: ['HYPERFY_UNUSE_ITEM'], source: 'hyperfy' } }
      ],
      [
        { name: '{{name1}}', content: { text: 'Stop using that.' } },
        { name: '{{name2}}', content: { text: 'Item released.', actions: ['HYPERFY_UNUSE_ITEM'], source: 'hyperfy' } }
      ]
    ]
  };
  