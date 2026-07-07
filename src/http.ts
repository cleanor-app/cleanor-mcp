// Shared HTTP helpers (CORS + JSON) used by both the MCP transport wrapper and
// the REST endpoints.

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Authorization, X-API-Key',
  'Access-Control-Expose-Headers':
    'Mcp-Session-Id, X-Cleanor-Original-Bytes, X-Cleanor-Optimized-Bytes, X-Cleanor-Saved-Pct',
  'Access-Control-Max-Age': '86400',
};

export function json(body: unknown, status = 200, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra },
  });
}
