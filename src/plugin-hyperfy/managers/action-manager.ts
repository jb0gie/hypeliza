import { IAgentRuntime, logger } from "@elizaos/core";
import { HyperfyService } from "../service";
import { AgentControls } from "../systems/controls";
import { agentActivityLock } from "./guards";
import { type ActionData, type ActionState } from "./action-interfaces";
import { ActionWrapper } from "./action-wrapper";

export class ActionManager {
  private runtime: IAgentRuntime;
  private state: ActionState = {
    currentAction: null,
    nearbyActions: [],
    lastDetectionTime: 0
  };

  constructor(runtime: IAgentRuntime) {
    console.info('[ActionManager] Initializing with runtime:', runtime?.agentId);
    this.runtime = runtime;
    this.logState('constructor', null, this.state);
  }

  private logState(operation: string, previousState: any, newState: any): void {
    console.info(`[ActionManager] State change: ${operation}`, {
      timestamp: Date.now(),
      previousState,
      newState
    });
  }

  private getService(): HyperfyService {
    const service = this.runtime.getService<HyperfyService>(HyperfyService.serviceType);
    if (!service) {
      throw new Error('HyperfyService not available');
    }
    return service;
  }

  async detectNearbyActions(radius: number): Promise<ActionData[]> {
    await agentActivityLock.run(async () => {
      try {
        const service = this.getService();
        const world = service.getWorld();

        if (!world || !world.actions) {
          console.warn('[ActionManager] World or actions system not available');
          return;
        }

        const cameraPos = world.rig?.position;
        if (!cameraPos) {
          console.warn('[ActionManager] Camera position not available');
          return;
        }

        const nearbyNodes = world.actions.getNearby(radius);
        const previousState = { ...this.state };

        this.state.nearbyActions = nearbyNodes.map((node: any) => {
          const wrapper = new ActionWrapper(node);
          const distance = node.ctx.entity.root.position.distanceTo(cameraPos);
          return wrapper.toActionData(distance);
        });

        this.state.lastDetectionTime = Date.now();
        this.logState('detectNearbyActions', previousState, this.state);

      } catch (error) {
        logger.error('[ActionManager] Error detecting nearby actions:', error);
      }
    });

    return this.state.nearbyActions;
  }

  async simulateActionClick(actionId: string): Promise<boolean> {
    return agentActivityLock.run(async () => {
      try {
        // Get action details for friendly logging
        const actionDetails = await this.getActionDetails(actionId);
        const actionName = actionDetails?.name || actionId;

        console.info(`[ActionManager] Attempting to simulate click on action: ${actionName}`);

        const service = this.getService();
        const world = service.getWorld();

        if (!world || !world.actions) {
          console.error('[ActionManager] World or actions system not available');
          return false;
        }

        const previousState = { ...this.state };

        // Use AgentActions to perform the action
        world.actions.performAction(actionId);

        this.state.currentAction = actionId;
        this.logState('simulateActionClick', previousState, this.state);

        console.info(`[ActionManager] Successfully initiated action: ${actionName}`);
        return true;

      } catch (error) {
        logger.error(`[ActionManager] Error simulating action click for ${actionId}:`, error);
        return false;
      }
    });
  }

  async getActionDetails(actionId: string): Promise<ActionData | null> {
    return agentActivityLock.run(async () => {
      try {
        const service = this.getService();
        const world = service.getWorld();

        if (!world || !world.actions) {
          console.warn('[ActionManager] World or actions system not available');
          return null;
        }

        // Get all nearby nodes to find the specific action
        const nearbyNodes = world.actions.getNearby();
        const targetNode = nearbyNodes.find((node: any) =>
          node.ctx?.entity?.data?.id === actionId
        );

        if (!targetNode) {
          console.warn(`[ActionManager] Action not found: ${actionId}`);
          return null;
        }

        const wrapper = new ActionWrapper(targetNode);
        console.debug(`[ActionManager] Found action details: ${wrapper.name} (${actionId})`);

        const cameraPos = world.rig?.position;
        const distance = cameraPos ?
          targetNode.ctx.entity.root.position.distanceTo(cameraPos) : 0;

        return wrapper.toActionData(distance);

      } catch (error) {
        logger.error(`[ActionManager] Error getting action details for ${actionId}:`, error);
        return null;
      }
    });
  }

  async releaseCurrentAction(): Promise<boolean> {
    return agentActivityLock.run(async () => {
      try {
        const actionId = this.state.currentAction;
        const actionDetails = actionId ? await this.getActionDetails(actionId) : null;
        const actionName = actionDetails?.name || actionId || 'unknown action';

        console.info(`[ActionManager] Attempting to release ${actionName}`);

        const service = this.getService();
        const world = service.getWorld();

        if (!world || !world.actions) {
          console.error('[ActionManager] World or actions system not available');
          return false;
        }

        const previousState = { ...this.state };

        world.actions.releaseAction();

        const releasedAction = this.state.currentAction;
        this.state.currentAction = null;
        this.logState('releaseCurrentAction', previousState, this.state);

        console.info(`[ActionManager] Successfully released ${actionName}`);
        return true;

      } catch (error) {
        logger.error('[ActionManager] Error releasing current action:', error);
        return false;
      }
    });
  }

  getCurrentAction(): string | null {
    return this.state.currentAction;
  }

  getState(): ActionState {
    return { ...this.state };
  }

  isActionActive(): boolean {
    return this.state.currentAction !== null;
  }

  // Interact with nearest action using Hyperfy's native performAction (for player commands like "use" or "interact")
  async interactWithNearestAction(radius: number = 5): Promise<string> {
    return agentActivityLock.run(async () => {
      try {
        console.info('[ActionManager] Interacting with nearest action');

        // First detect nearby actions
        const nearbyActions = await this.detectNearbyActions(radius);

        if (nearbyActions.length === 0) {
          console.warn('[ActionManager] No actions found within radius');
          return 'No interactive objects nearby';
        }

        // Find the nearest action
        const nearestAction = nearbyActions.reduce((nearest, action) => {
          if (!nearest || (action.distance && action.distance < (nearest.distance || Infinity))) {
            return action;
          }
          return nearest;
        });

        if (!nearestAction) {
          console.warn('[ActionManager] Could not determine nearest action');
          return 'No valid action found';
        }

        console.info(`[ActionManager] Found nearest action: ${nearestAction.name} (distance: ${nearestAction.distance}m)`);

        // Use Hyperfy's native performAction which handles key simulation internally
        const service = this.getService();
        const world = service.getWorld();

        if (!world || !world.actions) {
          console.error('[ActionManager] World or actions system not available');
          return 'Failed to interact - system unavailable';
        }

        const previousState = { ...this.state };
        world.actions.performAction(nearestAction.id);
        this.state.currentAction = nearestAction.id;
        this.logState('interactWithNearestAction', previousState, this.state);

        console.info(`[ActionManager] Successfully initiated interaction with: ${nearestAction.name}`);
        return `Interacted with: ${nearestAction.name}`;

      } catch (error) {
        logger.error('[ActionManager] Error in interactWithNearestAction:', error);
        return 'Error during interaction';
      }
    });
  }
}