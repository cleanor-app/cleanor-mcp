import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
import { CORS_HEADERS } from './http';
import { handleRest } from './rest';
import { registerAll } from './tools/registry';
import { buildTools, SERVER_VERSION } from './tools';
import type { ImageEncoder } from './tools/optimize';

interface Env {
  IMAGES: ImagesBinding;
  CleanorMCP: DurableObjectNamespace;
  RL_GENERAL: RateLimit;
  RL_IMAGE: RateLimit;
}

/** Cloudflare Images-backed encoder (also powers the REST /v1/optimize route). */
function makeWorkerEncoder(images: ImagesBinding): ImageEncoder {
  return async (input, { format, width, quality }) => {
    const mime = `image/${format}` as 'image/webp' | 'image/avif' | 'image/jpeg';
    let pipeline = images.input(new Response(input).body as ReadableStream<Uint8Array>);
    if (width) pipeline = pipeline.transform({ width });
    const result = await pipeline.output({ format: mime, quality });
    return new Uint8Array(await result.response().arrayBuffer());
  };
}

function rateLimited(msg: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: msg }, id: null }),
    {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '30', ...CORS_HEADERS },
    },
  );
}

export class CleanorMCP extends McpAgent<Env, unknown, Record<string, never>> {
  server = new McpServer(
    { name: 'cleanor', version: SERVER_VERSION },
    {
      instructions:
        'Cleanor tools for AI builders. Use optimize_image to shrink/convert an image an AI generated or dropped in (returns the optimized bytes + before/after size). Use storage_capacity and image_format_savings for real, cited Cleanor Labs data on device storage and image formats. Use qr_code for a paste-ready SVG QR. No API key needed. Every result links its cleanor.app source.',
    },
  );

  async init() {
    registerAll(this.server, buildTools(makeWorkerEncoder(this.env.IMAGES)));
  }
}

const LANDING = `Cleanor MCP — asset + real-data tools for AI builders.
Streamable HTTP endpoint: /mcp
REST: POST /v1/optimize  ·  GET /v1/capabilities
Tools: optimize_image, storage_capacity, image_format_savings, qr_code
By Cleanor Labs — https://cleanor.app`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight (browser-based MCP clients / playgrounds / the WP plugin).
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(LANDING, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'public, max-age=3600',
          ...CORS_HEADERS,
        },
      });
    }

    const encode = makeWorkerEncoder(env.IMAGES);

    // REST /v1 surface. Rate-limit the image route per IP (same budget as MCP's
    // image tool) before doing any heavy work.
    if (url.pathname.startsWith('/v1/')) {
      if (url.pathname.replace(/\/+$/, '') === '/v1/optimize' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';
        const general = await env.RL_GENERAL.limit({ key: ip });
        if (!general.success) return rateLimited('Too many requests. Try again in a moment.');
        const img = await env.RL_IMAGE.limit({ key: ip });
        if (!img.success)
          return rateLimited(
            'Image optimization limit reached (30/min per IP). Try again shortly.',
          );
      }
      const rest = await handleRest(request, encode, buildTools(encode));
      if (rest) return rest;
    }

    // MCP tool traffic — rate limit per IP so an abusive client can't burn the
    // image/CPU budget. Generous for real sessions; strict for the image tool.
    if (url.pathname === '/mcp' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'anon';
      const general = await env.RL_GENERAL.limit({ key: ip });
      if (!general.success) return rateLimited('Too many requests. Try again in a moment.');
      let bodyText = '';
      try {
        bodyText = await request.clone().text();
      } catch {
        /* body not readable; skip the image-specific check */
      }
      if (bodyText.includes('"optimize_image"')) {
        const img = await env.RL_IMAGE.limit({ key: ip });
        if (!img.success) {
          return rateLimited(
            'Image optimization limit reached (30/min per IP). Try again shortly.',
          );
        }
      }
    }

    const resp = await CleanorMCP.serve('/mcp', { binding: 'CleanorMCP' }).fetch(request, env, ctx);
    const headers = new Headers(resp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
  },
};
