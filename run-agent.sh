#!/bin/bash

# Script to run multiple Hyperfy agents on different ports
# Usage: ./run-agent.sh [port] [character_file]
# Example: ./run-agent.sh 3013 ./characters/alice.json

PORT=${1:-3012}
CHARACTER=${2:-""}

echo "🚀 Starting Hyperfy agent on port $PORT"

if [ -n "$CHARACTER" ]; then
    echo "📝 Using character file: $CHARACTER"
    if [ "$NODE_ENV" = "development" ]; then
        elizaos dev -p $PORT -char "$CHARACTER"
    else
        elizaos start -p $PORT -char "$CHARACTER"
    fi
else
    echo "📝 Using default character"
    if [ "$NODE_ENV" = "development" ]; then
        elizaos dev -p $PORT
    else
        elizaos start -p $PORT
    fi
fi 