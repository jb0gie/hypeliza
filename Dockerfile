FROM node:23-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install bun globally
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/bun

# Copy package files
COPY package.json .npmrc ./

# Install dependencies using bun
RUN bun install

# Copy all config files
COPY tsconfig.json tsconfig.build.json tsup.config.ts ./

# Copy source code
COPY src ./src

# Build the project
RUN bun run build || bun x tsup

# Copy startup script
COPY start-agents.sh ./
RUN chmod +x start-agents.sh

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs && \
    mkdir -p /app/data /app/logs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose ports for both agents
EXPOSE 3000 3001

# Start the multi-agent setup
CMD ["./start-agents.sh"]