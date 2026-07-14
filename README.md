# Cleanor MCP: a zero-auth MCP server for image optimization and dev utilities

**A hosted, zero-auth MCP server with 22 tools: optimize and convert images, generate QR codes, and run the deterministic dev utilities LLMs get wrong.**

[![npm](https://img.shields.io/npm/v/@cleanor/mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/@cleanor/mcp)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-app.cleanor%2Fcleanor-6b46c1)](https://registry.modelcontextprotocol.io/v0/servers?search=app.cleanor)
[![smithery](https://smithery.ai/badge/hello-ha8x/cleanor)](https://smithery.ai/servers/hello-ha8x/cleanor)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21225551.svg)](https://doi.org/10.5281/zenodo.21225551)

No API key. No signup. No OAuth. Point any [Model Context Protocol](https://modelcontextprotocol.io) client at one URL and 22 tools appear, all read-only and safe to hand to an autonomous agent.

| | |
|---|---|
| **Streamable HTTP endpoint** | `https://mcp.cleanor.app/mcp` |
| **npm package (stdio)** | [`@cleanor/mcp`](https://www.npmjs.com/package/@cleanor/mcp) |
| **Official MCP Registry** | [`app.cleanor/cleanor`](https://registry.modelcontextprotocol.io/v0/servers?search=app.cleanor) |
| **Homepage** | [cleanor.app/mcp](https://cleanor.app/mcp) |
| **Auth** | none |
| **Tools** | 22 |
| **Version** | 0.6.0 |

## Install

Pick your client. Every option below points at the same hosted server, so there is nothing to build, install or key.

### Claude Code

```bash
claude mcp add --transport http cleanor https://mcp.cleanor.app/mcp
```

Then run `claude mcp list` to confirm it connected. Full walkthrough: [docs/add-an-mcp-server-to-claude-code.md](docs/add-an-mcp-server-to-claude-code.md).

### Cursor

Add to `.cursor/mcp.json` (per project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "cleanor": {
      "url": "https://mcp.cleanor.app/mcp"
    }
  }
}
```

### VS Code

Run `code --add-mcp '{"name":"cleanor","type":"http","url":"https://mcp.cleanor.app/mcp"}'`, or add the server to `.vscode/mcp.json` in the workspace:

```json
{
  "servers": {
    "cleanor": {
      "type": "http",
      "url": "https://mcp.cleanor.app/mcp"
    }
  }
}
```

### Claude Desktop

Open Settings, then Connectors, then "Add custom connector", and paste the endpoint:

```
https://mcp.cleanor.app/mcp
```

Or run the server locally over stdio from `claude_desktop_config.json`:

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

The npm build is the same tool registry compiled for Node. It uses [`sharp`](https://sharp.pixelplumbing.com/) (an optional dependency) for local image encoding; the other 21 tools need nothing.

### Raw Streamable HTTP

The endpoint speaks the MCP Streamable HTTP transport, so you can drive it with `curl` or any HTTP client:

```bash
curl -s https://mcp.cleanor.app/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2025-06-18","capabilities":{},
                 "clientInfo":{"name":"curl","version":"1"}}}'
```

There is also a plain REST surface for non-MCP callers: `GET /v1/capabilities` (feature detection, machine-readable tool list) and `POST /v1/optimize` (one image in, optimized bytes out).

## Tools

22 tools, every one of them carrying an input **and** an output schema, so a client gets typed `structuredContent` back and not just a wall of text.

### Image

| Tool | What it does | Key params |
|---|---|---|
| `optimize_image` | Fetches an image from a public URL and re-encodes it smaller. Returns the optimized image plus before and after byte counts. Input capped at 25 MB. | `image_url` (required), `format` (`webp` \| `avif` \| `jpeg`, default `webp`), `width` (16 to 4096 px, optional), `quality` (1 to 100, default 80) |
| `placeholder_image` | Dependency-free SVG placeholder at any size, with a label and custom colors. | `width` (default 600), `height` (default 400), `bg`, `color`, `text` |
| `qr_code` | Encodes text or a URL as a crisp SVG QR code you can paste anywhere. | `text` (required, up to 2000 chars), `ecc` (`L` \| `M` \| `Q` \| `H`, default `M`), `size` (64 to 1024, default 320) |

### Cited data (Cleanor Labs research)

| Tool | What it does | Key params |
|---|---|---|
| `storage_capacity` | How many photos or minutes of video actually fit in a storage tier, corrected for real OS and filesystem overhead. Returns a per-format breakdown. | `storage_gb` (required, 1 to 4096), `content` (`photos` \| `video`, default `photos`) |
| `image_format_savings` | How much smaller WebP, AVIF or JPEG XL are than JPEG at matched perceptual quality, from a controlled benchmark on the 24-image Kodak suite. Also reports the HEIC conversion tax. | `format` (`webp` \| `avif` \| `jxl`, default `avif`), `quality` (`web` = SSIM 0.95, `high` = SSIM 0.98, default `web`) |

### Dev utilities

The operations an LLM is unreliable at: hashing, counting, radix math, timezones. Pure compute, no network, no state.

| Tool | What it does | Key params |
|---|---|---|
| `hash` | SHA-1/256/384/512 hex digest of text. MD5 is deliberately not offered. | `input` (required), `algorithm` (default `sha-256`) |
| `hmac` | Keyed HMAC signature, hex or Base64. For signing and verifying webhooks. | `message` (required), `secret` (required), `algorithm` (default `sha-256`), `encoding` (`hex` \| `base64`) |
| `uuid` | UUID v4 (random) or v7 (time-sortable, the better database key). | `version` (`v4` \| `v7`, default `v4`), `count` (1 to 100) |
| `base64` | Base64 encode or decode, UTF-8 safe, optional URL-safe alphabet. | `input` (required), `mode` (`encode` \| `decode`), `url_safe` (boolean) |
| `json_format` | Validates JSON, then pretty-prints or minifies it, optionally deep-sorting keys. Returns a precise parse error if invalid. | `input` (required), `mode` (`pretty` \| `minify`), `sort_keys` (boolean) |
| `jwt_decode` | Decodes a JWT header and payload and flags expiry. The signature is **not** verified and no secret is needed. | `token` (required) |
| `regex_test` | Runs a JavaScript regex against sample text and returns every match with its index and captured groups (first 100). | `pattern` (required), `input` (required), `flags` (default `g`) |
| `cron_describe` | Explains a 5-field cron expression in plain English and lists the next 5 run times in UTC. | `expression` (required) |
| `unit_convert` | Exact conversion across length, mass, data size, time, speed and temperature. | `value` (required), `from` (required), `to` (required) |
| `datetime` | The real current time, or any timestamp, rendered in an IANA timezone as ISO, Unix and human forms. | `input` (optional Unix timestamp or ISO string), `timezone` (default `UTC`) |
| `url_parse` | Splits a URL into scheme, host, port, path, decoded query params and fragment. | `url` (required) |
| `base_convert` | Integer conversion between bases 2 and 36, BigInt-exact so large values stay exact. | `value` (required), `from_base` (default 10), `to_base` (default 16) |
| `diff` | Line-by-line diff of two texts with an added and removed count. Up to 1000 lines per side. | `a` (required), `b` (required) |
| `color` | Converts one color into hex, RGB and HSL at once. Accepts hex, `rgb()`, `hsl()` and CSS names. | `value` (required) |
| `color_palette` | Derives a harmonious palette from one base color. | `color` (required), `harmony` (`complementary` \| `analogous` \| `triadic` \| `tetradic` \| `monochromatic`) |
| `slugify` | Clean, URL-safe slug from a title: lowercased, hyphenated, accents stripped. | `input` (required), `separator` (`-` \| `_`) |
| `count` | Exact characters (code points), UTF-16 units, words, lines and UTF-8 bytes. | `input` (required) |

Every tool is annotated `readOnlyHint: true`. Only `optimize_image` touches the network (`openWorldHint: true`); the other 21 are pure functions of their input.

Full input and output schemas: [docs/mcp-tools-reference.md](docs/mcp-tools-reference.md).

## Tool index (CSV)

[data/tools.csv](data/tools.csv) is the same 22 tools as a flat, machine-readable table: name, title, category (`image`, `data`, `dev`), summary, required and optional parameters, and output fields. Every value is taken from the tool's schema in `src/tools/`. Handy for diffing releases, feeding an MCP directory, or comparing this server against another.

## Docs

| Page | What it answers |
|---|---|
| [How to add an MCP server to Claude Code](docs/add-an-mcp-server-to-claude-code.md) | The `claude mcp add` command for stdio, HTTP and SSE servers, the three config scopes, and how to debug a server that will not connect. |
| [MCP server for image optimization](docs/mcp-server-for-image-optimization.md) | How to let an AI agent compress and convert images (WebP, AVIF, JPEG) through MCP, and the measured savings per format. |
| [MCP tools reference](docs/mcp-tools-reference.md) | All 22 tools, one section each, with the complete input and output schema and an example call. |

## FAQ

### Is Cleanor MCP free?

Yes. It is free to use, with no account, no API key and no paid tier. The hosted endpoint is rate-limited per IP (120 requests per minute in general, 30 per minute for image optimization) so one client cannot starve the rest, and the source is MIT licensed if you would rather run it yourself.

### Does it need an API key?

No. Auth is `none`, which you can verify for yourself at `GET https://mcp.cleanor.app/v1/capabilities`. There is no signup, no OAuth flow and no token to rotate. Point your client at `https://mcp.cleanor.app/mcp` and start calling tools.

### What data does it send?

Only what you pass to a tool. 21 of the 22 tools are pure functions evaluated on the server, and `optimize_image` additionally fetches the public image URL you hand it. There is no account, no user identifier, and no database or object store in the server: it is a single Cloudflare Worker with no persistence binding for your inputs. If your data is sensitive, run the stdio build locally with `npx -y @cleanor/mcp` and nothing leaves your machine.

### Can I self-host it?

Yes, in two ways. Run it locally over stdio with `npx -y @cleanor/mcp` (the same tool registry, with `sharp` doing the image encoding instead of Cloudflare Images), or deploy this repo to your own Cloudflare account with `wrangler deploy`, since the Worker entry point and `wrangler.jsonc` are both in the tree. The `Dockerfile` builds the stdio server for registries and scanners that prefer to start it themselves.

### How is a hosted MCP server different from a local MCP server?

A local (stdio) server is a process your client spawns on your machine: it can reach your filesystem, but you have to install it, keep it updated and carry its dependencies. A hosted (Streamable HTTP) server is just a URL: no install, no version drift, and the heavy work runs on someone else's CPU. Cleanor MCP is offered both ways, and the hosted endpoint is the one to prefer for image optimization, because Cloudflare Images does the encoding and you never install `sharp`.

### Which clients work with it?

Any MCP client that speaks Streamable HTTP: Claude Code, Claude Desktop (as a custom connector), Cursor, VS Code, and the agent frameworks with MCP support. Clients that only speak stdio can run the npm package instead. Both paths expose the identical 22 tools, because both register the same tool array from `src/tools/`.

### Where does the research data come from?

`storage_capacity` and `image_format_savings` return numbers from Cleanor Labs' published studies, not from model memory. The format savings come from a controlled benchmark on the 24-image Kodak lossless suite at matched SSIM; the storage numbers come from measured per-item file sizes plus real OS overhead. Every response links its source page on [cleanor.app/research](https://cleanor.app/research).

## Related projects

| Repo | What it is |
|---|---|
| [cleanor-app/browser-image-tools](https://github.com/cleanor-app/browser-image-tools) | The in-browser image compression and conversion engine behind cleanor.app. |
| [cleanor-app/image-compressor-chrome-extension](https://github.com/cleanor-app/image-compressor-chrome-extension) | Chrome extension: compress, convert and capture images without leaving the page. |
| [cleanor-app/wordpress-image-optimizer](https://github.com/cleanor-app/wordpress-image-optimizer) | WordPress plugin that optimizes and converts your media library. |
| [cleanor-app/cleanor-storage-lab](https://github.com/cleanor-app/cleanor-storage-lab) | The open benchmarks behind the storage and image-format studies. |
| [cleanor-app/search-index](https://github.com/cleanor-app/search-index) | Open dataset of monthly search demand, the source for the Cleanor trends studies. |

## Built by Cleanor Labs

[Cleanor](https://cleanor.app) is a set of free, private browser tools (files never leave your device) plus original research on device storage and image formats. This MCP server is a thin front door to that toolset and that data, for AI agents.

- Free browser tools: https://cleanor.app/tools
- Research and studies: https://cleanor.app/research
- MCP homepage: https://cleanor.app/mcp

## License

MIT, Cleanor Labs.

## Citation

If you use Cleanor MCP or its data, please cite it. Authored by Cleanor Labs, [ORCID 0009-0005-4623-961X](https://orcid.org/0009-0005-4623-961X). The archived, citable version has DOI [10.5281/zenodo.21225551](https://doi.org/10.5281/zenodo.21225551), a concept DOI that always resolves to the latest release. Machine-readable metadata lives in [CITATION.cff](CITATION.cff).
