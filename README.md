# Technical Caveats

## Build & Installation
- Run `bun install` twice to ensure postinstall scripts execute correctly

## WebSocket Configuration
- `HYPERFY_WS_URL` takes precedence over `WS_URL` for Hyperfy world connection
- Default WebSocket URL: `wss://chill.hyperfy.xyz/ws`
- Local development URL: `ws://localhost:3000/ws`

## Screen Perception
- Requires vision-capable LLM plugin (OpenAI GPT-4o, Gemini with vision)
- Puppeteer-based screenshots currently disabled in WSL2 due to resource constraints

## Voice Chat
- Requires ElevenLabs or OpenAI voice configuration
- ElevenLabs needs: `ELEVENLABS_XI_API_KEY`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_VOICE_ID`
- OpenAI voice requires `OPENAI_API_KEY`

## Character API Keys
- Schwepe character: `SCHWEPE_OPENROUTER_API_KEY`, `SCHWEPE_GROQ_API_KEY`, or `SCHWEPE_OPENAI_API_KEY`
- Cleetus character: `CLEETUS_OPENROUTER_API_KEY`, `CLEETUS_GROQ_API_KEY`, or `CLEETUS_OPENAI_API_KEY`
