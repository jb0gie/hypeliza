import 'ses';

import {
    type IAgentRuntime,
    type Memory,
    type Provider,
    type ProviderResult,
    logger,
    createUniqueUuid
} from '@elizaos/core';
import { HyperfyService } from '../service';
import * as THREE from 'three'
import { Vector3Enhanced } from '../hyperfy/src/core/extras/Vector3Enhanced.js'
import { EMOTES_LIST } from '../constants.js';

export const hyperfyProvider: Provider = {
    name: 'HYPERFY_WORLD_STATE',
    description: 'Provides current entity positions/rotations and agent state in the connected Hyperfy world.',
    get: async (runtime: IAgentRuntime, _message: Memory): Promise<ProviderResult> => {
      
      const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);

      if (!service || !service.isConnected()) {
        return {
          text: '# Hyperfy World State\nConnection Status: Disconnected',
          values: { hyperfy_status: 'disconnected' },
          data: { status: 'disconnected' },
        };
      }

      try {
        const world = service.getWorld();
        const messageManager = service.getMessageManager();
        const _currentWorldId = service.currentWorldId;
        const elizaRoomId = createUniqueUuid(runtime, _currentWorldId || 'hyperfy-unknown-world') 
        const entities = world?.entities?.items;
        const agentId = world?.entities?.player?.data?.id;

        const allEntityIds: string[] = [];
        const categorizedEntities: Record<string, string[]> = {};
        let agentText = '## Agent Info (You)\nUnable to find your own entity.';

        for (const [id, entity] of entities.entries()) {
          const name = entity?.data?.name || entity?.blueprint?.name || 'Unnamed';
          const type = entity?.data?.type || 'unknown';
          const pos = entity?.base?.position || entity?.root?.position;
          const quat = entity?.base?.quaternion || entity?.root?.quaternion;
          const posStr = pos && (pos instanceof THREE.Vector3 || pos instanceof Vector3Enhanced)
            ? `[${[pos.x, pos.y, pos.z].map(p => p.toFixed(2)).join(', ')}]`
            : 'N/A';

          if (id === agentId) {
            const quatStr = quat && (quat instanceof THREE.Quaternion)
              ? `[${[quat.x, quat.y, quat.z, quat.w].map(q => q.toFixed(4)).join(', ')}]`
              : 'N/A';
            
            agentText = `## Agent Info (You)\nEntity ID: ${id}, Name: ${name}, Position: ${posStr}, Quaternion: ${quatStr}`;
            continue;
          }

          allEntityIds.push(id);
          const line = `- Name: ${name}, Entity ID: ${id}, Position: ${posStr}`;

          if (!categorizedEntities[type]) {
            categorizedEntities[type] = [];
          }

          categorizedEntities[type].push(line);
        }

        let categorizedSummary = '';
        for (const [type, lines] of Object.entries(categorizedEntities)) {
          categorizedSummary += `\n\n## ${type[0].toUpperCase() + type.slice(1)} Entities (${lines.length})\n${lines.join('\n')}`;
        }

        const actionsSystem = world?.actions;
        const nearbyActions = actionsSystem?.getNearby(50) || [];
        const currentAction = actionsSystem?.currentNode;

        const actionLines = nearbyActions.map(action => {
          const entity = action.ctx?.entity;
          const pos = entity?.root?.position;
          const posStr = (pos && (pos instanceof THREE.Vector3 || pos instanceof Vector3Enhanced))
            ? `[${[pos.x, pos.y, pos.z].map(p => p.toFixed(2)).join(', ')}]`
            : 'N/A';

          const label = action._label ?? 'Unnamed Action';
          const entityId = entity?.data?.id ?? 'unknown';
          const entityName = entity?.blueprint?.name ?? 'Unnamed';

          return `- Entity ID: ${entityId}, Entity Name: ${entityName}, Action: ${label}, Position: ${posStr}`;
        });

        const actionHeader = `## Nearby Interactable Objects (${actionLines.length})`;
        const actionBody = actionLines.length > 0
          ? actionLines.join('\n')
          : 'There are no interactable objects nearby.';
        const actionText = `${actionHeader}\n${actionBody}`;
        
        const equipText = currentAction ? (() => {
          const entity = currentAction.ctx?.entity;
          const label = currentAction._label ?? 'Unnamed Action';
          const entityId = entity?.data?.id ?? 'unknown';
          const entityName = entity?.blueprint?.name ?? 'Unnamed';
          return `## Your Equipped Item or Action\nYou are currently using:\n- Action: ${label}, Entity Name: ${entityName}, Entity ID: ${entityId}`;
        })() : '## Your Equipped Item or Action\nYou are not currently performing or holding anything.';


        const chatHistory = await messageManager.getRecentMessages(elizaRoomId);
        const chatText = `## In-World Messages\n${chatHistory}`;

        const animationListText = EMOTES_LIST.map(
          (e) => `- **${e.name}**: ${e.description}`
        ).join('\n');
        const animationText = `## Available Animations\n${animationListText}`;
        
        const formattedText =
          `# Hyperfy World State\n\n${agentText}${categorizedSummary}\n\n${actionText}\n\n${equipText}\n\n${chatText}\n\n${animationText}`;

        return {
          text: formattedText,
          values: { // Simplified values for quick access
            hyperfyStatus: formattedText,
          },
          data: {
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
