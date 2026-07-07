// Plain-REST surface for non-MCP clients (the WordPress plugin, cURL, any
// backend). Versioned under /v1 so new capabilities are added as new routes /
// fields without breaking older plugin releases.
//
//   GET  /v1/capabilities   -> feature-detection JSON (derived from registry)
//   POST /v1/optimize       -> optimize one image; returns binary bytes
//                              (or JSON+base64 when Accept: application/json)
//
// /v1/optimize accepts, in priority order:
//   1. multipart/form-data  — field `file` (the image) + optional form fields
//      `format`, `quality`, `width`. This is the path the WP plugin uses.
//   2. application/json      — { image_url, format?, quality?, width? }
//   3. raw body              — the image bytes, params from the query string.

import { CORS_HEADERS, json } from './http';
import { buildCapabilities } from './tools';
import type { ToolDef } from './tools/registry';
import {
  optimizeBytes,
  OPTIMIZE_FORMATS,
  type ImageEncoder,
  type OptimizeFormat,
  type OptimizeOpts,
} from './tools/optimize';

function parseFormat(v: unknown): OptimizeFormat {
  return (OPTIMIZE_FORMATS as readonly string[]).includes(String(v))
    ? (v as OptimizeFormat)
    : 'webp';
}

function parseQuality(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 80;
}

function parseWidth(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 16 && n <= 4096 ? n : undefined;
}

/**
 * Hook for future API-key auth. Returns an error Response to reject, or null to
 * allow. Currently permissive (zero-auth, IP-rate-limited like MCP). When a
 * KV/D1 key store is wired in, validate here and flip `auth` in capabilities.
 */
export function checkApiKey(_request: Request): Response | null {
  return null;
}

/** Returns a Response for a /v1 route, or null if the path isn't ours. */
export async function handleRest(
  request: Request,
  encode: ImageEncoder,
  tools: ToolDef[],
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/v1/capabilities') {
    if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
    return json(buildCapabilities(tools), 200, { 'cache-control': 'public, max-age=300' });
  }

  if (path === '/v1/optimize') {
    if (request.method !== 'POST')
      return json(
        { error: 'Use POST with an image (multipart file, JSON image_url, or raw body).' },
        405,
      );

    const authError = checkApiKey(request);
    if (authError) return authError;

    try {
      const ct = request.headers.get('content-type') ?? '';
      let input: ArrayBuffer;
      let opts: OptimizeOpts;

      if (ct.includes('multipart/form-data')) {
        const form = await request.formData();
        // workers-types types get() as string|null; an uploaded file is a Blob
        // at runtime, so duck-type it rather than relying on a File type.
        const file = form.get('file') as unknown as
          | { size: number; arrayBuffer(): Promise<ArrayBuffer> }
          | string
          | null;
        if (
          !file ||
          typeof file === 'string' ||
          typeof file.arrayBuffer !== 'function' ||
          file.size === 0
        )
          return json({ error: 'Missing form field `file`.' }, 400);
        input = await file.arrayBuffer();
        opts = {
          format: parseFormat(form.get('format')),
          quality: parseQuality(form.get('quality')),
          width: parseWidth(form.get('width')),
        };
      } else if (ct.includes('application/json')) {
        const body = (await request.json()) as {
          image_url?: string;
          format?: string;
          quality?: number;
          width?: number;
        };
        if (!body.image_url) return json({ error: 'Provide `image_url`.' }, 400);
        const res = await fetch(body.image_url);
        if (!res.ok) return json({ error: `Could not fetch image (HTTP ${res.status}).` }, 400);
        input = await res.arrayBuffer();
        opts = {
          format: parseFormat(body.format),
          quality: parseQuality(body.quality),
          width: parseWidth(body.width),
        };
      } else {
        input = await request.arrayBuffer();
        if (input.byteLength === 0) return json({ error: 'Empty request body.' }, 400);
        opts = {
          format: parseFormat(url.searchParams.get('format')),
          quality: parseQuality(url.searchParams.get('quality')),
          width: parseWidth(url.searchParams.get('width')),
        };
      }

      const r = await optimizeBytes(encode, input, opts);
      const meta = {
        'X-Cleanor-Original-Bytes': String(r.originalBytes),
        'X-Cleanor-Optimized-Bytes': String(r.newBytes),
        'X-Cleanor-Saved-Pct': String(r.savedPct),
      };

      const wantsJson =
        url.searchParams.get('json') === '1' ||
        (request.headers.get('accept') ?? '').includes('application/json');
      if (wantsJson) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < r.bytes.length; i += chunk) {
          binary += String.fromCharCode(...r.bytes.subarray(i, i + chunk));
        }
        return json(
          {
            format: opts.format,
            mime: r.mime,
            original_bytes: r.originalBytes,
            optimized_bytes: r.newBytes,
            saved_pct: r.savedPct,
            data_base64: btoa(binary),
          },
          200,
          meta,
        );
      }

      return new Response(r.bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          'content-type': r.mime,
          'content-length': String(r.newBytes),
          'cache-control': 'no-store',
          ...CORS_HEADERS,
          ...meta,
        },
      });
    } catch (e) {
      return json({ error: `Optimize failed: ${(e as Error).message}` }, 400);
    }
  }

  return null;
}
