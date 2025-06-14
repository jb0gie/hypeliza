# Running Multiple Hyperfy Agents

This guide explains how to run multiple Hyperfy agents simultaneously on different ports.

## Quick Start

### Method 1: Using npm scripts (Recommended)

The package.json includes pre-configured scripts for common ports:

```bash
# Development mode (with hot reload)
npm run dev:3012  # Default port
npm run dev:3013  # Second agent
npm run dev:3014  # Third agent
npm run dev:3015  # Fourth agent

# Production mode
npm run start:3012  # Default port
npm run start:3013  # Second agent
npm run start:3014  # Third agent
npm run start:3015  # Fourth agent
```

### Method 2: Using the shell script

```bash
# Default port (3012) with default character
./run-agent.sh

# Custom port
./run-agent.sh 3013

# Custom port with custom character
./run-agent.sh 3014 ./characters/alice.json
```

### Method 3: Direct CLI commands

```bash
# Development mode
elizaos dev -p 3012
elizaos dev -p 3013
elizaos dev -p 3014

# Production mode
elizaos start -p 3012
elizaos start -p 3013
elizaos start -p 3014

# With custom character files
elizaos dev -p 3013 -char ./characters/alice.json
elizaos start -p 3014 -char ./characters/bob.json
```

## Running Multiple Agents Simultaneously

### Option 1: Multiple Terminal Windows/Tabs

Open separate terminal windows and run:

```bash
# Terminal 1
npm run dev:3012

# Terminal 2  
npm run dev:3013

# Terminal 3
npm run dev:3014
```

### Option 2: Background Processes

```bash
# Start agents in background
npm run dev:3012 &
npm run dev:3013 &
npm run dev:3014 &

# View running processes
jobs

# Bring a specific job to foreground
fg %1  # Brings first job to foreground

# Kill background processes
kill %1 %2 %3
```

### Option 3: Using tmux (Advanced)

```bash
# Create new tmux session
tmux new-session -d -s agents

# Create windows for each agent
tmux new-window -t agents:1 -n agent1 'npm run dev:3012'
tmux new-window -t agents:2 -n agent2 'npm run dev:3013'
tmux new-window -t agents:3 -n agent3 'npm run dev:3014'

# Attach to session
tmux attach-session -t agents

# Detach: Ctrl+B, then D
# List sessions: tmux ls
# Kill session: tmux kill-session -t agents
```

## Port Configuration

### Default Ports
- **3012**: Default ElizaOS port
- **3013-3015**: Pre-configured additional ports

### Custom Ports
You can use any available port:

```bash
elizaos dev -p 8080
elizaos dev -p 9000
./run-agent.sh 4000
```

### Environment Variable Method
You can also set the PORT environment variable:

```bash
PORT=3013 npm run dev
PORT=3014 elizaos start
```

## Character Configuration

### Using Different Characters
Each agent can use a different character file:

```bash
# Agent 1: Default character on port 3012
npm run dev:3012

# Agent 2: Alice character on port 3013
elizaos dev -p 3013 -char ./characters/alice.json

# Agent 3: Bob character on port 3014
elizaos dev -p 3014 -char ./characters/bob.json
```

### Character File Structure
Create character files in a `characters/` directory:

```json
{
  "name": "Alice",
  "bio": "A helpful AI assistant specialized in coding",
  "personality": "friendly and technical",
  "knowledge": ["programming", "web development"],
  "style": {
    "tone": "casual",
    "humor": "witty"
  }
}
```

## Monitoring Multiple Agents

### Check Running Agents
```bash
# List processes using ports
lsof -i :3012
lsof -i :3013
lsof -i :3014

# Check all ElizaOS processes
ps aux | grep elizaos

# Monitor system resources
htop
```

### Logs
Each agent will have its own log output. Consider using log management:

```bash
# Redirect logs to files
npm run dev:3012 > logs/agent-3012.log 2>&1 &
npm run dev:3013 > logs/agent-3013.log 2>&1 &

# Tail logs
tail -f logs/agent-3012.log
tail -f logs/agent-3013.log
```

## Troubleshooting

### Port Already in Use
```bash
# Find what's using a port
lsof -i :3012

# Kill process using port
kill -9 $(lsof -t -i:3012)
```

### Memory Issues
Running multiple agents can be memory-intensive:

```bash
# Monitor memory usage
free -h
htop

# Limit memory per process (if needed)
node --max-old-space-size=2048 $(which elizaos) dev -p 3012
```

### Performance Optimization
- Use production mode (`start`) instead of development mode (`dev`) for better performance
- Consider running agents on different machines for heavy loads
- Monitor CPU and memory usage with `htop` or similar tools

## Examples

### Development Setup (3 agents)
```bash
# Terminal 1: Main agent
npm run dev:3012

# Terminal 2: Testing agent  
npm run dev:3013

# Terminal 3: Experimental agent with custom character
elizaos dev -p 3014 -char ./characters/experimental.json
```

### Production Setup (2 agents)
```bash
# Background processes
npm run start:3012 > logs/main-agent.log 2>&1 &
npm run start:3013 > logs/backup-agent.log 2>&1 &

# Monitor
tail -f logs/main-agent.log
```

This setup allows you to run multiple Hyperfy agents simultaneously, each with their own port, character, and configuration! 