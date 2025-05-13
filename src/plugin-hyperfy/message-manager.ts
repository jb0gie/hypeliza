import { IAgentRuntime, UUID, formatMessages, getEntityDetails } from "@elizaos/core";
import { HyperfyService } from "./service";

export class MessageManager {
  private runtime: IAgentRuntime;
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
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
}
