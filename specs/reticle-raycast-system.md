# Hyperfy Reticle System and onPointerDown in 3D Space

## Key Discovery: schizo-pc.js Uses Two Interaction Modes

The schizo-pc.js app revealed something important:

```javascript
// schizo-pc.js lines 40-49: Standard proximity action (when PC is ON)
const action = app.create('action', {
  distance: 2,
  label: '🫵🤡',
  onTrigger: () => { world.open(props.url, true) }
})

// schizo-pc.js lines 51-65: Direct app click (when PC is OFF)
app.onPointerDown = () => {
  if (!isOn) {
    screen.play({ name: 'ON', loop: false })
    screen.add(action)  // Creates the action node after turning on
    isOn = true
  }
}
```

**Interaction Flow:**
1. PC is **OFF** → Click directly on PC (`app.onPointerDown`) → PC turns ON
2. PC is **ON** → E-key on action node (`onTrigger`) → Opens URL

## Reticle System Explained

Hyperfy has a **reticle** (crosshair) system that uses **raycasting**:

### How It Works

```typescript
// From ClientCameraControls-enhanced-prototype.js
raycastFromPlayerHead(multiplayer = true) {
  // 1. Get player's head/camera position
  const headPos = new THREE.Vector3().setFromMatrixPosition(headMatrix)

  // 2. Get forward direction (where player is looking)
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat)

  // 3. Raycast from head position along forward direction
  this.raycaster.set(headPos, forward)
  const intersects = this.raycaster.intersectObjects(scene.children, true)

  // 4. Return what the reticle is pointing at
  return intersects.length > 0 ? intersects[0].distance : null
}
```

### Reticle Behavior

**When players look at an object:**
- Raycast from camera center into 3D scene
- First intersection = what player is aiming at
- Shows reticle (dot) on screen
- Can click to interact (onPointerDown)

**Two interaction modes:**

1. **Proximity-based** (onTrigger):
   - Need to be within X meters
   - Shows "Press E to [action]" prompt
   - Hold E key to interact

2. **Reticle-based** (onPointerDown):
   - Can be any distance
   - Aim with crosshair
   - Click to interact
   - Doesn't require proximity

## schizo-pc.js: Why Two Modes?

**PC OFF** (default state):
- No action node exists yet
- Click anywhere on PC model
- Uses reticle raycast
- Triggers `app.onPointerDown`
- PC turns on, creates action node

**PC ON**:
- Action node now exists
- Proximity to screen required
- Shows "🫵🤡" label when near
- Press E to interact
- Triggers `onTrigger`
- Opens URL

This pattern allows:
- **Distance activation** (turn PC on from afar)
- **Proximity interaction** (interact when close)

## Can Cleetus Use Reticle System?

### Current Limitation

**Cleetus can:**
✅ Detect nearby action nodes (proximity-based)
✅ Trigger onTrigger (E-key simulation via performAction)

**Cleetus cannot:**
❌ Detect what object the reticle is pointing at
❌ Simulate reticle aiming
❌ Trigger onPointerDown on arbitrary objects
❌ Do distance-based raycast clicks

### Why It Matters

Some apps (like schizo-pc.js) require **initial click on app** before action nodes appear.

**Without reticle support:**
```
Cleetus: "use the computer"
Result: "No interactive objects nearby"
Reason: PC is OFF, no action node exists yet
```

**With reticle support:**
```
Cleetus: "click on the computer"
Result: Simulates reticle aimed at PC + click
PC turns ON → Creates action node
Cleetus: "now use the computer"
Result: Interacts with action node
URL opens!
```

## Implementing Reticle Support (Future)

### What Would Be Needed

```typescript
class ActionManager {
  async clickWithReticle(targetName: string): Promise<boolean> {
    // 1. Raycast from camera to find target
    const target = await this.raycastForTarget(targetName)

    // 2. If app uses onPointerDown, trigger it
    if (target.app.onPointerDown) {
      world.emit('pointerdown', {
        target: target.app,
        position: target.point,  // Intersection point
        playerId: world.entities.player.data.id
      })
      return true
    }

    return false
  }

  private async raycastForTarget(targetName: string): Promise<any> {
    // Use existing Hyperfy raycaster infrastructure
    const world = this.getService().getWorld()
    const raycaster = world.raycaster || new THREE.Raycaster()
    const camera = world.camera

    // Cast ray from camera center
    const origin = camera.position
    const direction = camera.getWorldDirection(new THREE.Vector3())

    raycaster.set(origin, direction)
    const intersects = raycaster.intersectObjects(world.scene.children, true)

    // Find target by name
    return intersects.find(hit =>
      hit.object.name.includes(targetName) ||
      hit.object.userData.name?.includes(targetName)
    )
  }
}
```

### Complexity Considerations

**Pros:**
- ✅ Could interact with apps like schizo-pc.js
- ✅ More natural for distance interactions
- ✅ Reticle is standard Hyperfy feature

**Cons:**
- ❌ Complex raycast simulation
- ❌ Need to maintain virtual "aim" state
- ❌ More error-prone than proximity system
- ❌ Most apps don't need it (use action nodes instead)

### Recommendation

**Priority:** Low-Medium

**Reasoning:**
- Most Hyperfy apps use action nodes (onTrigger) for interaction
- schizo-pc.js is rare example requiring direct app.click
- Could work around by modifying schizo-pc.js to auto-create action node
- Reticle simulation adds significant complexity

**Alternative Approach (Simpler):**
```javascript
// Modify schizo-pc.js to create action node immediately:
const action = app.create('action', {
  label: 'Turn On PC',
  distance: 10,  // Can turn on from distance
  onTrigger: () => {
    if (!isOn) {
      // Turn on logic
      isOn = true
    } else if (props.url) {
      // Use PC logic
      world.open(props.url, true)
    }
  }
})

// Remove app.onPointerDown entirely
// Everything works with standard action system!
```

## Current Status

### What Cleetus Can Do

```typescript
// ✅ Proximity-based interactions (onTrigger)
await hyperfy.interactWithNearestAction(radius)
// → Uses world.actions.performAction()
// → Triggers action.onTrigger()
// → Works for doors, buttons, elevators, etc.
```

### What Cleetus Cannot Do

```typescript
// ❌ Reticle-based clicks (onPointerDown on app)
app.onPointerDown = () => { /* can't trigger this */ }
// → No raycast simulation
// → No virtual aiming
// → Can't click on app instances directly
```

## Use Cases Requiring Reticle Clicks

Based on analysis, these would need reticle simulation:

1. **schizo-pc.js** (initial power on)
2. **Any app that uses app.onPointerDown instead of action nodes**
3. **Distance interaction without proximity requirement**

**Percentage of Hyperfy apps:** ~5-10% (most use action nodes)

## Conclusion

**You are correct** - Hyperfy has a reticle system for raycasting clicks on 3D objects. Some apps (like schizo-pc.js) use `app.onPointerDown` for direct clicks rather than action nodes.

**Cleetus currently cannot** simulate reticle-based clicks, only proximity-based E-key interactions.

**This is a genuine gap** in Cleetus's interaction capabilities, though it affects a minority of apps (~5-10%).

**Recommendation:** Consider implementing reticle simulation if apps like schizo-pc.js are important for Cleetus's use cases.
