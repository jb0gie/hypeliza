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

## OpenRouter API Issues
- Free models on OpenRouter can be discontinued without notice (e.g., `mistralai/devstral-2512:free`)
- When a free model ends, the API returns 404 "Not Found" with message about migration to paid slug
- Error manifests as `AI_APICallError: Not Found` in BehaviorManager logs
- To fix: Update `.env` to use a current free model (e.g., `google/gemma-3-27b-it:free`)
- Verify model availability at https://openrouter.ai/api/v1/models before deployment