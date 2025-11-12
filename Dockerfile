FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json /temp/dev/
RUN cd /temp/dev && bun install

# Build the application
FROM base AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .
RUN bun run build

# Production image
FROM base AS release
COPY --from=install /temp/dev/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/package.json .
COPY --from=build /app/characters characters
COPY --from=build /app/data data

# Expose the port (default to 3000, can be overridden by SERVER_PORT env var)
EXPOSE 3000

# Set the entrypoint
ENTRYPOINT [ "bun", "run", "start" ]
