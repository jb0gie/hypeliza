import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  elizaLogger,
} from "@elizaos/core";
import { HyperfyService } from "../../plugin-hyperfy/service";
import { AgentControls } from "../../plugin-hyperfy/systems/controls";

export const useRomAction: Action = {
  name: "USE_ROM",
  similes: ["ACTIVATE_ROM", "SPRINT", "DASH", "USE_SPRINT", "USE_DASH", "ENABLE_ROM"],
  description: "Use a Hyperfy ROM (Read-Only Module) by holding shift and moving. ROMs monitor player input continuously and activate automatically when conditions are met. Sprint ROM: Hold Shift + Move forward (W) = Super speed after 0.5s. Dash ROM: Hold Shift + Direction = Dash movement. Ledge Hang ROM: Fall near ledge = Auto-grab ledge.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    return (
      text.includes("rom") ||
      text.includes("sprint") ||
      text.includes("dash") ||
      text.includes("ledge hang") ||
      text.includes("super run")
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    try {
      elizaLogger.info("[UseRomAction] Processing ROM usage command");

      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!hyperfyService) {
        elizaLogger.error("[UseRomAction] HyperfyService not available");
        if (callback) {
          callback({
            text: "Cannot use ROM - Hyperfy service unavailable",
          });
        }
        return;
      }

      const world = hyperfyService.getWorld();
      const controls: AgentControls | null = world?.controls || null;

      if (!controls) {
        elizaLogger.error("[UseRomAction] Controls not available - world.controls is null");
        if (callback) {
          callback({
            text: "Controls not available - cannot use ROM. Make sure Cleetus is fully connected to the world.",
          });
        }
        return;
      }

      const text = message.content.text?.toLowerCase() || "";

      // Determine which ROM to use based on command
      if (text.includes("sprint") || text.includes("super run")) {
        elizaLogger.info("[UseRomAction] Activating sprint ROM");

        // Sprint ROM requires: Hold Shift + Move Forward
        // The ROM monitors keys and applies sprint automatically

        // 1. Enable sprint (hold shift)
        controls.setKey('shiftLeft', true);
        controls.setKey('shiftRight', true);
        elizaLogger.debug("[UseRomAction] Shift held down");

        // 2. Start moving forward (hold W)
        controls.setKey('keyW', true);
        elizaLogger.debug("[UseRomAction] Moving forward");

        // 3. Wait for ROM to detect and activate sprint (0.5s)
        await new Promise(resolve => setTimeout(resolve, 600));

        elizaLogger.info("[UseRomAction] Sprint ROM should be active now");

        // 4. Clean up keys after sprint activates
        setTimeout(() => {
          controls.setKey('keyW', false);
          controls.setKey('shiftLeft', false);
          controls.setKey('shiftRight', false);
        }, 2000);

        if (callback) {
          callback({
            text: "Sprint ROM activated! Hold shift and move for super speed! Point emerged!",
          });
        }
      } else if (text.includes("dash")) {
        elizaLogger.info("[UseRomAction] Activating dash ROM");

        // Dash ROM requires shift + direction (similar to sprint but different effect)
        controls.setKey('shiftLeft', true);
        controls.setKey('shiftRight', true);
        elizaLogger.debug("[UseRomAction] Shift held for dash");

        // Start moving
        controls.setKey('keyW', true);
        elizaLogger.debug("[UseRomAction] Moving for dash");

        await new Promise(resolve => setTimeout(resolve, 600));

        setTimeout(() => {
          controls.setKey('keyW', false);
          controls.setKey('shiftLeft', false);
          controls.setKey('shiftRight', false);
        }, 1500);

        if (callback) {
          callback({
            text: "Dash ROM engaged! Hold shift and direction to dash! Extra mobility unlocked!",
          });
        }
      } else {
        // General ROM usage - try to activate based on what's nearby
        elizaLogger.info("[UseRomAction] Attempting to activate nearby ROM");

        // Hold shift (most ROMs use shift)
        controls.setKey('shiftLeft', true);
        controls.setKey('shiftRight', true);

        // Try moving to trigger ROM detection
        controls.setKey('keyW', true);

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Release keys
        controls.setKey('keyW', false);
        controls.setKey('shiftLeft', false);
        controls.setKey('shiftRight', false);

        if (callback) {
          callback({
            text: "ROM engaged! Monitor your movement - ROM effects should be active! Point emerged!",
          });
        }
      }
    } catch (error) {
      elizaLogger.error("[UseRomAction] Error:", error);
      if (callback) {
        callback({
          text: "Failed to activate ROM. Make sure you're in the ROM's activation zone.",
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user}}",
        content: {
          text: "use the sprint ROM",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Sprint ROM activated! Hold shift and move for super speed! Point emerged!",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "activate the dash ROM",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Dash ROM engaged! Hold shift and direction to dash! Extra mobility unlocked!",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "use romSprint",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Sprint ROM engaged! Hold sprint and move for super speed! Point emerged!",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "super run with sprint ROM",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Super run engaged! Shift held, moving forward... Sprint ROM provides extra speed!",
        },
      },
    ],
  ],
} as Action;
