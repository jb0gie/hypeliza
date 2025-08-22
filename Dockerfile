# Multi-stage build for optimized image size
FROM node:20-alpine AS builder

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY tsup.config.ts ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Copy character files (if they exist)
COPY characters ./characters 2>/dev/null || true

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    git

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy character files (if they exist)
COPY --from=builder /app/characters ./characters 2>/dev/null || true

# Copy any necessary public files for Hyperfy plugin
COPY --from=builder /app/src/plugin-hyperfy/physx ./dist/plugin-hyperfy/physx 2>/dev/null || true
COPY --from=builder /app/src/plugin-hyperfy/public ./dist/plugin-hyperfy/public 2>/dev/null || true

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Switch to non-root user
USER nodejs

# Expose the default port
EXPOSE 3000

# Copy startup script
COPY --chmod=755 start-agents.sh /app/

# Start the application
CMD ["/app/start-agents.sh"]