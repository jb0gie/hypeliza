import { ChannelType, Content, EventType, HandlerCallback, IAgentRuntime, Memory, UUID, createUniqueUuid, formatMessages, getEntityDetails } from "@elizaos/core";
import { HyperfyService } from "./service";
import { msgGuard } from "./guards";
import { messageHandlerTemplate } from "./templates";

export class MessageManager {
  private runtime: IAgentRuntime;
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    if (!this.runtime.character.templates) {
      this.runtime.character.templates = {};
    }
    this.runtime.character.templates.messageHandlerTemplate = messageHandlerTemplate;
  }

  async handleMessage(msg): Promise<void> {
    // maybe a thinking emote here?
    await msgGuard.run(async () => {
      const service = this.getService();
      const world = service.getWorld();
      const agentPlayerId = world.entities.player.data.id // Get agent's ID
      const senderName = msg.from || 'System'
      const messageBody = msg.body || ''
      const _currentWorldId = service.currentWorldId;
      console.info(`[Chat Received] From: ${senderName}, ID: ${msg.id}, Body: "${messageBody}"`)

      // Respond only to messages not from the agent itself
      if (msg.fromId && msg.fromId !== agentPlayerId) {
        console.info(`[Hyperfy Chat] Processing message from ${senderName}`)

        // First, ensure we register the entity (world, room, sender) in Eliza properly
        const hyperfyWorldId = createUniqueUuid(this.runtime, 'hyperfy-world') as UUID
        const elizaRoomId = createUniqueUuid(this.runtime, _currentWorldId || 'hyperfy-unknown-world')
        const entityId = createUniqueUuid(this.runtime, msg.fromId.toString()) as UUID

        console.debug(`[Hyperfy Chat] Creating world: ${hyperfyWorldId}`)
        // Register the world if it doesn't exist
        await this.runtime.ensureWorldExists({
          id: hyperfyWorldId,
          name: 'Hyperfy World',
          agentId: this.runtime.agentId,
          serverId: 'hyperfy',
          metadata: {
            type: 'hyperfy',
          },
        })

        console.debug(`[Hyperfy Chat] Creating room: ${elizaRoomId}`)
        // Register the room if it doesn't exist
        await this.runtime.ensureRoomExists({
          id: elizaRoomId,
          name: 'Hyperfy Chat',
          source: 'hyperfy',
          type: ChannelType.WORLD,
          channelId: _currentWorldId,
          serverId: 'hyperfy',
          worldId: hyperfyWorldId,
        })

        console.debug(`[Hyperfy Chat] Creating entity connection for: ${entityId}`)
        // Ensure connection for the sender entity
        await this.runtime.ensureConnection({
          entityId: entityId,
          roomId: elizaRoomId,
          userName: senderName,
          name: senderName,
          source: 'hyperfy',
          channelId: _currentWorldId,
          serverId: 'hyperfy',
          type: ChannelType.WORLD,
          worldId: hyperfyWorldId,
        })

        // Create the message memory
        const messageId = createUniqueUuid(this.runtime, msg.id.toString()) as UUID
        console.debug(`[Hyperfy Chat] Creating memory: ${messageId}`)
        const memory: Memory = {
          id: messageId,
          entityId: entityId,
          agentId: this.runtime.agentId,
          roomId: elizaRoomId,
          worldId: hyperfyWorldId,
          content: {
            text: messageBody,
            source: 'hyperfy',
            channelType: ChannelType.WORLD,
            metadata: {
              hyperfyMessageId: msg.id,
              hyperfyFromId: msg.fromId,
              hyperfyFromName: senderName,
            },
          },
          createdAt: Date.now(),
        }

        // Create a callback function to handle responses
        const callback: HandlerCallback = async (responseContent: Content): Promise<Memory[]> => {
          console.info(`[Hyperfy Chat Callback] Received response: ${JSON.stringify(responseContent)}`)
          if (responseContent.text) {
            console.log(`[Hyperfy Chat Response] ${responseContent}`)
            const emote = responseContent.emote as string;
            // Send response back to Hyperfy
            const emoteManager = service.getEmoteManager();
            if (emote) {
              emoteManager.playEmote(emote);
            }
            this.sendMessage(responseContent.text);

            const callbackMemory: Memory = {
              id: createUniqueUuid(this.runtime, Date.now().toString()),
              entityId: this.runtime.agentId,
              agentId: this.runtime.agentId,
              content: {
                ...responseContent,
                channelType: ChannelType.WORLD,
                emote
              },
              roomId: elizaRoomId,
              createdAt: Date.now(),
            };
            
            await this.runtime.createMemory(callbackMemory, 'messages');
          }
          return [];
        };

        // Ensure the entity actually exists in DB before event emission
        try {
          const entity = await this.runtime.getEntityById(entityId)
          if (!entity) {
            console.warn(
              `[Hyperfy Chat] Entity ${entityId} not found in database after creation, creating directly`
            )
            await this.runtime.createEntity({
              id: entityId,
              names: [senderName],
              agentId: this.runtime.agentId,
              metadata: {
                hyperfy: {
                  id: msg.fromId,
                  username: senderName,
                  name: senderName,
                },
              },
            })
          }
        } catch (error) {
          console.error(`[Hyperfy Chat] Error checking/creating entity: ${error}`)
        }

        // Emit the MESSAGE_RECEIVED event to trigger the message handler
        console.info(`[Hyperfy Chat] Emitting MESSAGE_RECEIVED event for message: ${messageId}`)
        await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
            runtime: this.runtime,
            message: memory,
            callback: callback,
            source: 'hyperfy',
            onComplete: () => {
            }
          },
        )

        console.info(`[Hyperfy Chat] Successfully emitted event for message: ${messageId}`)
      }
    });
  }

  async sendMessage(text: string): Promise<void> {
    const service = this.runtime.getService<HyperfyService>(HyperfyService.serviceType);
    const world = service.getWorld();
    if (!service.isConnected() || !world?.chat || !world?.entities?.player) {
      console.error('HyperfyService: Cannot send message. Not ready.')
      return
    }

    try {
      const agentPlayerId = world.entities.player.data.id
      const agentPlayerName = service.getEntityName(agentPlayerId) || world.entities.player.data?.name || 'Hyperliza'

      console.info(`HyperfyService sending message: "${text}" as ${agentPlayerName} (${agentPlayerId})`)

      if (typeof world.chat.add !== 'function') {
        throw new Error('world.chat.add is not a function')
      }

      world.chat.add(
        {
          body: text,
          fromId: agentPlayerId,
          from: agentPlayerName,
        },
        true
      )

    } catch (error: any) {
      console.error('Error sending Hyperfy message:', error.message, error.stack)
      throw error
    }
  }

  async getRecentMessages(roomId: UUID, count = 10) {
    const [entitiesData, recentMessagesData] = await Promise.all([
      getEntityDetails({ runtime: this.runtime, roomId }),
      this.runtime.getMemories({
        tableName: 'messages',
        roomId,
        count,
        unique: false,
      }),
    ]);
    const formattedRecentMessages = formatMessages({
      messages: recentMessagesData,
      entities: entitiesData,
    });

    return formattedRecentMessages;
  }

  private getService() {
    return this.runtime.getService<HyperfyService>(HyperfyService.serviceType);
  }
}
