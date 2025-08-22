#!/bin/sh

# Function to start an agent
start_agent() {
    agent_name=$1
    port=$2
    
    echo "Starting $agent_name agent on port $port..."
    
    # Export port for this agent
    export PORT=$port
    
    # Start the agent with the appropriate flag using bun
    if [ "$agent_name" = "schwepe" ]; then
        bun dist/index.js --schwepe &
    elif [ "$agent_name" = "schiz0tr0n" ]; then
        bun dist/index.js --schiz0tr0n &
    fi
    
    echo "$agent_name agent started with PID $!"
}

# Check which agents to run based on environment variables
if [ "$RUN_SCHWEPE" = "true" ] || [ -z "$RUN_SCHWEPE" ]; then
    start_agent "schwepe" "${SCHWEPE_PORT:-3000}"
fi

if [ "$RUN_SCHIZ0TR0N" = "true" ]; then
    start_agent "schiz0tr0n" "${SCHIZ0TR0N_PORT:-3001}"
fi

# If both agents are disabled, default to schwepe
if [ "$RUN_SCHWEPE" != "true" ] && [ "$RUN_SCHIZ0TR0N" != "true" ]; then
    echo "No agents specified, defaulting to schwepe..."
    start_agent "schwepe" "${PORT:-3000}"
fi

# Wait for all background processes
wait