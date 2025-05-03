import 'ses';

import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type ProviderResult,
    logger
} from '@elizaos/core';
import { HyperfyService } from '../service';

export const hyperfyProvider: Provider = {
    name: 'HYPERFY_WORLD_STATE',
    description: 'Provides current entity positions/rotations and agent state in the connected Hyperfy world.',
    dynamic: true,
    get: async (runtime: IAgentRuntime, _message: Memory): Promise<ProviderResult> => {
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
  
      if (!service || !service.isConnected()) {
        return {
          text: '# Hyperfy World State\nStatus: Not connected to a Hyperfy world.',
          values: { hyperfy_status: 'disconnected' },
          data: { status: 'disconnected' },
        };
      }
  
      try {
        const state = service.getState();
  
        // Format agent state
        let agentText = 'Agent: Not found';
        if (state.agent?.position && state.agent?.rotation) {
            const pos = state.agent.position.map((p: number) => p.toFixed(2)).join(', ');
            // Rotation is [x, y, z, w] quaternion
            const rot = state.agent.rotation.map((r: number) => r.toFixed(2));
            agentText = `Agent: Pos(${pos}), Rot(x:${rot[0]}, y:${rot[1]}, z:${rot[2]}, w:${rot[3]}) [Quat]`;
        }
  
        // Format entities from the map
        const entityLines: string[] = [];
        const maxEntitiesToShow = 10;
        let count = 0;
        // Iterate over the entities Map from the service state
        for (const [id, entityState] of state.entities.entries()) {
             if (count >= maxEntitiesToShow) break;

             // Use service.getEntityName to get name (checks map first)
             // Use type or 'unknown' as fallback if name is null/undefined
             const name = service.getEntityName(id) || entityState.type || 'unknown';

             // Position from our internal state map
             const posArr = entityState.position;
             const pos = posArr ? posArr.map((p: number) => p.toFixed(2)).join(', ') : 'N/A';

             const shortId = typeof id === 'string' ? `${id.substring(0, 6)}...` : id;
             // Include type in parenthesis if different from name
             const typeInfo = (entityState.type && entityState.type !== name) ? ` (${entityState.type})` : '';

             entityLines.push(`- ${shortId} (${name}${typeInfo}): Pos(${pos})`);
             count++;
        }

        const entityText = state.entities.size > 0
            ? `Entities (${state.entities.size} total, showing up to ${maxEntitiesToShow}):\n${entityLines.join('\n')}`
            : 'Entities: None found';
  
  
        const formattedText = `# Hyperfy World State\nStatus: ${state.status}\n${agentText}\n${entityText}`;
  
        // Prepare data for values and raw data
        // Convert map to a more serializable object for the data field
        const entitiesData = Object.fromEntries(state.entities);

        return {
          text: formattedText,
          values: { // Simplified values for quick access
            hyperfy_status: state.status,
            agentPosition: JSON.stringify(state.agent?.position), // Keep as JSON string
            // agentRotation: JSON.stringify(state.agent?.rotation), // Maybe omit rotation from simple values
            entityCount: state.entities.size,
          },
          data: { // Pass more structured raw data including the entities object
              status: state.status,
              agent: state.agent,
              entities: entitiesData, // Pass the object form
          },
        };
      } catch (error: any) { // Add type annotation for error
         logger.error('Error getting Hyperfy state from service:', error);
         return {
          text: '# Hyperfy World State\nStatus: Error retrieving state.',
          values: { hyperfy_status: 'error' },
          data: { status: 'error', error: error.message },
        };
      }
    },
  };