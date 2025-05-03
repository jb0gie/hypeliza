import { System } from './hyperfy/core/systems/System.js'
import { logger } from '@elizaos/core';
import * as THREE from 'three';

// Define Navigation Constants here or import from a config file
const NAVIGATION_TICK_INTERVAL = 100; // ms, how often to check position and adjust movement
const NAVIGATION_STOP_DISTANCE = 1.0; // meters, how close to get before stopping

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
  // Track internally which keys are active due to navigation
  private _currentNavKeys: { forward: boolean, backward: boolean, left: boolean, right: boolean } = {
      forward: false, backward: false, left: false, right: false
  };
  // <------------------------

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
    // Ensure player entity exists before starting
    if (!this.world?.entities?.player?.base) {
        logger.error("[Controls Navigation] Cannot navigate: Player entity not found or missing base.");
        return;
    }

    this.stopNavigation("starting new navigation"); // Stop previous navigation first

    this._navigationTarget = new THREE.Vector3(x, 0, z); // Store target (Y is ignored)
    this._isNavigating = true;

    // Reset internal key tracker
    this._currentNavKeys = { forward: false, backward: false, left: false, right: false };

    // Start the navigation tick interval
    this._navigationIntervalId = setInterval(() => this._navigationTick(), NAVIGATION_TICK_INTERVAL);
    logger.info("[Controls Navigation] Navigation started.");
  }

  /**
   * Stops the current navigation process.
   */
  public stopNavigation(reason: string = "commanded"): void {
    if (!this._isNavigating && !this._navigationIntervalId) {
        return; // Nothing to stop
    }
    logger.info(`[Controls Navigation] Stopping navigation (${reason}).`);
    if (this._navigationIntervalId) {
      clearInterval(this._navigationIntervalId);
      this._navigationIntervalId = null;
    }
    this._isNavigating = false;
    this._navigationTarget = null;

    // Release all movement keys controlled by navigation
    try {
        this.setKey('keyW', false);
        this.setKey('keyA', false);
        this.setKey('keyS', false); // Stop backward movement if ever implemented
        this.setKey('keyD', false);
        this.setKey('shiftLeft', false);
        logger.debug("[Controls Navigation] Movement keys released.");
    } catch (e) {
        logger.error("[Controls Navigation] Error releasing keys on stop:", e);
    }

    // Reset internal key tracker
    this._currentNavKeys = { forward: false, backward: false, left: false, right: false };
  }

  /**
   * Returns whether the agent is currently navigating via navigateTo.
   */
  public getIsNavigating(): boolean {
    return this._isNavigating;
  }

  /**
   * The core navigation logic, executed at intervals.
   */
  private _navigationTick(): void {
    if (!this._isNavigating || !this._navigationTarget || !this.world?.entities?.player?.base) {
        if (this._isNavigating) {
             // If we are supposed to be navigating but something is wrong, stop.
             logger.warn("[Controls Navigation Tick] Stopping due to missing target/player/base.");
             this.stopNavigation("tick error - missing target/player/base");
        }
        // If not navigating, just exit (interval should have been cleared)
        return;
    }

    // Validate player base position/rotation
    if (!(this.world.entities.player.base.position instanceof THREE.Vector3) ||
        !(this.world.entities.player.base.quaternion instanceof THREE.Quaternion)) {
         logger.error("[Controls Navigation Tick] Player base position or quaternion is not a valid THREE object.");
         this.stopNavigation("tick error - invalid player base data");
         return;
     }

    const playerPosition = this.world.entities.player.base.position as THREE.Vector3;
    const playerQuaternion = this.world.entities.player.base.quaternion as THREE.Quaternion;

    // Check distance to target (XZ plane)
    const distanceXZ = playerPosition.clone().setY(0).distanceTo(this._navigationTarget.clone().setY(0));

    // --- Check if target reached --- >
    if (distanceXZ <= NAVIGATION_STOP_DISTANCE) {
      logger.info("[Controls Navigation Tick] Target reached.");
      this.stopNavigation("reached target");
      // Note: Event emission should probably happen from the *Action* that initiated the navigation,
      // listening for the state change, rather than directly from controls.
      return; // Stop further processing this tick
    }
    // <--------------------------------

    // --- Calculate Movement --- >
    const directionWorld = this._navigationTarget.clone().sub(playerPosition).setY(0).normalize();
    const forwardWorld = new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuaternion).setY(0).normalize();

    // Basic vector validity check
    if (isNaN(forwardWorld.x) || isNaN(directionWorld.x) || forwardWorld.lengthSq() < 0.001 || directionWorld.lengthSq() < 0.001) {
        logger.warn("[Controls Navigation Tick] Invalid vector for angle calculation. Holding position.");
        // Hold position by setting all movement keys to false
        this.setKey('keyW', false);
        this.setKey('keyA', false);
        this.setKey('keyD', false);
        this._currentNavKeys = { forward: false, backward: false, left: false, right: false };
        return;
    }

    const angle = forwardWorld.angleTo(directionWorld);
    const cross = new THREE.Vector3().crossVectors(forwardWorld, directionWorld);
    const signedAngle = cross.y < 0 ? -angle : angle; // Radians (-PI to PI)

    const forwardThreshold = Math.PI / 18; // ~10 degrees
    const turnThreshold = Math.PI / 6;     // ~30 degrees

    let desiredKeys = { forward: false, backward: false, left: false, right: false };

    if (Math.abs(signedAngle) > turnThreshold) { // Sharp turn
      desiredKeys.forward = false; // Stop forward motion for sharp turns
      if (signedAngle < 0) { desiredKeys.left = true; } else { desiredKeys.right = true; }
    }
    else { // Move forward if somewhat aligned
        desiredKeys.forward = true;
        // Gentle turn while moving forward if needed (between thresholds)
        if (Math.abs(signedAngle) > forwardThreshold) {
            if (signedAngle < 0) { desiredKeys.left = true; } else { desiredKeys.right = true; }
        }
    }
    // <--------------------------

    // --- Apply Keys --- >
    // Only call setKey if the state needs to change from the perspective of the navigation logic
    if (desiredKeys.forward !== this._currentNavKeys.forward) {
      this.setKey('keyW', desiredKeys.forward);
      this._currentNavKeys.forward = desiredKeys.forward;
    }
    if (desiredKeys.left !== this._currentNavKeys.left) {
      this.setKey('keyA', desiredKeys.left);
      this._currentNavKeys.left = desiredKeys.left;
    }
    if (desiredKeys.right !== this._currentNavKeys.right) {
      this.setKey('keyD', desiredKeys.right);
      this._currentNavKeys.right = desiredKeys.right;
    }
    // Ensure backward and run keys are off (unless implemented differently)
    if (this._currentNavKeys.backward) { this.setKey('keyS', false); this._currentNavKeys.backward = false; }
    this.setKey('shiftLeft', false);
    // <-------------------

    // Optional: Add stuck detection logic here later if needed
  }

  // <------------------------


  // Dummy methods needed for PlayerLocal init check (keep unless PlayerLocal changes)
  bind(options: any) { return this; }
  release() { }
  setActions() { }
}
