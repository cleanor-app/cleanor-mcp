// Runtime-agnostic tools: pure compute + embedded Cleanor Labs data. Identical
// on the Worker and the stdio build, so they live here as plain ToolDefs.

import { z } from 'zod';
import { encodeQr, qrToSvg, type QrEcc } from '../qr';
import {
  ATTRIBUTION,
  usableGb,
  PHOTO_ITEMS,
  VIDEO_ITEMS,
  STORAGE_STUDY,
  FORMAT_SAVINGS,
  HEIC_TAX,
} from '../data';
import { defineTool, type ToolDef } from './registry';

const storageCapacity = defineTool(
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
    outputSchema: {
      storage_gb: z.number(),
      usable_gb: z.number().describe('Usable GB after OS/filesystem overhead.'),
      content: z.string(),
      breakdown: z
        .array(z.object({ label: z.string(), count: z.number(), unit: z.string() }))
        .describe('How many of each item fit.'),
    },
  },
  async ({ storage_gb, content }) => {
    const usable = usableGb(storage_gb);
    const lines: string[] = [];
    const breakdown: Array<{ label: string; count: number; unit: string }> = [];
    if (content === 'photos') {
      for (const it of Object.values(PHOTO_ITEMS)) {
        const count = Math.floor((usable * 1000) / it.mb);
        breakdown.push({ label: it.label, count, unit: 'photos' });
        lines.push(`  ${it.label}: ${count.toLocaleString('en-US')} photos`);
      }
    } else {
      for (const it of Object.values(VIDEO_ITEMS)) {
        const min = Math.floor((usable * 1000) / it.mbPerMin);
        breakdown.push({ label: it.label, count: min, unit: 'minutes' });
        lines.push(
          `  ${it.label}: ${min.toLocaleString('en-US')} min (~${Math.floor(min / 60)} h)`,
        );
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
      structuredContent: { storage_gb, usable_gb: usable, content, breakdown },
    };
  },
);

const imageFormatSavings = defineTool(
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
    outputSchema: {
      format: z.string(),
      quality: z.string(),
      percent_smaller_than_jpeg: z.number(),
      all_formats: z.object({ avif: z.number(), webp: z.number(), jxl: z.number() }),
      source: z.string(),
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
      structuredContent: {
        format,
        quality,
        percent_smaller_than_jpeg: Math.abs(pct),
        all_formats: { avif: band.avif, webp: band.webp, jxl: band.jxl },
        source: FORMAT_SAVINGS.source,
      },
    };
  },
);

const qrCode = defineTool(
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
    outputSchema: {
      svg: z.string().describe('The QR code as SVG markup.'),
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
      structuredContent: { svg },
    };
  },
);

/** Runtime-agnostic tools (no image encoder needed). */
export const DATA_TOOLS: ToolDef[] = [storageCapacity, imageFormatSavings, qrCode];
