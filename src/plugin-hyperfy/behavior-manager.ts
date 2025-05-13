import { ChannelType, Content, EventType, HandlerCallback, IAgentRuntime, Memory, ModelType, UUID, composePromptFromState, createUniqueUuid, formatMessages, formatPosts, getEntityDetails, logger, parseKeyValueXml } from "@elizaos/core";
import { EMOTES_LIST, HYPERFY_ACTIONS } from "./constants";
import { AgentControls } from "./controls";
import { HyperfyService } from "./service";
import { autoTemplate, emotePickTemplate } from "./templates";

const TIME_INTERVAL_MIN = 5000; // 10 seconds
const TIME_INTERVAL_MAX = 20000; // 30 seconds


export class BehaviorManager {
  private isRunning: boolean = false;
  private runtime: IAgentRuntime;
  private msgGuard = new MessageActivityGuard();
  
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
      const delay = TIME_INTERVAL_MIN + Math.floor(Math.random() * (TIME_INTERVAL_MAX - TIME_INTERVAL_MIN));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  private getService() {
    return this.runtime.getService<HyperfyService>(HyperfyService.serviceType);
  }

  /**
   * Executes a behavior
   */
  private async executeBehavior(): Promise<void> {
    // TODO: There may be slow post-processing in the bootstrap plugin's message handler.
    // Investigate long tail after message handling, especially in emitEvent or runtime methods.
    if (this.msgGuard.isActive()) {
      logger.info("[BehaviorManager] Skipping behavior — message activity in progress");
      return;
    }

    const service = this.getService();
    const _currentWorldId = service.currentWorldId;
    
    const elizaRoomId = createUniqueUuid(this.runtime, _currentWorldId || 'hyperfy-unknown-world')
    const entityId = createUniqueUuid(this.runtime, this.runtime.agentId);

    const newMessage: Memory = {
      id:  createUniqueUuid(this.runtime, Date.now().toString()),
      content: {
        text: '',
        type: 'text',
      },
      roomId: elizaRoomId,
      worldId: _currentWorldId,
      entityId,
    };

    const messageManager = service.getMessageManager();
    const recentMessages = await messageManager.getRecentMessages(elizaRoomId)
    
    const state = await this.runtime.composeState(
      newMessage, 
      [
        'CHARACTER',
        'HYPERFY_WORLD_STATE',
        'HYPERFY_EMOTE_LIST',
      ]
    );

    const responsePrompt = composePromptFromState({ state, template: autoTemplate(recentMessages) });

    // decide
    const response = await this.runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: responsePrompt,
    });

    const parsedXml = parseKeyValueXml(response);

    console.log('****** response\n', parsedXml)

    const responseMemory = {
      content: {
        thought: parsedXml.thought,
        text: parsedXml.text,
        actions: parsedXml.actions,
        providers: parsedXml.providers,
        emote: parsedXml.emote,
      },
      entityId: createUniqueUuid(this.runtime, this.runtime.agentId),
      roomId: elizaRoomId,
    };

    const callback: HandlerCallback = async (responseContent: Content): Promise<Memory[]> => {
      console.info(`[Hyperfy Auto Callback] Received response: ${JSON.stringify(responseContent)}`)
      const emote = responseContent.emote as string || "TALK";
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

      if (responseContent.text) {
        const emoteManager = service.getEmoteManager();
        emoteManager.playEmote(emote);
        const messageManager = service.getMessageManager();
        messageManager.sendMessage(responseContent.text)
      }
      return [];
    };
    
    await this.runtime.processActions(
      newMessage,
      [responseMemory],
      state,
      callback
    );

    await this.runtime.evaluate(newMessage, state, true, callback, [
      responseMemory,
    ]);
  }

  async handleMessage(msg): Promise<void> {
    // maybe a thinking emote here?
    await this.msgGuard.run(async () => {
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
            // Send response back to Hyperfy
            const emote = 
              await this.pickEmoteForResponse(memory) || "TALK";

            const emoteManager = service.getEmoteManager();
            emoteManager.playEmote(emote);
            const messageManager = service.getMessageManager();
            messageManager.sendMessage(responseContent.text)

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

  private async pickEmoteForResponse(
    receiveMemory: Memory,
  ): Promise<string | null> {
    const state = await this.runtime.composeState(receiveMemory);
  
    const emotePickPrompt = composePromptFromState({
      state,
      template: emotePickTemplate,
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


/**
 * Guards any async task and tracks if something is running.
 * Used to prevent behavior execution during active message processing.
 */
class MessageActivityGuard {
  private count = 0;

  isActive(): boolean {
    return this.count > 0;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.count++;
    try {
      return await fn();
    } finally {
      this.count--;
    }
  }
}
