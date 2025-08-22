# Multi-Agent Setup

This repository now supports running multiple agents simultaneously, following the pattern from elizaOS/the-org.

## Agents

### 1. Schwepe (Hyperfy Agent)
- **Directory**: `src/schwepe/`
- **Plugin**: Hyperfy (3D virtual world)
- **Character**: Security-focused digital rebel in Hyperfy worlds
- **Authentication System**: Tests allies with "point emerged" → "probably entering"

### 2. Schiz0tr0n (Telegram Agent)
- **Directory**: `src/schiz0tr0n/`
- **Plugin**: Telegram bot
- **Character**: Crypto meme culture personality with cockney slang
- **Platform**: Telegram messenger

## Running Agents

### Method 1: Command Line Arguments

Run specific agents using command line flags:

```bash
# Run only Schwepe
npm start -- --schwepe

# Run only Schiz0tr0n
npm start -- --schiz0tr0n

# Run both agents
npm start -- --schwepe --schiz0tr0n

# Default (runs Schwepe if no flags specified)
npm start
```

### Method 2: Environment Variables

Set in your `.env` file:

```bash
# Enable/disable agents
RUN_SCHWEPE=true
RUN_SCHIZ0TR0N=true
```

## Configuration

### Environment Variables

Each agent has its own namespaced environment variables to avoid conflicts:

#### Schwepe Configuration
```bash
# AI Providers (at least one required)
SCHWEPE_OPENROUTER_API_KEY=
SCHWEPE_GROQ_API_KEY=
SCHWEPE_OPENAI_API_KEY=

# Hyperfy Settings
# For local: ws://localhost:3011/ws
# For remote: wss://hyperfy.io/yourworld/ws
WS_URL=wss://hyperfy.io/yourworld/ws
```

#### Schiz0tr0n Configuration
```bash
# Telegram (required)
SCHIZ0TR0N_TELEGRAM_BOT_TOKEN=

# AI Provider (required)
SCHIZ0TR0N_OPENROUTER_API_KEY=
```

## Directory Structure

```
src/
├── schwepe/              # Schwepe agent
│   └── index.ts         # Character definition
├── schiz0tr0n/          # Schiz0tr0n agent
│   └── index.ts         # Character definition
├── plugin-hyperfy/      # Hyperfy plugin (used by Schwepe)
└── index.ts             # Main entry point with multi-agent loader
```

## Adding New Agents

1. Create a new directory under `src/` with the agent name
2. Add an `index.ts` file with the character definition
3. Import the character in `src/index.ts`
4. Create a new `ProjectAgent` configuration
5. Add command line flag and/or environment variable support
6. Update the agent selection logic

Example:
```typescript
// src/newagent/index.ts
import { Character } from '@elizaos/core';

export const character: Character = {
  name: 'newagent',
  // ... character configuration
};

// In src/index.ts
import { character as newAgentCharacter } from './newagent';

const newAgent: ProjectAgent = {
  character: newAgentCharacter,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [], // Add plugins as needed
};
```

## Notes

- Each agent runs independently with its own runtime
- Agents can have different AI providers and configurations
- The Hyperfy plugin is currently only used by Schwepe
- Default behavior runs Schwepe if no specific agents are requested