# Cleanor MCP

[![smithery badge](https://smithery.ai/badge/hello-ha8x/cleanor)](https://smithery.ai/servers/hello-ha8x/cleanor) [![npm](https://img.shields.io/npm/v/@cleanor/mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/@cleanor/mcp) [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21225551.svg)](https://doi.org/10.5281/zenodo.21225551)

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
| `hash` | SHA-1/256/384/512 hex digest of text. |
| `hmac` | Keyed HMAC signature (SHA family), hex or Base64. |
| `uuid` | UUID v4 (random) or v7 (time-sortable). |
| `base64` | Base64 encode/decode, UTF-8 + URL-safe. |
| `json_format` | Validate and pretty-print or minify JSON, optional key sort. |
| `jwt_decode` | Decode a JWT header + payload (no verification). |
| `regex_test` | Test a regex and return every match and captured group. |
| `cron_describe` | Explain a cron expression and list the next runs. |
| `unit_convert` | Length, mass, data, time, speed, temperature. |
| `datetime` | Current time or a timestamp in any IANA timezone. |
| `url_parse` | Break a URL into scheme, host, path, query, fragment. |
| `base_convert` | Integers between bases 2–36 (BigInt-exact). |
| `diff` | Line-by-line diff of two texts with a change count. |
| `color` | Convert a color between hex, RGB and HSL. |
| `color_palette` | Harmonious palette from one base color. |
| `placeholder_image` | Sized SVG placeholder with a label and colors. |
| `slugify` | Clean, URL-safe slug from a title. |
| `count` | Exact characters, words, lines and UTF-8 bytes. |

The first four are image + cited-data tools; the remaining 18 are deterministic developer utilities for the operations LLMs get wrong. All 22 tools are read-only and safe to expose to autonomous agents.

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

## Citation

If you use Cleanor MCP or its data, please cite it. Authored by Cleanor Labs, [ORCID 0009-0005-4623-961X](https://orcid.org/0009-0005-4623-961X). The archived, citable version has DOI [10.5281/zenodo.21225551](https://doi.org/10.5281/zenodo.21225551) (concept DOI, always resolves to the latest release).
