// Tool registry — the extensibility backbone.
//
// Every Cleanor tool is declared once with `defineTool` and collected into an
// array. Both entry points (the Cloudflare Worker in ../index.ts and the local
// stdio build in ../stdio.ts) register the same array, and the REST
// /v1/capabilities endpoint is derived from it, so adding a tool is a one-file
// change that shows up everywhere automatically.

import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

export interface ToolMeta {
  /** Human-facing title. */
  title: string;
  /** What the tool does + when to use it (also shown to LLM clients). */
  description: string;
  annotations?: ToolAnnotations;
}

export interface ToolDef {
  name: string;
  meta: ToolMeta;
  /** Register this tool on a live McpServer instance. */
  register(server: McpServer): void;
}

/**
 * Declare a tool once. Captures the input schema in a closure so an array of
 * tools with differing schemas stays type-safe (no lossy union of generics).
 */
export function defineTool<Args extends ZodRawShape>(
  name: string,
  config: ToolMeta & { inputSchema: Args },
  handler: ToolCallback<Args>,
): ToolDef {
  return {
    name,
    meta: { title: config.title, description: config.description, annotations: config.annotations },
    register: (server) => server.registerTool(name, config, handler),
  };
}

export function registerAll(server: McpServer, tools: ToolDef[]): void {
  for (const t of tools) t.register(server);
}

// --- shared handler helpers -------------------------------------------------

export const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;

export const errText = (msg: string) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: msg }],
});

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
