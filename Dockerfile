# Use Node.js 20 (Debian-based, not Alpine)
FROM node:20

# Install dependencies for Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies with legacy peer deps
RUN npm install --legacy-peer-deps

# Build the application
RUN npm run build

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

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