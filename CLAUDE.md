# Technical Caveats

## Environment Variables
- `HYPERFY_WS_URL` takes precedence over `WS_URL` for Hyperfy world connection
- Character-specific API keys required: `SCHWEPE_*_API_KEY` or `CLEETUS_*_API_KEY` (OpenRouter/Groq/OpenAI)

## Build Process
- Complex build copies multiple asset directories (physics WASM, scripts, assets, avatars, emotes, puppeteer files)
- All asset copying happens in the `build` script

## Runtime Behavior
- Appearance polling occurs every 30 seconds
- Autonomous behavior runs every 10-20 seconds when agent is inactive
- Message deduplication uses processed message IDs stored in memory
- `AgentActivityLock` prevents concurrent actions via mutex pattern
- WebSocket reconnection handled automatically on disconnections

## Platform-Specific Issues
- Puppeteer-based screen perception disabled in WSL2 due to resource constraints
- Screenshot capability requires vision-capable LLM plugin

## System Dependencies
- PhysX WASM binary required for physics simulation
- Three.js-based 3D rendering with VRM avatar support
- LiveKit integration for spatial voice chat
- WebSocket real-time communication with message deduplication