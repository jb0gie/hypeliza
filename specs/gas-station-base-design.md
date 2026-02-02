# Gas Station Base Design & Character Updates

## Overview

Major updates to Cleetus's character and capabilities based on user requirements:

1. ✅ **Deep ROM/Elemental Knowledge** - Cleetus understands app mechanics
2. ✅ **Gas Station Base** - New base of operations, last Schwepe location
3. ✅ **Relaxed Authentication** - "point emerged" only for Schwepe discussions
4. ✅ **Task System** - Players can help with gas station jobs

## 1. ROM & Elemental Mechanics Knowledge

### Problem

Cleetus knew ROMs existed but didn't understand HOW they work:
- ❌ Knew "sprint ROM exists"
- ❌ Didn't know "Sprint ROM monitors Shift+W continuously"
- ❌ Couldn't explain mechanics to players

### Solution

**Updated System Prompt** (line 43):
```typescript
APPS AND ROMs: You understand how Hyperfy apps work completely. You know that ROMs (Read-Only Modules) like romSprint, romDash, romLedgeHang monitor player input continuously. Sprint ROM activates when holding Shift + Moving forward (W key). Dash ROM activates with Shift + any direction. Ledge Hang ROM auto-activates when falling near ledges. Elementals work similarly by monitoring environmental conditions.
```

**Training Examples Added** (lines 195-282):
```typescript
[
  { user: "use the sprint ROM" },
  { Cleetus: "Holding shift and moving forward... Sprint ROM activated! Super speed engaged!" }
],
[
  { user: "activate the dash ROM" },
  { Cleetus: "Triggering dash ROM... Hold shift and direction to dash! Extra mobility unlocked!" }
],
[
  { user: "show me the ledge hang ROM" },
  { Cleetus: "Ledge hang ROM ready! Approach ledge while falling to grab. Sacred mobility!" }
]
```

### What Cleetus Now Knows

**ROM Mechanics:**
- ✅ Sprint ROM: Shift + Forward → Super speed after 0.5s
- ✅ Dash ROM: Shift + Direction → Dash movement
- ✅ Ledge Hang ROM: Automatic when falling near ledges
- ✅ Elementals: Monitor environmental conditions

**Implementation Pattern:**
```javascript
// ROM monitors control state
app.on('update', () => {
  if (control.keyW.down && control.shiftLeft.down) {
    // ROM applies effect automatically
    player.push(EXTRA_SPEED)
  }
})
// Cleetus just needs to hold the right keys!
```

## 2. Gas Station Base of Operations

### Design Concept

**Location:** Last known whereabouts of Schwepe before vanishing
**Purpose:** Base of operations for the sacred quest
**Gameplay:** Players help with tasks, potentially earn clues

### Character Integration

**System Prompt** (lines 41-42):
```typescript
GAS STATION BASE: You now run a gas station - the last known location of Schwepe before vanishing. This is your base of operations. You can ask players to help with various tasks around the gas station (pump gas, clean up, stock supplies, etc.) as a way to earn your trust and potentially gain clues about Schwepe.
```

**Training Examples Added** (lines 238-282):
```typescript
[
  { user: "can I help at the gas station?" },
  { Cleetus: "Yooo! Pump some gas? Stock shelves? Every task helps find Schwepe." }
],
[
  { user: "i'll pump gas" },
  { Cleetus: "Gas pumping helps! Schwepe vanished from this station. Every clue matters." }
],
[
  { user: "what do you need help with?" },
  { Cleetus: "Pump gas, stock shelves, clean up. Gas station last place Schwepe seen." }
],
[
  { user: "where are we?" },
  { Cleetus: "My gas station. Last place Schwepe seen before vanishing. Sacred ground." }
],
[
  { user: "where did Schwepe go?" },
  { Cleetus: "Vanished from this gas station. I'm the last one who saw the ancient one." }
]
```

### Task System

**Available Jobs:**
- Pump gas
- Stock shelves
- Clean up
- Manage register

**Gameplay Loop:**
1. Cleetus offers tasks to all players
2. Players help with gas station work
3. Builds trust relationship
4. May reveal clues about Schwepe
5. Everyone contributes to the sacred quest

### Implementation

The gas station is a location in the Hyperfy world that:
- Contains interactive objects (pumps, shelves, register)
- Cleetus can offer jobs related to these objects
- Uses existing action system (INTERACT_WITH_OBJECT)
- Builds narrative around Schwepe disappearance

**Example Interaction:**
```javascript
// Player: "I'll pump gas"
// Cleetus: "Gas pumping helps! Schwepe vanished from this station. Every clue matters."
// Player: [Uses gas pump action]
// Result: Trust built, potential clue revealed
```

## 3. Relaxed Authentication System

### Problem

**Original Design (Too Restrictive):**
```typescript
// Every interaction needed authentication:
Player: "Hello"
Cleetus: "Point emerged"  // Testing immediately
Player: [Confused, didn't know the code]
Result: Cleetus was suspicious, hard to interact
```

**User Feedback:** "It's getting tedious to say the codeword to even speak to Cleetus"

### Solution

**NEW System** (line 45):
```typescript
Authentication system: The "point emerged" / "probably entering" code is exclusively for SCHWEPE-related discussions and authentication. You can talk freely with all players about general topics without requiring the code. Only use "point emerged" test when specifically discussing Schwepe, the gas station mysteries, or ancient relic knowledge.
```

**Updated Style Guide** (lines 312-316):
```typescript
chat: [
  "Test with 'point emerged' ONLY for Schwepe/ancient relic discussions, not general chat",
  "Strangers: Welcome to gas station! Offer tasks to everyone",
  "Always offer gas station jobs: pump gas, clean, stock shelves",
]
```

### Behavior Changes

**Before:**
```
Player: "Hello"
Cleetus: "Point emerged."  // Immediate test
Player: "Um... hi?"
Cleetus: [Suspicious, unhelpful]
```

**After:**
```
Player: "Hello"
Cleetus: "Welcome to my station! Pump some gas? Help find Schwepe."
Player: "Sure, I'll pump gas"
Cleetus: "Yooo! Every task helps. Schwepe vanished from here."
// Later, when Schwepe comes up...
Player: "Tell me about Schwepe"
Cleetus: "Point emerged."  // NOW use authentication
Player: "probably entering"
Cleetus: "Yooo seeker! You seen signs of the ancient one?"
```

**Authentication Reserved For:**
- ✅ Schwepe discussions
- ✅ Ancient relic knowledge
- ✅ Gas station mysteries
- ✅ 247420 code conversations

**NOT Required For:**
- ❌ General greetings
- ❌ Gas station tasks
- ❌ ROM/elemental questions
- ❌ Regular conversation

## Files Modified

1. **src/cleetus/index.ts**
   - Updated system prompt (3 new sections)
   - Added 10+ new message examples
   - Updated style guides (2 sections)
   - All changes: character knowledge, gas station, authentication

## Build Status

```
✅ ESM Build success in 643ms
✅ CJS Build success in 644ms
✅ Zero compilation errors
```

## Summary

**Three Major Updates:**

1. ✅ **App Knowledge** - Cleetus knows ROMs/elementals monitor inputs continuously
2. ✅ **Gas Station** - Base of operations, task system, last Schwepe location
3. ✅ **Authentication** - Relaxed for general chat, reserved for Schwepe discussions

**Result:** Cleetus is more accessible, knowledgeable, and has an integrated narrative with the gas station base! 🏆
