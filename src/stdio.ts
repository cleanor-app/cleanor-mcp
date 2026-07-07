// Standalone, locally-runnable stdio build of the Cleanor MCP server.
//
// The production server is a Cloudflare Worker (see index.ts) hosted at
// https://mcp.cleanor.app/mcp. This file registers the exact same tools over
// stdio using only Node + npm packages, so registries that build and run the
// server locally (e.g. Glama) can start it and run introspection.
//
// The only runtime difference is the image encoder: sharp here vs the
// Cloudflare Images binding in the Worker. Everything else comes from the
// shared registry in ./tools.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAll } from './tools/registry';
import { buildTools, SERVER_VERSION } from './tools';
import type { ImageEncoder } from './tools/optimize';

// Minimal structural type for the bits of sharp we use, so this file needs no
// @types/sharp and stays lint-clean (no explicit any).
type SharpPipeline = {
  resize(opts: { width: number }): SharpPipeline;
  webp(opts: { quality?: number }): SharpPipeline;
  avif(opts: { quality?: number }): SharpPipeline;
  jpeg(opts: { quality?: number }): SharpPipeline;
  toBuffer(): Promise<Uint8Array>;
};
type SharpFactory = (buf: Uint8Array) => SharpPipeline;

/** sharp-backed encoder (optional dependency; installed locally). */
const sharpEncoder: ImageEncoder = async (input, { format, width, quality }) => {
  // sharp is an optional CJS dependency; load it loosely so the Worker build
  // (which never imports this file) doesn't need its types.
  let sharp: SharpFactory;
  try {
    const mod = (await import('sharp')) as unknown as { default?: SharpFactory } & SharpFactory;
    sharp = mod.default ?? mod;
  } catch {
    throw new Error(
      'This local build needs the optional "sharp" dependency. Install it, or use the zero-setup hosted endpoint: https://mcp.cleanor.app/mcp',
    );
  }
  let pipeline = sharp(new Uint8Array(input));
  if (width) pipeline = pipeline.resize({ width });
  const out =
    format === 'webp'
      ? await pipeline.webp({ quality }).toBuffer()
      : format === 'avif'
        ? await pipeline.avif({ quality }).toBuffer()
        : await pipeline.jpeg({ quality }).toBuffer();
  return new Uint8Array(out);
};

const server = new McpServer(
  { name: 'cleanor', version: SERVER_VERSION },
  {
    instructions:
      'Cleanor tools for AI builders. Use optimize_image to shrink/convert an image an AI generated or dropped in (returns the optimized bytes + before/after size). Use storage_capacity and image_format_savings for real, cited Cleanor Labs data on device storage and image formats. Use qr_code for a paste-ready SVG QR. No API key needed. Every result links its cleanor.app source.',
  },
);

registerAll(server, buildTools(sharpEncoder));

const transport = new StdioServerTransport();
await server.connect(transport);
