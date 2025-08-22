# Coolify Deployment Guide for Multi-Agent Hypeliza

## Overview
This guide covers deploying the multi-agent Hypeliza system with both Schwepe (Hyperfy) and Schiz0tr0n (Telegram) agents on Coolify.

## Prerequisites
- Coolify instance running and accessible
- Git repository for your Hypeliza project
- Required API keys for each agent

## Deployment Steps

### 1. Push to Git Repository
```bash
git add .
git commit -m "Add multi-agent Docker configuration for Coolify"
git push origin main
```

### 2. Configure in Coolify

#### A. Create New Resource
1. Go to your Coolify dashboard
2. Click "New Resource" → "Docker Compose"
3. Select your server

#### B. Configure Source
1. Choose "Public Repository" or "Private Repository"
2. Enter your Git repository URL
3. Set branch to `main` (or your preferred branch)
4. Set base directory to `/` (root of repository)

#### C. Environment Variables

Configure the following environment variables in Coolify's environment section:

##### Multi-Agent Control
```env
# Enable/disable specific agents
RUN_SCHWEPE=true        # Enable Schwepe (Hyperfy) agent
RUN_SCHIZ0TR0N=true     # Enable Schiz0tr0n (Telegram) agent

# Port configuration
SCHWEPE_PORT=3000       # Port for Schwepe agent
SCHIZ0TR0N_PORT=3001    # Port for Schiz0tr0n agent
```

##### Schwepe Agent Configuration
```env
# AI Provider for Schwepe (at least one required)
SCHWEPE_OPENROUTER_API_KEY=your_key
SCHWEPE_GROQ_API_KEY=your_key
SCHWEPE_OPENAI_API_KEY=your_key
SCHWEPE_ANTHROPIC_API_KEY=your_key

# Hyperfy Configuration (required for Schwepe)
# For local Hyperfy server: ws://localhost:3011/ws
# For remote Hyperfy world: wss://hyperfy.io/yourworld/ws
WS_URL=wss://hyperfy.io/yourworld/ws
```

##### Schiz0tr0n Agent Configuration
```env
# Telegram Bot Token (required for Schiz0tr0n)
SCHIZ0TR0N_TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# AI Provider for Schiz0tr0n (required)
SCHIZ0TR0N_OPENROUTER_API_KEY=your_openrouter_key
```

##### Optional Shared Services
```env
# Database (optional, for SQL plugin)
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# ElevenLabs Voice (optional)
ELEVENLABS_XI_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id

# Discord (optional)
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_APPLICATION_ID=your_discord_app_id

# Twitter (optional)
TWITTER_USERNAME=your_username
TWITTER_PASSWORD=your_password
TWITTER_EMAIL=your_email
```

#### D. Build Configuration
- Build Pack: Docker Compose
- Compose File: `docker-compose.yml` (default)

#### E. Network Configuration
1. **Port Exposure**: 
   - Enable "Expose to Internet" for both ports
   - Configure ports 3000 and 3001 (or your chosen ports)
   
2. **Domain Configuration** (optional):
   - You can set up subdomains for each agent:
     - `schwepe.yourdomain.com` → Port 3000
     - `schiz0tr0n.yourdomain.com` → Port 3001
   
3. **SSL**: Automatically handled by Coolify

#### F. Deploy
1. Click "Deploy"
2. Monitor the build logs
3. Wait for deployment to complete

### 3. Verify Deployment

#### Check Container Status
1. Go to the container logs in Coolify
2. You should see:
   ```
   Starting schwepe agent on port 3000...
   schwepe agent started with PID xxx
   Starting schiz0tr0n agent on port 3001...
   schiz0tr0n agent started with PID xxx
   ```

#### Test Agents
1. **Schwepe (Hyperfy)**: 
   - Navigate to your Hyperfy world URL
   - The agent should appear and be responsive
   
2. **Schiz0tr0n (Telegram)**:
   - Search for your bot on Telegram
   - Send a message to test responsiveness

### 4. Monitoring & Management

#### View Logs
- In Coolify, go to your application → Logs
- Each agent logs independently

#### Resource Usage
- Monitor CPU and memory usage in Coolify dashboard
- Adjust limits in docker-compose.yml if needed

#### Restart Individual Agents
To restart only one agent without affecting the other:
1. SSH into your server
2. Access the container: `docker exec -it hypeliza-multi-agent sh`
3. Find agent PID: `ps aux | grep node`
4. Restart specific agent as needed

## Troubleshooting

### Common Issues

#### 1. Only One Agent Starting
- Check environment variables `RUN_SCHWEPE` and `RUN_SCHIZ0TR0N`
- Verify all required API keys are set for each agent
- Check container logs for specific errors

#### 2. Telegram Bot Not Responding
- Verify `SCHIZ0TR0N_TELEGRAM_BOT_TOKEN` is correct
- Ensure bot is not already running elsewhere
- Check firewall allows outbound HTTPS connections

#### 3. Hyperfy Agent Not Appearing
- Verify Hyperfy credentials are correct
- Check `HYPERFY_WORLD_URL` is accessible
- Ensure Puppeteer/Chromium is working (check logs)

#### 4. Memory Issues with Multiple Agents
- Increase memory limits in docker-compose.yml
- Consider running agents on separate containers
- Monitor with: `docker stats hypeliza-multi-agent`

#### 5. Port Conflicts
- Ensure ports 3000 and 3001 are not used by other services
- Modify `SCHWEPE_PORT` and `SCHIZ0TR0N_PORT` if needed

### Debug Commands

```bash
# View running processes in container
docker exec hypeliza-multi-agent ps aux

# Check agent-specific logs
docker logs hypeliza-multi-agent 2>&1 | grep schwepe
docker logs hypeliza-multi-agent 2>&1 | grep schiz0tr0n

# Test network connectivity
docker exec hypeliza-multi-agent wget -O- http://localhost:3000/health
docker exec hypeliza-multi-agent wget -O- http://localhost:3001/health
```

## Scaling Considerations

### Running Agents Separately
For better resource management, you can deploy each agent as a separate Coolify application:

1. Create two separate Docker Compose files:
   - `docker-compose.schwepe.yml`
   - `docker-compose.schiz0tr0n.yml`
   
2. Deploy as separate applications in Coolify
3. This allows independent scaling and resource allocation

### Performance Optimization
- Use production mode for better performance
- Consider using external databases for persistence
- Enable caching where applicable
- Monitor and adjust resource limits based on usage

## Updating

To update your deployment:
1. Push changes to Git repository
2. In Coolify, click "Redeploy"
3. Or enable auto-deploy for automatic updates

## Backup

Important items to backup:
- Environment variables (export from Coolify)
- `localstorage.json` (agent memory/state)
- Database (if using external database)
- Logs (for debugging/audit)

## Support

For issues:
- **Multi-agent setup**: Check this documentation
- **Coolify-specific**: Refer to Coolify documentation
- **ElizaOS framework**: Check ElizaOS documentation
- **Agent-specific**: Review individual agent configurations