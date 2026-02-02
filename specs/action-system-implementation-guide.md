# Action System Implementation Guide for AI Agents

## Summary

This guide provides practical implementation patterns for properly integrating AI agents with Hyperfy's action system, based on comprehensive analysis of the codebase architecture.

## Key Principles

1. **Use Native Systems**: Always prefer Hyperfy's built-in `performAction()` over manual workarounds
2. **Respect Game Design**: Don't bypass intentionally disabled features (like air jumps)
3. **ROMs for Mobility**: Use ROM system for enhanced movement capabilities
4. **No Physics Hacks**: Never manipulate physics directly; use proper channels

---

## Implementation Patterns

### Pattern 1: Interacting with Action Nodes

**Correct Implementation**:

```typescript
// In your AI agent action handler
import { HyperfyService } from '../../plugin-hyperfy/service';

export const interactAction: Action = {
  name: "HYPERFY_INTERACT",

  handler: async (runtime, message, state, options, callback) => {
    const hyperfyService = runtime.getService<HyperfyService>(
      HyperfyService.serviceType
    );
    const world = hyperfyService.getWorld();
    const actionId = options.actionId; // Target action ID

    // ✅ CORRECT: Use native Hyperfy API
    world.actions.performAction(actionId);

    await callback({
      text: `Interacting with action ${actionId}`,
      actions: ['HYPERFY_INTERACT'],
      source: 'hyperfy'
    });
  }
};
```

**How It Works**:
- Hyperfy handles distance checking automatically
- Shows progress UI to players
- Calls `onTrigger` when complete
- Respects action's `_duration` and `_distance` settings

**When to Use**:
- Opening doors
- Pressing buttons
- Picking up items
- Any "Press E to interact" scenario

---

### Pattern 2: Using ROMs for Enhanced Mobility

**Correct Implementation**:

```typescript
// In your AI agent action handler
import { HyperfyService } from '../../plugin-hyperfy/service';
import { AgentControls } from '../../plugin-hyperfy/systems/controls';

export const useRomAction: Action = {
  name: "HYPERFY_USE_ROM",

  handler: async (runtime, message, state, options, callback) => {
    const hyperfyService = runtime.getService<HyperfyService>(
      HyperfyService.serviceType
    );
    const world = hyperfyService.getWorld();
    const controls: AgentControls = world.controls;

    const text = message.content.text?.toLowerCase() || '';

    if (text.includes('sprint')) {
      // ✅ CORRECT: Hold keys and let ROM apply physics
      controls.setKey('shiftLeft', true);
      controls.setKey('keyW', true);

      // Wait for ROM detection (typically 0.5s)
      await new Promise(resolve => setTimeout(resolve, 600));

      // ROM automatically applies sprint physics!
      // No need for: player.capsule.addForce(...)

      await callback({
        text: 'Sprint ROM activated!',
        actions: ['HYPERFY_USE_ROM']
      });
    }
  }
};
```

**ROM Types and Usage**:

| ROM Type | Key Combination | Effect | Detection Time |
|----------|----------------|--------|----------------|
| **Sprint** | Shift + W (hold) | 2-3x speed | 0.5 seconds |
| **Dash** | Shift + Direction (hold) | Quick burst | Instant |
| **Ledge Hang** | Automatic | Grab ledges when falling | Proximity |

**How It Works**:
1. Agent holds appropriate keys
2. ROM's `app.on('update')` loop detects held keys
3. ROM applies physics automatically
4. No direct physics manipulation needed

**When to Use**:
- Enhanced movement (sprint, dash)
- Special abilities that require continuous input
- Any Hyperfy ROM-based functionality

---

### Pattern 3: Detecting Available Actions

**Implementation**:

```typescript
import { ActionManager } from '../../plugin-hyperfy/managers/action-manager';

export class MyAgentAction {
  private actionManager: ActionManager;

  constructor(runtime: IAgentRuntime) {
    this.actionManager = new ActionManager(runtime);
  }

  async findAndUseNearestAction() {
    // Detect actions within 5 meters
    const nearbyActions = await this.actionManager.detectNearbyActions(5);

    if (nearbyActions.length === 0) {
      console.log('No actions nearby');
      return;
    }

    // Find nearest interactable action
    const nearest = nearbyActions
      .filter(action => action.isInteractable)
      .reduce((nearest, action) => {
        if (!nearest || action.distance < nearest.distance) {
          return action;
        }
        return nearest;
      });

    if (nearest) {
      console.log(`Found action: ${nearest.name} (${nearest.distance}m away)`);

      // Use the action
      await this.actionManager.simulateActionClick(nearest.id);
    }
  }
}
```

**ActionData Structure**:

```typescript
interface ActionData {
  id: string;              // Entity ID of the action
  entityId: string;        // Same as id
  name: string;            // Display name/label
  label: string;           // Display label
  scriptName: string;      // Script/app name
  position: { x, y, z };   // World position
  distance: number;        // Distance from player
  isInteractable: boolean; // Can trigger onTrigger
  metadata?: Record<string, any>;  // Additional data
}
```

---

### Pattern 4: Movement Without Actions

**For Simple Movement**:

```typescript
export const moveAction: Action = {
  name: "HYPERFY_MOVE",

  handler: async (runtime, message, state, options, callback) => {
    const hyperfyService = runtime.getService<HyperfyService>(
      HyperfyService.serviceType
    );
    const controls: AgentControls = hyperfyService.getWorld().controls;

    // Parse direction from message
    const text = message.content.text?.toLowerCase() || '';
    let direction: { x: number, z: number };

    if (text.includes('forward')) {
      direction = { x: 0, z: -1 };
      controls.setKey('keyW', true);
    } else if (text.includes('back')) {
      direction = { x: 0, z: 1 };
      controls.setKey('keyS', true);
    } else if (text.includes('left')) {
      direction = { x: -1, z: 0 };
      controls.setKey('keyA', true);
    } else if (text.includes('right')) {
      direction = { x: 1, z: 0 };
      controls.setKey('keyD', true);
    }

    // Hold for specific duration
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Release keys
    controls.setKey('keyW', false);
    controls.setKey('keyS', false);
    controls.setKey('keyA', false);
    controls.setKey('keyD', false);

    await callback({
      text: `Moved in direction`,
      actions: ['HYPERFY_MOVE']
    });
  }
};
```

---

## What NOT to Do

### ❌ Don't Bypass the Action System

```typescript
// WRONG: Directly calling action callbacks
const node = world.actions.getNearby().find(n => n.id === actionId);
node._onTrigger({ playerId: 'agent' });  // ❌ Bypasses UI, distance, duration
```

**Why it's wrong**:
- Skips distance validation
- No progress UI shown to players
- Doesn't respect `_duration` setting
- May cause desync issues
- Circumvents Hyperfy's intended flow

### ❌ Don't Manipulate Physics Directly

```typescript
// WRONG: Direct velocity manipulation
const velocity = player.capsule.getLinearVelocity();
velocity.y = 10;  // ❌ Magic number
player.capsule.setLinearVelocity(velocity);  // ❌ Bypasses Hyperfy physics
```

**Why it's wrong**:
- Creates technical debt
- Ignores Hyperfy's physics parameters
- May break with updates
- Design bypass (e.g., disabled air jumps)
- No consistency with player experience

### ❌ Don't Fake Actions

```typescript
// WRONG: Simulating action without actually using one
await callback({
  text: 'Jumped!',  // ❌ Just a message
  actions: ['HYPERFY_JUMP']  // ❌ Not backed by real action
});
```

**Why it's wrong**:
- No actual game effect
- False reporting
- Confusing for debugging
- Doesn't integrate with Hyperfy

---

## Working with Disabled Features

### The Air Jump Issue

**Problem**: Line 664 in PlayerLocal.js shows:
```javascript
const shouldAirJump = false && /* conditions */  // Intentionally disabled
```

**Solutions (choose one)**:

**Option A: Enable Air Jumps Properly**
```javascript
// In PlayerLocal.js, line 664:
const shouldAirJump = !this.grounded && !this.airJumped &&
                      this.jumpPressed && !this.world.builder?.enabled;

// Then update AI action to use standard jump:
if (text.includes('double jump')) {
  // First jump
  controls.setKey('space', true);
  await wait(400);
  controls.setKey('space', false);

  // Wait for peak
  await wait(600);

  // Second jump (air jump)
  controls.setKey('space', true);
  await wait(200);
  controls.setKey('space', false);
  // Hyperfy handles the physics!
}
```

**Option B: Remove Double Jump Feature**
```typescript
// Delete: src/cleetus/actions/double-jump-action.ts
// Remove from action registry in src/cleetus/index.ts
// Add note to agent's knowledge that double jumps aren't available
```

**Option C: Replace with ROM-Based Alternative**
```typescript
// Instead of double jump, use dash ROM:
export const aerialDashAction: Action = {
  name: "HYPERFY_AERIAL_DASH",

  handler: async (runtime, message, state, options, callback) => {
    const hyperfyService = runtime.getService<HyperfyService>(
      HyperfyService.serviceType
    );
    const controls: AgentControls = hyperfyService.getWorld().controls;

    // Jump first
    controls.setKey('space', true);
    await wait(400);
    controls.setKey('space', false);
    await wait(600);

    // Then dash in mid-air (if dash ROM exists)
    controls.setKey('shiftLeft', true);
    controls.setKey('keyW', true);
    await wait(600);

    controls.setKey('shiftLeft', false);
    controls.setKey('keyW', false);

    await callback({
      text: 'Aerial dash performed!',
      actions: ['HYPERFY_AERIAL_DASH']
    });
  }
};
```

---

## Testing Your Implementation

### Test Suite for Actions

```typescript
describe('Hyperfy Action Integration', () => {
  it('should detect nearby actions', async () => {
    const actions = await actionManager.detectNearbyActions(5);
    expect(actions).toBeInstanceOf(Array);
    expect(actions[0]).toHaveProperty('id');
    expect(actions[0]).toHaveProperty('distance');
    expect(actions[0]).toHaveProperty('isInteractable');
  });

  it('should perform action via native API', async () => {
    const actionId = 'test-action-123';
    const result = await actionManager.simulateActionClick(actionId);
    expect(result).toBe(true);
    // Verify world.actions.performAction was called
  });

  it('should use ROM without physics manipulation', async () => {
    const controls = world.controls;
    const setKeySpy = jest.spyOn(controls, 'setKey');

    await agent.useRomAction('sprint');

    expect(setKeySpy).toHaveBeenCalledWith('shiftLeft', true);
    expect(setKeySpy).toHaveBeenCalledWith('keyW', true);
    // Verify no direct physics calls
  });
});
```

### Manual Testing Checklist

- [ ] Action detection finds nearby interactables
- [ ] `performAction()` triggers UI progress bar
- [ ] Action executes at correct distance
- [ ] ROM activation works with key holds
- [ ] No console errors about missing systems
- [ ] Movement feels natural and consistent
- [ ] No direct physics manipulation in logs

---

## Migration Guide

### If You Have Existing Direct-Manipulation Code

**Before**:
```typescript
// Direct physics hack
const velocity = player.capsule.getLinearVelocity();
velocity.y = calculatedVelocity;
player.capsule.setLinearVelocity(velocity);
```

**After**:
```typescript
// Use Hyperfy systems
if (isGrounded) {
  controls.setKey('space', true);  // Standard jump
} else if (hasAirJump) {
  // Air jump is built into Hyperfy (if enabled)
  controls.setKey('space', true);
}
```

### Updating ActionRegistry

```typescript
// In your agent's index.ts
import { hyperfyJumpAction } from './actions/jump';
import { useRomAction } from './actions/use-rom-action';

export default {
  actions: [
    hyperfyJumpAction,    // ✅ Uses Hyperfy systems
    useRomAction,         // ✅ Uses ROM system
    doubleJumpAction,     // ❌ Remove this
  ]
};
```

---

## Summary

The key to proper AI agent integration with Hyperfy is:

1. ✅ **Use** `world.actions.performAction(actionId)` for interactive objects
2. ✅ **Use** ROMs with `controls.setKey()` for enhanced mobility
3. ✅ **Use** standard movement keys for basic navigation
4. ❌ **Avoid** direct physics manipulation
5. ❌ **Avoid** bypassing Hyperfy's action system
6. ❌ **Avoid** faking actions with just text responses

This ensures your AI agents work correctly with Hyperfy's architecture, maintain compatibility with existing worlds, and provide consistent experiences for all players.
