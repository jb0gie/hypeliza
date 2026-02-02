# Signal-Based Interaction Alternative (Analysis)

## Current Implementation vs Signals

### What We Built

**ActionManager with E-key simulation:**
- `holdEKey(duration)` - Manually controls key press
- `simulateActionClick(actionId)` - Triggers actions
- `interactWithNearestAction()` - Finds and interacts with objects

**Hyperfy Native Approach (AgentActions):**
```typescript
// From systems/actions.ts:41-72
performAction(entityID?: string) {
  const control = this.world.controls;
  control.setKey('keyE', true);  // Press E

  setTimeout(() => {
    if (typeof target._onTrigger === 'function') {
      target._onTrigger({ playerId: this.world.entities.player.data.id });
    }
    control.setKey('keyE', false);  // Release E
  }, target._duration ?? 3000);  // Use action's own duration!
}
```

**Key Insight:** Hyperfy already handles E-key duration correctly using the action's `_duration` property!

## Signal System in Hyperfy

### How Signals Work

Apps can emit and listen for signals:

```javascript
// In an app script (e.g., BigDoor.js):
world.on('BigDoor:Open', () => {
  logDebug('Received signal, triggering animation sequence')
  playDoorSequence()
})

// Triggered via:
world.emit('BigDoor:Open')
```

### Signal Examples in Hyperfy

From `cool-scripts/0.10.0/proxim8/big-door.js:67-70`:
```javascript
world.on(props.signalName, () => {
  logDebug('Received signal, triggering animation sequence')
  playDoorSequence()
})
```

From `cool-scripts/numen/toc.js`:
```javascript
world.on('enter', checkAndHandleEntry)
world.on('playerUpdate', (updatedPlayer) => {
  // Handle player updates
})
```

## Alternative: Signal-Based Interaction System

Instead of manually simulating key presses, we could leverage signals:

### How It Would Work

```typescript
// In an app that wants to be agent-friendly:
app.create('action', {
  label: 'Open Door',
  signalName: 'DoorAction:Open',  // Custom signal
  onTrigger: () => {
    // Normal player interaction
    openDoor()
  }
})

// When E is pressed AND signalName is set:
world.emit(action.signalName, { playerId, source: 'player' })
```

### Agent Interaction via Signals

```typescript
// Agent triggers signal directly:
async function interactViaSignal(signalName: string) {
  world.emit(signalName, {
    playerId: world.entities.player.data.id,
    source: 'agent'
  })
}

// Usage:
await interactViaSignal('DoorAction:Open')
```

## Benefits of Signal Approach

✅ **No timing issues** - Apps control their own interaction duration
✅ **Explicit contracts** - Signal names document what actions do
✅ **No key simulation** - Direct API interaction
✅ **Player feedback** - Apps can show "Agent activated this"
✅ **Flexible** - Apps can have different behavior for agent vs player

## Drawbacks of Current Approach

⚠️ **Timing mismatches** - Our 500ms might not match app's expected duration
⚠️ **Overengineering** - Replicating what Hyperfy already does
⚠️ **Fragile** - If Hyperfy changes key handling, our code breaks
⚠️ **No app feedback** - Apps can't tell agent triggered them

## Overengineering Analysis

### What IS Overengineered

1. **holdEKey() method** - Hyperfy already does this correctly
2. **Manual timing** - Using hardcoded 500ms instead of action._duration
3. **Direct key simulation** - Brittle and bypasses Hyperfy's system

### What IS NOT Overengineered

1. **Friendly name extraction** - Directly addresses user complaint about entity IDs
2. **Action detection** - Finding nearby actions is still needed
3. **Action wrapper** - Abstraction is clean and useful

### Recommendation

**Keep:**
- `detectNearbyActions()` - Finding actions is necessary
- `getActionDetails()` - Getting action info is useful
- `ActionWrapper` - Clean abstraction
- Friendly name improvements - Directly solves entity ID problem

**Remove/Rework:**
- `holdEKey()` - Hyperfy handles this
- `simulateActionClick()` - Should use signals or Hyperfy's performAction
- Hardcoded timing - Should use action._duration

## Hybrid Approach (Recommended)

Keep the friendly identification system but use Hyperfy's native interaction:

```typescript
// Simplified ActionManager:
async interactWithAction(actionId: string): Promise<boolean> {
  const action = await this.getActionDetails(actionId)
  const actionName = action.name

  console.info(`[ActionManager] Interacting with: ${actionName}`)

  // Use Hyperfy's built-in system
  world.actions.performAction(actionId)

  console.info(`[ActionManager] Successfully interacted with: ${actionName}`)
  return true
}
```

This:
- ✅ Shows friendly names (solves the user's complaint)
- ✅ Uses Hyperfy's reliable interaction system
- ✅ No timing mismatches
- ✅ Less code to maintain
- ✅ More robust

## Signal-Based Player Communication

### How Agents Could Use Signals

```typescript
// Agent detects a door:
const doorAction = await findNearestAction('door')

// Signal to inform app:
world.emit('AgentAction:Detected', {
  actionId: doorAction.id,
  actionName: doorAction.name,
  playerId: world.entities.player.data.id,
  agentId: this.runtime.agentId
})

// App listens and provides feedback:
world.on('AgentAction:Detected', (data) => {
  if (data.actionName.includes('door')) {
    world.chat.send(`${data.agentId} sees the door`)
  }
})
```

### Benefits for Players

1. **Visibility** - Players see what the agent detects
2. **Debugging** - Builders understand agent behavior
3. **Interaction** - Apps can respond to agent presence
4. **Feedback loop** - Player guidance becomes possible

## Conclusion

**The user is correct** - we are partially overengineering:
- ✅ Friendly names: Good addition, solves real problem
- ❌ Manual E-key simulation: Redundant, Hyperfy handles this

**Recommended path forward:**
1. Keep the identification improvements (friendly names)
2. Simplify ActionManager to use Hyperfy's performAction()
3. Investigate signal system for agent-player communication
4. Add signal hooks for better observability
