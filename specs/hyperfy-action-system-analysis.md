# Hyperfy Action System Architecture Analysis

## Executive Summary

This document provides a comprehensive analysis of Hyperfy's action system architecture, explaining how actions work, how they're triggered, and the proper implementation patterns for AI agents. The research reveals critical insights about the difference between Hyperfy's native action system and AI agent actions, ROMs (Read-Only Modules), and why certain features like air jumps are disabled.

## Key Findings

1. **Two Distinct Action Systems Exist**: Hyperfy has a native client-side action system (Action Nodes) AND an AI agent action system that are fundamentally different
2. **Air Jumps Are Intentionally Disabled**: The code shows `shouldAirJump = false && ...` indicating air jumps are disabled by design
3. **ROMs vs Actions**: ROMs continuously monitor input state while actions are single event triggers
4. **Proper Implementation Pattern**: AI agents should use Hyperfy's native `performAction()` method, not attempt to bypass it

---

## 1. Action Node System

### Core Components

**File**: `/home/blank/hypeliza/src/plugin-hyperfy/hyperfy/src/core/systems/ClientActions.js`

The Action Node System is Hyperfy's native client-side system for interactive objects:

```javascript
export class ClientActions extends System {
  constructor(world) {
    super(world)
    this.nodes = []              // Array of registered action nodes
    this.current = {             // Currently active action
      node: null,
      distance: Infinity,
    }
    this.action = null           // Active action UI/display
  }

  register(node) {               // Register a new action node
    this.nodes.push(node)
  }

  unregister(node) {             // Remove an action node
    const idx = this.nodes.indexOf(node)
    if (idx === -1) return
    this.nodes.splice(idx, 1)
  }
}
```

### Action Node Structure

Action nodes are entities with this structure:
- `_label`: Display text (e.g., "Open Door")
- `_distance`: Interaction radius (typically 3-5 meters)
- `_duration`: Hold time in seconds (typically 1-3s)
- `_onStart()`: Called when player starts holding E
- `_onTrigger(event)`: Called when hold completes
- `_onCancel()`: Called if player releases early
- `ctx.entity`: The entity this action is attached to

### How Actions Are Triggered

**Input Detection** (ClientActions.js line 56-60):
```javascript
this.btnDown =
  this.control.keyE.down ||
  this.control.touchB.down ||
  this.control.xrLeftTrigger.down ||
  this.control.xrRightTrigger.down
```

**Action Processing** (lines 180-212):
```javascript
if (world.actions.btnDown) {
  if (node.progress === 0) {
    cancelled = false
    node._onStart()          // Start action
  }
  node.progress += delta     // Fill progress bar
  if (node.progress > node._duration) {
    node.progress = 0
    node._onTrigger({
      playerId: world.entities.player.data.id
    })                       // Execute action
  }
}
```

### Event Flow

1. Player approaches action node within `_distance` radius
2. Action system detects proximity and activates "Press E" UI
3. Client holds E key (or equivalent)
4. Progress bar fills over `_duration` seconds
5. On complete: `_onTrigger()` fires → Executes action logic
6. On release: `_onCancel()` fires → Resets progress

---

## 2. Action System Architecture

### ActionManager for AI Agents

**File**: `/home/blank/hypeliza/src/plugin-hyperfy/managers/action-manager.ts`

The ActionManager provides AI agents with access to Hyperfy's native action system:

```typescript
export class ActionManager {
  private state: ActionState = {
    currentAction: null,     // Currently active action ID
    nearbyActions: [],       // Actions within detection radius
    lastDetectionTime: 0
  };

  async detectNearbyActions(radius: number): Promise<ActionData[]> {
    const nearbyNodes = world.actions.getNearby(radius);
    this.state.nearbyActions = nearbyNodes.map((node: any) => {
      const wrapper = new ActionWrapper(node);
      const distance = node.ctx.entity.root.position.distanceTo(cameraPos);
      return wrapper.toActionData(distance);
    });
    return this.state.nearbyActions;
  }

  async simulateActionClick(actionId: string): Promise<boolean> {
    // Use AgentActions to perform the action
    world.actions.performAction(actionId);
    this.state.currentAction = actionId;
    return true;
  }
}
```

### ActionWrapper Structure

**File**: `/home/blank/hypeliza/src/plugin-hyperfy/managers/action-wrapper.ts`

```typescript
export class ActionWrapper {
  get id(): string {
    return this.node.ctx?.entity?.data?.id || this.node.uuid || '';
  }

  get name(): string {
    return this.node.ctx?.entity?.data?.label ||
           this.node.ctx?.entity?.data?.name || 'Unknown Action';
  }

  get isInteractable(): boolean {
    return !this.node.finished && typeof this.node._onTrigger === 'function';
  }

  toActionData(distance: number): ActionData {
    return {
      id: this.id,
      entityId: this.entityId,
      name: this.name,
      label: this.label,
      scriptName: this.scriptName,
      position: this.position,
      distance,
      isInteractable: this.isInteractable,
      metadata: this.metadata
    };
  }
}
```

### How AI Agents Should Use Actions

**Pattern**: AI agents should use `world.actions.performAction(actionId)`

**File**: `/home/blank/hypeliza/src/plugin-hyperfy/actions/use.ts`:
```typescript
logger.info(`[USE ITEM] Walking to ${entityName} and holding E to interact`);
actions.performAction(targetEntityId);  // ← CORRECT: Uses native Hyperfy

await callback({
  text: `Walking to ${entityName} and using it`,
  actions: ['HYPERFY_USE_ITEM'],
  source: 'hyperfy'
});
```

**Benefits of this approach**:
- Uses Hyperfy's native systems
- Proper event flow with progress bars
- Compatible with all existing action nodes
- Respects distance and duration settings
- Works with both human players and AI agents

---

## 3. The Air Jump Mystery: Why It's Disabled

### Critical Finding: Air Jumps Are Intentionally Disabled

**File**: `/home/blank/hypeliza/src/plugin-hyperfy/hyperfy/src/core/entities/PlayerLocal.js` (lines 663-664):

```javascript
const shouldAirJump =
  false && !this.grounded && !this.airJumped && this.jumpPressed && !this.world.builder?.enabled // temp: disabled
```

**The `false &&` intentionally disables air jumps regardless of other conditions.**

### Air Jump Logic Flow

```javascript
if (shouldJump || shouldAirJump) {
  // calc velocity needed to reach jump height
  let jumpVelocity = Math.sqrt(2 * this.effectiveGravity * this.jumpHeight)
  jumpVelocity = jumpVelocity * (1 / Math.sqrt(this.mass))

  // update velocity
  const velocity = this.capsule.getLinearVelocity()
  velocity.y = jumpVelocity
  this.capsule.setLinearVelocity(velocity)

  // air jump init
  if (shouldAirJump) {
    this.falling = false
    this.fallTimer = 0
    this.jumping = true
    this.airJumped = true
    this.airJumping = true
  }
}
```

### Why It's Disabled

The comment "temp: disabled" suggests this was a design decision:
- May have been disabled for game balance
- Could cause issues with level design
- Might have had physics bugs
- Designer preference for single jump only

### Improper "Fix" in AI Agent Code

**File**: `/home/blank/hypeliza/src/cleetus/actions/double-jump-action.ts`:

```typescript
// IMPORTANT: Hyperfy has air jumps disabled (shouldAirJump = false)
// We need to manually add upward velocity
elizaLogger.info("[DoubleJumpAction] SECOND JUMP - direct velocity manipulation!");

// Direct physics manipulation - bypasses Hyperfy systems
const velocity = player.capsule.getLinearVelocity();
const jumpVelocity = Math.sqrt(2 * 20 * 1.5); // gravity=20, height=1.5m
velocity.y = jumpVelocity; // Set vertical velocity directly
player.capsule.setLinearVelocity(velocity);
```

**Why this is problematic**:
- Bypasses Hyperfy's intended game design
- May cause desync between client and server
- Doesn't respect Hyperfy's jump mechanics
- Could break if physics system changes
- Creates technical debt

### The Right Approach

1. **If air jumps should exist**: Enable them properly in PlayerLocal.js
   ```javascript
   const shouldAirJump = !this.grounded && !this.airJumped &&
                        this.jumpPressed && !this.world.builder?.enabled
   ```

2. **If air jumps should not exist**: Remove the double-jump action entirely

3. **For ROM-based mobility**: Use ROM system as intended (see section 4)

---

## 4. ROM System: The Proper Way to Add Mobility

### What Are ROMs?

ROMs (Read-Only Modules) are Hyperfy's system for continuous input monitoring:

**Key Differences from Actions**:

| Feature | Actions | ROMs |
|---------|---------|------|
| **Trigger** | Single E-key press | Continuous key hold |
| **Detection** | Proximity + onTrigger | Input state monitoring |
| **Effect** | Instant (one-time) | Continuous (while holding) |
| **API** | `app.create('action')` | `app.on('update', ...)` |
| **Example** | Open door | Sprint while holding Shift+W |

### How ROMs Work

**File**: `/home/blank/hypeliza/specs/rom-usage-system.md`:

```javascript
// ROMs continuously monitor input:
app.on('update', () => {
  if (control.keyW.down && control.shiftLeft.down && isGrounded()) {
    player.push(forwardDirection.multiplyScalar(EXTRA_SPEED))
  }
})
// Player: Hold Shift + W → Continuous sprint effect
```

### How AI Agents Use ROMs

**File**: `/home/blank/hypeliza/src/cleetus/actions/use-rom-action.ts`:

```typescript
if (text.includes("sprint") || text.includes("super run")) {
  // 1. Enable sprint (hold shift)
  controls.setKey('shiftLeft', true);
  controls.setKey('shiftRight', true);

  // 2. Start moving forward (hold W)
  controls.setKey('keyW', true);

  // 3. Wait for ROM to detect and activate sprint (0.5s)
  await new Promise(resolve => setTimeout(resolve, 600));

  // 4. ROM automatically pushes player with EXTRA_SPEED!
  // No need to manipulate physics directly
}
```

### Available ROMs

From `/home/blank/hypeliza/specs/rom-usage-system.md`:

| ROM File | Command | Effect | How It Works |
|----------|---------|--------|--------------|
| **romSprint.js** | "use sprint ROM" | Super speed while moving | After 0.5s of Shift+W, applies continuous speed boost |
| **romDash.js** | "use dash ROM" | Quick dash movement | Instant burst when Shift+direction held |
| **romLedgeHang.js** | "use ledge hang" | Auto-grab ledges | Automatic when falling near ledge |

### ROM vs Double-Jump Action Comparison

**Double-Jump Action (Current)**:
- Bypasses Hyperfy systems
- Manipulates physics directly
- Hardcoded velocities
- Doesn't respect game design

**Proper ROM Implementation**:
- Uses Hyperfy's intended systems
- Continuous monitoring
- Configurable parameters
- Respects game balance

---

## 5. Player Action Implementation

### How Human Players Trigger Actions

**Input System** (ClientControls.js):

```javascript
export class ClientControls extends System {
  bind(options = {}) {
    const control = {
      entries: {},
      api: {
        release: () => { /* ... */ },
        setActions: (value) => { /* UI actions */ }
      }
    }

    // Return proxy that creates buttons on-demand
    return new Proxy(control, {
      get(target, prop) {
        // Create button if it doesn't exist
        if (buttons.has(prop)) {
          entries[prop] = createButton(self, control, prop)
          return entries[prop]
        }
      }
    })
  }
}

function createButton() {
  return {
    $button: true,
    down: false,      // Currently held
    pressed: false,   // Just pressed (cleared next frame)
    released: false,  // Just released (cleared next frame)
    onPress: null,    // Callback
    onRelease: null   // Callback
  }
}
```

### Key Bindings

**File**: `/home/blank/hypeliza/src/plugin-hyperfy/hyperfy/src/core/extras/buttons.js` (referenced):

Standard mappings:
- `keyE`: Interact with actions
- `space`: Jump
- `shiftLeft/shiftRight`: Run/sprint modifier
- `keyW/A/S/D`: Movement
- `touchA/touchB`: Touch equivalents

### Event Flow: Input → Action

1. **Key Press** (ClientControls.js:409-432):
   ```javascript
   onKeyDown = e => {
     const prop = codeToProp[code]  // Map 'KeyE' → 'keyE'
     this.buttonsDown.add(prop)

     for (const control of this.controls) {
       const button = control.entries[prop]
       if (button?.$button) {
         button.pressed = true
         button.down = true
         button.onPress?.()  // Trigger callbacks
       }
     }
   }
   ```

2. **Action Detected** (ClientActions.js:53-98):
   ```javascript
   update(delta) {
     this.btnDown = this.control.keyE.down

     // Check all nodes in batches
     for (let i = 0; i < size; i++) {
       const node = this.nodes[idx]
       const distance = node.worldPos.distanceTo(cameraPos)

       if (distance <= node._distance && distance < this.current.distance) {
         this.current.node = node    // New nearest action
         didChange = true
       }
     }

     if (didChange) {
       this.action.start(this.current.node)  // Show UI
     }

     this.action.update(delta)  // Fill progress bar
   }
   ```

3. **Action Executed** (in `action.update()`):
   ```javascript
   if (world.actions.btnDown) {
     if (node.progress === 0) {
       node._onStart()           // Action-specific start
     }
     node.progress += delta
     if (node.progress === node._duration) {
       node._onTrigger({ playerId })  // Execute!
     }
   }
   ```

### Integration with Physics

**PlayerLocal.js** shows how actions integrate with physics:

```javascript
// Jump velocity calculation
let jumpVelocity = Math.sqrt(2 * this.effectiveGravity * this.jumpHeight)
velocity.y = jumpVelocity
this.capsule.setLinearVelocity(velocity)

// Move force application
const moveForce = moveDir.multiplyScalar(moveSpeed * 10)
this.capsule.addForce(moveForce.toPxVec3(), PHYSX.PxForceModeEnum.eFORCE, true)

// Push force (for external actions)
if (this.pushForce) {
  velocity.add(this.pushForce)
  this.pushForce.multiplyScalar(Math.max(1 - drag * delta, 0))
}
```

---

## 6. AI Agent Integration Patterns

### The Correct Pattern

**Use Hyperfy's Native Systems**:

```typescript
// ✅ CORRECT: Use performAction()
async function interactWithAction(actionId: string) {
  world.actions.performAction(actionId)  // Native Hyperfy API
  return true
}

// ✅ CORRECT: Use agent controls for ROMs
async function useRom(romType: string) {
  controls.setKey('shiftLeft', true)
  controls.setKey('keyW', true)
  await sleep(600)  // ROM detection time
  // ROM applies effects automatically
}
```

### Incorrect Patterns to Avoid

```typescript
// ❌ WRONG: Bypass action system
async function hackyInteraction(entity: Entity) {
  entity._onTrigger({ playerId: 'agent' })  // Bypasses UI, distance checks
}

// ❌ WRONG: Manipulate physics directly
async function hackyJump() {
  const velocity = player.capsule.getLinearVelocity()
  velocity.y = 10  // Magic number
  player.capsule.setLinearVelocity(velocity)  // Bypasses Hyperfy physics
}
```

### The Hybrid Approach (Current Implementation)

**ActionManager** provides both patterns:

```typescript
class ActionManager {
  // Pattern 1: Native action triggering
  async simulateActionClick(actionId: string) {
    world.actions.performAction(actionId)
  }

  // Pattern 2: Manual interaction (fallback)
  async interactWithNearestAction(radius: number) {
    const nearby = await this.detectNearbyActions(radius)
    const nearest = this.findNearest(nearby)
    world.actions.performAction(nearest.id)
  }
}
```

---

## 7. Recommendations

### For Action Implementation

1. **Use Native Action System**
   - Always prefer `world.actions.performAction(actionId)`
   - Let Hyperfy handle UI, distance checks, and event flow
   - Compatible with existing Hyperfy worlds

2. **Enable Air Jumps Properly (If Desired)**
   ```javascript
   // In PlayerLocal.js, line 664:
   const shouldAirJump = !this.grounded && !this.airJumped &&
                        this.jumpPressed && !this.world.builder?.enabled
   ```
   Then use the air jump action properly, don't bypass with direct velocity manipulation

3. **Add Mobility Through ROMs**
   - Create ROMs for sprint, dash, wall-jump, etc.
   - AI agents hold appropriate keys
   - ROMs apply physics automatically

4. **Remove Improper Workarounds**
   - Remove direct physics manipulation in double-jump-action.ts
   - Either enable air jumps properly or remove the feature

### For AI Agent Design

1. **Action Detection**
   - Use `ActionManager.detectNearbyActions(radius)` for action discovery
   - Filter by `isInteractable` property
   - Respect distance limits

2. **Action Execution**
   - Primary: `world.actions.performAction(actionId)`
   - Secondary: `controls.setKey()` for ROMs
   - Never: Direct physics manipulation

3. **State Management**
   - Track `currentAction` to prevent concurrent actions
   - Use `agentActivityLock` for synchronization
   - Monitor action completion through callbacks

4. **Error Handling**
   - Verify `world && world.actions` before operations
   - Check action existence before performing
   - Handle null/undefined gracefully

---

## 8. Conclusion

Hyperfy has a well-designed, intentional action system that AI agents should use natively rather than bypassing. The current implementation in `double-jump-action.ts` takes shortcuts that:

1. Bypass Hyperfy's intended game design (disabled air jumps)
2. Create technical debt through direct physics manipulation
3. May cause synchronization issues
4. Aren't compatible with Hyperfy's event architecture

**The proper approach** is to:

- Use `world.actions.performAction()` for interactive objects
- Use ROMs for continuous mobility enhancements
- Enable features properly in Hyperfy source if needed
- Respect the architectural boundaries between systems

This ensures compatibility, maintainability, and adherence to Hyperfy's design principles.

---

## Appendix: Key Files Referenced

### Hyperfy Core
- `/home/blank/hypeliza/src/plugin-hyperfy/hyperfy/src/core/systems/ClientActions.js` - Native action system
- `/home/blank/hypeliza/src/plugin-hyperfy/hyperfy/src/core/systems/ClientControls.js` - Input handling
- `/home/blank/hypeliza/src/plugin-hyperfy/hyperfy/src/core/entities/PlayerLocal.js` - Player physics (line 664: disabled air jump)
- `/home/blank/hypeliza/src/plugin-hyperfy/hyperfy/src/core/extras/ControlPriorities.js` - Control layering

### AI Agent Implementation
- `/home/blank/hypeliza/src/plugin-hyperfy/managers/action-manager.ts` - Action management for agents
- `/home/blank/hypeliza/src/plugin-hyperfy/managers/action-wrapper.ts` - Action data wrapper
- `/home/blank/hypeliza/src/plugin-hyperfy/managers/action-interfaces.ts` - Type definitions
- `/home/blank/hypeliza/src/cleetus/actions/double-jump-action.ts` - Problematic implementation
- `/home/blank/hypeliza/src/cleetus/actions/use-rom-action.ts` - Proper ROM usage pattern

### Specifications & Documentation
- `/home/blank/hypeliza/specs/rom-usage-system.md` - ROM system documentation
- `/home/blank/hypeliza/specs/action-manager-implementation.md` - ActionManager design
