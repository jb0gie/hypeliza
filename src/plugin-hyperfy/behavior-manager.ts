import { ChannelType, Content, EventType, HandlerCallback, IAgentRuntime, Memory, ModelType, UUID, composePromptFromState, createUniqueUuid, logger } from "@elizaos/core";
import { EMOTES_LIST } from "./constants";
import { AgentControls } from "./controls";
import { HyperfyService } from "./service";

const TIME_INTERVAL = 30000;

export class BehaviorManager {
  private isRunning: boolean = false;
  private runtime: IAgentRuntime;
  
  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Starts the behavior loop
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn("[BehaviorManager] Already running");
      return;
    }

    this.isRunning = true;
    logger.info("[BehaviorManager] Starting behavior loop");

    this.runLoop();
  }

  /**
   * Stops the behavior loop
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn("[BehaviorManager] Not running");
      return;
    }

    this.isRunning = false;
    logger.info("[BehaviorManager] Stopped behavior loop");
  }

  /**
   * Main loop that waits for each behavior to finish
   */
  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.executeBehavior();
      } catch (error) {
        logger.error("[BehaviorManager] Error in behavior:", error);
      }

      // Short delay between behaviors
      await new Promise((resolve) => setTimeout(resolve, TIME_INTERVAL));
    }
  }

  /**
   * Executes a behavior
   */
  private async executeBehavior(): Promise<void> {
    
  }

  async handleMessage(msg): Promise<void> {
    const service = this.runtime.getService<HyperfyService>(HyperfyService.serviceType);
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
          console.info(`[Hyperfy Chat Response] ${responseContent.text}`)
          // Send response back to Hyperfy
          const emote = 
            await this.pickEmoteForResponse(memory) || "TALK";

          const emoteManager = service.getEmoteManager();
          emoteManager.playEmote(emote);
          const messageManager = service.getMessageManager();
          messageManager.sendMessage(responseContent.text)
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
  }

  private async pickEmoteForResponse(
    receiveMemory: Memory,
  ): Promise<string | null> {
    const state = await this.runtime.composeState(receiveMemory);
  
    const emotePickPrompt = composePromptFromState({
      state,
      template: `
  # Task: Determine which emote best fits {{agentName}}'s response, based on the character’s personality and intent.
  
  {{providers}}
  
  Guidelines:
  - ONLY pick an emote if {{agentName}}’s response shows a clear emotional tone (e.g. joy, frustration, sarcasm) or strong contextual intent (e.g. celebration, mockery).
  - DO NOT pick an emote for neutral, factual, or generic replies. If unsure, default to "null".
  - Emotes should enhance the meaning or delivery of the message from {{agentName}}’s perspective, not just match keywords.
  - Respond with exactly one emote name (e.g. "crying") if appropriate, or "null" if no emote fits.

  Respond ONLY with one emote name or "null".
  `.trim(),
    });
  
    const emoteResultRaw = await this.runtime.useModel(ModelType.TEXT_SMALL, {
      prompt: emotePickPrompt,
    });
  
    const result = emoteResultRaw?.trim().toLowerCase().replace(/["']/g, '');
  
    if (!result || result === 'null') return null;
  
    const match = EMOTES_LIST.find((e) => e.name.toLowerCase() === result);
    return match ? match.name : null;
  }
}
