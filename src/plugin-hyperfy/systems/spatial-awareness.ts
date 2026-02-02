import { logger } from '@elizaos/core';
import * as THREE from '../hyperfy/src/core/extras/three';
import { Layers } from '../hyperfy/src/core/extras/Layers';

// Physics layer mask for obstacle detection
const OBSTACLE_LAYER_MASK = Layers.environment.group | Layers.player.group;

// Steering behavior constants
const MAX_AVOIDANCE_FORCE = 0.5;
const WALL_DETECTION_DISTANCE = 3.0;
const OBSTACLE_DETECTION_DISTANCE = 2.5;
const PATH_CLEARANCE_DISTANCE = 1.5;

// Raycast configuration
const RAYCAST_COUNT = 5; // Number of raycasts for obstacle detection
const RAYCAST_SPREAD = Math.PI / 3; // 60 degree spread centered forward

interface ObstacleInfo {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  isWall: boolean;
}

interface RaycastResult {
  hit: boolean;
  obstacle?: ObstacleInfo;
  direction: THREE.Vector3;
}

export class SpatialAwareness {
  private world: any;
  private player: any;

  // Cache for raycast results
  private raycastCache = new Map<string, RaycastResult>();
  private cacheTime = 100; // ms
  private lastRaycastTime = 0;

  // Vectors for calculations (to avoid creating new objects)
  private forwardVector = new THREE.Vector3(0, 0, -1);
  private tempVector1 = new THREE.Vector3();
  private tempVector2 = new THREE.Vector3();
  private tempVector3 = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private direction = new THREE.Vector3();

  constructor(world: any) {
    this.world = world;
    this.player = world?.entities?.player;
  }

  /**
   * Ensure a THREE.Vector3 has PhysX extensions for physics operations.
   * Vectors created before PhysX is initialized don't have these methods.
   * This copies them from the prototype if available.
   */
  private ensureExtensions(vec: THREE.Vector3): boolean {
    if (!vec.toPxVec3) {
      if (THREE && THREE.Vector3 && THREE.Vector3.prototype && THREE.Vector3.prototype.toPxVec3) {
        vec.toPxVec3 = THREE.Vector3.prototype.toPxVec3;
        vec.fromPxVec3 = THREE.Vector3.prototype.fromPxVec3;
        vec.toPxExtVec3 = THREE.Vector3.prototype.toPxExtVec3;
        vec.toPxTransform = THREE.Vector3.prototype.toPxTransform;
        return true;
      }
      return false;
    }
    return true;
  }

  /**
   * Update the spatial awareness system
   */
  update(): void {
    this.player = this.world?.entities?.player;
    // Clear cache periodically
    const now = Date.now();
    if (now - this.lastRaycastTime > this.cacheTime) {
      this.raycastCache.clear();
      this.lastRaycastTime = now;
    }
  }

  /**
   * Check if there's an obstacle in the given direction
   */
  checkObstacleInDirection(direction: THREE.Vector3, maxDistance: number = OBSTACLE_DETECTION_DISTANCE): ObstacleInfo | null {
    if (!this.player?.base?.position || !this.world?.physics) {
      return null;
    }

    this.origin.copy(this.player.base.position);
    this.origin.y += 1.0; // Cast from eye level

    // Check cache first
    const cacheKey = `${this.origin.x.toFixed(2)},${this.origin.z.toFixed(2)},${direction.x.toFixed(2)},${direction.z.toFixed(2)}`;
    const cached = this.raycastCache.get(cacheKey);
    if (cached && Date.now() - this.lastRaycastTime < this.cacheTime) {
      return cached.hit && cached.obstacle && cached.obstacle.distance <= maxDistance ? cached.obstacle : null;
    }

// Ensure vectors have PhysX extensions
    this.ensureExtensions(this.origin);
    this.ensureExtensions(direction);

    const hit = this.world.physics.raycast(this.origin, direction, maxDistance, OBSTACLE_LAYER_MASK);

    const result: RaycastResult = {
      hit: !!hit,
      direction: direction.clone(),
      obstacle: hit ? {
        position: hit.point,
        normal: hit.normal,
        distance: hit.distance,
        isWall: this.isWall(hit.normal)
      } : undefined
    };

    this.raycastCache.set(cacheKey, result);

    return result.hit && result.obstacle && result.obstacle.distance <= maxDistance ? result.obstacle : null;
  }

  /**
   * Check if the normal indicates a wall (vertical surface)
   */
  private isWall(normal: THREE.Vector3): boolean {
    // Walls have small Y component in their normal
    return Math.abs(normal.y) < 0.7;
  }

  /**
   * Perform multiple raycasts to detect obstacles ahead
   */
  detectObstaclesAhead(): ObstacleInfo[] {
    if (!this.player?.base?.position || !this.world?.physics) {
      return [];
    }

    const obstacles: ObstacleInfo[] = [];
    const playerRotation = this.player.base.rotation.y;

    // Cast multiple rays in a fan pattern
    for (let i = 0; i < RAYCAST_COUNT; i++) {
      const angle = playerRotation + (i / (RAYCAST_COUNT - 1) - 0.5) * RAYCAST_SPREAD;

      this.direction.set(Math.sin(angle), 0, Math.cos(angle));
      const obstacle = this.checkObstacleInDirection(this.direction, WALL_DETECTION_DISTANCE);

      if (obstacle && !obstacles.some(o => o.position.distanceTo(obstacle.position) < 0.5)) {
        obstacles.push(obstacle);
      }
    }

    return obstacles;
  }

  /**
   * Check if a path to target is clear using sweep test
   */
  isPathClear(target: THREE.Vector3): boolean {
    if (!this.player?.base?.position || !this.world?.physics || !this.player?.capsule) {
      return true;
    }

    this.origin.copy(this.player.base.position);
    this.tempVector1.copy(target).sub(this.origin);

    const distance = this.tempVector1.length();
    if (distance < 0.1) return true;

    this.direction.copy(this.tempVector1).normalize();

    // Ensure vectors have PhysX extensions
    this.ensureExtensions(this.origin);
    this.ensureExtensions(this.direction);

    // Use capsule geometry for sweep test
    const sweepHit = this.world.physics.sweep(
      this.player.capsule.geometry,
      this.origin,
      this.direction,
      Math.min(distance, PATH_CLEARANCE_DISTANCE * 2),
      OBSTACLE_LAYER_MASK
    );

    return !sweepHit;
  }

  /**
   * Calculate avoidance force to steer away from obstacles
   */
  calculateAvoidanceForce(currentVelocity: THREE.Vector3): THREE.Vector3 {
    const obstacles = this.detectObstaclesAhead();
    if (obstacles.length === 0) {
      return new THREE.Vector3(0, 0, 0);
    }

    const avoidanceForce = new THREE.Vector3(0, 0, 0);
    const playerPos = this.player.base.position;

    for (const obstacle of obstacles) {
      // Calculate vector from obstacle to player
      this.tempVector1.copy(playerPos).sub(obstacle.position);
      this.tempVector1.y = 0; // Only horizontal avoidance

      const distance = this.tempVector1.length();
      if (distance > 0.1) {
        // Weight by inverse distance - closer obstacles have stronger avoidance
        const weight = Math.min(1.0, (OBSTACLE_DETECTION_DISTANCE - distance) / OBSTACLE_DETECTION_DISTANCE);
        this.tempVector1.normalize().multiplyScalar(weight * MAX_AVOIDANCE_FORCE);
        avoidanceForce.add(this.tempVector1);
      }
    }

    // Blend with current velocity to avoid sharp turns
    if (currentVelocity.length() > 0) {
      avoidanceForce.lerp(currentVelocity, 0.3);
    }

    return avoidanceForce;
  }

  /**
   * Find a clear direction to move when blocked
   */
  findClearDirection(blockedDirection: THREE.Vector3): THREE.Vector3 | null {
    const playerRotation = Math.atan2(-blockedDirection.x, -blockedDirection.z);
    const searchAngles = [-Math.PI/2, Math.PI/2, -Math.PI/4, Math.PI/4, -3*Math.PI/4, 3*Math.PI/4];

    for (const angleOffset of searchAngles) {
      const testAngle = playerRotation + angleOffset;
      this.direction.set(Math.sin(testAngle), 0, Math.cos(testAngle));

      if (!this.checkObstacleInDirection(this.direction, OBSTACLE_DETECTION_DISTANCE)) {
        return this.direction.clone();
      }
    }

    return null; // No clear direction found
  }

  /**
   * Get navigation suggestions for reaching a target
   */
  getNavigationSuggestion(currentPos: THREE.Vector3, targetPos: THREE.Vector3): {
    direction: THREE.Vector3;
    isClear: boolean;
    alternativeDirection?: THREE.Vector3;
    obstacles: ObstacleInfo[];
  } {
    this.tempVector1.copy(targetPos).sub(currentPos);
    this.tempVector1.y = 0; // Horizontal only
    const distance = this.tempVector1.length();

    if (distance < 0.1) {
      return {
        direction: new THREE.Vector3(0, 0, 0),
        isClear: true,
        obstacles: []
      };
    }

    const desiredDirection = this.tempVector1.normalize();
    const obstacles = this.detectObstaclesAhead();

    // Check if direct path is clear
    const hit = this.checkObstacleInDirection(desiredDirection, Math.min(distance, PATH_CLEARANCE_DISTANCE));

    if (!hit) {
      return {
        direction: desiredDirection,
        isClear: true,
        obstacles: []
      };
    }

    // Find alternative direction
    const alternativeDirection = this.findClearDirection(desiredDirection);

    return {
      direction: desiredDirection,
      isClear: false,
      alternativeDirection,
      obstacles
    };
  }

  /**
   * Check if near a wall (for wall following behavior)
   */
  getWallDistance(direction: THREE.Vector3): number {
    const obstacle = this.checkObstacleInDirection(direction, WALL_DETECTION_DISTANCE);
    return obstacle ? obstacle.distance : Infinity;
  }
}