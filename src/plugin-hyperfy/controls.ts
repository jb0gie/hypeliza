import { System } from './hyperfy/core/systems/System.js'
import { logger } from '@elizaos/core';
import * as THREE from 'three';

// Define Navigation Constants
const NAVIGATION_TICK_INTERVAL = 100; // ms
const NAVIGATION_STOP_DISTANCE = 1.0; // meters
const RANDOM_WALK_DEFAULT_INTERVAL = 5000; // ms <-- SET TO 5 SECONDS
const RANDOM_WALK_DEFAULT_MAX_DISTANCE = 7; // meters

function createButtonState() {
  return {
    $button: true,
    down: false,
    pressed: false,
    released: false,
  }
}

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

  // --- Navigation State --- >
  private _navigationTarget: THREE.Vector3 | null = null;
  private _isNavigating: boolean = false;
  private _navigationIntervalId: NodeJS.Timeout | null = null;
  private _currentNavKeys: { forward: boolean, backward: boolean, left: boolean, right: boolean } = {
      forward: false, backward: false, left: false, right: false
  };
  private _stopReason: string | null = null; // Store the reason for stopping
  // <------------------------

  // --- Random Walk State --- >
  private _isWalkingRandomly: boolean = false;
  private _randomWalkIntervalId: NodeJS.Timeout | null = null;
  private _randomWalkIntervalMs: number = RANDOM_WALK_DEFAULT_INTERVAL;
  private _randomWalkMaxDistance: number = RANDOM_WALK_DEFAULT_MAX_DISTANCE;
  // <-------------------------

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
      // If the key doesn't exist or isn't a button state, log a warning or initialize
      logger.warn(`[Controls] Attempted to set unknown or non-button key: ${keyName}. Initializing.`);
      this[keyName] = createButtonState(); // Create if missing
    }
    const state = this[keyName];

    // Check if the state actually changed to avoid redundant updates
    const changed = state.down !== isDown;

    if (isDown && !state.down) {
      state.pressed = true;
      state.released = false;
    } else if (!isDown && state.down) {
      state.released = true;
      state.pressed = false;
    }
    state.down = isDown;

    // Optional: Log the key press/release
    // if (changed) {
    //     logger.debug(`[Controls] setKey: ${keyName} = ${isDown}`);
    // }
  }

  // Reset pressed/released flags at the end of the frame
  // This is important for detecting single presses/releases
  postLateUpdate() {
    for (const key in this) {
      if (this.hasOwnProperty(key) && this[key] && (this[key] as any).$button) {
        (this[key] as any).pressed = false;
        (this[key] as any).released = false;
      }
    }
    // We don't run navigationTick here, it runs on its own interval
  }

  // --- Navigation Methods --- >

  /**
   * Starts navigating the agent towards the target X, Z coordinates.
   */
  public navigateTo(x: number, z: number): void {
    logger.info(`[Controls Navigation] Request to navigate to (${x.toFixed(2)}, ${z.toFixed(2)})`);
    // --- Add check for player existence early ---
    if (!this.world?.entities?.player) {
        logger.error("[Controls Navigation] Cannot navigateTo: Player entity not found.");
        this.stopNavigation("error - player missing");
        return;
    }
    // -------------------------------------------
    if (!this._validatePlayerState("navigateTo")) return;

    this.stopNavigation("starting new navigation"); // Stop previous navigation first

    this._navigationTarget = new THREE.Vector3(x, 0, z); // Store target (Y is ignored)
    this._isNavigating = true;
    this._stopReason = null; // Clear stop reason

    // Reset internal key tracker
    this._currentNavKeys = { forward: false, backward: false, left: false, right: false };

    // Start the navigation tick interval
    if (!this._navigationIntervalId) {
        this._navigationIntervalId = setInterval(() => this._navigationTick(), NAVIGATION_TICK_INTERVAL);
        logger.info("[Controls Navigation] Navigation tick interval started.");
    }
  }

  /**
   * Stops the current navigation process AND random walk if active.
   */
  public stopNavigation(reason: string = "commanded"): void {
    let stoppedNav = false;
    if (this._isNavigating || this._navigationIntervalId) {
        logger.info(`[Controls Navigation] Stopping navigation (${reason}). Reason stored.`);
        this._stopReason = reason; // Store the reason
        if (this._navigationIntervalId) {
          clearInterval(this._navigationIntervalId);
          this._navigationIntervalId = null;
        }
        this._isNavigating = false;
        this._navigationTarget = null;
        stoppedNav = true;

        // Release movement keys
        try {
            this.setKey('keyW', false);
            this.setKey('keyA', false);
            this.setKey('keyS', false);
            this.setKey('keyD', false);
            this.setKey('shiftLeft', false);
            logger.debug("[Controls Navigation] Movement keys released.");
        } catch (e) {
            logger.error("[Controls Navigation] Error releasing keys on stop:", e);
        }
        this._currentNavKeys = { forward: false, backward: false, left: false, right: false };
    }
    // Also stop random walk if navigation stopped for a reason other than the random walk itself starting a new leg
    if (stoppedNav && reason !== "random walk tick") {
        this.stopRandomWalk("navigation stopped");
    }
  }

  /**
   * Returns whether the agent is currently navigating towards a target.
   */
  public getIsNavigating(): boolean {
    return this._isNavigating;
  }

  /**
   * The core navigation logic, executed at intervals.
   */
  private _navigationTick(): void {
    // --- BEGIN DEBUG LOGS ---
    if (!this._isNavigating || !this._navigationTarget) {
        // Check if we already logged a stop reason
        if (this._stopReason) {
             logger.debug(`[Controls Navigation Tick] Tick skipped (Stopped: ${this._stopReason}). Interval should be clearing.`);
        } else {
             logger.warn("[Controls Navigation Tick] Tick skipped (not navigating or no target, no explicit stop reason). Clearing interval.");
        }
        if (this._navigationIntervalId) { clearInterval(this._navigationIntervalId); this._navigationIntervalId = null; }
        // Don't call stopNavigation here to avoid loops, just clear interval
        return;
    }
    // --- Add check for player existence ---
    if (!this.world?.entities?.player) {
        logger.error("[Controls Navigation Tick] Cannot tick: Player entity not found.");
        this.stopNavigation("tick error - player missing");
        return;
    }
    // ------------------------------------
    if (!this._validatePlayerState("_navigationTick")) {
        logger.warn("[Controls Navigation Tick] Tick skipped (player state invalid).");
        this.stopNavigation("tick error - player state invalid");
        return;
    }
    logger.debug(`[Controls Navigation Tick] Tick running. Target: (${this._navigationTarget.x.toFixed(2)}, ${this._navigationTarget.z.toFixed(2)})`);
    // --- END DEBUG LOGS ---

    // --- Incorporate user's fix: Create new Vec/Quat instances ---
    const playerPosition = new THREE.Vector3().copy(this.world.entities.player.base.position);
    const playerQuaternion = new THREE.Quaternion().copy(this.world.entities.player.base.quaternion);
    logger.debug(`[Controls Navigation Tick] DEBUG: Current Pos: (${playerPosition.x.toFixed(2)}, ${playerPosition.y.toFixed(2)}, ${playerPosition.z.toFixed(2)})`);
    logger.debug(`[Controls Navigation Tick] DEBUG: Current Quat: (${playerQuaternion.x.toFixed(2)}, ${playerQuaternion.y.toFixed(2)}, ${playerQuaternion.z.toFixed(2)}, ${playerQuaternion.w.toFixed(2)})`);
    // -----------------------------------------------------------

    // Check distance to target (XZ plane)
    const distanceXZ = playerPosition.clone().setY(0).distanceTo(this._navigationTarget.clone().setY(0));
    logger.debug(`[Controls Navigation Tick] DEBUG: Distance to target: ${distanceXZ.toFixed(2)}m`);

    // --- Check if target reached --- >
    if (distanceXZ <= NAVIGATION_STOP_DISTANCE) {
      logger.info(`[Controls Navigation Tick] Target reached (distance ${distanceXZ.toFixed(2)} <= ${NAVIGATION_STOP_DISTANCE}).`);
      this.stopNavigation("reached target"); // Stop everything once target is reached
      // TODO: Emit navigation completion event?
      return; // Stop further processing this tick
    }
    // <--------------------------------

    // --- Calculate Movement --- >
    const directionWorld = this._navigationTarget.clone().sub(playerPosition).setY(0).normalize();
    const forwardWorld = new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuaternion).setY(0).normalize();
    logger.debug(`[Controls Navigation Tick] DEBUG: Direction Vector: (${directionWorld.x.toFixed(2)}, ${directionWorld.y.toFixed(2)}, ${directionWorld.z.toFixed(2)})`);
    logger.debug(`[Controls Navigation Tick] DEBUG: Forward Vector: (${forwardWorld.x.toFixed(2)}, ${forwardWorld.y.toFixed(2)}, ${forwardWorld.z.toFixed(2)})`);

    // Check for zero vectors or NaN
    if (isNaN(forwardWorld.x) || isNaN(forwardWorld.y) || isNaN(forwardWorld.z) || forwardWorld.lengthSq() < 0.001) {
         logger.warn("[Controls Navigation Tick] Invalid player forward vector. Holding position.");
         this.setKey('keyW', false); this.setKey('keyA', false); this.setKey('keyD', false); this.setKey('keyS', false);
         this._currentNavKeys = { forward: false, backward: false, left: false, right: false };
         return;
    }
     if (isNaN(directionWorld.x) || isNaN(directionWorld.y) || isNaN(directionWorld.z) || directionWorld.lengthSq() < 0.001) {
          logger.warn("[Controls Navigation Tick] Invalid target direction vector (target likely same as current pos). Holding position.");
          this.setKey('keyW', false); this.setKey('keyA', false); this.setKey('keyD', false); this.setKey('keyS', false);
          this._currentNavKeys = { forward: false, backward: false, left: false, right: false };
          // Optionally stop navigation if direction is invalid
          // this.stopNavigation("invalid direction");
          return;
     }

    const angle = forwardWorld.angleTo(directionWorld);
    const cross = new THREE.Vector3().crossVectors(forwardWorld, directionWorld);
    const signedAngle = cross.y < 0 ? -angle : angle;
    logger.debug(`[Controls Navigation Tick] DEBUG: Angle: ${(angle * THREE.MathUtils.RAD2DEG).toFixed(1)} deg, Signed Angle: ${(signedAngle * THREE.MathUtils.RAD2DEG).toFixed(1)} deg, Cross Y: ${cross.y.toFixed(3)}`);

    // --- Determine desired movement ---
    const forwardThreshold = Math.PI / 18; // ~10 degrees
    const turnThreshold = Math.PI / 4; // 45 degrees - turn in place if angle > this
    let desiredKeys = { forward: false, backward: false, left: false, right: false };
    if (Math.abs(signedAngle) > turnThreshold) {
      desiredKeys.forward = false;
      if (signedAngle < 0) { desiredKeys.left = true; } else { desiredKeys.right = true; }
    }
    else {
        desiredKeys.forward = true;
        if (Math.abs(signedAngle) > forwardThreshold) {
            if (signedAngle < 0) { desiredKeys.left = true; } else { desiredKeys.right = true; }
        }
    }
    logger.debug(`[Controls Navigation Tick] DEBUG: Desired keys: F:${desiredKeys.forward}, L:${desiredKeys.left}, R:${desiredKeys.right}`);
    // <--------------------------

    // --- Apply Keys --- >
    if (desiredKeys.forward !== this._currentNavKeys.forward) { logger.debug(`[Controls Navigation Tick] DEBUG: Setting keyW to ${desiredKeys.forward}`); this.setKey('keyW', desiredKeys.forward); this._currentNavKeys.forward = desiredKeys.forward; }
    if (desiredKeys.left !== this._currentNavKeys.left) { logger.debug(`[Controls Navigation Tick] DEBUG: Setting keyA to ${desiredKeys.left}`); this.setKey('keyA', desiredKeys.left); this._currentNavKeys.left = desiredKeys.left; }
    if (desiredKeys.right !== this._currentNavKeys.right) { logger.debug(`[Controls Navigation Tick] DEBUG: Setting keyD to ${desiredKeys.right}`); this.setKey('keyD', desiredKeys.right); this._currentNavKeys.right = desiredKeys.right; }
    if (this._currentNavKeys.backward) { logger.debug(`[Controls Navigation Tick] DEBUG: Setting keyS to false`); this.setKey('keyS', false); this._currentNavKeys.backward = false; }
    this.setKey('shiftLeft', false);
    // <-------------------
  }

  // --- Random Walk Methods --- >

  /**
   * Starts the agent walking to random nearby points.
   */
  public startRandomWalk(
      intervalMs: number = RANDOM_WALK_DEFAULT_INTERVAL,
      maxDistance: number = RANDOM_WALK_DEFAULT_MAX_DISTANCE
  ): void {
      if (this._isWalkingRandomly) {
          logger.warn('[Controls Random Walk] Already walking randomly. Restarting with new parameters.');
          this.stopRandomWalk("restarting"); // Stop existing random walk first
      }

      logger.info(`[Controls Random Walk] Starting. Interval: ${intervalMs}ms, Max Distance: ${maxDistance}m`);
      this._isWalkingRandomly = true;
      this._randomWalkIntervalMs = intervalMs;
      this._randomWalkMaxDistance = maxDistance;

      // Start the first leg shortly
      setTimeout(() => this._randomWalkTick(), 100);

      // Set interval for subsequent legs
      this._randomWalkIntervalId = setInterval(() => this._randomWalkTick(), this._randomWalkIntervalMs);
  }

  /**
   * Stops the random walk process.
   */
  public stopRandomWalk(reason: string = "commanded"): void {
      if (!this._isWalkingRandomly && !this._randomWalkIntervalId) {
          return; // Nothing to stop
      }
      logger.info(`[Controls Random Walk] Stopping (${reason}).`);
      if (this._randomWalkIntervalId) {
          clearInterval(this._randomWalkIntervalId);
          this._randomWalkIntervalId = null;
      }
      this._isWalkingRandomly = false;

      // Also stop any current navigation leg initiated by the random walk
      // Avoid loop if stopNavigation called us
      if (reason !== "navigation stopped") {
          this.stopNavigation("random walk stopped");
      }
  }

  /**
   * Returns whether the agent is currently walking randomly.
   */
  public getIsWalkingRandomly(): boolean {
      return this._isWalkingRandomly;
  }

  /**
   * The core random walk logic, executed at intervals.
   */
  private _randomWalkTick(): void {
      if (!this._isWalkingRandomly) return; // Stop if flag was turned off
      if (!this._validatePlayerState("_randomWalkTick")) {
         this.stopRandomWalk("tick error - player state invalid"); // Stop the random walk itself
         return;
      }

      const currentPos = this.world.entities.player.base.position as THREE.Vector3;

      // Generate random offset
      const randomAngle = Math.random() * Math.PI * 2;
      const randomDistance = Math.random() * this._randomWalkMaxDistance;
      const offsetX = Math.cos(randomAngle) * randomDistance;
      const offsetZ = Math.sin(randomAngle) * randomDistance;
      const targetX = currentPos.x + offsetX;
      const targetZ = currentPos.z + offsetZ;

      logger.info(`[Controls Random Walk Tick] New target: (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
      // Call navigateTo, which will handle stopping the previous leg
      this.navigateTo(targetX, targetZ);
  }
  // <-------------------------

  /** Helper to check if player and base position/quaternion are valid */
  private _validatePlayerState(caller: string): boolean {
       const player = this.world?.entities?.player;
       if (!player?.base) {
            logger.error(`[Controls ${caller}] Cannot proceed: Player entity or base not found.`);
            return false;
       }
       // --- Enhanced Checks ---
       const pos = player.base.position;
       const quat = player.base.quaternion;

       if (!(pos instanceof THREE.Vector3)) {
            logger.error(`[Controls ${caller}] Invalid state: player.base.position is not a THREE.Vector3.`);
            return false;
       }
        if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
            logger.error(`[Controls ${caller}] Invalid state: player.base.position contains NaN values.`);
             return false;
        }

       if (!(quat instanceof THREE.Quaternion)) {
            logger.error(`[Controls ${caller}] Invalid state: player.base.quaternion is not a THREE.Quaternion.`);
            return false;
       }
       if (isNaN(quat.x) || isNaN(quat.y) || isNaN(quat.z) || isNaN(quat.w)) {
           logger.error(`[Controls ${caller}] Invalid state: player.base.quaternion contains NaN values.`);
            return false;
       }
       // Check if quaternion is normalized (length approx 1)
        const quatLengthSq = quat.lengthSq();
        if (Math.abs(quatLengthSq - 1.0) > 0.01) { // Allow small tolerance
            logger.warn(`[Controls ${caller}] Player quaternion is not normalized (lengthSq: ${quatLengthSq.toFixed(4)}). Attempting normalization.`);
            // Attempt to normalize in place if possible, or log warning
            quat.normalize();
        }

       logger.debug(`[Controls ${caller}] Player state validated successfully.`);
       // ---------------------
       return true;
  }

  // Dummy methods
  bind(options: any) { return this; }
  release() { }
  setActions() { }
}

