// Assembles the full tool list for a given runtime and derives the machine-
// readable capabilities document from it.

import { DATA_TOOLS } from './data-tools';
import { DEV_TOOLS } from './dev-tools';
import {
  makeOptimizeImageTool,
  OPTIMIZE_FORMATS,
  MAX_INPUT_BYTES,
  type ImageEncoder,
} from './optimize';
import type { ToolDef } from './registry';

export const SERVER_VERSION = '0.5.0';

/** Every tool, wired to the runtime's image encoder. Order = discovery order. */
export function buildTools(encode: ImageEncoder): ToolDef[] {
  return [makeOptimizeImageTool(encode), ...DATA_TOOLS, ...DEV_TOOLS];
}

/**
 * The /v1/capabilities payload. A plugin fetches this to feature-detect what
 * the API supports before enabling UI, so new tools/endpoints light up without
 * a plugin release. Derived from the registry so it can never drift.
 */
export function buildCapabilities(tools: ToolDef[]) {
  return {
    server: 'cleanor',
    version: SERVER_VERSION,
    auth: 'none' as 'none' | 'api_key', // flips to 'api_key' once key checking is enabled
    mcp: { endpoint: '/mcp', transport: 'streamable-http' },
    rest: {
      optimize: {
        endpoint: '/v1/optimize',
        methods: ['POST'],
        accepts: ['multipart/form-data', 'application/json'],
        formats: OPTIMIZE_FORMATS,
        max_input_bytes: MAX_INPUT_BYTES,
        quality_range: [1, 100],
      },
    },
    tools: tools.map((t) => ({
      name: t.name,
      title: t.meta.title,
      description: t.meta.description,
    })),
    attribution: 'Cleanor Labs — https://cleanor.app',
  };
}
