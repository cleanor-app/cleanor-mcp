# How do I add an MCP server to Claude Code?

Run `claude mcp add` from your terminal. For a hosted (remote) server you pass the URL, for a local one you pass the command that starts it:

```bash
# hosted server, Streamable HTTP
claude mcp add --transport http cleanor https://mcp.cleanor.app/mcp

# local server, stdio
claude mcp add my-server -- npx -y @some/mcp-package
```

That is the whole operation. The rest of this page explains the pieces you will hit the moment you do it for real: transports, scopes, secrets, and what to do when the server shows up as "failed".

## Pick the right transport

MCP servers come in three flavours, and Claude Code needs to know which one it is talking to.

| Transport | When | Command |
|---|---|---|
| `stdio` (default) | The server is an npm package, a binary, or a script you run locally. Claude Code spawns the process and talks to it over stdin/stdout. | `claude mcp add name -- <command> <args>` |
| `http` | The server is hosted at a URL and speaks Streamable HTTP. Nothing to install. | `claude mcp add --transport http name <url>` |
| `sse` | An older remote transport, Server-Sent Events. Some hosted servers still use it. | `claude mcp add --transport sse name <url>` |

Note the `--` in the stdio form. Everything after it is passed to the server process untouched, which is what stops Claude Code from swallowing the server's own flags.

## Pick the right scope

Where the config is written decides who else gets the server.

- `--scope local` (the default): this project, this machine, just you. Good for experiments and anything with a personal token in it.
- `--scope project`: writes to `.mcp.json` at the repo root, which you commit. Everyone who clones the repo gets the server. This is the right scope for a team-wide tool.
- `--scope user`: available to you in every project on this machine. The right scope for a general-purpose server you always want, like a search or docs server.

```bash
claude mcp add --transport http --scope project cleanor https://mcp.cleanor.app/mcp
```

## Pass secrets and headers

Most real servers want a key. Never paste one into a committed `.mcp.json`.

```bash
# stdio: environment variables
claude mcp add github --env GITHUB_TOKEN=$GITHUB_TOKEN -- npx -y @modelcontextprotocol/server-github

# http/sse: request headers
claude mcp add --transport http acme https://api.acme.dev/mcp \
  --header "Authorization: Bearer $ACME_KEY"
```

A server that needs no key at all sidesteps this problem entirely, which is worth weighing when you choose one.

## Verify it connected

```bash
claude mcp list          # every configured server and its connection status
claude mcp get cleanor   # the full config for one server
```

Inside a Claude Code session, the `/mcp` slash command shows live server status and walks you through authentication for servers that need it. If a server is connected, its tools appear to the model automatically, namespaced by server, and you can just ask for them in plain English.

## When the server will not connect

Work through these in order.

1. **Run the command yourself.** For a stdio server, run the exact command from `claude mcp get <name>` in your shell. Nine times out of ten it fails there too: a missing binary, a wrong path, a Node version.
2. **Check the URL, not just the host.** A remote MCP server almost never lives at the root. `https://mcp.cleanor.app` is the site; `https://mcp.cleanor.app/mcp` is the endpoint. Dropping the path is the most common mistake.
3. **Curl the endpoint.** A healthy Streamable HTTP server answers an `initialize` request:

   ```bash
   curl -s https://mcp.cleanor.app/mcp \
     -H 'content-type: application/json' \
     -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
          "params":{"protocolVersion":"2025-06-18","capabilities":{},
                    "clientInfo":{"name":"curl","version":"1"}}}'
   ```

   If curl gets nothing, the problem is the server or your network, not Claude Code.
4. **Read the logs.** Start Claude Code with `claude --debug` to see the MCP handshake and the server's stderr.
5. **Remove and re-add.** `claude mcp remove <name>` then add it again, this time watching for a typo in the transport flag. Adding an HTTP server without `--transport http` makes Claude Code try to execute the URL as a command, and the error message is not obvious.

## A worked example: Cleanor MCP

[Cleanor MCP](https://github.com/cleanor-app/cleanor-mcp) is a useful first server precisely because it removes every variable above: it is hosted, so there is nothing to install, and it is zero-auth, so there is no key, no header and no OAuth dance.

```bash
claude mcp add --transport http cleanor https://mcp.cleanor.app/mcp
claude mcp list
```

You now have 22 read-only tools in the session. Ask Claude Code to "convert this hero image to AVIF at 1200px wide", "give me the SHA-256 of this file's contents", "explain this cron expression and tell me when it next runs", or "how many photos fit in 128 GB", and it will call `optimize_image`, `hash`, `cron_describe` or `storage_capacity` rather than guessing. Every tool ships an output schema, so the model receives typed `structuredContent` instead of parsing prose.

Next: the [full tools reference](mcp-tools-reference.md), or, if images are what brought you here, [how to use an MCP server for image optimization](mcp-server-for-image-optimization.md).
