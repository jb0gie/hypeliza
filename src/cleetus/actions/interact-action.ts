import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  elizaLogger,
} from "@elizaos/core";
import { HyperfyService } from "../../plugin-hyperfy/service";

export const interactAction: Action = {
  name: "INTERACT_WITH_OBJECT",
  similes: ["USE_OBJECT", "INTERACT", "USE", "PRESS", "ACTIVATE"],
  description: "Hold E key to interact with nearest interactive object when player says 'use' or 'interact'",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    const hasKeywords = text.includes("use") || text.includes("interact");

    // Additional validation: check if there are actually interactive objects nearby
    // This prevents false positives when no objects are available
    try {
      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (hyperfyService && hyperfyService.getActionManager()) {
        const nearbyActions = await hyperfyService.getActionManager().detectNearbyActions(10);
        if (nearbyActions.length === 0) {
          elizaLogger.debug(`[InteractAction] Validate - no nearby actions, skipping`);
          return false; // Don't claim we can handle it if nothing to interact with
        }
      }
    } catch (error) {
      elizaLogger.debug(`[InteractAction] Validate - error checking nearby actions: ${error}`);
    }

    elizaLogger.debug(`[InteractAction] Validate - text: "${text}", hasKeywords: ${hasKeywords}`);
    return hasKeywords;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    try {
      elizaLogger.info("[InteractAction] Detected use/interact command");

      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!hyperfyService) {
        elizaLogger.error("[InteractAction] HyperfyService not available");
        if (callback) {
          callback({
            text: "Cannot interact - Hyperfy service unavailable",
          });
        }
        return;
      }

      // Interact with nearest action by holding E key
      const result = await hyperfyService.interactWithNearestAction(10);

      elizaLogger.info(`[InteractAction] Interaction result: ${result}`);

      if (callback) {
        callback({
          text: result,
        });
      }
    } catch (error) {
      elizaLogger.error("[InteractAction] Error:", error);
      if (callback) {
        callback({
          text: "Failed to interact with object",
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user}}",
        content: {
          text: "use the door",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Holding E to interact... Door opened. Sacred passage revealed.",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "interact with that button",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "E key engaged... Button pressed. Ancient mechanism activated.",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "use the elevator",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Interacting with elevator... Divine transport awaits.",
        },
      },
    ],
  ],
} as Action;
