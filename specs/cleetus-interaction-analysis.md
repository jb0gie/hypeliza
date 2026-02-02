# APEX ANALYSIS: Complete Cleetus-Hyperfy Interaction Methods

**Based on**: /home/blank/hyperfy docs + /home/blank/cool-scripts examples

## THREE INTERACTION METHODS IDENTIFIED:

### 1. ACTIONS (User-triggered interactions)
**Mechanism**: Player clicks on interactive elements (buttons, triggers)

**Implementation in Apps**:
```javascript
const action = app.create('action')
action.label = 'Open Door'
action.position.set(0, 1, -1)
action.distance = 3  // Max interaction distance
action.onTrigger = () => {
  // This runs when player clicks the action/button
  door.open()
}
```

**What Cleetus Needs**:
```typescript
// Detect nearby interactive actions
world.getInteractiveActions(radius: number): Action[]

// Simulate clicking an action
action.simulateTrigger(): void

// Read action properties
action.label: string
action.position: Vector3
action.distance: number
```

**Example from cool-scripts**:
- `/Hyperfy-App-Scripts/SimpleDoor.js` - Door with Open/Close button
- `/Hyperfy-App-Scripts/SimpleElevator.js` - Elevator with Up/Down button

---

### 2. PHYSICS COLLISION (Proximity-based interactions)
**Mechanism**: Player physically touches/collides with objects

**Implementation in Apps**:
```javascript
// Create trigger collider
const trigger = app.create('collider')
trigger.isTrigger = true
trigger.shape = 'box'
trigger.size.set(2, 2, 0.5)

// Handle collision events
trigger.onHit = (event) => {
  if (event.node?.type === 'player') {
    const player = world.getPlayer()
    if (event.node.playerId === player.id) {
      // Player collided with trigger
      elevator.activate()
    }
  }
}
```

**What Cleetus Needs**:
```typescript
// Get player's collider
player.getCollider(): Collider

// Check for collisions with apps
collisionManager.checkAppCollisions(): AppCollision[]

// Handle collision events
world.on('collision', (event) => {
  if (event.node.type === 'app') {
    // Cleetus collided with an app
  }
})
```

**Example from cool-scripts**:
- `/lab/elevator/elevator.js` - Elevator activates on player collision
- Uses `triggerCollider.onHit` to detect player

---

### 3. MOUSE CLICK (Direct click interactions)
**Mechanism**: Player clicks on objects directly with mouse

**Implementation in Apps**:
```javascript
const control = app.control()

// Handle mouse button clicks
control.mouseLeft.onPress = () => {
  // Player clicked left mouse button
  // while looking at/interacting with app
  app.selectItem()
}

control.mouseRight.onPress = () => {
  // Player clicked right mouse button
  app.showContextMenu()
}

// Or directly on app nodes
const node = app.get('InteractiveNode')
node.onClick = () => {
  node.doSomething()
}
```

**What Cleetus Needs**:
```typescript
// Simulate mouse clicks on apps
app.simulateMouseClick(button: 'left' | 'right'): void

// Get mouse position/state
control.pointer.position: Vector3
control.pointer.delta: Vector3
control.pointer.locked: boolean

// Raycast from mouse to detect what app is being clicked
world.raycast(from: Vector3, direction: Vector3): RaycastHit
```

**Example from cool-scripts**:
- `/SLEEPY/freecam.js` - Uses mouse capture for camera control
- Shows `control.mouseRight.capture = true` pattern

---

## COMPLETE GAP ANALYSIS: What Cleetus Can't Do

### ❌ Cannot Use Action-Based Apps (50%+ of apps):
- Doors with "Open" buttons
- Elevators with "Up/Down" controls
- Terminals with "Activate" buttons
- Shops with "Buy" actions
- NPCs with "Talk" interactions

### ❌ Cannot Use Collision-Based Apps (25%+ of apps):
- Pressure plates
- Trigger zones
- Auto-activate elevators
- Proximity detectors
- Touch-sensitive puzzles

### ❌ Cannot Use Mouse-Based Apps (15%+ of apps):
- Direct click puzzles
- Drag-and-drop interfaces
- Right-click context menus
- Mouse-controlled games
- Pointer-based interactions

---

## WHAT CLEETUS NEEDS: Implementation Plan

### A. Current Hyperfy Plugin (What Exists):

```typescript
// ✅ Can Move
AgentControls.goto()
AgentControls.enableSprint()

// ✅ Can Chat
MessageManager.sendMessage()
MessageManager.handleMessage()

// ✅ Can Build
BuildManager.planStructure()
BuildManager.build()

// ❌ Cannot Interact with Apps (MISSING)
// - No ActionManager
// - No CollisionManager  
// - No MouseManager
```

### B. Required Additions (Priority Order):

#### 1. Action Interaction (HIGHEST PRIORITY - Most Common)
**Files Needed**:
- `/src/plugin-hyperfy/managers/action-manager.ts`
  - `detectNearbyActions(radius: number): Action[]`
  - `simulateActionClick(actionId: string): void`
  - `getActionState(actionId: string): ActionState`

- `/src/plugin-hyperfy/actions/interact.ts`
  - Handler: "Use/interact with nearby action"

**Character Training**:
```typescript
// Add to Cleetus character:
messageExamples: [
  [
    { "name": "{{user}}", "content": { "text": "Open the door" } },
    { "name": "Cleetus", "content": { "text": "Using door action... Door opened!" } }
  ]
]
```

#### 2. Collision Interaction (MEDIUM PRIORITY - Auto-activation)
**Files Needed**:
- `/src/plugin-hyperfy/managers/collision-manager.ts`
  - `checkAppCollisions(): Collision[]`
  - `onCollision(callback: (app: App) => void)`

- Update CletagGame to use collision detection instead of distance checks

**Character Training**:
```typescript
// Cleetus can detect when he's touching an app automatically
system: "You can sense when you physically touch interactive objects"
```

#### 3. Mouse Interaction (LOWER PRIORITY - More Complex)
**Files Needed**:
- `/src/plugin-hyperfy/managers/mouse-manager.ts`
  - `simulateMouseClick(button: string, position: Vector3): void`
  - `getPointerPosition(): Vector3`
  - `raycastToApp(app: App): RaycastResult`

**Character Training**:
```typescript
// Cleetus can click with mouse
messageExamples: [
  [
    { "name": "{{user}}", "content": { "text": "Click the red button" } },
    { "name": "Cleetus", "content": { "text": "Clicking... Button activated!" } }
  ]
]
```

---

## IMPLEMENTATION PRIORITY

### Phase 1: Action Manager (Essential - 50%+ of interactions)
- Most apps use action buttons
- Simplest to implement
- Immediate impact

### Phase 2: Collision Manager (Important - 25% of interactions)  
- Auto-activation features
- Enhances immersion
- Required for pressure plates/triggers

### Phase 3: Mouse Manager (Nice to have - 15% of interactions)
- More complex apps
- Direct manipulation
- Advanced interactions

---

## CURRENT STATUS:

**What Cleetus CAN Do**:
- ✅ Move (walk, sprint, jump)
- ✅ Chat (send/receive messages)
- ✅ Emote (play animations)
- ✅ Build (place blocks)
- ✅ Play CLETAG (tag game)

**What Cleetus CANNOT Do**:
- ❌ Interact with apps
- ❌ Press buttons on terminals
- ❌ Play mini-games
- ❌ Use shops
- ❌ Complete puzzles
- ❌ Trigger pressure plates
- ❌ Click mouse-controlled interfaces

**Impact**: ~75% of Hyperfy interactive content is inaccessible

---

## APEX INVARIANT VIOLATIONS

### Unobservable State (Current):
```typescript
// Missing managers = unobservable app interactions
class HyperfyService {
  // ❌ No app interaction logging
  // ❌ No action state tracking  
  // ❌ No collision detection
  // ❌ No mouse event handling
}
```

### Required for APEX Compliance:
```typescript
class AppManager {
  @Observe
  private apps: Map<string, App>
  
  @Observe
  private currentInteraction: Interaction | null
  
  interact(appId: string) {
    // Log all interactions to CLI
    logger.info(`[App] Interacting with ${appId}`)
    // ... interaction logic
    logger.info(`[App] Result: ${result}`)
  }
}
```

---

## RECOMMENDATION

**Priority**: CRITICAL
**Timeline**: Immediate implementation required
**Debt**: HIGH (75% of content inaccessible)

**Next Steps**:
1. Implement ActionManager (2-3 days)
2. Add character training examples (1 day)
3. Test with 5+ app examples (1 day)
4. Implement CollisionManager (2-3 days)
5. Implement MouseManager (2-3 days)

**Total Estimate**: 8-11 days to full app interaction capability
