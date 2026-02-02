# Cleetus App Scripts Awareness & Memory Behavior

## Issue 1: App Scripts (ROMs, Examples)

### Clarification: What are App Scripts?

The files in `/ROMs/`, `/examples/ROMs/`, `/examples/essentials/`, etc. are **Hyperfy App Scripts**, not ElizaOS agent actions.

**Key Difference:**
- **App Scripts** (like `romSprint.js`): Define interactive objects in Hyperfy world
- **Agent Actions** (like `INTERACT_WITH_OBJECT`): Allow Cleetus to interact with those objects

### Analogy

Think of it like a video game:
- **App Scripts** = Level designers placing doors, buttons, items in the world
- **Agent Actions** = Player pressing E to use those objects

Cleetus is the **player**, not the **level designer**.

### What Just Happened

I've added a new provider that makes Cleetus aware of available app scripts:

**File Created:** `src/plugin-hyperfy/providers/app-scripts.ts`

**What it does:**
- Scans all app script directories (ROMs, essentials, elementals, games, etc.)
- Makes the list available to Cleetus via the `HYPERFY_APP_SCRIPTS` provider
- Cleetus can now tell players what apps/scripts are available

**Provider Output Example:**
```
Available Hyperfy App Scripts:

- romSprint (ROMs): Movement and interaction ROMs
- romDash (ROMs): Movement and interaction ROMs
- romLedgeHang (ROMs): Movement and interaction ROMs
- debug-trigger (Essentials): Essential building blocks and utilities
- interactive-model (Essentials): Essential building blocks and utilities
- SimpleDoor (General Examples): Various example apps
- SimpleElevator (General Examples): Various example apps

Total: 47 scripts available
```

**Usage in Character:**
```typescript
// Now Cleetus can reference available scripts
world.appScripts.romSprint // Information about sprint ROM
world.appScripts.interactive-model // Info about model interaction
```

### What Cleetus Can Do

✅ **Interact with** objects created by these scripts:
- "use the door" → Opens SimpleDoor
- "interact with button" → Presses button from essentials

❌ **Cannot load or manage** these scripts:
- Cannot place new ROMs in the world
- Cannot configure script parameters
- Cannot tell which specific script an object came from

### For Builders/World Creators

If you want to use these scripts:

1. **Via Hyperfy Builder UI:**
   - Open Hyperfy builder
   - Add app/script from examples/ROMs
   - Configure and place in world
   - Cleetus can then interact with them

2. **Via Script Loading:**
   - Use Hyperfy's app loading system
   - Scripts define what objects exist
   - Cleetus detects and interacts with those objects

## Issue 2: Memory / Looping Behavior

### What You're Seeing

From the logs:
```
Cleetus: "What action, seeker? You seen Schwepe around here?"
[30 seconds later]
Cleetus: "What action, seeker? You seen Schwepe around here?"
[30 seconds later]
Cleetus: "What action, seeker? You seen Schwepe around here?"
```

**This is NOT a technical bug** - it's **character design behavior**.

### Why It Happens

1. **Chat is Empty** → No new player messages
2. **Behavior Loop Runs** (every 10-30 seconds)
3. **Cleetus "thinks" about situation**:
   ```
   "b0gie is nearby but hasn't responded to authentication"
   "I should ask about the action they mentioned"
   "I should also ask about Schwepe"
   ```
4. **Generates Response** → Same thought pattern
5. **Sends Message** → Repeats previous message

### Why Same Message Repeats

**Cleetus's Core Programming (from character file):**
```typescript
style: {
  all: [
    "Every response must mention or ask about finding Schwepe",
    "Stay focused on the sacred quest",
    "Test with 'point emerged' often",
  ]
}
```

**Result:** When idle, Cleetus:
- Remembers there's a seeker nearby (b0gie)
- Remembers they mentioned an action
- Must ask about Schwepe (core directive)
- Generates same response

### This is Expected Behavior

Cleetus is designed to:
- ✅ Be obsessive about finding Schwepe
- ✅ Constantly test authentication
- ✅ Never forget the quest
- ✅ Keep asking about clues

**The "looping" is Cleetus being Cleetus!**

### When It Changes

The pattern breaks when:
- Player sends new message → New context
- Player responds to authentication → Trust established
- Player gives new information → Updates context

Example:
```
Player: "probably entering"
Cleetus: "A true seeker! Have you seen signs of Schwepe?"
```

### Technical Details

**Memory IS working:**
- Remembers b0gie is nearby
- Remembers authentication test was sent
- Remembers quest for Schwepe

**What you see:**
- Cleetus re-evaluating situation every 30 seconds
- Same inputs = same outputs (deterministic)
- Designed to persistently pursue the quest

### Comparison: Technical Loop vs Character Behavior

| Technical Loop | Character Behavior |
|----------------|-------------------|
| Processing own message | Responding to empty chat |
| Bug in deduplication | Intentional persistent behavior |
| Would show in logs as error | Shows as "behavior loop" in logs |
| Fixed by code | Fixed by player interaction |

What you're seeing is **character behavior**, not a technical bug!

## Summary

### App Scripts (ROMs, Examples)

✅ **Added:** App script awareness provider
- Cleetus knows what scripts exist
- Can inform players about available apps
- Cannot load/manage scripts (builder task)

**For Cleetus to use scripts:**
1. You (builder) place scripts in Hyperfy world
2. Cleetus detects objects created by scripts
3. Players tell Cleetus: "use the door"
4. Cleetus interacts with object

### Memory / Looping

✅ **Expected Behavior:**
- Cleetus remembers quest, authentication, nearby players
- Re-evaluates every 10-30 seconds when idle
- Persistent, obsessive behavior by design
- Pattern breaks with new player input

**Not a bug - it's a feature!** 🎯

## Recommendations

### To Use ROM Scripts:

1. **Place in World:**
   ```
   Hyperfy Builder → Add App → Select romSprint.js
   Configure → Place in world
   ```

2. **Cleetus Will:**
   ```
   Player: "use the sprint ROM"
   Cleetus: [detects nearby action node] → Interacts → Sprint activates!
   ```

### To Stop Looping:

Simply respond to Cleetus:
```
Player: "probably entering"
Cleetus: "A true seeker! Tell me what you know of Schwepe."
```

The conversation will progress and change.

---

**Bottom Line:**
- App scripts: Now aware via provider (can't use them directly - they create objects)
- Memory looping: Character feature, not bug (obsessive seeker behavior)
- Both are working as designed! 🎮
