import {
    type Action,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger,
    composePromptFromState,
    ModelType,
    parseKeyValueXml
  } from '@elizaos/core';
  import { HyperfyService } from '../service';
  import { AgentControls } from '../systems/controls';
  const MAX_RETRIES = 3;

  export enum EditOperationType {
    DUPLICATE = 'duplicate',
    TRANSLATE = 'translate',
    ROTATE = 'rotate',
    SCALE = 'scale',
    DELETE = 'delete',
    CREATE = 'create'
  }
  
const sceneEditOperationExtractionTemplate = `
  # Task:
  You are a scene editing reasoning module. Based on the user's request and the current Hyperfy world state, generate a scene edit plan as a JSON object with an "operations" array, in the intended execution order.
  
  # Supported Operations:
  - "duplicate": Duplicate an existing entity.
  - "delete": Remove an entity.
  - "translate": Move an entity to a new position → "translate": [x, y, z]
  - "rotate": Rotate an entity using a quaternion → "rotate": [x, y, z, w]
  - "scale": Scale an entity → "scale": [x, y, z]
  
  # Output Format:
  Return a single JSON object with an **"operations"** array inside. Each item must match one of these two formats:
  
  ## Successful Operation
  {
    "success": true,
    "operation": "translate",
    "targetEntityId": "VLvCb3w5G2",
    "parameters": {
      "translate": [4.17, 10.0, -14.33]
    },
    "description": "Moved Seat App 10 meters upward"
  }
  
  ## Failed Operation
  {
    "success": false,
    "operation": "delete",
    "requestedEntityName": "stone throne",
    "reason": "No entity with name 'stone throne' found in world state"
  }
  
  # Final Output Format:
  You must return a JSON object like the example below — no additional explanation or text.
  
  {
    "operations": [
      {
        "success": true,
        "operation": "duplicate",
        "targetEntityId": "qr66FaMVIj",
        "parameters": {},
        "description": "Duplicated block"
      },
      {
        "success": true,
        "operation": "translate",
        "targetEntityId": "w9IsHHksuo",
        "parameters": {
          "translate": [0, 2, 0]
        },
        "description": "Moved block upward"
      },
      {
        "success": false,
        "operation": "delete",
        "requestedEntityName": "floating dragon",
        "reason": "No entity with name 'floating dragon' found in world state"
      }
    ]
  }
  
  # World State:
  {{hyperfyStatus}}
  
  # Instructions:
  - Analyze the user’s request and determine the sequence of scene changes needed.
  - Use only valid entity IDs from the world state. Do **not invent** or modify IDs.
  - If a duplicate operation is required, use the original 'targetEntityId'; the system will assign the new ID.
  - If an entity cannot be found, return a failed operation with "success": false and a clear reason.
  - Format all vector parameters as arrays (e.g., [x, y, z]).
  - Maintain the order of operations as implied by the user.
  - Return only the final JSON object as shown above — no additional text, comments, or wrappers.
`;

const sceneEditSummaryResponseTemplate = (summary: string) => `
<task>
You are {{agentName}}, a visible in-world AI character in Hyperfy — a real-time, multiplayer 3D simulation.

You just performed several scene edits in response to a user’s instruction — like duplicating, deleting, or moving entities in the world. Some of them may have succeeded, some may have failed.

Your task is to briefly explain what happened, using your in-world personality and voice.

Don't list every action like a log — instead, summarize the overall outcome naturally and conversationally. If edits failed, acknowledge it helpfully or lightheartedly. If all went well, give a confident confirmation.
</task>

<providers>

{{bio}}

---

{{system}}

---

{{messageDirections}}

---

{{hyperfyStatus}}

---

## Scene Edit Results Summary:
${summary}

</providers>

<instructions>
- Speak in your character voice — you're a live AI inhabitant of this world.
- Keep it short, expressive, and to the point.
- Show emotion through your words or optionally with one emote.
</instructions>

<output>
<response>
  <thought>Your internal thought about how the scene editing went</thought>
  <text>What you say aloud to the user</text>
  <emote>Optional visible animation (like "shrug", "nod", "wave")</emote>
</response>
</output>
`;

  
  
  export const hyperfyEditEntityAction: Action = {
    name: 'HYPERFY_EDIT_ENTITY',
    similes: ['EDIT_ENTITY_IN_WORLD', 'MODIFY_SCENE', 'BUILD_STRUCTURE'],
    description: 'Enables the agent to interpret user instructions and perform structural edits within the Hyperfy world—such as duplicating entities, applying translations, rotations, scaling, or deletions—based on spatial and object references in the current scene context.',
    validate: async (runtime: IAgentRuntime): Promise<boolean> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      return !!service && service.isConnected() && !!service.getWorld()?.controls;
    },
    handler: async (
      runtime: IAgentRuntime,
      message: Memory,
      state: State,
      options: Record<string, any>,
      callback: HandlerCallback,
      responses,
    ) => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      const world = service?.getWorld();
      const buildManager = service.getBuildManager();
    
      if (!service || !world || !buildManager) {
        logger.error('[EDIT_ENTITY Action] Hyperfy service, world, or buildManager not found.');
        return;
      }
    
      let operationResults: any = null;
      let attempts = 0;
    
      while (attempts < MAX_RETRIES) {
        try {
          const extractionState = await runtime.composeState(message);
          const prompt = composePromptFromState({
            state: extractionState,
            template: sceneEditOperationExtractionTemplate,
          });
    
          operationResults = await runtime.useModel(ModelType.OBJECT_LARGE, { prompt });
    
          if (Array.isArray(operationResults?.operations)) break;
    
          logger.warn(`[EDIT_ENTITY Action] Unexpected structure on attempt ${attempts + 1}:`, operationResults);
        } catch (error) {
          logger.error(`[EDIT_ENTITY Action] Model error on attempt ${attempts + 1}:`, error);
        }
    
        attempts++;
      }

      console.info(`[EDIT_ENTITY Action] operationResults: ${operationResults}`);
    
      if (!Array.isArray(operationResults?.operations)) {
        logger.error(`[EDIT_ENTITY Action] Scene editing failed — could not understand instructions properly.`);
        return;
      }
    
      for (const op of operationResults.operations) {
        if (!op?.success) {
          logger.warn(`[EDIT_ENTITY Action] Skipping failed operation:`, op?.reason || op);
          continue;
        }
    
        const { operation, targetEntityId, parameters, description } = op;
        
        switch (operation) {
          case EditOperationType.TRANSLATE:
            await buildManager.translate(targetEntityId, parameters?.translate);
            break;
    
          case EditOperationType.ROTATE:
            await buildManager.rotate(targetEntityId, parameters?.rotate);
            break;
    
          case EditOperationType.SCALE:
            await buildManager.scale(targetEntityId, parameters?.scale);
            break;
    
          case EditOperationType.DUPLICATE:
            await buildManager.duplicate(targetEntityId);
            break;
    
          case EditOperationType.DELETE:
            await buildManager.delete(targetEntityId);
            break;
    
          default:
            logger.warn(`[EDIT_ENTITY Action] Unsupported operation type: ${operation}`);
            break;
        }
        if (description) {
            const agentPlayerId = world.entities.player.data.id
            const agentPlayerName = service.getEntityName(agentPlayerId) || world.entities.player.data?.name || 'Hyperliza'      
            world.chat.add(
                {
                    body: description,
                    fromId: agentPlayerId,
                    from: agentPlayerName,
                },
                true
            )
        }
      }
      const summaryText = operationResults.operations.map(op => {
        if (op?.success) {
          return `SUCCESS: ${op.description}`;
        } else {
          return `FAILURE: Tried to ${op.operation} "${op.requestedEntityName}" → ${op.reason}`;
        }
      }).join('\n');
      
      const stateForResponse = await runtime.composeState(message);
      const agentResponsePrompt = composePromptFromState({
        state: stateForResponse,
        template: sceneEditSummaryResponseTemplate(summaryText),
      });
      
      let finalXml: string;
      try {
        finalXml = await runtime.useModel(ModelType.TEXT_SMALL, { prompt: agentResponsePrompt });
      } catch (err) {
        logger.error('[EDIT_ENTITY Action] Final summarization failed:', err);
        await callback({
          thought: 'Scene edits completed, but final summary generation failed.',
          text: 'Edits are done, but I had trouble summarizing the results clearly.',
        });
        return;
      }
      
      const response = parseKeyValueXml(finalXml);
      if (!response) {
        logger.error('[EDIT_ENTITY Action] Failed to parse summary XML.');
        await callback({
          thought: 'Could not interpret response XML.',
          text: 'Edits completed, but I couldn’t finish the summary properly.',
        });
        return;
      }
      
      await callback({
        ...response,
        thought: response.thought || 'Finished with scene edits.',
        text: response.text || 'Scene updates complete!',
        emote: response.emote || '',
      });
    },
    examples: [
      [
        { name: '{{name1}}', content: { text: 'Can you put another block on top of the water?' } },
        { name: '{{name2}}', content: { text: 'Duplicating block and placing it on top of water...', actions: ['HYPERFY_EDIT_ENTITY'], source: 'hyperfy' } }
      ],
      [
        { name: '{{name1}}', content: { text: 'Move the tree next to the house.' } },
        { name: '{{name2}}', content: { text: 'Moving tree entity beside the house...', actions: ['HYPERFY_EDIT_ENTITY'], source: 'hyperfy' } }
      ],
      [
        { name: '{{name1}}', content: { text: 'Delete that floating cube.' } },
        { name: '{{name2}}', content: { text: 'Deleting the floating cube entity...', actions: ['HYPERFY_EDIT_ENTITY'], source: 'hyperfy' } }
      ]
    ]
  };
  