import {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  elizaLogger,
} from "@elizaos/core";
import { HyperfyService } from "../../plugin-hyperfy/service";
import { GasStationTaskManager } from "../managers/gas-station-task-manager";

export const delegateTaskAction: Action = {
  name: "DELEGATE_TASK",
  similes: ["HELP_ME", "CAN_YOU_HELP", "LEND_A_HAND", "ASSIGN_TASK"],
  description: "Delegate a gas station task to a player who volunteers to help.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    return (
      text.includes("help") ||
      text.includes("i'll help") ||
      text.includes("i can") ||
      text.includes("what can i do") ||
      text.includes("assign me")
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
      elizaLogger.info("[DelegateTaskAction] Player volunteering for tasks");

      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!hyperfyService) {
        elizaLogger.error("[DelegateTaskAction] HyperfyService not available");
        if (callback) {
          callback({
            text: "Cannot assign tasks - Hyperfy service unavailable",
          });
        }
        return;
      }

      const world = hyperfyService.getWorld();
      if (!world._gasStationTaskManager) {
        world._gasStationTaskManager = new GasStationTaskManager(hyperfyService);
      }
      const taskManager = world._gasStationTaskManager as GasStationTaskManager;

      // Find a suitable task to delegate
      const tasks = taskManager.getTasksNeedingAttention();
      const delegatableTasks = tasks.filter(t => t.priority > 1); // Don't delegate priority 1

      if (delegatableTasks.length === 0) {
        await callback?.({
          text: "Thanks for offering, but everything's handled right now. You could check for Schwepe clues though.",
        });
        return;
      }

      // Assign the most urgent delegatable task
      const taskToAssign = delegatableTasks[0];
      const assignedTask = taskManager.assignTaskToPlayer(taskToAssign.id);

      if (assignedTask) {
        await callback?.({
          text: `Perfect! Can you ${assignedTask.description}? Every task helps in the search for Schwepe.`,
        });
      } else {
        await callback?.({
          text: "I appreciate the offer, but someone else already took that one. Check back in a bit.",
        });
      }

    } catch (error) {
      elizaLogger.error("[DelegateTaskAction] Error:", error);
      if (callback) {
        callback({
          text: "Couldn't assign task right now.",
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user}}",
        content: {
          text: "I can help",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Perfect! Can you stock the store shelves? Every task helps in the search for Schwepe.",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "what can i do to help?",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Could use someone at the pumps. Can you check the fuel levels? The ancient one might have left clues nearby.",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "i'll help with the gas station",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Yooo! Could you check the main door and entrance area? Schwepe vanished from this station - maybe there are clues.",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "assign me a task",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "The cashier area needs organizing. Every task done here brings us closer to finding the missing deity.",
        },
      },
    ],
  ],
} as Action;
