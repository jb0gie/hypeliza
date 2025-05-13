import { ChannelType, Content, EventType, HandlerCallback, IAgentRuntime, Memory, ModelType, UUID, composePromptFromState, createUniqueUuid, formatMessages, formatPosts, getEntityDetails, logger, parseKeyValueXml } from "@elizaos/core";
import { EMOTES_LIST } from "./constants";
import { AgentControls } from "./controls";
import { HyperfyService } from "./service";

const TIME_INTERVAL = 30000;

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
      await new Promise((resolve) => setTimeout(resolve, TIME_INTERVAL));
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
    const HYPERFY_ACTIONS = [
      {
        name: 'HYPERFY_GOTO_ENTITY',
        description: 'Choose this when {{agentName}} notices a nearby user that they haven’t interacted with yet, or when a previous conversation feels unfinished and approaching the user makes sense. {{agentName}} must review the recent Conversation Messages and world state before deciding to move. Only use this action if there’s a clear reason to walk toward someone — such as initiating friendly presence or continuing a previously started interaction.'
      },
      {
        name: 'HYPERFY_WALK_RANDOMLY',
        description: 'Choose this when the conversation is quiet or winding down, and {{agentName}} wants to stay present without speaking. Use it based on the current situation and conversation vibe — when there’s nothing urgent to say or do, but movement feels more natural than being idle.'
      },
      {
        name: 'REPLY',
        description: 'You {{agentName}} need to carefully review the recent Conversation Messages. If the user has already been acknowledged or a similar message was sent recently, do not repeat it. Only choose this action and respond if there is new context, user engagement, or something helpful and different to say.'
      },
      {
        name: 'IGNORE',
        description: 'Only choose this if {{agentName}} has reviewed all the available actions above and decided that none of them are appropriate. Use it when there’s nothing meaningful to say or do in the current situation.'
      }
    ]
    
    
    const autoTemplate = `
<note>
This message is part of {{agentName}}'s regular behavior loop and is not triggered by any user message. {{agentName}} must check the recent Conversation Messages before responding. Only choose an action if it adds something new, useful, or appropriate based on the current situation.
</note>

<task>Decide the action, and emotional expression for {{agentName}} based on the conversation and the Hyperfy world state.</task>
    
<providers>
{{providers}}

# Conversation Messages:
${recentMessages}

# Available Actions:
${HYPERFY_ACTIONS.map(
  (a) => `- **${a.name}**: ${a.description}`
).join('\n')}
</providers>

<keys>
"thought" should be a short description of what the agent is thinking about and planning.
"actions" should be a comma-separated list of the actions {{agentName}} plans to take based on the thought (if none, use IGNORE, if simply responding with text, use REPLY)
"emote" should be exactly one emote {{agentName}} will play to express the intent or emotion behind the response (e.g. "crying", "wave"). Leave this blank if no emote fits.
"text" should be the text of the next message for {{agentName}} which they will send to the conversation.
</keys>

<instructions>

Respond using XML format like this:

<response>
    <thought>
      Agent's thinking goes here
    </thought>
    <text>
      The text of the next message for {{agentName}} which they will send to the conversation.
    </text>
    <actions>
      Actions to take next, as comma separated list
    </actions>
    <emote>
      Exactly one emote to express tone or reaction
    </emote>
</response>

Your response must ONLY include the <response></response> XML block.
</instructions>`;

    const responsePrompt = composePromptFromState({ state, template: autoTemplate });

    console.log('****** responsePrompt\n', responsePrompt);

    // decide
    const response = await this.runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: responsePrompt,
    });

    const parsedXml = parseKeyValueXml(response);

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
