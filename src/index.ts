import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpAgent } from 'agents/mcp';
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

interface Env {
  IMAGES: ImagesBinding;
  CleanorMCP: DurableObjectNamespace;
  RL_GENERAL: RateLimit;
  RL_IMAGE: RateLimit;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
const errText = (msg: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: msg }],
});

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
    { name: 'cleanor', version: '0.1.0' },
    {
      instructions:
        'Cleanor tools for AI builders. Use optimize_image to shrink/convert an image an AI generated or dropped in (returns the optimized bytes + before/after size). Use storage_capacity and image_format_savings for real, cited Cleanor Labs data on device storage and image formats. Use qr_code for a paste-ready SVG QR. No API key needed. Every result links its cleanor.app source.',
    },
  );

  async init() {
    const env = this.env;

    // 1) optimize_image — the flagship. Re-encode a web image smaller.
    this.server.registerTool(
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
          quality: z.number().int().min(1).max(100).default(80).describe('Encode quality 1-100 (80 is a good default).'),
        },
      },
      async ({ image_url, format, width, quality }) => {
        try {
          const res = await fetch(image_url);
          if (!res.ok) return errText(`Could not fetch the image (HTTP ${res.status}).`);
          const original = await res.arrayBuffer();
          const originalBytes = original.byteLength;
          if (originalBytes > 25 * 1024 * 1024) return errText('Image is larger than 25 MB (v1 limit).');

          const mime = `image/${format}` as 'image/webp' | 'image/avif' | 'image/jpeg';
          let pipeline = env.IMAGES.input(new Response(original).body as ReadableStream<Uint8Array>);
          if (width) pipeline = pipeline.transform({ width });
          const result = await pipeline.output({ format: mime, quality });
          const optimized = await result.response().arrayBuffer();
          const newBytes = optimized.byteLength;
          const savedPct = originalBytes > 0 ? Math.round((1 - newBytes / originalBytes) * 100) : 0;

          return {
            content: [
              { type: 'image' as const, data: toBase64(optimized), mimeType: mime },
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

    // 2) storage_capacity — how many photos / minutes of video fit (proprietary data).
    this.server.registerTool(
      'storage_capacity',
      {
        title: 'How much fits in a phone storage tier',
        annotations: { readOnlyHint: true, openWorldHint: false },
        description:
          'How many photos or minutes of video actually fit in a given storage size, corrected for real OS/filesystem overhead. Backed by Cleanor Labs measured per-item sizes. Use for realistic sample copy, dashboards, or "how many photos fit in 128 GB" answers.',
        inputSchema: {
          storage_gb: z.number().min(1).max(4096).describe('Advertised storage size in GB (e.g. 64, 128, 256, 512).'),
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

    // 3) image_format_savings — real % smaller vs JPEG (proprietary benchmark).
    this.server.registerTool(
      'image_format_savings',
      {
        title: 'Real storage savings of next-gen image formats',
        annotations: { readOnlyHint: true, openWorldHint: false },
        description:
          'How much smaller WebP, AVIF or JPEG XL are than JPEG at matched perceptual quality, from Cleanor Labs’ controlled benchmark. Also reports the "HEIC conversion tax" (converting an iPhone HEIC to JPG/PNG makes it bigger). Use to justify a format choice when building a site or app.',
        inputSchema: {
          format: z.enum(['webp', 'avif', 'jxl']).default('avif').describe('Target format to compare against JPEG.'),
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
    this.server.registerTool(
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
  }
}

const LANDING = `Cleanor MCP — asset + real-data tools for AI builders.
Streamable HTTP endpoint: /mcp
Tools: optimize_image, storage_capacity, image_format_savings, qr_code
By Cleanor Labs — https://cleanor.app`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight (browser-based MCP clients / playgrounds)
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

    // Rate limit MCP tool traffic per IP so an abusive client can't burn the
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
          return rateLimited('Image optimization limit reached (30/min per IP). Try again shortly.');
        }
      }
    }

    const resp = await CleanorMCP.serve('/mcp', { binding: 'CleanorMCP' }).fetch(request, env, ctx);
    const headers = new Headers(resp.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
  },
};
