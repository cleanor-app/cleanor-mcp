# Locally-runnable build of the Cleanor MCP server (stdio transport).
#
# The production server is a hosted, zero-auth Cloudflare Worker at
# https://mcp.cleanor.app/mcp — for normal use just point your client at that URL:
#   { "mcpServers": { "cleanor": { "url": "https://mcp.cleanor.app/mcp" } } }
#
# This image builds and runs the same four tools locally over stdio (via src/stdio.ts),
# so registries/scanners that introspect a self-contained server can start it directly.
# optimize_image uses the optional `sharp` dependency; the other three tools are identical
# to production.

FROM node:22-slim

WORKDIR /app

# Install dependencies first for better layer caching. `sharp` is an optional
# dependency; if its prebuilt binary is unavailable the build still succeeds and
# the three data/QR tools keep working.
COPY package.json ./
RUN npm install

COPY . .

# Start the stdio MCP server. `tsx` runs the TypeScript entry directly.
CMD ["npx", "tsx", "src/stdio.ts"]
