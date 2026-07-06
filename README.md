# Cleanor MCP

[![smithery badge](https://smithery.ai/badge/hello-ha8x/cleanor)](https://smithery.ai/servers/hello-ha8x/cleanor) [![npm](https://img.shields.io/npm/v/@cleanor/mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/@cleanor/mcp)

**Zero-auth, hosted [Model Context Protocol](https://modelcontextprotocol.io) server for AI builders.**

Two things no popular MCP does well, in one server:

1. **Actually optimize the images** your AI just generated or a user dropped in (WebP / AVIF / JPEG, optional resize) — returns the smaller bytes plus before/after sizes.
2. **Hand back real, cited [Cleanor Labs](https://cleanor.app) research data** — device storage capacity, next-gen image-format savings, and the "HEIC conversion tax".

No API key. No signup. Every response links its source on [cleanor.app](https://cleanor.app).

- **Endpoint (Streamable HTTP):** `https://mcp.cleanor.app/mcp`
- **Official MCP Registry:** [`app.cleanor/cleanor`](https://registry.modelcontextprotocol.io/v0/servers?search=app.cleanor)
- **Homepage:** https://mcp.cleanor.app

## Tools

| Tool | What it does |
|---|---|
| `optimize_image` | Fetch an image URL → re-encode smaller (WebP/AVIF/JPEG), optional resize. Returns the optimized image + before/after bytes. |
| `storage_capacity` | How many photos / minutes of video fit in a given GB tier, corrected for real OS/filesystem overhead. Backed by the [photo-storage-capacity study](https://cleanor.app/research). |
| `image_format_savings` | How much smaller WebP / AVIF / JPEG XL are than JPEG at matched quality, plus the HEIC → JPG/PNG conversion tax. From Cleanor's controlled benchmark. |
| `qr_code` | Text or URL → a crisp, dependency-free SVG QR code you can paste anywhere. |

All tools are read-only and safe to expose to autonomous agents.

## Connect

**Claude Code (CLI):**

```bash
claude mcp add --transport http cleanor https://mcp.cleanor.app/mcp
```

**Cursor** (`.cursor/mcp.json`), **Claude Desktop**, **VS Code**, and most clients:

```json
{
  "mcpServers": {
    "cleanor": {
      "url": "https://mcp.cleanor.app/mcp"
    }
  }
}
```

**Stdio-only clients** can run the server locally via `npx` — no bridge needed. Published on npm as [`@cleanor/mcp`](https://www.npmjs.com/package/@cleanor/mcp):

```json
{
  "mcpServers": {
    "cleanor": {
      "command": "npx",
      "args": ["-y", "@cleanor/mcp"]
    }
  }
}
```

Local image optimization uses [`sharp`](https://sharp.pixelplumbing.com/) (an optional dependency); the data and QR tools work regardless.

## About

Built and hosted by **[Cleanor Labs](https://cleanor.app)** — free, private, in-browser tools (files never leave your device) plus original research on device storage and image formats. The MCP server is a thin, hosted front door to that toolset and data for AI agents.

- Free browser tools: https://cleanor.app/tools
- Original research / studies: https://cleanor.app/research

## License

MIT © Cleanor Labs
