# Spatial Awareness System for Hyperfy Agents

## Overview

The Spatial Awareness System provides Hyperfy agents (like Cleetus) with sophisticated obstacle detection and avoidance capabilities using physics-based raycasts and sweep tests. This enables natural navigation around walls and obstacles instead of getting stuck.

## Architecture

### Core Components

1. **SpatialAwareness Class** (`/src/plugin-hyperfy/systems/spatial-awareness.ts`)
   - Physics-based obstacle detection using raycasts
   - Sweep tests for path clearance
   - Steering behaviors for natural avoidance
   - Cache system for performance optimization

2. **Enhanced Controls** (`/src/plugin-hyperfy/systems/controls.ts`)
   - Integrated spatial awareness into navigation
   - Obstacle avoidance during path following
   - Smart recovery from stuck states
   - Velocity-based steering forces

3. **Improved CLETAG** (`/src/plugin-hyperfy/managers/cletag-game-manager.ts`)
   - Path clearance checks before movement
   - Spatially-aware player following
   - Better navigation around obstacles

## Features

### 1. Physics-Based Obstacle Detection

```typescript
// Raycast from agent position in a specific direction
const obstacle = spatialAwareness.checkObstacleInDirection(direction, maxDistance);

// Multi-raycast fan pattern for comprehensive detection
const obstacles = spatialAwareness.detectObstaclesAhead();
```

### 2. Path Clearance Testing

```typescript
// Use sweep tests to verify entire path is clear
const isClear = spatialAwareness.isPathClear(targetPosition);
```

### 3. Steering Behaviors

```typescript
// Calculate avoidance force based on nearby obstacles
const avoidanceForce = spatialAwareness.calculateAvoidanceForce(currentVelocity);
```

### 4. Smart Navigation Suggestions

```typescript
// Get navigation suggestions including alternative routes
const suggestion = spatialAwareness.getNavigationSuggestion(currentPos, targetPos);
```

## Implementation Details

### Physics Integration

The system uses Hyperfy's PhysX integration:
- **Raycasts**: `world.physics.raycast(origin, direction, maxDistance, layerMask)`
- **Sweep Tests**: `world.physics.sweep(geometry, origin, direction, maxDistance, layerMask)`
- **Layer Masks**: Filters collisions using environment and player layers

### Obstacle Detection Strategy

1. **Multiple Raycasts**: 5 rays in a 60-degree fan pattern
2. **Clearance Testing**: Capsule sweep tests for path validation
3. **Normal Analysis**: Distinguish walls from floors using surface normals
4. **Caching**: Results cached for 100ms to reduce physics queries

### Steering Implementation

1. **Avoidance Forces**: Weighted by inverse distance to obstacles
2. **Velocity Blending**: Maintains momentum while avoiding
3. **Clear Path Finding**: Tests multiple angles for alternative routes
4. **Wall Following**: Can detect and follow walls when needed

## Navigation Improvements

### Before Spatial Awareness
- Naive straight-line movement
- Gets stuck on walls and corners
- Random recovery rotations
- No obstacle consideration

### After Spatial Awareness
- Physics-aware path planning
- Dynamic obstacle avoidance
- Smart direction finding
- Natural steering behaviors
- Better stuck recovery using spatial queries

## Usage Examples

### Basic Obstacle Avoidance

```typescript
// Check if path is clear before moving
if (spatialAwareness.isPathClear(targetPos)) {
    await controls.goto(targetPos.x, targetPos.z);
} else {
    // Use alternative navigation with avoidance
    await controls.goto(targetPos.x, targetPos.z); // Will use avoidance automatically
}
```

### Player Following with Awareness

```typescript
// Follow entity with obstacle avoidance
await controls.followEntity(playerId, stopDistance);
// Navigation automatically uses spatial awareness
```

### Direct Spatial Queries

```typescript
// Get obstacles in current direction
const obstacle = spatialAwareness.checkObstacleInDirection(
    directionVector,
    detectionDistance
);

if (obstacle && obstacle.isWall) {
    // Wall detected - find alternative direction
    const clearDir = spatialAwareness.findClearDirection(desiredDirection);
}
```

## Performance Considerations

1. **Caching**: Raycast results cached for 100ms
2. **Batching**: Multiple raycasts per navigation tick
3. **Distance Culling**: Only checks within relevant ranges
4. **Efficient Cleanup**: Automatic cache invalidation

## Integration with Existing Systems

### CLETAG Game Mode
- Enhanced player detection with path validation
- Smart movement that avoids obstacles
- Better pursuit behavior

### General Navigation
- All `goto()` and `followEntity()` calls benefit from avoidance
- Backward compatible with existing code
- No changes required to use spatial awareness

### Physics System
- Leverages existing PhysX integration
- Uses proper collision layers
- Respects world geometry

## Future Enhancements

1. **Dynamic Obstacles**: Track moving entities
2. **Pathfinding**: A* navigation for complex environments
3. **Memory**: Remember obstacle locations
4. **Learning**: Adapt to frequently blocked paths
5. **Group Navigation**: Coordinate with other agents

## Testing Recommendations

1. **Wall Collision**: Navigate toward walls to test avoidance
2. **Corner Stuck**: Walk into corners to verify recovery
3. **Player Following**: Follow players around obstacles
4. **CLETAG Mode**: Test game mode in complex environments
5. **Performance**: Monitor physics query counts

## Related Systems

- **SnapOctree**: Spatial partitioning for entity queries
- **LooseOctree**: Alternative spatial structure
- **Physics.js**: Core physics raycast/sweep implementation
- **PlayerLocal.js**: Player physics and ground detection