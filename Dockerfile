# Introspection shim for registries (e.g. Glama) that start a server and speak MCP
# over stdio to it. The real Cleanor MCP runs on Cloudflare Workers and is a hosted,
# zero-auth Streamable HTTP server at https://mcp.cleanor.app/mcp — it is not meant to
# be self-hosted from this image. This container simply bridges stdio <-> that remote
# endpoint via `mcp-remote`, so a scanner can start it and run tools/list.
#
# To actually use the server, don't build this — just point your client at the URL:
#   { "mcpServers": { "cleanor": { "url": "https://mcp.cleanor.app/mcp" } } }

FROM node:22-alpine

# Pin mcp-remote so the image is reproducible.
RUN npm install -g mcp-remote@0.1.38

ENV CLEANOR_MCP_URL=https://mcp.cleanor.app/mcp

# Bridge stdio to the hosted Streamable HTTP endpoint.
ENTRYPOINT ["sh", "-c", "exec mcp-remote \"$CLEANOR_MCP_URL\""]
