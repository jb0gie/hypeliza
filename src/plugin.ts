import 'ses'

import type { Plugin, UUID, WorldPayload, MessagePayload } from '@elizaos/core';
import {
  type Action,
  ChannelType,
  type Content,
  EventType,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  createUniqueUuid,
  logger,
} from '@elizaos/core';
import { z } from 'zod';
import * as THREE from 'three'; // Import THREE
import { performance } from 'perf_hooks'; // For simulation loop timing

// --- Configuration ---
/** Easy toggle for development test mode - Set to true to mimic agent script */
const ENABLE_HYPERFY_TEST_MODE_FLAG = true; // <-- SET TO true TO ENABLE TEST MODE

// --- Hardcoded values matching agent/index.mjs ---
const HYPERFY_WS_URL = process.env.WS_URL || 'ws://localhost:1337/ws'; // Match agent default
const HYPERFY_TICK_RATE = 50; // Hz (Matches agent)
const HYPERFY_TEST_MODE_MOVE_INTERVAL = 1000; // ms (Matches agent MOVE_INTERVAL)
const HYPERFY_TEST_MODE_CHAT_INTERVAL = 5000; // ms (Matches agent CHAT_INTERVAL)
// ---------------------------------------------

// --- Begin: Adapting Hyperfy/Agent Dependencies ---
// Assuming these are available or appropriately adjusted based on your build/package structure
// If `@hyperfy/core` is the package, adjust paths accordingly.
// These might come from '../project-hyperfy/src/hyperfy/core.js' in your original agent.
// For this example, let's assume they are exported by a hypothetical '@hyperfy/core' package.
import {
  createClientWorld,
  loadNodePhysX,
  System
  // storage // Not used directly in the service logic here, handled by runtime
} from './hyperfy/core'; // Adjust this import path as needed

// Helper to create the button state object (from AgentControls.js)
function createButtonState() {
  return {
    $button: true,
    down: false,
    pressed: false,
    released: false,
  }
}

// Simplified AgentControls without Proxy (from AgentControls.js)
// We need this for the world.init call
export class AgentControls extends System {
  // Define expected control properties directly on the instance
  scrollDelta = { value: 0 };
  pointer = { locked: false, delta: { x: 0, y: 0 } };
  camera: any = undefined; // PlayerLocal checks for this
  screen: any = undefined; // PlayerLocal checks for this
  xrLeftStick = { value: { x: 0, y: 0, z: 0 } };
  xrRightStick = { value: { x: 0, y: 0, z: 0 } };
  keyW: any;
  keyA: any;
  keyS: any;
  keyD: any;
  space: any;
  shiftLeft: any;
  shiftRight: any;
  controlLeft: any;
  keyC: any;
  keyF: any;
  keyE: any;
  arrowUp: any;
  arrowDown: any;
  arrowLeft: any;
  arrowRight: any;
  touchA: any;
  touchB: any;
  xrLeftBtn1: any;
  xrLeftBtn2: any;
  xrRightBtn1: any;
  xrRightBtn2: any;

  constructor(world: any) {
    super(world); // Call base System constructor

    const commonKeys = [
      'keyW', 'keyA', 'keyS', 'keyD', 'space', 'shiftLeft', 'shiftRight',
      'controlLeft', 'keyC', 'keyF', 'keyE', 'arrowUp', 'arrowDown',
      'arrowLeft', 'arrowRight', 'touchA', 'touchB', 'xrLeftStick',
      'xrRightStick', 'xrLeftBtn1', 'xrLeftBtn2', 'xrRightBtn1', 'xrRightBtn2',
    ];
    commonKeys.forEach(key => {
      this[key] = createButtonState();
    });
  }

  // Method for the agent script to set a key state
  setKey(keyName: string, isDown: boolean) {
    if (!this[keyName] || !this[keyName].$button) {
      this[keyName] = createButtonState(); // Create if missing
    }
    const state = this[keyName];

    if (isDown && !state.down) {
      state.pressed = true;
      state.released = false;
    } else if (!isDown && state.down) {
      state.released = true;
      state.pressed = false;
    }
    state.down = isDown;
  }

  // Reset pressed/released flags at the end of the frame
  postLateUpdate() {
    for (const key in this) {
      if (this.hasOwnProperty(key) && this[key] && (this[key] as any).$button) {
        (this[key] as any).pressed = false;
        (this[key] as any).released = false;
      }
    }
  }

  // Dummy methods needed for PlayerLocal init check
  bind(options: any) { return this; }
  release() {}
  setActions() {}
}
// --- End: Adapting Hyperfy/Agent Dependencies ---


// Define the plugin configuration schema (optional, adjust as needed)
// Renamed this one to avoid conflict
const hyperfyPluginConfigSchema = z.object({
  DEFAULT_HYPERFY_WS_URL: z.string().url().optional(),
  DEFAULT_TICK_RATE: z.coerce.number().positive().optional().default(50), // Added TICK_RATE config
});
type HyperfyPluginConfig = z.infer<typeof hyperfyPluginConfigSchema>;


// --- Hyperfy Service Implementation ---
export class HyperfyService extends Service {
  static serviceType = 'hyperfy';
  capabilityDescription = 'Manages connection and interaction with a Hyperfy world.';

  private world: any | null = null;
  private controls: AgentControls | null = null;
  private isConnectedState: boolean = false;
  private currentEntities: Map<string, any> = new Map();
  private agentState: any = { position: null, rotation: null };
  private tickIntervalId: NodeJS.Timeout | null = null;
  private entityUpdateIntervalId: NodeJS.Timeout | null = null;
  private wsUrl: string | null = null;
  private _currentWorldId: UUID | null = null;
  private processedMsgIds: Set<string> = new Set(); // Track processed message IDs

  // Test Mode properties
  private randomMoveIntervalId: NodeJS.Timeout | null = null;
  private randomChatIntervalId: NodeJS.Timeout | null = null;
  private currentMoveKey: string | null = null;

  public get currentWorldId(): UUID | null {
      return this._currentWorldId;
  }

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
    logger.info('HyperfyService instance created');
  }

  // --- Start Method: Automatically Connects ---
  static async start(runtime: IAgentRuntime): Promise<HyperfyService> {
    logger.info('*** Starting Hyperfy service ***');
    const service = new HyperfyService(runtime);

    // Automatically connect on start using hardcoded URL
    logger.info(`Attempting automatic connection to default Hyperfy URL: ${HYPERFY_WS_URL}`);
    // Generate a worldId based on the agentId for consistency if needed elsewhere
    const defaultWorldId = createUniqueUuid(runtime, runtime.agentId + '-default-hyperfy') as UUID;
    // Auth token needs separate secure handling if required (e.g., runtime secrets)
    const authToken: string | undefined = undefined; // Placeholder

    // Use .catch to prevent agent startup failure if connection fails
    service.connect({ wsUrl: HYPERFY_WS_URL, worldId: defaultWorldId, authToken })
        .then(() => logger.info(`Automatic Hyperfy connection initiated.`)) // Log initiation, not success yet
        .catch(err => logger.error(`Automatic Hyperfy connection failed: ${err.message}`));

    return service;
  }
  // --- End Start Method ---

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('*** Stopping Hyperfy service ***');
    const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
    if (service) await service.stop();
    else logger.warn('Hyperfy service not found during stop.');
  }

  async connect(config: { wsUrl: string; authToken?: string; worldId: UUID }): Promise<void> {
    if (this.isConnectedState) {
      logger.warn(`HyperfyService already connected to world ${this._currentWorldId}. Disconnecting first.`);
      await this.disconnect();
    }

    logger.info(`Attempting to connect HyperfyService to ${config.wsUrl} for world ${config.worldId}`);
    this.wsUrl = config.wsUrl;
    this._currentWorldId = config.worldId;

    try {
      // Create the world
      const world = createClientWorld();
      this.world = world;

      // Create and register the controls system
      this.controls = new AgentControls(world);
      (world as any).controls = this.controls;
      world.systems.push(this.controls);

      // Create mock elements for the UI
      const mockElement = { 
        appendChild: ()=>{}, 
        removeChild: ()=>{}, 
        offsetWidth: 1920, 
        offsetHeight: 1080, 
        addEventListener: ()=>{}, 
        removeEventListener: ()=>{}, 
        style: {} 
      };
      
      // Setup the connection config
      const hyperfyConfig = {
        wsUrl: this.wsUrl,
        loadPhysX: loadNodePhysX,
        viewport: mockElement,
        ui: mockElement,
        initialAuthToken: config.authToken,
        controls: this.controls // Pass the controls instance
      };

      // Initialize the world
      if (typeof this.world.init !== 'function') {
        throw new Error("world.init missing");
      }
      
      await this.world.init(hyperfyConfig);
      logger.info('Hyperfy world initialized.');

      // Process existing messages before subscribing to new ones
      if (this.world.chat?.msgs) {
        logger.info(`Processing ${this.world.chat.msgs.length} existing chat messages.`);
        this.world.chat.msgs.forEach((msg: any) => {
          if (msg && msg.id) {
            this.processedMsgIds.add(msg.id);
          }
        });
        logger.info(`Populated ${this.processedMsgIds.size} processed message IDs from history.`);
      }

      // Setup event listeners (including starting the chat subscription)
      this.subscribeToHyperfyEvents();

      // Mark as connected after successful initialization
      this.isConnectedState = true;
      
      // Start the simulation systems
      this.startSimulation();
      this.startEntityUpdates();

      // Start test mode if enabled
      if (ENABLE_HYPERFY_TEST_MODE_FLAG) {
        logger.info("Starting Hyperfy Test Mode (Random Walk & Chat)");
        // this.startRandomMovement();
        // this.startRandomChatting();
      }

      logger.info(`HyperfyService connected successfully to ${this.wsUrl}`);

    } catch (error) {
      logger.error(`HyperfyService connection failed for ${config.worldId} at ${config.wsUrl}: ${error.message}`);
      this.handleDisconnect(); // Ensure cleanup on failed connection
      throw error; // Re-throw to indicate connection failure
    }
  }

  private subscribeToHyperfyEvents(): void {
    if (!this.world || typeof this.world.on !== 'function') return;

    this.world.on('disconnect', (reason: string) => {
      logger.warn(`Hyperfy world disconnected: ${reason}`);
      this.runtime.emitEvent(EventType.WORLD_LEFT, { 
        runtime: this.runtime, 
        eventName: 'HYPERFY_DISCONNECTED', 
        data: { worldId: this._currentWorldId, reason: reason } 
      });
      this.handleDisconnect();
    });

    if (this.world.chat?.subscribe) {
      // Start the chat subscription system
      this.startChatSubscription();
      logger.info("Subscribed to Hyperfy chat messages.");
    } else {
      logger.warn("world.chat.subscribe not available.");
    }
  }

  private startChatSubscription(): void {
    if (!this.world || !this.world.chat) {
      logger.error('Cannot subscribe to chat: World or Chat system not available.');
      return;
    }
    
    logger.info('[HyperfyService] Initializing chat subscription...');
    
    // Pre-populate processed IDs with existing messages
    this.world.chat.msgs?.forEach((msg: any) => this.processedMsgIds.add(msg.id));
    
    this.world.chat.subscribe((msgs: any[]) => {
      // Wait for player entity (ensures world/chat exist too)
      if (!this.world || !this.world.chat || !this.world.entities?.player) return;
      
      const agentPlayerId = this.world.entities.player.id; // Get agent's ID
      const agentPlayerName = this.world.entities.player.data.name || 'Hyperliza'; // Get agent's name
      
      const newMessagesFound: any[] = []; // Temporary list for new messages
      
      // Step 1: Identify new messages and update processed set
      msgs.forEach((msg: any) => {
        // Check if we've already processed this message ID
        if (msg && msg.id && !this.processedMsgIds.has(msg.id)) {
          newMessagesFound.push(msg); // Add the full message object
          this.processedMsgIds.add(msg.id); // Mark ID as processed immediately
        }
      });
      
      // Step 2: Process only the newly found messages
      if (newMessagesFound.length > 0) {
        logger.info(`[Chat] Found ${newMessagesFound.length} new messages to process.`);
        
        newMessagesFound.forEach(async (msg: any) => {
          const senderName = msg.from || 'System';
          const messageBody = msg.body || '';
          logger.info(`[Chat Received] From: ${senderName}, ID: ${msg.id}, Body: "${messageBody}"`);
          
          // Respond only to messages not from the agent itself
          if (msg.fromId !== agentPlayerId) {
            try {
              logger.info(`[Hyperfy Chat] Processing message from ${senderName}`);
              
              // First, ensure we register the entity (world, room, sender) in Eliza properly
              const hyperfyWorldId = createUniqueUuid(this.runtime, 'hyperfy-world') as UUID;
              const elizaRoomId = createUniqueUuid(this.runtime, this._currentWorldId || 'hyperfy-unknown-world');
              const entityId = createUniqueUuid(this.runtime, msg.fromId.toString()) as UUID;
              
              logger.debug(`[Hyperfy Chat] Creating world: ${hyperfyWorldId}`);
              // Register the world if it doesn't exist
              await this.runtime.ensureWorldExists({
                id: hyperfyWorldId,
                name: 'Hyperfy World',
                agentId: this.runtime.agentId,
                serverId: 'hyperfy',
                metadata: {
                  type: 'hyperfy'
                }
              });
              
              logger.debug(`[Hyperfy Chat] Creating room: ${elizaRoomId}`);
              // Register the room if it doesn't exist
              await this.runtime.ensureRoomExists({
                id: elizaRoomId,
                name: 'Hyperfy Chat',
                source: 'hyperfy',
                type: ChannelType.WORLD,
                channelId: this._currentWorldId,
                serverId: 'hyperfy',
                worldId: hyperfyWorldId
              });
              
              logger.debug(`[Hyperfy Chat] Creating entity connection for: ${entityId}`);
              // Ensure connection for the sender entity
              await this.runtime.ensureConnection({
                entityId: entityId,
                roomId: elizaRoomId,
                userName: senderName,
                name: senderName,
                source: 'hyperfy',
                channelId: this._currentWorldId,
                serverId: 'hyperfy',
                type: ChannelType.WORLD,
                worldId: hyperfyWorldId
              });
              
              // Create the message memory
              const messageId = createUniqueUuid(this.runtime, msg.id.toString()) as UUID;
              logger.debug(`[Hyperfy Chat] Creating memory: ${messageId}`);
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
                    hyperfyFromName: senderName
                  }
                },
                createdAt: Date.now(),
              };
              
              // Create a callback function to handle responses
              const callback: HandlerCallback = async (responseContent: Content): Promise<Memory[]> => {
                logger.info(`[Hyperfy Chat Callback] Received response: ${JSON.stringify(responseContent)}`);
                if (responseContent.text) {
                  logger.info(`[Hyperfy Chat Response] ${responseContent.text}`);
                  // Send response back to Hyperfy
                  this.world.chat.add({
                    body: responseContent.text,
                    fromId: agentPlayerId,
                    from: agentPlayerName
                  }, true);
                }
                return [];
              };
              
              // DIRECT CHAT TEST - Uncomment to test direct messaging without the full event system
              // This will immediately send a response to verify the chat system works
              this.world.chat.add({
                body: `[Test Response] I'm processing your message: "${messageBody}"`,
                fromId: agentPlayerId,
                from: agentPlayerName
              }, true);
              
              // Ensure the entity actually exists in DB before event emission
              try {
                const entity = await this.runtime.getEntityById(entityId);
                if (!entity) {
                  logger.warn(`[Hyperfy Chat] Entity ${entityId} not found in database after creation, creating directly`);
                  await this.runtime.createEntity({
                    id: entityId,
                    names: [senderName],
                    agentId: this.runtime.agentId,
                    metadata: {
                      hyperfy: {
                        id: msg.fromId,
                        username: senderName,
                        name: senderName
                      }
                    }
                  });
                }
              } catch (error) {
                logger.error(`[Hyperfy Chat] Error checking/creating entity: ${error}`);
              }
              
              // Emit the MESSAGE_RECEIVED event to trigger the message handler
              logger.info(`[Hyperfy Chat] Emitting MESSAGE_RECEIVED event for message: ${messageId}`);
              await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
                runtime: this.runtime,
                message: memory,
                callback: callback,
                source: 'hyperfy',
              });
              
              logger.info(`[Hyperfy Chat] Successfully emitted event for message: ${messageId}`);
              
              // Set a timeout for fallback response in case the event system doesn't respond
              setTimeout(() => {
                // Check if the message is still in processedMsgIds but hasn't received a response
                if (this.processedMsgIds.has(msg.id)) {
                  logger.warn(`[Hyperfy Chat] No response received within timeout for message: ${msg.id}`);
                  
                  // Send a fallback response
                  const fallbackResponse = `I received your message "${messageBody}". Let me think about that...`;
                  logger.info(`[Hyperfy Chat Fallback] Sending response: "${fallbackResponse}"`);
                  
                  try {
                    this.world.chat.add({
                      body: fallbackResponse,
                      fromId: agentPlayerId,
                      from: agentPlayerName
                    }, true);
                  } catch (err) {
                    logger.error(`[Hyperfy Chat Fallback] Error sending fallback: ${err}`);
                  }
                }
              }, 5000); // 5 second timeout
              
            } catch (error) {
              logger.error(`[Hyperfy Chat] Error processing message: ${error}`);
              logger.error(error.stack);
              
              // Always send a fallback response on error
              const response = `I received your message but encountered an issue processing it.`;
              logger.info(`[Hyperfy Chat Fallback] Sending direct response after error: "${response}"`);
              
              try {
                this.world.chat.add({
                  body: response,
                  fromId: agentPlayerId,
                  from: agentPlayerName
                }, true);
              } catch (err) {
                logger.error(`[Hyperfy Chat Fallback] Error sending error response: ${err}`);
              }
            }
          }
        });
      }
    });
  }

  private handleDisconnect(): void {
      if (!this.isConnectedState) return;
      logger.info('Handling Hyperfy disconnection...');
      this.isConnectedState = false;
      this.stopSimulation();
      this.stopEntityUpdates();
      this.stopRandomMovement(); // Stop test mode
      this.stopRandomChatting(); // Stop test mode
      if (this.world) { try { /* this.world.destroy?.(); */ } catch(e) {/* log */} }
      this.world = null; this.controls = null; this.currentEntities.clear();
      this.agentState = { position: null, rotation: null }; this.wsUrl = null;
  }

  async disconnect(): Promise<void> {
    logger.info(`Disconnecting HyperfyService from world ${this._currentWorldId}`);
    this.handleDisconnect();
    logger.info('HyperfyService disconnect complete.');
  }

  isConnected(): boolean { return this.isConnectedState; }

  private startSimulation(): void {
    if (this.tickIntervalId) clearTimeout(this.tickIntervalId);
    const tickIntervalMs = 1000 / HYPERFY_TICK_RATE;
    let lastTickTime = performance.now();
    let lastTickErrorLogTime = 0; // Track last error log time
    const tickErrorLogInterval = 10000; // Log tick errors max every 10 seconds
    
    const tickLoop = () => {
      if (!this.world) return;
      
      const now = performance.now();
      try {
        // Wrap in try-catch to handle browser API calls that might fail in Node
        if (typeof this.world.tick === 'function') {
          this.world.tick(now);
        }
      } catch (e) {
        // Check if it's the specific ReferenceError and log less frequently
        if (e instanceof ReferenceError && e.message.includes('document is not defined')) {
          if (now - lastTickErrorLogTime > tickErrorLogInterval) {
            logger.warn('[HyperfyService] Suppressed frequent ReferenceError during world.tick (document not defined)');
            lastTickErrorLogTime = now;
          }
        } else {
           // Log other errors normally
           logger.error('[HyperfyService] Error during world.tick:', e);
        }
        // Don't stop the loop on error, just log and continue
      }
      
      lastTickTime = now;
      // Schedule next tick precisely
      const elapsed = performance.now() - now;
      const delay = Math.max(0, tickIntervalMs - elapsed);
      this.tickIntervalId = setTimeout(tickLoop, delay);
    };
    
    logger.info(`[HyperfyService] Starting simulation tick at ${HYPERFY_TICK_RATE}Hz.`);
    tickLoop();
  }

  private stopSimulation(): void {
     if (this.tickIntervalId) { clearTimeout(this.tickIntervalId); this.tickIntervalId = null; logger.info('[Sim] Tick stopped.'); }
  }

  private startEntityUpdates(intervalMs = 1000): void {
    if (this.entityUpdateIntervalId) clearInterval(this.entityUpdateIntervalId);
    this.entityUpdateIntervalId = setInterval(() => { /* ... entity update logic ... */ }, intervalMs); // Logic remains the same
    logger.info(`[Entity Update] Started every ${intervalMs}ms.`);
  }

  private stopEntityUpdates(): void {
     if (this.entityUpdateIntervalId) { clearInterval(this.entityUpdateIntervalId); this.entityUpdateIntervalId = null; logger.info('[Entity Update] Stopped.'); }
  }

  // --- Test Mode Methods ---
  private startRandomMovement(): void {
    if (this.randomMoveIntervalId) clearInterval(this.randomMoveIntervalId);
    const interval = HYPERFY_TEST_MODE_MOVE_INTERVAL;
    logger.info(`[Test Mode] Starting random movement every ${interval}ms.`);
    
    // Store the currently active key to easily turn it off
    this.currentMoveKey = null;
    
    this.randomMoveIntervalId = setInterval(() => {
      if (!this.isConnected() || !this.world?.entities?.player) {
        return; // Wait for player entity to be ready
      }
      
      const controls = (this.world as any).controls;
      if (!controls || typeof controls.setKey !== 'function') {
        logger.error('[Test Mode] AgentControls system not found or missing setKey method!');
        if (this.randomMoveIntervalId) clearInterval(this.randomMoveIntervalId);
        return;
      }
      
      // Turn off the previously active key (if any)
      if (this.currentMoveKey) {
        controls.setKey(this.currentMoveKey, false);
        this.currentMoveKey = null;
      }
      // Reset shift key
      controls.setKey('shiftLeft', false);
      
      const direction = Math.floor(Math.random() * 5); // 0:W, 1:A, 2:S, 3:D, 4:Stop
      let moveKey = null;
      
      switch (direction) {
        case 0:
          moveKey = 'keyW';
          logger.info('Agent moving: FORWARD');
          break;
        case 1:
          moveKey = 'keyA';
          logger.info('Agent moving: LEFT');
          break;
        case 2:
          moveKey = 'keyS';
          logger.info('Agent moving: BACKWARD');
          break;
        case 3:
          moveKey = 'keyD';
          logger.info('Agent moving: RIGHT');
          break;
        case 4:
          /* Stop */ logger.info('Agent moving: STOP');
          break;
      }
      
      // Set the new key state
      if (moveKey) {
        controls.setKey(moveKey, true);
        this.currentMoveKey = moveKey; // Remember which key is active
      }
      
      // Maybe randomly run sometimes?
      if (moveKey && Math.random() < 0.2) {
        controls.setKey('shiftLeft', true);
      }
    }, interval);
  }

  private stopRandomMovement(): void {
    if (this.randomMoveIntervalId) {
      clearInterval(this.randomMoveIntervalId);
      this.randomMoveIntervalId = null;
      
      // Release any active keys
      if (this.currentMoveKey && this.isConnected() && this.world) {
        const controls = (this.world as any).controls;
        if (controls && typeof controls.setKey === 'function') {
          controls.setKey(this.currentMoveKey, false);
          controls.setKey('shiftLeft', false);
        }
      }
      this.currentMoveKey = null;
      logger.info('[Test Mode] Stopped random movement.');
    }
  }

  private startRandomChatting(): void {
    if (this.randomChatIntervalId) clearInterval(this.randomChatIntervalId);
    
    const interval = HYPERFY_TEST_MODE_CHAT_INTERVAL;
    logger.info(`[Test Mode] Starting random chat every ${interval}ms.`);
    
    const messages = ["Hello Hyperfy!", "Anyone here?", "Testing...", "Wandering around...", "Beep boop."];
    
    this.randomChatIntervalId = setInterval(() => {
      if (!this.isConnected() || !this.world?.chat || !this.world?.entities?.player) {
        return; // Wait for chat and player to be ready
      }
      
      const agentPlayerId = this.world.entities.player.id;
      const agentPlayerName = this.world.entities.player.data.name || 'Hyperliza';
      
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      logger.debug(`[Test Mode] Sending chat: "${randomMessage}"`);
      
      try {
        // Use world.chat.add directly to match the behavior in index.mjs
        this.world.chat.add({
          body: randomMessage,
          fromId: agentPlayerId,
          from: agentPlayerName
        }, true); // Add true for broadcast
      } catch (e) {
        logger.error("[Test Mode] Error sending chat:", e);
      }
    }, interval);
  }

  private stopRandomChatting(): void {
    if (this.randomChatIntervalId) {
      clearInterval(this.randomChatIntervalId);
      this.randomChatIntervalId = null;
      logger.info('[Test Mode] Stopped random chatting.');
    }
  }
  // --- End Test Mode Methods ---

  getState(): { entities: any[]; agent: any } {
     const entitiesArray = Array.from(this.currentEntities.values());
     const agentStateCopy = this.agentState ? JSON.parse(JSON.stringify(this.agentState)) : {};
     return { entities: entitiesArray, agent: agentStateCopy };
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.isConnected() || !this.world?.chat || !this.world?.entities?.player) {
      throw new Error('HyperfyService: Cannot send message');
    }
    
    try {
      const agentPlayerId = this.world.entities.player.id;
      const agentPlayerName = this.world.entities.player.data.name || `Agent-${this.runtime.agentId.substring(0, 6)}`;
      
      logger.info(`HyperfyService sending message: "${text}" as ${agentPlayerName} (${agentPlayerId})`);
      
      if (typeof this.world.chat.add !== 'function') {
        throw new Error("world.chat.add missing");
      }
      
      this.world.chat.add({
        body: text,
        fromId: agentPlayerId,
        from: agentPlayerName
      }, true); // Use true for broadcast
    } catch (error) {
      logger.error("Error sending Hyperfy message:", error);
      throw error;
    }
  }

  async move(key: string, isDown: boolean): Promise<void> {
      if (!this.isConnected() || !this.controls) throw new Error('HyperfyService: Cannot move');
      try {
        logger.debug(`HyperfyService move: key=${key}, isDown=${isDown}`);
        if (typeof this.controls.setKey !== 'function') throw new Error("controls.setKey missing");
        this.controls.setKey(key, isDown);
      } catch (error) { logger.error("Error setting key:", error); throw error; }
  }

  async stop(): Promise<void> {
    logger.info('*** Stopping Hyperfy service instance ***');
    await this.disconnect();
  }
}
// --- End Hyperfy Service Implementation ---


// --- Hyperfy Provider Implementation ---
const hyperfyProvider: Provider = {
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
          const rot = state.agent.rotation.map((r: number) => r.toFixed(2)).join(', ');
          agentText = `Agent: Pos(${pos}), Rot(${rot})`;
      }

      // Format entities
      const entityLines = state.entities.slice(0, 10).map((entity: any) => { // Limit output
          const pos = entity.position ? entity.position.map((p: number) => p.toFixed(2)).join(', ') : 'N/A';
          const rot = entity.rotation ? entity.rotation.map((r: number) => r.toFixed(2)).join(', ') : 'N/A';
          // Shorten ID for display
          const shortId = typeof entity.id === 'string' ? `${entity.id.substring(0, 6)}...` : entity.id;
          return `- ${shortId} (${entity.type}): Pos(${pos})`; // Simplified output
      });
      const entityText = state.entities.length > 0
          ? `Entities (${state.entities.length} total, showing up to 10):\n${entityLines.join('\n')}`
          : 'Entities: None found';


      const formattedText = `# Hyperfy World State\nStatus: Connected\n${agentText}\n${entityText}`;

      return {
        text: formattedText,
        values: {
          hyperfy_status: 'connected',
          agentPosition: JSON.stringify(state.agent?.position),
          agentRotation: JSON.stringify(state.agent?.rotation),
          entityCount: state.entities.length,
        },
        data: state, // Pass the raw state
      };
    } catch (error) {
       logger.error('Error getting Hyperfy state from service:', error);
       return {
        text: '# Hyperfy World State\nStatus: Error retrieving state.',
        values: { hyperfy_status: 'error' },
        data: { status: 'error', error: error.message },
      };
    }
  },
};
// --- End Hyperfy Provider Implementation ---


// --- Hyperfy Chat Action Implementation ---
const hyperfyChatAction: Action = {
  name: 'HYPERFY_CHAT',
  similes: ['HYPERFY_SEND_MESSAGE', 'CHAT_IN_WORLD', 'WORLD_CHAT'],
  description: 'Sends a chat message within the connected Hyperfy world.',
  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
    return !!service && service.isConnected();
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    options: { text?: string }, // Allow passing text directly
    callback: HandlerCallback
  ) => {
    const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);
    if (!service) {
      logger.error('Hyperfy service not found for HYPERFY_CHAT action.');
      // Use callback for user-facing errors if appropriate
      await callback({ text: "Error: Could not send message. Hyperfy connection unavailable." });
      return; // Stop execution
    }

    const textToSend = options?.text || message.content.text || '...'; // Determine text, provide default

    if (!textToSend || textToSend === '...') {
        logger.warn('HYPERFY_CHAT: No text provided to send.');
        await callback({ text: "Action failed: No message text specified."});
        return;
    }

    try {
      await service.sendMessage(textToSend);
      // Confirmation callback
      await callback({
         text: `Sent message to Hyperfy: "${textToSend}"`,
         actions: ['HYPERFY_CHAT'], // Indicate which action was performed
         source: 'hyperfy' // Mark source as hyperfy
      });
    } catch (error) {
      logger.error('Error sending Hyperfy chat message via service:', error);
      // Error callback
      await callback({ text: `Error sending message to Hyperfy: ${error.message}` });
    }
  },
   examples: [
    [
      { name: '{{name1}}', content: { text: 'Say hello in Hyperfy' } },
      // Example assumes agent decides to say "Hello there!"
      { name: '{{name2}}', content: { text: 'Sent message to Hyperfy: "Hello there!"', actions: ['HYPERFY_CHAT'], source: 'hyperfy' } }
    ],
    [
      { name: '{{name1}}', content: { text: 'Tell everyone in the world "I have arrived"' } },
      { name: '{{name2}}', content: { text: 'Sent message to Hyperfy: "I have arrived"', actions: ['HYPERFY_CHAT'], source: 'hyperfy' } }
    ]
  ]
};
// --- End Hyperfy Chat Action Implementation ---


// --- Main Plugin Definition ---
const plugin: Plugin = {
  name: 'hyperfy', // Renamed plugin
  description: 'Integrates ElizaOS agents with Hyperfy worlds',
  config: {
    // Map environment variables to config keys
    DEFAULT_HYPERFY_WS_URL: process.env.DEFAULT_HYPERFY_WS_URL,
    DEFAULT_TICK_RATE: process.env.DEFAULT_TICK_RATE,
  },
  async init(config: Record<string, string | undefined>) {
    logger.info('*** Initializing Hyperfy Integration plugin ***');
    try {
      // Validate config using the schema
      const validatedConfig = await hyperfyPluginConfigSchema.parseAsync(config);
      logger.info('Hyperfy plugin config validated:', validatedConfig);
      // Store validated config for service use (runtime.pluginConfigs is usually the way)
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error(`Invalid Hyperfy plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`);
        // Decide if this is a fatal error
        // throw new Error(`Invalid Hyperfy plugin configuration...`);
      } else {
         logger.error('Unknown error during Hyperfy plugin init:', error);
        // throw error;
      }
      // Allow initialization to continue even if config fails, service might get config later
    }
  },
  // Removed example models, tests, routes
  events: {
    // Define how a Hyperfy world connection is triggered and handled
    WORLD_CONNECTED: [
      async (payload: WorldPayload) => {
        // **Decision Point:** How do we know this payload represents a Hyperfy world?
        // Option 1: Check payload.source
        // Option 2: Check world metadata (e.g., payload.world.metadata?.type === 'hyperfy')
        // Option 3: Check world settings associated with payload.world.id
        const isHyperfy = payload.source === 'hyperfy' || payload.world?.metadata?.type === 'hyperfy'; // Example check

        if (isHyperfy) {
            logger.info(`Hyperfy WORLD_CONNECTED event received for world: ${payload.world.id}`);
            const runtime = payload.runtime;
            const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);

            // Get connection details (WS URL, Auth Token)
            // Prioritize metadata, then maybe check runtime settings/config as fallback
            const wsUrl = payload.world.metadata?.wsUrl as string || HYPERFY_WS_URL; // Use default if not in metadata
            const authToken = payload.world.metadata?.authToken as string | undefined; // Optional
            const worldId = payload.world.id;

            if (service && worldId) {
                try {
                    await service.connect({ wsUrl, authToken, worldId });
                    logger.info(`Successfully initiated Hyperfy connection for world ${worldId}`);
                } catch(error) {
                     logger.error(`Failed to connect Hyperfy service for world ${worldId}:`, error);
                     // Optionally notify user/admin through a callback or another event
                }
            } else {
                logger.error(`Missing required info (service, worldId) to connect Hyperfy service for world ${payload.world.id}`);
            }
        } else {
             logger.debug(`Ignoring WORLD_CONNECTED event, source is not Hyperfy: ${payload.source}`);
        }
      },
    ],
    // Handle disconnect events
    WORLD_DISCONNECTED: [
       async (payload: WorldPayload) => {
           const isHyperfy = payload.source === 'hyperfy' || payload.world?.metadata?.type === 'hyperfy'; // Check if it was a Hyperfy world

           if (isHyperfy && payload.world?.id) {
                logger.info(`Hyperfy WORLD_DISCONNECTED event for world: ${payload.world.id}`);
                const runtime = payload.runtime;
                const service = runtime.getService<HyperfyService>(HyperfyService.serviceType);

                // Only disconnect if the service is currently connected to *this* world
                if (service?.isConnected() && service.currentWorldId === payload.world.id) {
                    await service.disconnect();
                    logger.info(`Hyperfy service disconnected for world ${payload.world.id}`);
                } else {
                     logger.warn(`Received disconnect for Hyperfy world ${payload.world.id}, but service was not connected or connected to a different world.`);
                }
           }
       }
     ],
     // Add a handler for MESSAGE_RECEIVED that passes through to messageReceivedHandler
     [EventType.MESSAGE_RECEIVED]: [
        async (payload: MessagePayload) => {
          try {
            // Only handle messages that originated from Hyperfy
            const metadata = payload.message.content.metadata;
            if (payload.source === 'hyperfy' && 
                metadata && 
                typeof metadata === 'object' &&
                'hyperfyMessageId' in metadata) {
              
              logger.info(`[Hyperfy Plugin] Processing MESSAGE_RECEIVED event for message: ${payload.message.id}`);
              
              // Message will be handled by the callback mechanism in startChatSubscription
              // but we can add any additional processing here if needed
              
              // Note: most of the logic for routing messages back to Hyperfy happens in the callback
              // that was registered when the message was created
            }
          } catch (error) {
            logger.error(`[Hyperfy Plugin] Error handling MESSAGE_RECEIVED event: ${error}`);
          }
        }
     ]
  },
  services: [
      HyperfyService // Register the Hyperfy service
  ],
  actions: [
      hyperfyChatAction // Register the Hyperfy chat action
      // Add hyperfyMoveAction here if implemented
  ],
  providers: [
      hyperfyProvider // Register the Hyperfy provider
  ],
};

export default plugin;
