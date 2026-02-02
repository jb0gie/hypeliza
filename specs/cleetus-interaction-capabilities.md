# Cleetus Interaction Capabilities: onPointerDown vs onTrigger

## Question: Can Cleetus perform onPointerDown?

**Short Answer:** Yes and no - it depends on what type of interaction the app uses.

## Hyperfy Interaction Types

### 1. 3D World Interactions (onTrigger) ✅ SUPPORTED

**How it works:**
```javascript
const action = app.create('action', {
  label: 'Open Door',
  distance: 3,
  onTrigger: () => {
    // This is triggered when player:
    // 1. Is within 3 meters
    // 2. Presses and holds E key OR clicks with mouse/pointer
    openDoor()
  }
})
```

**This is the standard way** 99% of Hyperfy apps handle interaction. When a player looks at an interactive object and clicks, it triggers `onTrigger`.

**Cleetus Support:** ✅ **FULLY SUPPORTED**

We've already implemented this via `world.actions.performAction()`:

```typescript
// In your code:
const hyperfy = runtime.getService('hyperfy')

// Player says: "use the door"
await hyperfy.interactWithNearestAction(10)

// What happens behind the scenes:
// 1. Finds nearest action (door)
// 2. Calls world.actions.performAction(doorId)
// 3. Hyperfy handles the E-key simulation with correct timing
// 4. onTrigger() is called
// 5. Door opens!
```

**Examples that work with Cleetus:**
- SimpleDoor.js ✅
- SimpleElevator.js ✅
- BigDoor.js ✅
- interactive-model.js ✅
- 99% of Hyperfy apps ✅

### 2. 2D UI Interactions (onPointerDown / onClick) ⚠️ NOT YET SUPPORTED

**How it works:**
```javascript
// UI button (2D screen element)
const button = app.create('uibutton', {
  text: 'Accept',
  position: [100, 200]
})

button.onPointerDown = () => {
  // Triggered when player clicks directly on the button
  acceptTerms()
}
```

**This is used for:**
- Complex UI panels
- Menus
- Dialog boxes
- Forms

**Cleetus Support:** ❌ **NOT CURRENTLY SUPPORTED**

**Why:**
- UI elements are 2D screen-space coordinates
- Would need to:
  - Calculate screen position
  - Move virtual mouse pointer
  - Simulate click at exact screen coordinates
- Most Hyperfy apps don't require UI interaction
- UI interaction is rare in game/exploration contexts

**Examples that don't work yet:**
- Complex menu systems
- Multi-page UI
- Forms and dialogs
- UI-heavy apps (but these are rare in Hyperfy)

## What Cleetus Can Do

### ✅ Interact with 3D Objects (onTrigger)

```javascript
// Player says any of these:
- "use the door"
- "interact with button"
- "pick up the sword"
- "activate the elevator"

// Cleetus will:
1. Find nearest interactive action
2. Trigger onTrigger()
3. Object responds (door opens, elevator moves, etc.)
```

**How we built it:**
```typescript
// HYPERFY_USE_ITEM or INTERACT_WITH_OBJECT actions
// → hyperfyService.interactWithNearestAction(radius)
//   → actionManager.detectNearbyActions(radius)
//     → Finds action nodes with onTrigger
//   → world.actions.performAction(actionId)
//     → Hyperfy simulates E-key
//       → action.onTrigger() fires
//         → Door opens!
```

### ❌ Click on 2D UI (onPointerDown)

```javascript
// Player says:
- "click the accept button"

// Cleetus currently CANNOT do this because:
// 1. No UI element detection system
// 2. No screen-space coordinate mapping
// 3. No virtual mouse pointer simulation
```

## Testing Cleetus Interactions

### Setup

```javascript
// Add any standard Hyperfy interactive app
// Examples:
- SimpleDoor.js (opens/closes door)
- SimpleElevator.js (moves up/down)
- interactive-model.js (opens URLs)
```

### Test Commands

```
Player: "use the door"
Cleetus: "Interacting with: Open Door (distance: 2.3m)"
[ActionManager] Found nearest action: Open Door (distance: 2.3m)
[ActionManager] Successfully initiated interaction with: Open Door
Result: ✅ Door opens!

Player: "interact with elevator"
Cleetus: "Interacted with: Elevator"
[ActionManager] Found nearest action: Elevator (distance: 1.5m)
[ActionManager] Successfully initiated interaction with: Elevator
Result: ✅ Elevator moves!
```

## Adding Support for UI Clicks (Future)

**If needed**, we could add UI interaction support:

```typescript
// New method in ActionManager:
async clickUiElement(elementName: string): Promise<boolean> {
  // 1. Find UI element by name/text
  // 2. Get screen coordinates
  // 3. Simulate mouse movement
  // 4. Simulate mouse click
  // 5. Trigger onPointerDown
}
```

**Considerations:**
- Would need UI element detection system
- Screen resolution affects coordinates
- Most Hyperfy apps are 3D-focused
- Rarely needed for gameplay

**Recommendation:** Don't implement unless specific use case requires it.

## Summary

| Interaction Type | Method | Cleetus Support | Use Case |
|-----------------|--------|-----------------|----------|
| **3D World Objects** | onTrigger (E-key) | ✅ FULL | Doors, buttons, elevators (99% of apps) |
| **2D UI Elements** | onPointerDown (mouse) | ❌ NONE | Menus, dialogs (rare in Hyperfy) |
| **Physics Collision** | onTriggerEnter | ❌ NONE | Automatic triggers (not needed) |
| **Proximity Actions** | distance + E-key | ✅ FULL | Interactive actions |

## Answer to Question

**"Can Cleetus perform onPointerDown?"**

- **For 3D objects:** Yes, through onTrigger (which is what onPointerDown usually maps to in 3D space)
- **For 2D UI:** No, not currently implemented

**The distinction:**
- In 3D, clicking on an object = E-key = onTrigger (SUPPORTED ✅)
- In 2D UI, clicking a button = direct mouse event (NOT SUPPORTED ❌)

**Bottom line:** Cleetus can interact with 99% of Hyperfy apps using natural language commands like "use the door" or "interact with button"! 🎮
