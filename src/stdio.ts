// Standalone, locally-runnable stdio build of the Cleanor MCP server.
//
// The production server is a Cloudflare Worker (see index.ts) hosted at
// https://mcp.cleanor.app/mcp. This file exposes the exact same four tools over
// stdio using only Node + npm packages, so registries that build and run the
// server locally (e.g. Glama) can start it and run introspection.
//
// The three data/QR tools are identical to production. optimize_image here uses
// `sharp` (an optional dependency) instead of the Cloudflare Images binding.
//
// Run: `npx tsx src/stdio.ts`  (or `npm run stdio`)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { encodeQr, qrToSvg, type QrEcc } from './qr';
import {
  ATTRIBUTION,
  usableGb,
  PHOTO_ITEMS,
  VIDEO_ITEMS,
  STORAGE_STUDY,
  FORMAT_SAVINGS,
  HEIC_TAX,
} from './data';

const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
const errText = (msg: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: msg }],
});

const server = new McpServer(
  { name: 'cleanor', version: '0.1.1' },
  {
    instructions:
      'Cleanor tools for AI builders. Use optimize_image to shrink/convert an image an AI generated or dropped in (returns the optimized bytes + before/after size). Use storage_capacity and image_format_savings for real, cited Cleanor Labs data on device storage and image formats. Use qr_code for a paste-ready SVG QR. No API key needed. Every result links its cleanor.app source.',
  },
);

// 1) optimize_image — re-encode a web image smaller (sharp).
server.registerTool(
  'optimize_image',
  {
    title: 'Optimize / convert an image for the web',
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      'Fetch an image from a public URL and re-encode it smaller (WebP/AVIF/JPEG), optionally resizing to a target width. Returns the optimized image plus before/after byte sizes. Use this when an AI-generated or dropped-in asset (hero image, screenshot, illustration) is too large to ship.',
    inputSchema: {
      image_url: z.string().url().describe('Public URL of the source image (PNG/JPEG/WebP/AVIF/GIF).'),
      format: z
        .enum(['webp', 'avif', 'jpeg'])
        .default('webp')
        .describe('Output format. webp = best browser support; avif = smallest; jpeg = universal.'),
      width: z
        .number()
        .int()
        .min(16)
        .max(4096)
        .optional()
        .describe('Resize to this width in px, preserving aspect ratio. Omit to keep original size.'),
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
      const original = Buffer.from(await res.arrayBuffer());
      const originalBytes = original.byteLength;
      if (originalBytes > 25 * 1024 * 1024) return errText('Image is larger than 25 MB (v1 limit).');

      let sharp: typeof import('sharp').default;
      try {
        sharp = (await import('sharp')).default;
      } catch {
        return errText(
          'This local build needs the optional "sharp" dependency for optimize_image. Install it, or use the zero-setup hosted endpoint: https://mcp.cleanor.app/mcp',
        );
      }

      let pipeline = sharp(original);
      if (width) pipeline = pipeline.resize({ width });
      const optimized =
        format === 'webp'
          ? await pipeline.webp({ quality }).toBuffer()
          : format === 'avif'
            ? await pipeline.avif({ quality }).toBuffer()
            : await pipeline.jpeg({ quality }).toBuffer();

      const newBytes = optimized.byteLength;
      const savedPct = originalBytes > 0 ? Math.round((1 - newBytes / originalBytes) * 100) : 0;
      const mime = `image/${format}` as 'image/webp' | 'image/avif' | 'image/jpeg';

      return {
        content: [
          { type: 'image' as const, data: optimized.toString('base64'), mimeType: mime },
          {
            type: 'text' as const,
            text:
              `Optimized to ${format.toUpperCase()}${width ? ` @ ${width}px wide` : ''}, quality ${quality}.\n` +
              `Before: ${kb(originalBytes)}  →  After: ${kb(newBytes)}  (${savedPct}% smaller)\n\n` +
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

// 2) storage_capacity — how many photos / minutes of video fit (Cleanor Labs data).
server.registerTool(
  'storage_capacity',
  {
    title: 'How much fits in a phone storage tier',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      'How many photos or minutes of video actually fit in a given storage size, corrected for real OS/filesystem overhead. Backed by Cleanor Labs measured per-item sizes. Use for realistic sample copy, dashboards, or "how many photos fit in 128 GB" answers.',
    inputSchema: {
      storage_gb: z
        .number()
        .min(1)
        .max(4096)
        .describe('Advertised storage size in GB (e.g. 64, 128, 256, 512).'),
      content: z.enum(['photos', 'video']).default('photos').describe('What to count.'),
    },
  },
  async ({ storage_gb, content }) => {
    const usable = usableGb(storage_gb);
    const lines: string[] = [];
    if (content === 'photos') {
      for (const it of Object.values(PHOTO_ITEMS)) {
        lines.push(`  ${it.label}: ${Math.floor((usable * 1000) / it.mb).toLocaleString('en-US')} photos`);
      }
    } else {
      for (const it of Object.values(VIDEO_ITEMS)) {
        const min = Math.floor((usable * 1000) / it.mbPerMin);
        lines.push(`  ${it.label}: ${min.toLocaleString('en-US')} min (~${Math.floor(min / 60)} h)`);
      }
    }
    return {
      content: [
        {
          type: 'text' as const,
          text:
            `A ${storage_gb} GB device has ~${usable} GB usable after OS overhead. It holds:\n` +
            lines.join('\n') +
            `\n\nSource: ${STORAGE_STUDY.source}\nTry it: ${STORAGE_STUDY.tryIt}\n` +
            ATTRIBUTION.brand,
        },
      ],
    };
  },
);

// 3) image_format_savings — real % smaller vs JPEG (Cleanor Labs benchmark).
server.registerTool(
  'image_format_savings',
  {
    title: 'Real storage savings of next-gen image formats',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      'How much smaller WebP, AVIF or JPEG XL are than JPEG at matched perceptual quality, from Cleanor Labs’ controlled benchmark. Also reports the "HEIC conversion tax" (converting an iPhone HEIC to JPG/PNG makes it bigger). Use to justify a format choice when building a site or app.',
    inputSchema: {
      format: z
        .enum(['webp', 'avif', 'jxl'])
        .default('avif')
        .describe('Target format to compare against JPEG.'),
      quality: z
        .enum(['web', 'high'])
        .default('web')
        .describe('web = typical web quality (SSIM 0.95); high = near-lossless (SSIM 0.98).'),
    },
  },
  async ({ format, quality }) => {
    const band = FORMAT_SAVINGS[quality];
    const pct = band[format];
    const label = { webp: 'WebP', avif: 'AVIF', jxl: 'JPEG XL' }[format];
    return {
      content: [
        {
          type: 'text' as const,
          text:
            `${label} is ${Math.abs(pct)}% smaller than JPEG at ${band.label}, measured on the ${FORMAT_SAVINGS.corpus}.\n` +
            `(AVIF ${band.avif}%, WebP ${band.webp}%, JPEG XL ${band.jxl}% vs JPEG.)\n\n` +
            `${HEIC_TAX.note}\n\n` +
            `Source: ${FORMAT_SAVINGS.source}\nRun a real conversion in-browser: https://cleanor.app/tools?utm_source=mcp\n` +
            ATTRIBUTION.brand,
        },
      ],
    };
  },
);

// 4) qr_code — pure-compute utility, returns crisp SVG.
server.registerTool(
  'qr_code',
  {
    title: 'Generate a QR code (SVG)',
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      'Encode text or a URL as a QR code and return a crisp, dependency-free SVG you can paste straight into a page, deck or doc.',
    inputSchema: {
      text: z.string().min(1).max(2000).describe('Text or URL to encode.'),
      ecc: z
        .enum(['L', 'M', 'Q', 'H'])
        .default('M')
        .describe('Error-correction level: L=7%, M=15%, Q=25%, H=30% recoverable.'),
      size: z.number().int().min(64).max(1024).default(320).describe('SVG pixel size.'),
    },
  },
  async ({ text, ecc, size }) => {
    const svg = qrToSvg(encodeQr(text, ecc as QrEcc), { size });
    return {
      content: [
        {
          type: 'text' as const,
          text: `${svg}\n\nMore generators (no signup): https://cleanor.app/tools?utm_source=mcp`,
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
