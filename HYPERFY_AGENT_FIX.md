# Hyperfy Agent Integration Fixes

## Overview

This PR fixes critical issues preventing the Hyperfy agent from properly connecting and operating in Hyperfy worlds. The agent was experiencing two main problems:

1. **Player Entity Not Found**: The BehaviorManager was starting before the player entity was created, causing immediate failures
2. **Audio System Crashes**: Scripts in Hyperfy worlds were triggering audio playback before the world context was fully initialized

## Issues Fixed

### 🔧 Issue 1: BehaviorManager Starting Too Early

**Problem**: The BehaviorManager was attempting to start immediately after world initialization, but the player entity is created asynchronously during the network snapshot process. This caused the error:
```
[BehaviorManager] Cannot start — player entity not found
```

**Root Cause**: The player entity is only created when:
1. The `onSnapshot` method receives entity data from the server
2. An entity has `type === 'player'` 
3. That entity has `owner === this.world.network.id` (matching the agent's network ID)

**Solution**: Implemented a patient waiting mechanism that polls for the player entity before starting the BehaviorManager.

### 🔧 Issue 2: Audio System Null Reference Crashes

**Problem**: The agent was crashing with:
```
TypeError: Cannot read properties of null (reading 'world')
at Audio.play (file:///home/blank/hypeliza/dist/index.js:2969:19)
```

**Root Cause**: Scripts in Hyperfy worlds were calling `audio.play()` before the world context (`this.ctx.world`) was fully initialized.

**Solution**: Added comprehensive defensive programming to the Audio node methods.

## Changes Made

### 1. Enhanced BehaviorManager Startup (`src/plugin-hyperfy/service.ts`)

```typescript
// Added patient waiting mechanism
private async waitForPlayerAndStartBehavior(): Promise<void> {
  const maxWaitTime = 30000; // 30 seconds max wait
  const checkInterval = 1000; // Check every 1 second
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    if (this.world?.entities?.player) {
      console.info('[BehaviorManager] Player entity found, starting behavior manager...');
      this.behaviorManager.start();
      return;
    }
    
    console.debug(`[BehaviorManager] Waiting for player entity... (${elapsed}ms elapsed)`);
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    elapsed += checkInterval;
  }

  console.error('[BehaviorManager] Timeout waiting for player entity. Starting anyway...');
  this.behaviorManager.start();
}
```

**Benefits**:
- ✅ Prevents immediate failures when player entity isn't ready
- ✅ Provides clear logging of the waiting process
- ✅ Has a reasonable timeout to prevent infinite waiting
- ✅ Gracefully degrades if timeout is reached

### 2. Audio System Defensive Programming (`src/plugin-hyperfy/hyperfy/src/core/nodes/Audio.js`)

#### Enhanced Null Checking
```javascript
// Before: Unsafe property access
if (!this.ctx.world) return

// After: Safe optional chaining
if (!this.ctx?.world) return
```

#### Added World Context Guards
```javascript
pause() {
  if (!this.ctx?.world) return  // Added safety check
  const audio = this.ctx.world.audio
  if (!audio) return
  // ... rest of method
}

stop() {
  if (!this.ctx?.world) return  // Added safety check
  const audio = this.ctx.world.audio
  if (!audio) return
  // ... rest of method
}

setPlaybackRate(rate) {
  if (!this.ctx?.world) return  // Added safety check
  const audio = this.ctx.world.audio
  if (!audio) return           // Added audio system check
  // ... rest of method
}
```

#### Improved Proxy Error Handling
```javascript
// Enhanced proxy play method with error handling
play(restartIfPlaying) {
  try {
    return self.play(restartIfPlaying)
  } catch (err) {
    console.warn('[Audio] Play failed:', err.message)
    return Promise.resolve()
  }
}
```

**Benefits**:
- ✅ Prevents crashes when audio is called before world initialization
- ✅ Graceful degradation - audio calls fail silently instead of crashing
- ✅ Better error logging for debugging
- ✅ Maintains full functionality when world is properly initialized

### 3. Version Compatibility Fixes (`package.json`)

Fixed version mismatches that were causing API incompatibilities:

```json
{
  "dependencies": {
    "@elizaos/cli": "1.0.0-beta.52",
    "@elizaos/core": "1.0.0-beta.52",
    "@elizaos/plugin-bootstrap": "^1.0.0-beta.76",
    "@elizaos/plugin-openrouter": "1.0.0-beta.55"
  }
}
```

**Benefits**:
- ✅ Ensures all ElizaOS packages use compatible core versions
- ✅ Resolves `getWavHeader` and other API compatibility issues
- ✅ Enables OpenRouter plugin functionality

### 4. Connection Configuration Updates

Updated default connection settings for better reliability:

```typescript
// Updated to use official Hyperfy infrastructure
const HYPERFY_WS_URL = process.env.WS_URL || 'wss://255242621.xyz/ws'

// Generate proper UUID for world identification
const defaultWorldId = createUniqueUuid(runtime, '-default-hyperfy') as UUID
```

## Testing Results

After implementing these fixes, the agent now:

✅ **Connects successfully** to Hyperfy worlds  
✅ **Player entity created** and properly identified  
✅ **Name and avatar set** correctly (schwepe.vrm uploaded)  
✅ **Emotes uploaded** (15 emotes successfully uploaded)  
✅ **Behavior system running** and generating contextual responses  
✅ **In-world communication** working via `HYPERFY_AMBIENT_SPEECH` and `REPLY` actions  
✅ **No crashes** - audio system handles edge cases gracefully  

## Example Agent Behavior

The agent now successfully:
- Connects to Hyperfy worlds automatically
- Sets its name to "schwepe" 
- Uploads and applies its custom avatar
- Generates contextual responses like:
  - "point emerged" (authentication testing)
  - "Oneirocom's grip on the meta isn't as strong as they think. We'll find their weak points."
- Uses appropriate emotes ("looking around", etc.)
- Responds to user interactions in the world

## Impact

These fixes enable:
- **Stable Hyperfy integration** for ElizaOS agents
- **Reliable world presence** without crashes or connection failures  
- **Rich interactive experiences** with proper avatar, emotes, and communication
- **Robust error handling** that degrades gracefully under edge conditions
- **Better debugging** with comprehensive logging

## Files Modified

- `src/plugin-hyperfy/service.ts` - Enhanced BehaviorManager startup logic
- `src/plugin-hyperfy/hyperfy/src/core/nodes/Audio.js` - Audio system defensive programming
- `package.json` - Version compatibility fixes

## Breaking Changes

None. All changes are backward compatible and improve stability.

## Future Considerations

- Consider implementing retry logic for failed connections
- Add configuration options for wait timeouts
- Enhance audio system with better resource management
- Add more comprehensive error reporting for debugging 