import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type Room,
  logger,
  addHeader,
  ChannelType,
} from '@elizaos/core';

/**
 * Provider that exposes relevant world/environment information to agents.
 * Includes details like channel list, world name, and other world metadata.
 */
export const worldProvider: Provider = {
  name: 'WORLD',
  description: 'World and environment information',
  dynamic: true,

  get: async (runtime: IAgentRuntime, message: Memory) => {
    try {
      logger.debug('🌐 World provider activated for roomId:', message.roomId);

      // Get the current room from the message
      const currentRoom = await runtime.getRoom(message.roomId);

      if (!currentRoom) {
        logger.warn(`World provider: Room not found for roomId ${message.roomId}`);
        return {
          data: {
            world: {
              info: 'Unable to retrieve world information - room not found',
            },
          },
          text: 'Unable to retrieve world information - room not found',
        };
      }

      logger.debug(`🌐 World provider: Found room "${currentRoom.name}" (${currentRoom.type})`);

      // Get the world for the current room
      const worldId = currentRoom.worldId;
      const world = await runtime.getWorld(worldId);

      if (!world) {
        logger.warn(`World provider: World not found for worldId ${worldId}`);
        return {
          data: {
            world: {
              info: 'Unable to retrieve world information - world not found',
            },
          },
          text: 'Unable to retrieve world information - world not found',
        };
      }

      logger.debug(`🌐 World provider: Found world "${world.name}" (ID: ${world.id})`);

      // Get all rooms in the current world
      const worldRooms = await runtime.getRooms(worldId);
      logger.debug(`🌐 World provider: Found ${worldRooms.length} rooms in world "${world.name}"`);

      // Get participants for the current room
      const participants = await runtime.getParticipantsForRoom(message.roomId);
      logger.debug(
        `🌐 World provider: Found ${participants.length} participants in room "${currentRoom.name}"`
      );

      // Format rooms by type
      type RoomInfo = {
        id: string;
        name: string;
        isCurrentChannel: boolean;
        type?: string;
      };

      const channelsByType: Record<string, RoomInfo[]> = {
        text: [],
        voice: [],
        dm: [],
        feed: [],
        thread: [],
        other: [],
      };

      // Categorize rooms by type
      for (const room of worldRooms) {
        const roomInfo: RoomInfo = {
          id: room.id,
          name: room.name,
          isCurrentChannel: room.id === message.roomId,
        };

        // Group channels by their purpose
        if (
          room.type === ChannelType.GROUP ||
          room.type === ChannelType.WORLD ||
          room.type === ChannelType.FORUM
        ) {
          channelsByType.text.push(roomInfo);
        } else if (room.type === ChannelType.VOICE_GROUP || room.type === ChannelType.VOICE_DM) {
          channelsByType.voice.push(roomInfo);
        } else if (room.type === ChannelType.DM || room.type === ChannelType.SELF) {
          channelsByType.dm.push(roomInfo);
        } else if (room.type === ChannelType.FEED) {
          channelsByType.feed.push(roomInfo);
        } else if (room.type === ChannelType.THREAD) {
          channelsByType.thread.push(roomInfo);
        } else {
          channelsByType.other.push({
            ...roomInfo,
            type: room.type,
          });
        }
      }

      // Create formatted text for display
      const worldInfoText = [
        `# World: ${world.name}`,
        `Current Channel: ${currentRoom.name} (${currentRoom.type})`,
        `Total Channels: ${worldRooms.length}`,
        `Participants in current channel: ${participants.length}`,
        '',
        `Text channels: ${channelsByType.text.length}`,
        `Voice channels: ${channelsByType.voice.length}`,
        `DM channels: ${channelsByType.dm.length}`,
        `Feed channels: ${channelsByType.feed.length}`,
        `Thread channels: ${channelsByType.thread.length}`,
        `Other channels: ${channelsByType.other.length}`,
      ].join('\n');

      // --- Get Interactable Actions --- >
      let interactableActions: Array<{ id: string, label: string, distance: number }> = [];
      let interactablesText = 'No interactable objects nearby.';
      try {
          const hyperfyService = runtime.getService<any>('hyperfy'); // Use 'any' if type import is problematic
          if (hyperfyService && typeof hyperfyService.getInteractableActions === 'function') {
              // Use a default distance or make it configurable?
              interactableActions = hyperfyService.getInteractableActions(3);

              if (interactableActions.length > 0) {
                  interactablesText = 'Nearby Interactable Objects:\n' +
                      interactableActions.map(action =>
                          ` - "${action.label}" (ID: ${action.id.substring(0, 6)}...) at ${action.distance.toFixed(1)}m`
                      ).join('\n');
              }
               logger.debug(`🌐 World provider: Found ${interactableActions.length} interactable actions.`);
          } else {
              logger.warn("🌐 World provider: Hyperfy service or getInteractableActions method not found.");
              interactablesText = 'Could not check for interactable objects.';
          }
      } catch (err) {
          logger.error(`🌐 World provider: Error getting interactable actions: ${err}`);
          interactablesText = 'Error checking for interactable objects.';
      }
      // <-------------------------------

      // Build the world information object with formatted data
      const data = {
        world: {
          id: world.id,
          name: world.name,
          serverId: world.serverId,
          metadata: world.metadata || {},
          currentRoom: {
            id: currentRoom.id,
            name: currentRoom.name,
            type: currentRoom.type,
            channelId: currentRoom.channelId,
            participantCount: participants.length,
          },
          channels: channelsByType,
          channelStats: {
            total: worldRooms.length,
            text: channelsByType.text.length,
            voice: channelsByType.voice.length,
            dm: channelsByType.dm.length,
            feed: channelsByType.feed.length,
            thread: channelsByType.thread.length,
            other: channelsByType.other.length,
          },
        },
        interactables: interactableActions,
      };

      const values = {
        worldName: world.name,
        currentChannelName: currentRoom.name,
        worldInfo: worldInfoText,
        interactablesInfo: interactablesText,
      };

      // Use addHeader like in entitiesProvider
      const formattedText = addHeader('# World Information', worldInfoText) + '\n\n' + addHeader('# Nearby Objects', interactablesText);

      logger.debug('🌐 World provider completed successfully');

      return {
        data,
        values,
        text: formattedText,
      };
    } catch (error) {
      logger.error(
        `Error in world provider: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        data: {
          world: {
            info: 'Error retrieving world information',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        text: 'Error retrieving world information',
      };
    }
  },
};

export default worldProvider;
