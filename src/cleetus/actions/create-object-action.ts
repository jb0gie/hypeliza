import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  elizaLogger,
} from "@elizaos/core";
import { HyperfyService } from "../../plugin-hyperfy/service";
import { uuid } from '../../plugin-hyperfy/hyperfy/src/core/utils.js'

export const createObjectAction: Action = {
  name: "CREATE_OBJECT",
  similes: ["BUILD_OBJECT", "MAKE_OBJECT", "GENERATE_OBJECT", "CREATE_PROP", "BUILD_PROP"],
  description: "Create a 3D object using Hyperfy's AI generation system (/create command). Uses prims (primitive shapes) to build objects like gas pumps, shelves, registers, etc.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    // Check for creation/building keywords
    const hasCreateKeywords = text.includes("create") || text.includes("build") || text.includes("make") || text.includes("generate");
    const hasObjectKeywords = text.includes("gas pump") || text.includes("register") || text.includes("shelf") ||
                               text.includes("counter") || text.includes("prop") || text.includes("object") ||
                               text.includes("sign") || text.includes("machine") || text.includes("furniture") ||
                               text.includes("desk") || text.includes("chair") || text.includes("table");

    // Accept if it has creation keywords AND seems to be asking for a physical object
    return hasCreateKeywords && (hasObjectKeywords || text.includes("for the gas station") || text.includes("for my station"));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    try {
      elizaLogger.info("[CreateObjectAction] Processing object creation request");

      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!hyperfyService) {
        elizaLogger.error("[CreateObjectAction] HyperfyService not available");
        if (callback) {
          callback({
            text: "Cannot create object - Hyperfy service unavailable. Make sure I'm connected to the world.",
          });
        }
        return;
      }

      const world = hyperfyService.getWorld();
      if (!world) {
        elizaLogger.error("[CreateObjectAction] World not available");
        if (callback) {
          callback({
            text: "World not available - cannot create object",
          });
        }
        return;
      }

      const text = message.content.text || "";
      elizaLogger.info(`[CreateObjectAction] Creating object for prompt: "${text}"`);

      // Extract the object description from the message
      let objectPrompt = text;
      // Remove common prefixes to get the actual description
      objectPrompt = objectPrompt.replace(/^(create|build|make|generate)\s+/i, '');
      objectPrompt = objectPrompt.replace(/^(me|us|a|an)\s+/i, '');
      objectPrompt = objectPrompt.trim();

      // Create blueprint with AI template
      const blueprintId = uuid();
      const appId = uuid();

      // Create the action payload that ServerAI expects
      const aiAction = {
        name: 'create',
        blueprintId: blueprintId,
        appId: appId,
        prompt: objectPrompt
      };

      elizaLogger.info("[CreateObjectAction] Sending AI creation request:", aiAction);

      // Send the action to the world's AI system
      // This uses the same path as the /create command
      if (world.network && world.network.send) {
        world.network.send('ai', aiAction);

        if (callback) {
          callback({
            text: `Creating "${objectPrompt}" for the gas station! The AI is generating it now...`,
          });
        }
      } else {
        elizaLogger.error("[CreateObjectAction] world.network.send not available");
        if (callback) {
          callback({
            text: "Cannot send creation request - network not available",
          });
        }
      }
    } catch (error) {
      elizaLogger.error("[CreateObjectAction] Error:", error);
      if (callback) {
        callback({
          text: "Failed to create object. Make sure the AI system is configured properly.",
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user}}",
        content: {
          text: "create a gas pump for the station",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Creating \"gas pump for the station\"! The AI is generating it now...",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "build a cash register",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Creating \"cash register\" for the gas station! The AI is generating it now...",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "make a store shelf for chips and snacks",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Creating \"store shelf for chips and snacks\"! Perfect for the convenience store section!",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "I need a sign for the gas station",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Creating \"sign for the gas station\"! Need to let people know we're open for business!",
        },
      },
    ],
  ],
} as Action;
