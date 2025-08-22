FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json ./
COPY .npmrc ./
RUN bun install

# Copy all config files
COPY tsconfig.json tsconfig.build.json tsup.config.ts ./

# Copy source code
COPY src ./src

# Build the project
RUN bun run build || (echo "Trying alternate build" && bun x tsup)

# Copy necessary Hyperfy assets if the build didn't handle them
RUN mkdir -p dist && \
    ([ -f src/plugin-hyperfy/physx/physx-js-webidl.js ] && cp src/plugin-hyperfy/physx/physx-js-webidl.js dist/) || true && \
    ([ -f src/plugin-hyperfy/physx/physx-js-webidl.wasm ] && cp src/plugin-hyperfy/physx/physx-js-webidl.wasm dist/) || true

# Copy startup script
COPY start-agents.sh ./
RUN chmod +x start-agents.sh

# Expose ports for both agents
EXPOSE 3000 3001

# Start the multi-agent setup
CMD ["./start-agents.sh"]