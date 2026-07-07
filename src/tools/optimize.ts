// Image optimization: one core, three surfaces.
//
// `optimizeBytes` is the pure engine. It takes an `ImageEncoder` (Cloudflare
// Images in the Worker, sharp in the stdio build) so the same logic backs the
// MCP `optimize_image` tool AND the REST /v1/optimize endpoint used by the
// WordPress plugin.

import { z } from 'zod';
import { ATTRIBUTION } from '../data';
import { defineTool, errText, kb, toBase64, type ToolDef } from './registry';

export const OPTIMIZE_FORMATS = ['webp', 'avif', 'jpeg'] as const;
export type OptimizeFormat = (typeof OPTIMIZE_FORMATS)[number];
export const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB (v1 limit)

export interface OptimizeOpts {
  format: OptimizeFormat;
  width?: number;
  quality: number;
}

/** Re-encode raw image bytes. Implemented per-runtime. */
export type ImageEncoder = (input: ArrayBuffer, opts: OptimizeOpts) => Promise<Uint8Array>;

export interface OptimizeResult {
  bytes: Uint8Array;
  mime: `image/${OptimizeFormat}`;
  originalBytes: number;
  newBytes: number;
  savedPct: number;
}

/** The shared engine: validate size, encode, report savings. */
export async function optimizeBytes(
  encode: ImageEncoder,
  input: ArrayBuffer,
  opts: OptimizeOpts,
): Promise<OptimizeResult> {
  const originalBytes = input.byteLength;
  if (originalBytes === 0) throw new Error('Empty image.');
  if (originalBytes > MAX_INPUT_BYTES) throw new Error('Image is larger than 25 MB (v1 limit).');
  const bytes = await encode(input, opts);
  const newBytes = bytes.byteLength;
  return {
    bytes,
    mime: `image/${opts.format}` as OptimizeResult['mime'],
    originalBytes,
    newBytes,
    savedPct: originalBytes > 0 ? Math.round((1 - newBytes / originalBytes) * 100) : 0,
  };
}

/** Build the MCP `optimize_image` tool bound to a given encoder. */
export function makeOptimizeImageTool(encode: ImageEncoder): ToolDef {
  return defineTool(
    'optimize_image',
    {
      title: 'Optimize / convert an image for the web',
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        'Fetch an image from a public URL and re-encode it smaller (WebP/AVIF/JPEG), optionally resizing to a target width. Returns the optimized image plus before/after byte sizes. Use this when an AI-generated or dropped-in asset (hero image, screenshot, illustration) is too large to ship.',
      inputSchema: {
        image_url: z
          .string()
          .url()
          .describe('Public URL of the source image (PNG/JPEG/WebP/AVIF/GIF).'),
        format: z
          .enum(OPTIMIZE_FORMATS)
          .default('webp')
          .describe(
            'Output format. webp = best browser support; avif = smallest; jpeg = universal.',
          ),
        width: z
          .number()
          .int()
          .min(16)
          .max(4096)
          .optional()
          .describe(
            'Resize to this width in px, preserving aspect ratio. Omit to keep original size.',
          ),
        quality: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(80)
          .describe('Encode quality 1-100 (80 is a good default).'),
      },
    },
    async ({ image_url, format, width, quality }) => {
      try {
        const res = await fetch(image_url);
        if (!res.ok) return errText(`Could not fetch the image (HTTP ${res.status}).`);
        const r = await optimizeBytes(encode, await res.arrayBuffer(), { format, width, quality });
        return {
          content: [
            { type: 'image' as const, data: toBase64(r.bytes), mimeType: r.mime },
            {
              type: 'text' as const,
              text:
                `Optimized to ${format.toUpperCase()}${width ? ` @ ${width}px wide` : ''}, quality ${quality}.\n` +
                `Before: ${kb(r.originalBytes)}  →  After: ${kb(r.newBytes)}  (${r.savedPct}% smaller)\n\n` +
                `Batch-optimize in your browser, no upload: https://cleanor.app/tools?utm_source=mcp\n` +
                ATTRIBUTION.brand,
            },
          ],
        };
      } catch (e) {
        return errText(`Optimize failed: ${(e as Error).message}`);
      }
    },
  );
}
