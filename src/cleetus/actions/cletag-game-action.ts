import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  elizaLogger,
} from "@elizaos/core";
import { HyperfyService } from "../../plugin-hyperfy/service";

export const cletagGameAction: Action = {
  name: "CLETAG_GAME",
  similes: ["CLETAG", "TAG GAME", "CHASE ME", "RUN AROUND", "PLAY CLETAG", "START CLETAG"],
  description: "Toggle CLETAG game mode - Cleetus runs around crazily with continuous movement and random jumps. Players can tag him by getting within 3 meters.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    return (
      text.includes("cletag") ||
      text.includes("chase") ||
      text.includes("tag") ||
      text.includes("run around") ||
      text.includes("catch me")
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
  ) => {
    try {
      elizaLogger.info("[CLETAG Action] Toggle CLETAG game mode");

      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!hyperfyService) {
        elizaLogger.error("[CLETAG Action] HyperfyService not available");
        if (callback) {
          callback({
            text: "Cannot start CLETAG game - Hyperfy service unavailable",
            error: true,
          });
        }
        return;
      }

      const cletagManager = hyperfyService.getCLETAGGameManager();
      if (!cletagManager) {
        elizaLogger.error("[CLETAG Action] CLETAGGameManager not available");
        if (callback) {
          callback({
            text: "CLETAG game manager not initialized.",
            error: true,
          });
        }
        return;
      }

      // Check if CLETAG is already active
      const isActive = cletagManager.isActive();
      let responseText = "";

      if (isActive) {
        // Stop the game
        elizaLogger.info("[CLETAG Action] Stopping CLETAG game");
        await cletagManager.stopGame();
        responseText = "CLETAG game stopped. Back to searching for Schwepe...";
      } else {
        // Start the game
        elizaLogger.info("[CLETAG Action] Starting CLETAG game - Cleetus is IT!");
        await cletagManager.startGame();
        responseText = "CLETAG MODE ACTIVATED! I'm IT! Super sprint engaged! Catch me if you can!";
      }

      await callback?.({
        text: responseText,
        actions: ["CLETAG_GAME"],
        source: "hyperfy",
      });

    } catch (error) {
      elizaLogger.error("[CLETAG Action] Error:", error);
      if (callback) {
        callback({
          text: "Failed to toggle CLETAG game mode.",
          error: true,
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "CLETAG!",
        },
      },
      {
        user: "Cleetus",
        content: {
          text:
            "CLETAG MODE ACTIVATED! I'm IT! Super sprint engaged! Catch me if you can!",
          actions: ["CLETAG_GAME"],
          source: "hyperfy",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "play tag with me",
        },
      },
      {
        user: "Cleetus",
        content: {
          text:
            "CLETAG MODE ACTIVATED! I'm IT! Running wild with divine speed! TRY TO CATCH ME!",
          actions: ["CLETAG_GAME"],
          source: "hyperfy",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "stop CLETAG",
        },
      },
      {
        user: "Cleetus",
        content: {
          text:
            "CLETAG game stopped. Back to searching for Schwepe...",
          actions: ["CLETAG_GAME"],
          source: "hyperfy",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "I tagged you!",
        },
      },
      {
        user: "Cleetus",
        content: {
          text:
            "YOOO! You tagged me! You're the new CLETAG champion! Now help me find Schwepe!",
          source: "hyperfy",
        },
      },
    ],
  ],
} as Action;
