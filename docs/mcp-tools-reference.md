# What tools does the Cleanor MCP server provide?

Cleanor MCP exposes **22 tools** over one zero-auth endpoint, `https://mcp.cleanor.app/mcp`: one image optimizer, two cited-research lookups, an SVG QR generator, an SVG placeholder generator, and 17 deterministic developer utilities. Every tool declares an input schema **and** an output schema, so clients receive typed `structuredContent` alongside the human-readable text, and every tool is annotated `readOnlyHint: true`.

You can always fetch the live list yourself: `GET https://mcp.cleanor.app/v1/capabilities`.

Shared limits: text inputs are capped at 100,000 characters, images at 25 MB, and the hosted endpoint rate-limits to 120 requests per minute per IP (30 per minute for `optimize_image`).

---

## optimize_image

Fetches an image from a public URL and re-encodes it smaller, optionally resizing. Returns the optimized image bytes plus the savings. The only tool that touches the network (`openWorldHint: true`).

**Input**: `image_url` string, URL, required. `format` enum `webp` | `avif` | `jpeg`, default `webp`. `width` integer 16 to 4096, optional. `quality` integer 1 to 100, default `80`.

**Output**: `format` string, `original_bytes` number, `optimized_bytes` number, `saved_pct` number, `mime_type` string.

```json
{ "image_url": "https://example.com/hero.png", "format": "avif", "width": 1200, "quality": 80 }
```

## storage_capacity

How many photos or minutes of video actually fit in a storage tier, corrected for real OS and filesystem overhead, from measured per-item sizes.

**Input**: `storage_gb` number 1 to 4096, required. `content` enum `photos` | `video`, default `photos`.

**Output**: `storage_gb` number, `usable_gb` number, `content` string, `breakdown` array of `{ label, count, unit }` (one row per capture format: HEIC 12 MP, JPEG 12 MP, HEIF 48 MP, ProRAW 48 MP, or 1080p, 4K 30, 4K 60, ProRes 4K).

## image_format_savings

How much smaller WebP, AVIF or JPEG XL are than JPEG at matched perceptual quality, from a controlled benchmark on the 24-image Kodak lossless suite. Also reports the HEIC conversion tax.

**Input**: `format` enum `webp` | `avif` | `jxl`, default `avif`. `quality` enum `web` (SSIM 0.95) | `high` (SSIM 0.98), default `web`.

**Output**: `format` string, `quality` string, `percent_smaller_than_jpeg` number, `all_formats` object `{ avif, webp, jxl }`, `source` string (the study URL).

## qr_code

Encodes text or a URL as a dependency-free SVG QR code.

**Input**: `text` string 1 to 2000 chars, required. `ecc` enum `L` | `M` | `Q` | `H`, default `M` (7%, 15%, 25%, 30% recoverable). `size` integer 64 to 1024, default `320`.

**Output**: `svg` string.

## placeholder_image

A lightweight SVG placeholder at any size, with a label and custom colors. No hotlinking a placeholder service.

**Input**: `width` integer 1 to 4000, default `600`. `height` integer 1 to 4000, default `400`. `bg` string, default `#e5e7eb`. `color` string, default `#6b7280`. `text` string up to 120 chars, optional (defaults to the dimensions).

**Output**: `svg` string, `width` number, `height` number.

## hash

SHA-1, SHA-256, SHA-384 or SHA-512 digest of text, as hex. MD5 is deliberately not offered: it is broken, and it is not in Web Crypto.

**Input**: `input` string, required. `algorithm` enum `sha-256` | `sha-1` | `sha-384` | `sha-512`, default `sha-256`.

**Output**: `algorithm` string, `hex` string.

## hmac

Keyed HMAC signature of a message, for signing or verifying webhooks.

**Input**: `message` string, required. `secret` string up to 4096 chars, required. `algorithm` enum `sha-256` | `sha-1` | `sha-384` | `sha-512`, default `sha-256`. `encoding` enum `hex` | `base64`, default `hex`.

**Output**: `algorithm` string, `encoding` string, `signature` string.

## uuid

Generates UUIDs. v4 is fully random; v7 is time-sortable and is the better database key.

**Input**: `version` enum `v4` | `v7`, default `v4`. `count` integer 1 to 100, default `1`.

**Output**: `version` string, `uuids` array of strings.

## base64

Base64 encode or decode, UTF-8 safe, with an optional URL-safe alphabet (`-_`, no padding).

**Input**: `input` string, required. `mode` enum `encode` | `decode`, default `encode`. `url_safe` boolean, default `false`.

**Output**: `mode` string, `result` string.

## json_format

Validates JSON, then pretty-prints (2-space) or minifies it, optionally deep-sorting object keys. An invalid document returns a parse error with its position rather than a guess.

**Input**: `input` string, required. `mode` enum `pretty` | `minify`, default `pretty`. `sort_keys` boolean, default `false`.

**Output**: `valid` boolean, `formatted` string.

## jwt_decode

Decodes a JWT header and payload so you can read the claims. The signature is **not** verified and no secret is required or stored.

**Input**: `token` string, required (three dot-separated segments).

**Output**: `header` object, `payload` object, `exp_iso` string (optional, present when the token carries `exp`), `expired` boolean (optional).

## regex_test

Runs a JavaScript regex against sample text and returns every match with its index and captured groups. Results are capped at 100 matches.

**Input**: `pattern` string up to 1000 chars, required. `input` string up to 20,000 chars, required. `flags` string, default `g`, allowed `g i m s u y d`.

**Output**: `matched` boolean, `match_count` number, `truncated` boolean, `matches` array of `{ index, match, groups }`.

## cron_describe

Parses a standard 5-field cron expression (minute, hour, day-of-month, month, day-of-week) into plain English and computes the next run times.

**Input**: `expression` string up to 200 chars, required, e.g. `30 2 * * 1-5`.

**Output**: `minute`, `hour`, `day_of_month`, `month`, `day_of_week` strings, plus `next_runs`, an array of up to 5 UTC ISO 8601 timestamps.

## unit_convert

Exact conversion within a category. Length: `mm cm m km in ft yd mi nmi`. Mass: `mg g kg t oz lb st`. Data: `bit byte kb kib mb mib gb gib tb tib`. Time: `ms s min h day week`. Speed: `mps kph mph fps knot`. Temperature: `c f k`.

**Input**: `value` number, required. `from` string, required. `to` string, required (same category as `from`).

**Output**: `value` number, `from` string, `to` string, `result` number, `category` string.

## datetime

The real current time, or any timestamp you pass, rendered in an IANA timezone. A model cannot know the current time; this tool can.

**Input**: `input` string, optional (a Unix timestamp in seconds or milliseconds, or an ISO string; omit for now). `timezone` string, default `UTC`.

**Output**: `timezone` string, `local` string (human-readable), `iso_utc` string, `unix_s` number, `unix_ms` number.

## url_parse

Splits an absolute URL into its parts, with the query string decoded into pairs.

**Input**: `url` string up to 4000 chars, required.

**Output**: `scheme`, `host`, `port`, `path`, `fragment` strings, `query` array of `{ key, value }`, and `username` string when present.

## base_convert

Converts an integer between bases 2 and 36. BigInt-backed, so very large values stay exact.

**Input**: `value` string, required (written in `from_base`). `from_base` integer 2 to 36, default `10`. `to_base` integer 2 to 36, default `16`.

**Output**: `input` string, `from_base` number, `to_base` number, `result` string, `decimal` string.

## diff

Line-by-line diff of two texts: removed lines prefixed `-`, added `+`, unchanged with two spaces. Up to 1000 lines per side.

**Input**: `a` string, required (the "before" text). `b` string, required (the "after" text).

**Output**: `changed` boolean, `added` number, `removed` number, `diff` string (empty when identical).

## color

Converts one color into hex, RGB and HSL at once. Accepts hex (3 or 6 digit), `rgb()`, `hsl()` and common CSS color names.

**Input**: `value` string up to 64 chars, required.

**Output**: `hex` string, `rgb` string, `hsl` string.

## color_palette

Derives a harmonious palette from one base color using color-theory rules.

**Input**: `color` string, required. `harmony` enum `complementary` | `analogous` | `triadic` | `tetradic` | `monochromatic`, default `analogous`.

**Output**: `harmony` string, `base` string (hex), `colors` array of `{ hex, hsl }`.

## slugify

Turns a title into a clean, URL-safe slug: lowercased, hyphenated, accents stripped.

**Input**: `input` string up to 2000 chars, required. `separator` enum `-` | `_`, default `-`.

**Output**: `slug` string.

## count

Exact text measurement. Models are notoriously bad at counting, so this is the tool to reach for on any "how many characters" question.

**Input**: `input` string, required (may be empty).

**Output**: `characters` number (Unicode code points), `utf16_units` number, `words` number, `lines` number, `bytes` number (UTF-8).

---

## Calling a tool over raw HTTP

After `initialize`, a `tools/call` looks like this:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "unit_convert",
    "arguments": { "value": 1, "from": "gib", "to": "mb" }
  }
}
```

Send it to `https://mcp.cleanor.app/mcp` with `content-type: application/json`, `accept: application/json, text/event-stream` and the `mcp-session-id` header returned by `initialize`.

## Related

- [How to add an MCP server to Claude Code](add-an-mcp-server-to-claude-code.md)
- [MCP server for image optimization](mcp-server-for-image-optimization.md)
- [cleanor.app/mcp](https://cleanor.app/mcp) and the hosted endpoint at [mcp.cleanor.app](https://mcp.cleanor.app)
