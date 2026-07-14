# Publishing / listing the Cleanor MCP

## Official MCP Registry — LIVE ✅

- **Listing:** `app.cleanor/cleanor` — https://registry.modelcontextprotocol.io/v0/servers?search=app.cleanor
- **Namespace:** `app.cleanor` (reverse-DNS of `cleanor.app`), proven via a DNS TXT record on the **apex** `cleanor.app`:
  `v=MCPv1; k=ed25519; p=…` (SPF-style apex placement, NOT a `_mcp` selector).
- The registry is the master source many directories (Glama / PulseMCP / mcp.so) sync from.

### Re-publish (after editing tools, description, or bumping version)

```bash
# in this mcp/ directory
brew install mcp-publisher                 # first time only (v1.7.9+)

# 1. edit server.json — NOTE: description MUST be <= 100 characters, bump "version"

# 2. auth (needs the Ed25519 private key hex generated when the TXT record was created;
#    if lost, regenerate a key, update the apex TXT record, then log in again)
mcp-publisher login dns --domain cleanor.app --private-key <PRIVATE_KEY_HEX>

# 3. publish
mcp-publisher publish
```

`server.json` describes a **remote** server (`remotes: [{ type: "streamable-http", url: ".../mcp" }]`),
and now also carries `packages` (the npm package `@cleanor/mcp`) and `repository`, since this repo is public.

### Regenerate the keypair + TXT record (if the private key is lost)

```bash
openssl genpkey -algorithm Ed25519 -out key.pem
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "cleanor.app. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""   # add this at the apex, replacing the old one
PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n')"
# use $PRIVATE_KEY as --private-key above. macOS system openssl is 3.x → Ed25519 works.
```

## Other directories (manual — need a human login)

| Directory | How | Notes |
|---|---|---|
| PulseMCP | pulsemcp.com → "Submit" (top nav) | also ingests the official registry |
| Smithery | smithery.ai → "Add Server", or `smithery mcp publish` | scan-based; a remote-only server may need an `mcp-remote` shim to be introspected |
| mcp.so | mcp.so submit form | large directory (~20k servers) |
| Glama | glama.ai/mcp → claim + verify your listing | auto-crawls; claiming lets you control copy/links |
| awesome-mcp-servers | PR to `punkpeye/awesome-mcp-servers` | GitHub list |

Every registry wants: name, description, transport (`streamable-http`), auth (`none`),
tool list (`optimize_image`, `storage_capacity`, `image_format_savings`, `qr_code`),
homepage (`https://mcp.cleanor.app`), and the connect URL `https://mcp.cleanor.app/mcp`.
