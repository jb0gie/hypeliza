# Deploying HypEliza to Coolify

This guide will help you deploy the HypEliza (Eliza x Hyperfy) project to Coolify.

## Prerequisites

1. A Coolify instance (self-hosted or managed)
2. A Git repository with your code (GitHub, GitLab, Bitbucket, etc.)
3. API keys for the services you want to use (OpenAI, Anthropic, ElevenLabs, etc.)

## Deployment Options

### Option 1: Docker Compose Deployment (Recommended)

This is the easiest method as the `docker-compose.yml` file is already configured.

#### Steps:

1. **Push your code to a Git repository**
   ```bash
   git add .
   git commit -m "Add Coolify deployment files"
   git push origin main
   ```

2. **Create a new project in Coolify**
   - Log into your Coolify dashboard
   - Click "New Project" or use an existing one

3. **Add a new service**
   - Click "+ Add New Resource"
   - Select "Service" (Docker Compose)
   - Choose your Git repository
   - Select the branch (e.g., `main`)
   - Coolify will detect the `docker-compose.yml` file

4. **Configure environment variables**
   Add these environment variables in Coolify:
   
   **Required:**
   - `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (at least one LLM provider)
   - `SERVER_PORT` (default: 3000)
   - `WS_URL` (default: wss://chill.hyperfy.xyz/ws)

   **Optional (for voice chat):**
   - `ELEVENLABS_XI_API_KEY`
   - `ELEVENLABS_MODEL_ID`
   - `ELEVENLABS_VOICE_ID`
   - Or use OpenAI TTS with `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`

   **Optional (for database):**
   - `POSTGRES_URL`

5. **Configure port mapping**
   - Coolify will automatically detect port 3000
   - You can optionally add a domain name

6. **Deploy**
   - Click "Deploy" to start the deployment
   - Monitor the build logs
   - Once deployed, your app will be accessible at the configured URL

### Option 2: Dockerfile Deployment

If you prefer to use just the Dockerfile:

1. **Create a new application in Coolify**
   - Select "Application"
   - Choose "Public Repository" or "Private Repository"
   - Connect your Git repository

2. **Configure build settings**
   - Build Pack: `Dockerfile`
   - Dockerfile Location: `/Dockerfile`
   - Port: `3000` (or your `SERVER_PORT`)

3. **Add environment variables** (same as Option 1)

4. **Deploy**

## Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key | No* | - |
| `ANTHROPIC_API_KEY` | Anthropic API key | No* | - |
| `SERVER_PORT` | Application port | No | 3000 |
| `WS_URL` | Hyperfy world WebSocket URL | No | wss://chill.hyperfy.xyz/ws |
| `POSTGRES_URL` | PostgreSQL connection string | No | - |
| `ELEVENLABS_XI_API_KEY` | ElevenLabs API key | No | - |
| `ELEVENLABS_MODEL_ID` | ElevenLabs model | No | eleven_multilingual_v2 |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice | No | EXAVITQu4vr4xnSDxMaL |
| `OPENAI_TTS_MODEL` | OpenAI TTS model | No | - |
| `OPENAI_TTS_VOICE` | OpenAI TTS voice | No | - |

*At least one LLM provider (OpenAI or Anthropic) is required.

## Persistent Storage

The following directories should be mounted as persistent volumes in Coolify:

- `/app/characters` - Character configuration files
- `/app/data` - Application data
- `/app/generatedImages` - Generated image storage

In Coolify's service settings, add these as volume mounts to ensure data persists across deployments.

## Connecting to Your Own Hyperfy World

If you want to run your own Hyperfy world:

1. Deploy Hyperfy separately (https://github.com/hyperfy-xyz/hyperfy)
2. Update the `WS_URL` environment variable to point to your Hyperfy instance
   - Example: `ws://your-hyperfy-instance:3000/ws`

## Health Checks

The `docker-compose.yml` includes a health check endpoint. Coolify will automatically monitor the application health at:
- `http://localhost:3000/health`

## Troubleshooting

### Build fails with "module not found"
- Make sure `bun install` runs twice (check Dockerfile)
- Verify all dependencies are in `package.json`

### Application doesn't start
- Check environment variables are set correctly
- Review logs in Coolify dashboard
- Ensure `SERVER_PORT` matches the exposed port

### Can't connect to Hyperfy world
- Verify `WS_URL` is correct
- Check network connectivity from your Coolify server
- Ensure WebSocket connections are allowed through firewall

## Additional Resources

- [ElizaOS Documentation](https://elizaos.github.io/eliza/)
- [Hyperfy Documentation](https://docs.hyperfy.io/)
- [Coolify Documentation](https://coolify.io/docs/)
