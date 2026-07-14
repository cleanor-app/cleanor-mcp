# Which MCP server optimizes images?

[Cleanor MCP](https://github.com/cleanor-app/cleanor-mcp) does: connect your AI client to `https://mcp.cleanor.app/mcp` and the `optimize_image` tool will fetch an image from a URL, re-encode it as WebP, AVIF or JPEG, optionally resize it, and hand back the smaller bytes with a before and after byte count. There is no API key and nothing to install, so an agent can compress an asset the moment it notices the asset is too heavy.

This page covers why an agent needs a tool for this at all, how to wire it up, and what the formats are actually worth.

## Why an LLM cannot do this itself

An LLM can tell you that AVIF is smaller than JPEG. It cannot produce the bytes. Image encoding is a binary transform, not a text prediction, so a model without a tool has exactly two options: hand you a broken base64 blob, or tell you to go and run `cwebp` yourself. Neither is useful inside an agent loop that just generated a 2.4 MB hero image and is about to commit it.

Giving the agent an image-optimization tool closes that loop. The model decides *that* the image should be optimized and *which* format to target; the tool does the encoding.

## Connect it

```bash
# Claude Code
claude mcp add --transport http cleanor https://mcp.cleanor.app/mcp
```

```json
// Cursor: .cursor/mcp.json    VS Code: use "servers" + "type": "http"
{
  "mcpServers": {
    "cleanor": { "url": "https://mcp.cleanor.app/mcp" }
  }
}
```

The hosted endpoint encodes with Cloudflare Images. If you would rather keep the pixels on your own machine, run the same server over stdio with `npx -y @cleanor/mcp`, which encodes with [`sharp`](https://sharp.pixelplumbing.com/) locally. Same tool name, same schema, same result.

## The tool

`optimize_image` takes four parameters:

| Param | Type | Default | Notes |
|---|---|---|---|
| `image_url` | string (URL) | required | Public URL of the source image (PNG, JPEG, WebP, AVIF, GIF). |
| `format` | `webp` \| `avif` \| `jpeg` | `webp` | `webp` is the safe default, `avif` is the smallest, `jpeg` is universal. |
| `width` | integer, 16 to 4096 | none | Resize to this width, preserving aspect ratio. Omit to keep the original size. |
| `quality` | integer, 1 to 100 | `80` | 80 is a good default for the web. |

It returns the optimized image as an image content block, plus typed `structuredContent`:

```json
{
  "format": "avif",
  "original_bytes": 2411008,
  "optimized_bytes": 388214,
  "saved_pct": 84,
  "mime_type": "image/avif"
}
```

Because `saved_pct` comes back as a number rather than as prose, an agent can branch on it: keep the AVIF if it saved more than 30 percent, fall back to WebP otherwise.

Limits worth knowing: the input is capped at 25 MB, and the hosted endpoint rate-limits image calls to 30 per minute per IP (120 per minute for everything else). The tool is annotated `readOnlyHint: true`, so it never writes anything anywhere.

## What each format is actually worth

Guessing at format savings is how teams end up shipping AVIF at a quality setting that makes the file *bigger*. Cleanor MCP ships the measurement as a second tool, `image_format_savings`, so the agent can quote a real number instead of a vibe. The figures come from a controlled benchmark on the 24-image Kodak lossless suite, comparing each format against JPEG at matched perceptual quality:

| Format | vs JPEG at typical web quality (SSIM 0.95) | vs JPEG at high quality (SSIM 0.98) |
|---|---|---|
| AVIF | 36.9% smaller | 17.9% smaller |
| WebP | 21.7% smaller | 6.1% smaller |
| JPEG XL | 18.4% smaller | 6.7% smaller |

Two things fall out of that table. AVIF's advantage is real but it narrows sharply as quality climbs, so the closer you push to lossless, the less any modern format buys you. And WebP, the format with near-universal browser support, still takes a fifth off a JPEG at ordinary web quality, which is why it is the default here.

The same tool reports the **HEIC conversion tax**: converting an iPhone HEIC to a quality-matched JPG makes it roughly 2.5 times bigger, and to PNG roughly 5.5 times bigger, for no visible quality gain. If an agent is about to "helpfully" convert a user's HEIC photos to PNG, this is the number that should stop it.

## Beyond MCP: the REST endpoint

Not every caller is an MCP client. A WordPress plugin or a backend job can hit the same encoder over plain HTTP:

```bash
curl -X POST "https://mcp.cleanor.app/v1/optimize?format=webp&quality=80&width=1200" \
  --data-binary @hero.png -o hero.webp
```

It accepts `multipart/form-data` (field `file`), `application/json` (`{ "image_url": ... }`), or raw bytes with the options in the query string, and returns the optimized bytes directly. Add `Accept: application/json` to get JSON with base64 instead. Savings come back in the `X-Cleanor-Original-Bytes`, `X-Cleanor-Optimized-Bytes` and `X-Cleanor-Saved-Pct` response headers. `GET /v1/capabilities` tells you which formats and limits the server currently supports, so a client can feature-detect rather than hardcode.

## Related

- [Full MCP tools reference](mcp-tools-reference.md), all 22 tools with schemas.
- [How to add an MCP server to Claude Code](add-an-mcp-server-to-claude-code.md).
- [cleanor.app/mcp](https://cleanor.app/mcp), and the free in-browser optimizer at [cleanor.app/tools](https://cleanor.app/tools) where files never leave your device.
