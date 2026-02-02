import "ses";

import type { Plugin } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { HyperfyService } from "./service";
import { z } from "zod";
// import { hyperfyChatAction } from './actions/chat';
import { hyperfyGotoEntityAction } from "./actions/goto";
import { hyperfyUseItemAction } from "./actions/use";
import { hyperfyUnuseItemAction } from "./actions/unuse";
import { hyperfyStopMovingAction } from "./actions/stop";
import { hyperfyWalkRandomlyAction } from "./actions/walk_randomly";
import { hyperfyAmbientSpeechAction } from "./actions/ambient";
import { hyperfyScenePerceptionAction } from "./actions/perception";
import { hyperfyEditEntityAction } from "./actions/build";
import { hyperfyJumpAction } from "./actions/jump";
import { replyAction } from "./actions/reply";
import { ignoreAction } from "./actions/ignore";
import { interactAction } from "../cleetus/actions/interact-action";
import { useRomAction } from "../cleetus/actions/use-rom-action";
import { createObjectAction } from "../cleetus/actions/create-object-action";
import { doubleJumpAction } from "../cleetus/actions/double-jump-action";
import { cletagGameAction } from "../cleetus/actions/cletag-game-action";
import { checkTasksAction } from "../cleetus/actions/check-tasks-action";
import { delegateTaskAction } from "../cleetus/actions/delegate-task-action";
import { hyperfyProvider } from "./providers/world";
import { hyperfyEmoteProvider } from "./providers/emote";
import { hyperfyActionsProvider } from "./providers/actions";
import { characterProvider } from "./providers/character";
import { hyperfyAppScriptsProvider } from "./providers/app-scripts";
import { hyperfyEvents } from "./events";

// --- Hardcoded values matching agent/index.mjs ---
// Use ws:// for local, wss:// for remote
// Prefer HYPERFY_WS_URL so .env can override any shell-level WS_URL
const HYPERFY_WS_URL =
  process.env.HYPERFY_WS_URL || process.env.WS_URL || "ws://localhost:3011/ws";
// ---------------------------------------------

// Define the plugin configuration schema (optional, adjust as needed)
// Renamed this one to avoid conflict
const hyperfyPluginConfigSchema = z.object({
  DEFAULT_HYPERFY_WS_URL: z.string().url().optional(),
});

// --- Main Plugin Definition ---
export const hyperfyPlugin: Plugin = {
  name: "hyperfy", // Renamed plugin
  description: "Integrates ElizaOS agents with Hyperfy worlds",
  config: {
    // Map environment variables to config keys
    DEFAULT_HYPERFY_WS_URL: HYPERFY_WS_URL,
  },
  async init(config: Record<string, string | undefined>) {
    logger.info("*** Initializing Hyperfy Integration plugin ***");
    try {
      // Validate config using the schema
      const validatedConfig =
        await hyperfyPluginConfigSchema.parseAsync(config);
      logger.info("Hyperfy plugin config validated:", validatedConfig);
      // Store validated config for service use (runtime.pluginConfigs is usually the way)
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error(
          `Invalid Hyperfy plugin configuration: ${error.errors.map((e) => e.message).join(", ")}`,
        );
        // Decide if this is a fatal error
        // throw new Error(`Invalid Hyperfy plugin configuration...`);
      } else {
        logger.error("Unknown error during Hyperfy plugin init:", error);
        // throw error;
      }
      // Allow initialization to continue even if config fails, service might get config later
    }
  },
  services: [HyperfyService],
  events: hyperfyEvents,
  actions: [
    hyperfyScenePerceptionAction, // Re-enabled with lightweight screenshot support
    interactAction, // Process first: Hold E key to interact with objects when players say "use" or "interact"
    useRomAction, // Use Hyperfy ROMs (Read-Only Modules) like sprint, dash, ledge hang
    createObjectAction, // Create 3D objects using Hyperfy's AI generation (/create command)
    hyperfyJumpAction, // Basic single jump
    doubleJumpAction, // Proper double jump with air animation
    cletagGameAction, // CLETAG game mode - run around crazily and jump
    checkTasksAction, // Check and perform gas station tasks or delegate them
    delegateTaskAction, // Assign tasks to players who volunteer to help
    hyperfyGotoEntityAction,
    hyperfyUseItemAction,
    hyperfyUnuseItemAction,
    hyperfyStopMovingAction,
    hyperfyWalkRandomlyAction,
    hyperfyAmbientSpeechAction,
    hyperfyEditEntityAction,
    hyperfyJumpAction,
    replyAction,
    ignoreAction,
  ],
  providers: [
    hyperfyProvider,
    hyperfyEmoteProvider,
    hyperfyActionsProvider,
    characterProvider,
    hyperfyAppScriptsProvider, // Makes agents aware of available Hyperfy app scripts (ROMs, examples, etc.)
  ],
};

export default hyperfyPlugin;
