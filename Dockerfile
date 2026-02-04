# Use Node.js 23 (Debian-based) with bun
FROM node:23-slim

# Install dependencies for Chromium, build tools, and bun
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    wget \
    curl \
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
    python3 \
    build-essential \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -s /usr/local/bin/bun /usr/local/bin/bunx

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock .npmrc ./

# Install dependencies with bun
RUN bun install

# Copy the rest of the application
COPY . .

# Build the application
RUN bun run build

# Create necessary directories
RUN mkdir -p /app/data /app/generatedImages /app/characters

# Expose port
EXPOSE 3012

# Start the application
CMD ["bun", "run", "start"]
