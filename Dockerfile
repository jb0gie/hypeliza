# ElizaOS with Hyperfy plugin - Multi-agent setup
FROM node:23.3.0-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    g++ \
    git \
    make \
    python3 \
    unzip \
    chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install bun
RUN npm install -g bun@1.2.5

# Create python symlink
RUN ln -s /usr/bin/python3 /usr/bin/python

# Copy package files
COPY package.json tsconfig.json tsup.config.ts .npmrc ./

# Install with bun, skipping post-install
RUN SKIP_POSTINSTALL=1 bun install --no-cache

# Copy source code
COPY src ./src

# Build
RUN bun run build

# Production stage
FROM node:23.3.0-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    git \
    python3 \
    unzip \
    chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g bun@1.2.5

# Set Puppeteer environment
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Copy from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copy startup script for multi-agent
COPY start-agents.sh ./
RUN chmod +x start-agents.sh

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs && \
    mkdir -p /app/data /app/logs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000 3001

# Use the multi-agent startup script
CMD ["/app/start-agents.sh"]