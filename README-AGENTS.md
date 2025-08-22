# Multiple Agents Setup

This project runs two independent Eliza agents:

## Agents

### 1. Schwepe (Hyperfy Agent)
- **Port**: 3000
- **Plugin**: Hyperfy (custom 3D world integration)
- **Character**: Security-focused digital rebel in Hyperfy worlds
- **Activation**: Requires `HYPERFY_WORLD_ID` environment variable

### 2. Schiz0tr0n (Telegram Bot)
- **Port**: 3001  
- **Plugin**: Telegram
- **Character**: Crypto meme culture personality
- **Activation**: Requires `TELEGRAM_BOT_TOKEN` environment variable

## Local Development

Run each agent in separate terminals:

```bash
# Terminal 1: Schwepe (Hyperfy)
elizaos dev -p 3000 -char ./characters/schwepe.character.json

# Terminal 2: Schiz0tr0n (Telegram)
elizaos dev -p 3001 -char ./characters/schiz0tr0n.character.json
```

## Docker Deployment

Both agents run automatically in the Docker container based on environment variables:

```bash
docker-compose up
```

The startup script (`start-agents.sh`) will:
1. Check for `HYPERFY_WORLD_ID` and start schwepe if present
2. Check for `TELEGRAM_BOT_TOKEN` and start schiz0tr0n if present
3. Run both agents concurrently if both are configured

## Environment Variables

### Required for Schwepe (Hyperfy)
- `HYPERFY_WORLD_ID` - Your Hyperfy world identifier
- `HYPERFY_API_URL` - Hyperfy API endpoint

### Required for Schiz0tr0n (Telegram)
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token from BotFather

### AI Providers (at least one required)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`

## Character Files

Character definitions are stored in `/characters/`:
- `schwepe.character.json` - Hyperfy agent personality
- `schiz0tr0n.character.json` - Telegram bot personality

## Adding More Agents

1. Create a new character file in `/characters/`
2. Update `start-agents.sh` to include the new agent
3. Assign a unique port for the agent
4. Add the port mapping in `docker-compose.yml`
5. Configure required environment variables

## Monitoring

Each agent runs on its own port:
- Schwepe health check: `http://localhost:3000/health`
- Schiz0tr0n health check: `http://localhost:3001/health`

Check Docker logs:
```bash
docker-compose logs -f
```