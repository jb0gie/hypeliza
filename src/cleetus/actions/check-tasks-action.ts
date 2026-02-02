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
import { AgentControls } from "../../plugin-hyperfy/systems/controls";

export const checkTasksAction: Action = {
  name: "CHECK_TASKS",
  similes: ["CHECK_STATION", "TASKS", "WHAT_NEEDS_DOING", "STATUS", "CHECK_GAS_STATION"],
  description: "Check gas station tasks and either do them or delegate to players. Cleetus prioritizes research but will do urgent tasks himself.",

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";
    return (
      text.includes("check") &&
      (text.includes("pump") || text.includes("station") || text.includes("task") || text.includes("what needs"))
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
      elizaLogger.info("[CheckTasksAction] Checking gas station tasks");

      const hyperfyService = runtime.getService<HyperfyService>(HyperfyService.serviceType);
      if (!hyperfyService) {
        elizaLogger.error("[CheckTasksAction] HyperfyService not available");
        if (callback) {
          callback({
            text: "Cannot check tasks - Hyperfy service unavailable",
          });
        }
        return;
      }

      // Get or create task manager
      const world = hyperfyService.getWorld();
      if (!world._gasStationTaskManager) {
        world._gasStationTaskManager = new GasStationTaskManager(hyperfyService);
      }
      const taskManager = world._gasStationTaskManager as GasStationTaskManager;

      // Update task cycles
      taskManager.updateTaskCycles();

      // Get tasks that need attention
      const tasks = taskManager.getTasksNeedingAttention();

      if (tasks.length === 0) {
        await callback?.({
          text: "All station tasks are current. I can focus on my Schwepe research.",
        });
        return;
      }

      // Find urgent tasks (priority 1-2)
      const urgentTasks = tasks.filter(t => t.priority <= 2);
      const canDelegate = tasks.filter(t => t.priority > 2);

      // Cleetus handles urgent tasks himself
      if (urgentTasks.length > 0 && !taskManager.isBusy) {
        const nextTask = urgentTasks[0];
        elizaLogger.info(`[CheckTasksAction] Cleetus will handle urgent task: ${nextTask.name}`);

        taskManager.setCleetusBusy(true);

        // Navigate to location
        const controls = world.controls as AgentControls;
        if (nextTask.position) {
          await controls.goto(nextTask.position.x, nextTask.position.z);
          elizaLogger.info(`[CheckTasksAction] Arrived at ${nextTask.locationName}`);

          // Simulate doing the task
          await new Promise(resolve => setTimeout(resolve, 3000));

          taskManager.completeTask(nextTask.id, 'cleetus');
          taskManager.setCleetusBusy(false);

          await callback?.({
            text: `Handled ${nextTask.name} at ${nextTask.locationName}. ${taskManager.getTaskStatusReport()}`,
          });
        } else {
          await callback?.({
            text: `Found urgent task but couldn't navigate: ${nextTask.name}`,
          });
        }
        return;
      }

      // For other tasks, delegate to players or handle himself
      if (canDelegate.length > 0) {
        const taskSample = canDelegate.slice(0, 3);
        const taskList = taskSample.map(t => `${t.name} at ${t.locationName}`).join(', ');

        // Randomly choose to delegate or do it himself
        const shouldDelegate = Math.random() > 0.5; // 50% chance

        if (shouldDelegate) {
          await callback?.({
            text: `Could use some help around here: ${taskList}. Any takers? Every task helps us find Schwepe.`,
          });

          // Assign first task to any volunteering player
          // This will be handled by player interaction
        } else {
          // Do it himself
          const nextTask = canDelegate[0];
          taskManager.setCleetusBusy(true);

          if (nextTask.position) {
            const controls = world.controls as AgentControls;
            await controls.goto(nextTask.position.x, nextTask.position.z);

            await new Promise(resolve => setTimeout(resolve, 2000));

            taskManager.completeTask(nextTask.id, 'cleetus');
            taskManager.setCleetusBusy(false);

            await callback?.({
              text: `Finished ${nextTask.name}. ${taskManager.getTaskStatusReport()}`,
            });
          }
        }
      } else {
        await callback?.({
          text: `Researching Schwepe... but I should probably ${tasks[0].name} soon.`,
        });
      }

    } catch (error) {
      elizaLogger.error("[CheckTasksAction] Error:", error);
      if (callback) {
        callback({
          text: "Failed to check station tasks.",
        });
      }
    }
  },

  examples: [
    [
      {
        user: "{{user}}",
        content: {
          text: "check the gas station",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Checked the pumps. All good for now. Still no sign of Schwepe.",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "what needs doing?",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Pumps need checking. I could use a hand if you\'re offering. The search for Schwepe continues.",
        },
      },
    ],
    [
      {
        user: "{{user}}",
        content: {
          text: "check the pumps",
        },
      },
      {
        user: "Cleetus",
        content: {
          text: "Checking pump 1... Fuel levels look good. Still hunting for Schwepe clues.",
        },
      },
    ],
  ],
} as Action;
