# HYPERFY_USE_ITEM vs INTERACT_WITH_OBJECT

## Overview

There are now **two different ways** Cleetus can interact with objects in Hyperfy, each serving a different purpose:

1. **HYPERFY_USE_ITEM** - Smart navigation + interaction (go to object first)
2. **INTERACT_WITH_OBJECT** - Immediate interaction (use what's nearby)

## HYPERFY_USE_ITEM (Existing)

**File:** `src/plugin-hyperfy/actions/use.ts`

**Primary Use Case:** Picking up or using specific items that require walking to them first

### How It Works

1. **Extracts entity ID** from context using LLM
   ```typescript
   // Player: "Pick up the book"
   // LLM extracts: entityId = "book123"
   ```

2. **Walks to the entity** using pathfinding
   ```typescript
   await controls.goto(targetPosition.x, targetPosition.z);
   // Cleetus navigates to the book's location
   ```

3. **Holds E key** to interact once reached
   ```typescript
   // Internally calls actions.performAction(entityId)
   // Which holds E key for 3000ms
   ```

### Key Features

- **Smart Targeting:** Uses LLM to understand what object the player is referring to
- **Navigation:** Automatically walks to the target object
- **Flexible:** Can target any entity by ID
- **Fallback:** If no entityId provided, uses nearest object

### Example Interactions

```javascript
// Player: "Pick up the book"
// Cleetus: Walks to book → Holds E → Picks up book

// Player: "Interact with the glowing orb"
// Cleetus: Walks to orb → Holds E → Activates orb

// Player: "Use the key on the door"
// Cleetus: Extracts entityId → Walks to door → Holds E → Uses key
```

### When to Use

✅ **Items that need to be approached:**
- Books, weapons, collectibles
- Levers, switches that are far away
- Objects that require precise positioning
- Anything you need to "pick up" or "grab"

✅ **Complex targeting:**
- When player refers to object by description
- When multiple similar objects exist nearby
- When object is not immediately adjacent

## INTERACT_WITH_OBJECT (New)

**File:** `src/cleetus/actions/interact-action.ts`

**Primary Use Case:** Immediate interaction with nearby objects using natural language

### How It Works

1. **Detects command keywords** "use" or "interact"
   ```typescript
   // Player: "use the door"
   // Action triggers immediately
   ```

2. **Finds nearest action** within radius (default 10m)
   ```typescript
   const nearbyActions = await detectNearbyActions(radius);
   const nearest = findNearest(nearbyActions);
   ```

3. **Holds E key** at current position
   ```typescript
   await holdEKey(500); // Holds for 500ms
   // No movement required
   ```

### Key Features

- **Natural Language:** Responds to "use" and "interact" commands
- **Immediate:** No walking required, acts from current position
- **Simple:** Automatically finds nearest relevant object
- **Player-Friendly:** Intuitive commands like "use the door"

### Example Interactions

```javascript
// Player: "use the door"
// Cleetus: Holds E → Door opens (stays in place)

// Player: "interact with that button"
// Cleetus: Holds E → Button pressed (stays in place)

// Player: "use the elevator"
// Cleetus: Holds E → Elevator activated (stays in place)
```

### When to Use

✅ **Objects you're already near:**
- Doors, buttons, switches
- Elevators, interactive panels
- Anything within arm's reach

✅ **Quick interactions:**
- When movement would be cumbersome
- When object is already close
- When you want immediate response

✅ **Natural commands:**
- "use the [object]"
- "interact with [object]"
- Player-friendly language

## Key Differences

| Feature | HYPERFY_USE_ITEM | INTERACT_WITH_OBJECT |
|---------|------------------|---------------------|
| **Trigger** | Context/entityId extraction | "use" or "interact" keywords |
| **Movement** | Walks to object (goto) | Stays in place |
| **Targeting** | Specific entity by ID | Nearest action automatically |
| **E-key Duration** | 3000ms (default) | 500ms (configurable) |
| **Best For** | Items, pickups, distant objects | Doors, buttons, nearby objects |
| **AI Required** | Yes (LLM extraction) | No (keyword detection) |
| **Use Case** | "Pick up the book" | "Use the door" |

## Under the Hood

### HYPERFY_USE_ITEM uses AgentActions.performAction()
```typescript
// From systems/actions.ts:41-72
performAction(entityID?: string) {
  // Holds E key
  control.setKey('keyE', true);

  setTimeout(() => {
    // Triggers the action
    if (typeof target._onTrigger === 'function') {
      target._onTrigger({ playerId: ... });
    }
    // Releases E key
    control.setKey('keyE', false);
  }, target._duration ?? 3000); // 3 second default
}
```

### INTERACT_WITH_OBJECT uses ActionManager.holdEKey()
```typescript
// From managers/action-manager.ts:186-229
async holdEKey(duration: number = 500) {
  controls.setKey('keyE', true);   // Press down
  await sleep(duration);           // Hold
  controls.setKey('keyE', false);  // Release
}
```

## When to Use Each

### Use HYPERFY_USE_ITEM when:
- Player says "pick up" or "grab"
- Object is far away and needs walking
- Need specific targeting by description
- Working with items in inventory

**Examples:**
```
"Pick up the sword"
"Grab the key"
"Take the book"
"Interact with the glowing crystal on the pedestal"
```

### Use INTERACT_WITH_OBJECT when:
- Player says "use" or "interact with"
- Object is nearby (door, button, elevator)
- Want immediate, natural interaction
- Don't need complex targeting

**Examples:**
```
"Use the door"
"Interact with that button"
"Use the elevator"
"Open the gate"
```

## Real-World Scenarios

### Scenario 1: Entering a Building
**Setup:** Player and Cleetus are outside a building with a door

**Player says:** "Let's go inside"
→ HYPERFY_USE_ITEM might extract "door" → Walks to door → Opens it

**Player says:** "Use the door"
→ INTERACT_WITH_OBJECT detects "use" → Holds E → Opens door immediately

**Winner:** INTERACT_WITH_OBJECT (more natural)

### Scenario 2: Collecting Items
**Setup:** Books scattered around a room, Cleetus needs to pick one up

**Player says:** "Pick up the red book"
→ HYPERFY_USE_ITEM extracts "red book" → Walks to it → Picks up

**Player says:** "Use the book"
→ INTERACT_WITH_OBJECT detects "use" → Interacts with nearest book (might be wrong one)

**Winner:** HYPERFY_USE_ITEM (precise targeting)

### Scenario 3: Complex Puzzle
**Setup:** Multiple switches, doors, and levers in sequence

**Player says:** "Pull the third lever, then use the door"
→ HYPERFY_USE_ITEM: "third lever" → Walks to it → Pulls
→ INTERACT_WITH_OBJECT: "use door" → Opens door

**Winner:** BOTH (different strengths)

## Integration in Plugin

Both actions are registered in `src/plugin-hyperfy/index.ts`:

```typescript
actions: [
  // ... other actions ...
  hyperfyUseItemAction,      // Smart navigation + interaction
  hyperfyUnuseItemAction,    // Release item
  interactAction,            // Immediate E-key interaction (NEW)
]
```

## Summary

**HYPERFY_USE_ITEM** = "Go to this specific thing and use it"
- Smart (LLM-powered)
- Navigates
- Precise targeting
- Best for: items, pickups, distant objects

**INTERACT_WITH_OBJECT** = "Use whatever's nearby"
- Simple (keyword-based)
- Immediate
- Automatic targeting
- Best for: doors, buttons, nearby objects

Both actions ultimately **hold the E key** to interact - they just differ in **how they decide what to interact with** and **whether they walk there first**.
