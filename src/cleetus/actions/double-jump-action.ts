import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  elizaLogger,
} from "@elizaos/core";
import { HyperfyService } from "../../plugin-hyperfy/service";

export const doubleJumpAction: Action = {
  name: "HYPERFY_DOUBLE_JUMP",
  similes: ["DOUBLE_JUMP", "AIR_JUMP", "SECOND_JUMP"],
  description: "Perform a jump. Note: Double/air jumps are intentionally disabled in Hyperfy - only single jumps are available. This action performs a standard jump.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    return (
      text.includes("double jump") ||
      text.includes("air jump") ||
      text.includes("jump twice") ||
      (text.includes("double") && text.includes("jump"))
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
      elizaLogger.info("[DoubleJumpAction] Performing jump (air jumps disabled in Hyperfy)");

      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!hyperfyService) {
        elizaLogger.error("[DoubleJumpAction] HyperfyService not available");
        if (callback) {
          callback({
            text: "Cannot jump - Hyperfy service unavailable",
          });
        }
        return;
      }

      const world = hyperfyService.getWorld();
      const controls = world?.controls;

      if (!controls) {
        elizaLogger.error("[DoubleJumpAction] Controls not available");
        if (callback) {
          callback({
            text: "Controls not available - cannot jump",
          });
        }
        return;
      }

      // Perform a standard jump using Hyperfy's built-in systems
      // IMPORTANT: Air jumps are intentionally disabled in Hyperfy (PlayerLocal.js line 664)
      // We respect this design decision and only perform ground jumps
      elizaLogger.info("[DoubleJumpAction] Executing standard jump");

      controls.setKey('space', true);
      await new Promise(resolve => setTimeout(resolve, 300));
      controls.setKey('space', false);

      elizaLogger.info("[DoubleJumpAction] Jump completed");

      await callback?.({
        text: "Jump executed! (Note: Double/air jumps are disabled in Hyperfy - only ground jumps available)",
        actions: ['HYPERFY_DOUBLE_JUMP'],
        source: 'hyperfy',
      });

    } catch (error) {
      elizaLogger.error("[DoubleJumpAction] Error:", error);
      if (callback) {
        callback({
          text: "Failed to jump.",
          error: true,
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user}}",
        content: {
          text: "double jump",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Jump executed! (Note: Double/air jumps are disabled in Hyperfy - only ground jumps available)",
          actions: ['HYPERFY_DOUBLE_JUMP'],
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "do a double jump",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Standard jump performed! Note: Air jumps are disabled in Hyperfy - this is a ground jump only.",
          actions: ['HYPERFY_DOUBLE_JUMP'],
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "air jump",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Jump completed! FYI: Hyperfy intentionally disables air jumps - only ground jumps work.",
          actions: ['HYPERFY_DOUBLE_JUMP'],
        },
      },
    ],
  ],
} as Action;
