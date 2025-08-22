# Use Node.js 20
FROM node:20-alpine

# Install dependencies for building native modules and Chromium
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies with legacy peer deps
RUN npm install --legacy-peer-deps

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create necessary directories and set permissions
RUN mkdir -p /app/data /app/logs && \
    chown -R nodejs:nodejs /app && \
    chmod +x start-agents.sh

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000 3001

# Start the application
CMD ["/app/start-agents.sh"]