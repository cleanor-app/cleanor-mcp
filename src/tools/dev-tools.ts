// Deterministic developer utilities: pure compute, zero marginal cost.
//
// These cover the everyday operations LLMs are unreliable at (hashing, UUIDs,
// base64, JWT decode, color math, counting). They run on the Worker's CPU with
// no image binding, no network fetch and no session state, so they add
// negligible load while giving AI builders a reason to call Cleanor in almost
// every session. Same ToolDef shape as data-tools, so they light up on the
// Worker, the stdio build and /v1/capabilities automatically.

import { z } from 'zod';
import { defineTool, errText, toBase64, type ToolDef } from './registry';

// Guardrail: zero-auth means anyone can send input, so cap every pure tool's
// text payload. The Worker CPU limit is the ultimate backstop; this keeps us
// well under it and makes abuse pointless.
const MAX_TEXT = 100_000; // 100k chars

const FOOTER = '\n\n— free browser dev tools (no signup): https://cleanor.app/tools?utm_source=mcp';

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });

// A result carrying BOTH a human-readable text block and machine-readable
// structuredContent (required by the SDK whenever a tool declares outputSchema).
const out = (t: string, structuredContent: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: t }],
  structuredContent,
});

// --- hash -------------------------------------------------------------------

const HASH_ALGOS = {
  'sha-1': 'SHA-1',
  'sha-256': 'SHA-256',
  'sha-384': 'SHA-384',
  'sha-512': 'SHA-512',
} as const;

const hash = defineTool(
  'hash',
  {
    title: 'Hash text (SHA family)',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Compute a cryptographic hash of text (SHA-1, SHA-256, SHA-384 or SHA-512) and return the hex digest. Use for checksums, cache keys, or verifying content. MD5 is intentionally not offered (broken, and unavailable in Web Crypto). LLMs cannot compute these reliably by hand, so always use this tool instead of guessing.',
    inputSchema: {
      input: z.string().min(1).max(MAX_TEXT).describe('Text to hash (UTF-8).'),
      algorithm: z
        .enum(['sha-256', 'sha-1', 'sha-384', 'sha-512'])
        .default('sha-256')
        .describe('Hash algorithm. Default sha-256.'),
    },
    outputSchema: {
      algorithm: z.string().describe('The hash algorithm used.'),
      hex: z.string().describe('The hex-encoded digest.'),
    },
  },
  async ({ input, algorithm }) => {
    const buf = await crypto.subtle.digest(HASH_ALGOS[algorithm], new TextEncoder().encode(input));
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return out(`${algorithm}: ${hex}${FOOTER}`, { algorithm, hex });
  },
);

// --- uuid -------------------------------------------------------------------

function uuidV7(): string {
  const ms = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const uuid = defineTool(
  'uuid',
  {
    title: 'Generate UUIDs',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: false },
    description:
      'Generate one or more UUIDs. v4 is fully random; v7 is time-sortable (recommended for database keys). LLMs cannot produce cryptographically random or correctly-formatted UUIDs, so always use this tool.',
    inputSchema: {
      version: z.enum(['v4', 'v7']).default('v4').describe('UUID version. v7 = time-ordered.'),
      count: z.number().int().min(1).max(100).default(1).describe('How many to generate.'),
    },
    outputSchema: {
      version: z.string().describe('UUID version generated.'),
      uuids: z.array(z.string()).describe('The generated UUIDs.'),
    },
  },
  async ({ version, count }) => {
    const list = Array.from({ length: count }, () =>
      version === 'v7' ? uuidV7() : crypto.randomUUID(),
    );
    return out(list.join('\n') + FOOTER, { version, uuids: list });
  },
);

// --- base64 -----------------------------------------------------------------

const base64 = defineTool(
  'base64',
  {
    title: 'Base64 encode / decode',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Encode text to Base64 or decode Base64 back to text (UTF-8 safe). Supports URL-safe alphabet. Use whenever you need to encode/decode data URIs, tokens, or config values instead of guessing the bytes.',
    inputSchema: {
      input: z.string().min(1).max(MAX_TEXT).describe('Text to encode, or Base64 to decode.'),
      mode: z.enum(['encode', 'decode']).default('encode').describe('Direction.'),
      url_safe: z
        .boolean()
        .default(false)
        .describe('Use URL-safe alphabet (-_ instead of +/, no padding).'),
    },
    outputSchema: {
      mode: z.string().describe('encode or decode.'),
      result: z.string().describe('The encoded or decoded text.'),
    },
  },
  async ({ input, mode, url_safe }) => {
    try {
      if (mode === 'encode') {
        let encoded = toBase64(new TextEncoder().encode(input));
        if (url_safe) encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return out(encoded + FOOTER, { mode, result: encoded });
      }
      let b64 = input.trim();
      if (url_safe || /[-_]/.test(b64)) b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      return out(decoded + FOOTER, { mode, result: decoded });
    } catch {
      return errText('Invalid Base64 input.');
    }
  },
);

// --- json_format ------------------------------------------------------------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

const jsonFormat = defineTool(
  'json_format',
  {
    title: 'Format / validate JSON',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Validate JSON and pretty-print or minify it, optionally sorting object keys. Returns a precise parse error (with position) if invalid. Use to check and clean JSON instead of eyeballing it.',
    inputSchema: {
      input: z.string().min(1).max(MAX_TEXT).describe('JSON text.'),
      mode: z
        .enum(['pretty', 'minify'])
        .default('pretty')
        .describe('pretty = 2-space indent; minify = single line.'),
      sort_keys: z.boolean().default(false).describe('Sort object keys alphabetically (deep).'),
    },
    outputSchema: {
      valid: z.boolean().describe('Whether the input was valid JSON.'),
      formatted: z.string().describe('The formatted JSON text.'),
    },
  },
  async ({ input, mode, sort_keys }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (e) {
      return errText(`Invalid JSON: ${(e as Error).message}`);
    }
    if (sort_keys) parsed = sortKeys(parsed);
    const formatted = mode === 'pretty' ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
    return out('```json\n' + formatted + '\n```' + FOOTER, { valid: true, formatted });
  },
);

// --- jwt_decode -------------------------------------------------------------

function b64urlToJson(seg: string): unknown {
  let b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const jwtDecode = defineTool(
  'jwt_decode',
  {
    title: 'Decode a JWT (no verification)',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Decode a JSON Web Token into its header and payload so you can inspect claims (iss, exp, sub, scopes). The signature is NOT verified and no secret is required or stored. Use to read a token during debugging.',
    inputSchema: {
      token: z.string().min(1).max(MAX_TEXT).describe('The JWT (three dot-separated segments).'),
    },
    outputSchema: {
      header: z.unknown().describe('The decoded JWT header object.'),
      payload: z.unknown().describe('The decoded JWT payload (claims).'),
      exp_iso: z.string().optional().describe('Expiry as ISO 8601, if present.'),
      expired: z.boolean().optional().describe('Whether the token is past its exp, if present.'),
    },
  },
  async ({ token }) => {
    const parts = token.trim().split('.');
    if (parts.length !== 3) return errText('Not a JWT: expected 3 dot-separated segments.');
    try {
      const header = b64urlToJson(parts[0]);
      const payload = b64urlToJson(parts[1]) as Record<string, unknown>;
      const structured: Record<string, unknown> = { header, payload };
      let expNote = '';
      if (typeof payload.exp === 'number') {
        const iso = new Date(payload.exp * 1000).toISOString();
        const expired = payload.exp * 1000 < Date.now();
        structured.exp_iso = iso;
        structured.expired = expired;
        expNote = `\n\nexp: ${iso} (${expired ? 'EXPIRED' : 'valid'})`;
      }
      return out(
        `Header:\n${JSON.stringify(header, null, 2)}\n\nPayload:\n${JSON.stringify(payload, null, 2)}` +
          expNote +
          `\n\nNote: signature is NOT verified.` +
          FOOTER,
        structured,
      );
    } catch {
      return errText('Could not decode JWT segments as Base64URL JSON.');
    }
  },
);

// --- color ------------------------------------------------------------------

// Common CSS named colors → 6-digit hex, so "white"/"red"/"navy" work everywhere.
const NAMED_COLORS: Record<string, string> = {
  black: '000000',
  white: 'ffffff',
  red: 'ff0000',
  green: '008000',
  blue: '0000ff',
  yellow: 'ffff00',
  cyan: '00ffff',
  aqua: '00ffff',
  magenta: 'ff00ff',
  fuchsia: 'ff00ff',
  gray: '808080',
  grey: '808080',
  silver: 'c0c0c0',
  maroon: '800000',
  olive: '808000',
  lime: '00ff00',
  teal: '008080',
  navy: '000080',
  purple: '800080',
  orange: 'ffa500',
  pink: 'ffc0cb',
  brown: 'a52a2a',
  gold: 'ffd700',
  indigo: '4b0082',
  violet: 'ee82ee',
  coral: 'ff7f50',
  salmon: 'fa8072',
  khaki: 'f0e68c',
  crimson: 'dc143c',
  turquoise: '40e0d0',
  slategray: '708090',
  slategrey: '708090',
};

function parseColor(input: string): { r: number; g: number; b: number } | null {
  const s = input.trim().toLowerCase();
  if (NAMED_COLORS[s]) {
    const h = NAMED_COLORS[s];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  let m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  m = s.match(/^hsla?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)%?[,\s]+(\d+(?:\.\d+)?)%?/);
  if (m) return hslToRgb(+m[1], +m[2], +m[3]);
  return null;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const color = defineTool(
  'color',
  {
    title: 'Convert a color between formats',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Convert a color (hex, rgb() or hsl()) and return hex, RGB and HSL representations at once. Use when picking or translating colors for CSS, design tokens or themes.',
    inputSchema: {
      value: z
        .string()
        .min(1)
        .max(64)
        .describe('A color: "#3b82f6", "rgb(59,130,246)" or "hsl(217,91%,60%)".'),
    },
    outputSchema: {
      hex: z.string(),
      rgb: z.string(),
      hsl: z.string(),
    },
  },
  async ({ value }) => {
    const rgb = parseColor(value);
    if (!rgb) return errText('Could not parse color. Use hex, rgb(...) or hsl(...).');
    const hex = '#' + [rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, '0')).join('');
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const rgbStr = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    const hslStr = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    return out(`hex: ${hex}\nrgb: ${rgbStr}\nhsl: ${hslStr}` + FOOTER, {
      hex,
      rgb: rgbStr,
      hsl: hslStr,
    });
  },
);

// --- slugify ----------------------------------------------------------------

const slugify = defineTool(
  'slugify',
  {
    title: 'Slugify text for URLs',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Turn a title or phrase into a clean, URL-safe slug (lowercase, hyphenated, accents stripped). Use when generating page paths, filenames or anchor IDs.',
    inputSchema: {
      input: z.string().min(1).max(2000).describe('Text to slugify.'),
      separator: z.enum(['-', '_']).default('-').describe('Word separator.'),
    },
    outputSchema: {
      slug: z.string().describe('The URL-safe slug.'),
    },
  },
  async ({ input, separator }) => {
    const slug =
      input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, separator)
        .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), '') || 'n-a';
    return out(slug + FOOTER, { slug });
  },
);

// --- count ------------------------------------------------------------------

const count = defineTool(
  'count',
  {
    title: 'Count characters, words, lines, bytes',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Accurately count characters (Unicode code points), UTF-16 units, words, lines and UTF-8 bytes in text. LLMs are notoriously bad at counting, so always use this tool for "how many characters/words" questions.',
    inputSchema: {
      input: z.string().min(0).max(MAX_TEXT).describe('Text to measure.'),
    },
    outputSchema: {
      characters: z.number().describe('Unicode code points.'),
      utf16_units: z.number(),
      words: z.number(),
      lines: z.number(),
      bytes: z.number().describe('UTF-8 bytes.'),
    },
  },
  async ({ input }) => {
    const chars = Array.from(input).length;
    const utf16 = input.length;
    const words = input.trim() ? input.trim().split(/\s+/).length : 0;
    const lines = input === '' ? 0 : input.split(/\r\n|\r|\n/).length;
    const bytes = new TextEncoder().encode(input).length;
    return out(
      `characters (code points): ${chars}\nUTF-16 units: ${utf16}\nwords: ${words}\nlines: ${lines}\nUTF-8 bytes: ${bytes}` +
        FOOTER,
      { characters: chars, utf16_units: utf16, words, lines, bytes },
    );
  },
);

// --- regex_test -------------------------------------------------------------

const regexTest = defineTool(
  'regex_test',
  {
    title: 'Test a regular expression',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Test a JavaScript regular expression against sample text and return whether it matches, plus every match with its captured groups and index. Use to verify a pattern instead of reasoning about it in your head. Input and pattern are length-capped to keep it fast and safe.',
    inputSchema: {
      pattern: z.string().min(1).max(1000).describe('The regex pattern (without slashes).'),
      input: z.string().min(0).max(20_000).describe('Text to test against.'),
      flags: z
        .string()
        .max(8)
        .default('g')
        .describe('Regex flags, e.g. "gi". Allowed: g i m s u y d.'),
    },
    outputSchema: {
      matched: z.boolean().describe('Whether the pattern matched at all.'),
      match_count: z.number(),
      truncated: z.boolean().describe('True if results were capped at 100.'),
      matches: z
        .array(
          z.object({
            index: z.number(),
            match: z.string(),
            groups: z.array(z.string().nullable()),
          }),
        )
        .describe('Each match with its start index and captured groups.'),
    },
  },
  async ({ pattern, input, flags }) => {
    if (!/^[gimsuyd]*$/.test(flags)) return errText('Invalid flags. Allowed: g i m s u y d.');
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch (e) {
      return errText(`Invalid regex: ${(e as Error).message}`);
    }
    const global = flags.includes('g');
    const results: Array<{ index: number; match: string; groups: (string | null)[] }> = [];
    let truncated = false;
    const collect = (m: RegExpMatchArray) => {
      results.push({
        index: m.index ?? 0,
        match: m[0],
        groups: m.slice(1).map((g) => (g === undefined ? null : g)),
      });
    };
    if (global) {
      for (const m of input.matchAll(re)) {
        if (results.length >= 100) {
          truncated = true;
          break;
        }
        collect(m);
      }
    } else {
      const m = re.exec(input);
      if (m) collect(m);
    }
    const head = results.length
      ? `${results.length === 1 ? '1 match' : results.length + ' matches'}${truncated ? ' (capped at 100)' : ''}:`
      : 'No match.';
    const lines = results.map(
      (r) =>
        `@${r.index}: ${JSON.stringify(r.match)}${r.groups.length ? ` groups: [${r.groups.map((g) => JSON.stringify(g)).join(', ')}]` : ''}`,
    );
    return out([head, ...lines].join('\n') + FOOTER, {
      matched: results.length > 0,
      match_count: results.length,
      truncated,
      matches: results,
    });
  },
);

// --- cron_describe ----------------------------------------------------------

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_NAMES = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseCronField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;
    if (!step || step < 1) throw new Error(`bad step in "${part}"`);
    let lo = min;
    let hi = max;
    if (range !== '*' && range !== '') {
      const bounds = range.split('-');
      lo = parseInt(bounds[0], 10);
      hi = bounds.length > 1 ? parseInt(bounds[1], 10) : lo;
      if (Number.isNaN(lo) || Number.isNaN(hi)) throw new Error(`bad range "${range}"`);
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`"${part}" out of range ${min}-${max}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

function describeField(
  field: string,
  set: Set<number>,
  all: number,
  namer?: (n: number) => string,
): string {
  if (field === '*') return 'every';
  const vals = [...set].sort((a, b) => a - b);
  if (vals.length === all) return 'every';
  const show = (n: number) => (namer ? namer(n) : String(n));
  if (vals.length <= 6) return vals.map(show).join(', ');
  return `${vals.length} values (${show(vals[0])}…${show(vals[vals.length - 1])})`;
}

const cronDescribe = defineTool(
  'cron_describe',
  {
    title: 'Explain a cron expression',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: false },
    description:
      'Parse a standard 5-field cron expression (minute hour day-of-month month day-of-week) into a plain-English breakdown and the next few run times in UTC. Use to sanity-check a schedule instead of guessing what the fields mean.',
    inputSchema: {
      expression: z
        .string()
        .min(1)
        .max(200)
        .describe('A 5-field cron expression, e.g. "30 2 * * 1-5".'),
    },
    outputSchema: {
      minute: z.string(),
      hour: z.string(),
      day_of_month: z.string(),
      month: z.string(),
      day_of_week: z.string(),
      next_runs: z.array(z.string()).describe('Next run times in UTC ISO 8601.'),
    },
  },
  async ({ expression }) => {
    const f = expression.trim().split(/\s+/);
    if (f.length !== 5)
      return errText('Expected 5 fields: minute hour day-of-month month day-of-week.');
    let minutes: Set<number>,
      hours: Set<number>,
      doms: Set<number>,
      months: Set<number>,
      dows: Set<number>;
    try {
      minutes = parseCronField(f[0], 0, 59);
      hours = parseCronField(f[1], 0, 23);
      doms = parseCronField(f[2], 1, 31);
      months = parseCronField(f[3], 1, 12);
      dows = parseCronField(f[4].replace(/7/g, '0'), 0, 6);
    } catch (e) {
      return errText(`Invalid cron: ${(e as Error).message}`);
    }
    const domRestricted = f[2] !== '*';
    const dowRestricted = f[4] !== '*';
    const fireTimes: string[] = [];
    let t = new Date(Date.now());
    t.setUTCSeconds(0, 0);
    t = new Date(t.getTime() + 60_000); // start next minute
    for (let i = 0; i < 366 * 24 * 60 && fireTimes.length < 5; i++) {
      const domOk = doms.has(t.getUTCDate());
      const dowOk = dows.has(t.getUTCDay());
      const dayOk = domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk;
      if (
        minutes.has(t.getUTCMinutes()) &&
        hours.has(t.getUTCHours()) &&
        months.has(t.getUTCMonth() + 1) &&
        dayOk
      ) {
        fireTimes.push(t.toISOString().replace('.000Z', 'Z'));
      }
      t = new Date(t.getTime() + 60_000);
    }
    const fields = {
      minute: describeField(f[0], minutes, 60),
      hour: describeField(f[1], hours, 24),
      day_of_month: describeField(f[2], doms, 31),
      month: describeField(f[3], months, 12, (n) => MON_NAMES[n]),
      day_of_week: describeField(f[4].replace(/7/g, '0'), dows, 7, (n) => DOW_NAMES[n]),
    };
    const lines = [
      `Minute: ${fields.minute}`,
      `Hour: ${fields.hour}`,
      `Day of month: ${fields.day_of_month}`,
      `Month: ${fields.month}`,
      `Day of week: ${fields.day_of_week}`,
      '',
      fireTimes.length
        ? `Next ${fireTimes.length} runs (UTC):\n  ${fireTimes.join('\n  ')}`
        : 'No run within the next year.',
    ];
    return out(`Cron: ${expression.trim()}\n` + lines.join('\n') + FOOTER, {
      ...fields,
      next_runs: fireTimes,
    });
  },
);

// --- unit_convert -----------------------------------------------------------

// Each category maps a unit to its size in the category's base unit.
const UNITS: Record<string, Record<string, number>> = {
  length: {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    km: 1000,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
    nmi: 1852,
  },
  mass: { mg: 0.001, g: 1, kg: 1000, t: 1e6, oz: 28.349523125, lb: 453.59237, st: 6350.29318 },
  data: {
    bit: 0.125,
    byte: 1,
    kb: 1e3,
    kib: 1024,
    mb: 1e6,
    mib: 2 ** 20,
    gb: 1e9,
    gib: 2 ** 30,
    tb: 1e12,
    tib: 2 ** 40,
  },
  time: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800 },
  speed: { mps: 1, kph: 1000 / 3600, mph: 0.44704, fps: 0.3048, knot: 1852 / 3600 },
};

function findCategory(a: string, b: string): string | null {
  if (['c', 'f', 'k'].includes(a) && ['c', 'f', 'k'].includes(b)) return 'temperature';
  for (const [cat, map] of Object.entries(UNITS)) if (a in map && b in map) return cat;
  return null;
}

function convertTemp(v: number, from: string, to: string): number {
  const c = from === 'c' ? v : from === 'f' ? ((v - 32) * 5) / 9 : v - 273.15;
  return to === 'c' ? c : to === 'f' ? (c * 9) / 5 + 32 : c + 273.15;
}

const ALL_UNITS = [...Object.values(UNITS).flatMap((m) => Object.keys(m)), 'c', 'f', 'k'];

const unitConvert = defineTool(
  'unit_convert',
  {
    title: 'Convert between units',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description: `Convert a value between units of length, mass, data size, time, speed or temperature. Supported units: ${ALL_UNITS.join(', ')}. Use for exact conversions instead of approximating.`,
    inputSchema: {
      value: z.number().describe('The numeric value to convert.'),
      from: z.string().min(1).max(8).describe('Source unit (e.g. "km", "lb", "mib", "c").'),
      to: z.string().min(1).max(8).describe('Target unit (must be the same category as "from").'),
    },
    outputSchema: {
      value: z.number(),
      from: z.string(),
      to: z.string(),
      result: z.number(),
      category: z.string(),
    },
  },
  async ({ value, from, to }) => {
    const a = from.toLowerCase();
    const b = to.toLowerCase();
    const cat = findCategory(a, b);
    if (!cat) return errText(`Cannot convert "${from}" to "${to}" — unknown or mismatched units.`);
    let result: number;
    if (cat === 'temperature') result = convertTemp(value, a, b);
    else result = (value * UNITS[cat][a]) / UNITS[cat][b];
    const rounded = Math.abs(result) >= 1e-4 ? Number(result.toPrecision(10)) : result;
    return out(`${value} ${from} = ${rounded} ${to}  (${cat})` + FOOTER, {
      value,
      from,
      to,
      result: rounded,
      category: cat,
    });
  },
);

// --- datetime ---------------------------------------------------------------

const datetime = defineTool(
  'datetime',
  {
    title: 'Current or parsed date/time',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: false },
    description:
      'Get the current date/time, or convert a given timestamp, into a target IANA timezone with ISO, Unix and human-readable forms. Pass a Unix timestamp (seconds or ms) or an ISO string as input; omit it for "now". LLMs cannot know the real current time, so use this instead of guessing.',
    inputSchema: {
      input: z
        .string()
        .max(64)
        .optional()
        .describe(
          'Optional: a Unix timestamp (s or ms) or ISO date string. Omit for the current time.',
        ),
      timezone: z
        .string()
        .max(64)
        .default('UTC')
        .describe('IANA timezone, e.g. "America/New_York" or "UTC".'),
    },
    outputSchema: {
      timezone: z.string(),
      local: z.string().describe('Human-readable local time in the timezone.'),
      iso_utc: z.string(),
      unix_s: z.number(),
      unix_ms: z.number(),
    },
  },
  async ({ input, timezone }) => {
    let date: Date;
    if (input && input.trim()) {
      const s = input.trim();
      if (/^-?\d+$/.test(s)) {
        const num = Number(s);
        date = new Date(s.length > 12 ? num : num * 1000); // <=12 digits → seconds
      } else {
        date = new Date(s);
      }
      if (Number.isNaN(date.getTime()))
        return errText(`Could not parse "${input}" as a date or timestamp.`);
    } else {
      date = new Date(Date.now());
    }
    let human: string;
    try {
      human = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(date);
    } catch {
      return errText(`Unknown timezone "${timezone}". Use an IANA name like "Europe/London".`);
    }
    return out(
      `local (${timezone}): ${human}\n` +
        `ISO (UTC): ${date.toISOString()}\n` +
        `Unix (s): ${Math.floor(date.getTime() / 1000)}\n` +
        `Unix (ms): ${date.getTime()}` +
        FOOTER,
      {
        timezone,
        local: human,
        iso_utc: date.toISOString(),
        unix_s: Math.floor(date.getTime() / 1000),
        unix_ms: date.getTime(),
      },
    );
  },
);

// --- url_parse --------------------------------------------------------------

const urlParse = defineTool(
  'url_parse',
  {
    title: 'Parse a URL into parts',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Break a URL into its components: scheme, host, port, path, decoded query parameters and fragment. Use to inspect or debug a URL instead of parsing it by eye.',
    inputSchema: {
      url: z.string().min(1).max(4000).describe('The URL to parse (absolute, with scheme).'),
    },
    outputSchema: {
      scheme: z.string(),
      username: z.string().optional(),
      host: z.string(),
      port: z.string().describe('Port, or empty if the scheme default.'),
      path: z.string(),
      query: z.array(z.object({ key: z.string(), value: z.string() })),
      fragment: z.string(),
    },
  },
  async ({ url }) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return errText('Invalid URL. Include a scheme, e.g. "https://example.com/path?q=1".');
    }
    const params = [...u.searchParams.entries()];
    const paramLines = params.length
      ? params.map(([k, v]) => `  ${k} = ${v}`).join('\n')
      : '  (none)';
    const structured: Record<string, unknown> = {
      scheme: u.protocol.replace(':', ''),
      host: u.hostname,
      port: u.port,
      path: u.pathname,
      query: params.map(([key, value]) => ({ key, value })),
      fragment: u.hash ? u.hash.slice(1) : '',
    };
    if (u.username) structured.username = u.username;
    return out(
      `scheme: ${u.protocol.replace(':', '')}\n` +
        (u.username ? `user: ${u.username}${u.password ? ':***' : ''}\n` : '') +
        `host: ${u.hostname}\n` +
        `port: ${u.port || '(default)'}\n` +
        `path: ${u.pathname}\n` +
        `query params:\n${paramLines}\n` +
        `fragment: ${u.hash ? u.hash.slice(1) : '(none)'}` +
        FOOTER,
      structured,
    );
  },
);

// --- base_convert -----------------------------------------------------------

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';

function parseInBase(str: string, base: number): bigint {
  let s = str.trim().toLowerCase();
  let neg = false;
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!s.length) throw new Error('empty number');
  const B = BigInt(base);
  let n = 0n;
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= base) throw new Error(`digit "${ch}" is invalid for base ${base}`);
    n = n * B + BigInt(d);
  }
  return neg ? -n : n;
}

function toBaseStr(n: bigint, base: number): string {
  if (n === 0n) return '0';
  const neg = n < 0n;
  if (neg) n = -n;
  const B = BigInt(base);
  let out = '';
  while (n > 0n) {
    out = DIGITS[Number(n % B)] + out;
    n /= B;
  }
  return (neg ? '-' : '') + out;
}

const baseConvert = defineTool(
  'base_convert',
  {
    title: 'Convert a number between bases',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Convert an integer between number bases 2–36 (e.g. hex to binary, decimal to base-36). Arbitrary precision via BigInt, so large values stay exact. Use for radix conversions instead of doing them by hand.',
    inputSchema: {
      value: z
        .string()
        .min(1)
        .max(2000)
        .describe('The number, in from_base (e.g. "ff", "1010", "255").'),
      from_base: z.number().int().min(2).max(36).default(10).describe('Base of the input (2–36).'),
      to_base: z.number().int().min(2).max(36).default(16).describe('Base to convert to (2–36).'),
    },
    outputSchema: {
      input: z.string(),
      from_base: z.number(),
      to_base: z.number(),
      result: z.string().describe('The value in to_base.'),
      decimal: z.string().describe('The value in base 10.'),
    },
  },
  async ({ value, from_base, to_base }) => {
    let n: bigint;
    try {
      n = parseInBase(value, from_base);
    } catch (e) {
      return errText((e as Error).message);
    }
    const result = toBaseStr(n, to_base);
    return out(
      `${value} (base ${from_base}) = ${result} (base ${to_base})\n` +
        `decimal: ${n.toString(10)}` +
        FOOTER,
      { input: value, from_base, to_base, result, decimal: n.toString(10) },
    );
  },
);

// --- diff -------------------------------------------------------------------

const MAX_DIFF_LINES = 1000;

function lineDiff(a: string[], b: string[]): { lines: string[]; added: number; removed: number } {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines: string[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push('  ' + a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push('- ' + a[i]);
      i++;
      removed++;
    } else {
      lines.push('+ ' + b[j]);
      j++;
      added++;
    }
  }
  while (i < n) {
    lines.push('- ' + a[i++]);
    removed++;
  }
  while (j < m) {
    lines.push('+ ' + b[j++]);
    added++;
  }
  return { lines, added, removed };
}

const diff = defineTool(
  'diff',
  {
    title: 'Line diff between two texts',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Compute a line-by-line diff between two texts, marking removed lines with "-", added with "+" and unchanged with two spaces, plus a change count. Use to see exactly what changed instead of comparing by eye. Capped at 1000 lines per side.',
    inputSchema: {
      a: z.string().min(0).max(MAX_TEXT).describe('The original ("before") text.'),
      b: z.string().min(0).max(MAX_TEXT).describe('The updated ("after") text.'),
    },
    outputSchema: {
      changed: z.boolean(),
      added: z.number(),
      removed: z.number(),
      diff: z.string().describe('The line diff (+/-/space prefixed), empty if identical.'),
    },
  },
  async ({ a, b }) => {
    const al = a.split(/\r\n|\r|\n/);
    const bl = b.split(/\r\n|\r|\n/);
    if (al.length > MAX_DIFF_LINES || bl.length > MAX_DIFF_LINES) {
      return errText(`Too many lines (max ${MAX_DIFF_LINES} per side).`);
    }
    const { lines, added, removed } = lineDiff(al, bl);
    if (!added && !removed) {
      return out('No differences.' + FOOTER, { changed: false, added: 0, removed: 0, diff: '' });
    }
    const body = lines.join('\n');
    return out(`+${added} -${removed}\n\n` + '```diff\n' + body + '\n```' + FOOTER, {
      changed: true,
      added,
      removed,
      diff: body,
    });
  },
);

// --- hmac -------------------------------------------------------------------

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const hmac = defineTool(
  'hmac',
  {
    title: 'HMAC signature of a message',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Compute an HMAC (keyed hash) of a message with a secret, using SHA-1/256/384/512, returned as hex or Base64. Use to sign webhook payloads or verify a signature instead of guessing. LLMs cannot compute this by hand.',
    inputSchema: {
      message: z.string().min(0).max(MAX_TEXT).describe('The message to sign (UTF-8).'),
      secret: z.string().min(1).max(4096).describe('The shared secret key (UTF-8).'),
      algorithm: z
        .enum(['sha-256', 'sha-1', 'sha-384', 'sha-512'])
        .default('sha-256')
        .describe('Hash algorithm.'),
      encoding: z.enum(['hex', 'base64']).default('hex').describe('Output encoding.'),
    },
    outputSchema: {
      algorithm: z.string(),
      encoding: z.string(),
      signature: z.string().describe('The HMAC in the requested encoding.'),
    },
  },
  async ({ message, secret, algorithm, encoding }) => {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: HASH_ALGOS[algorithm] },
      false,
      ['sign'],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)),
    );
    const signature = encoding === 'base64' ? toBase64(sig) : toHex(sig);
    return out(`hmac-${algorithm} (${encoding}): ${signature}${FOOTER}`, {
      algorithm,
      encoding,
      signature,
    });
  },
);

// --- placeholder_image ------------------------------------------------------

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

function toHexColor(input: string, fallback: string): string {
  const rgb = parseColor(input);
  if (rgb) return rgbToHex(rgb.r, rgb.g, rgb.b);
  // Any other bare CSS keyword (e.g. "transparent", "rebeccapurple") is letters-only,
  // so it is injection-safe to drop straight into an SVG fill attribute.
  const t = input.trim();
  if (/^[a-z]{1,20}$/i.test(t)) return t.toLowerCase();
  return fallback;
}

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const placeholderImage = defineTool(
  'placeholder_image',
  {
    title: 'Generate a placeholder image (SVG)',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Generate a lightweight SVG placeholder image at any size, with an optional label and custom background/text colors. Dependency-free, pastes straight into a page or mockup. Use for wireframes and design stubs instead of hotlinking a placeholder service.',
    inputSchema: {
      width: z.number().int().min(1).max(4000).default(600).describe('Width in pixels.'),
      height: z.number().int().min(1).max(4000).default(400).describe('Height in pixels.'),
      bg: z.string().max(32).default('#e5e7eb').describe('Background color (hex, rgb() or hsl()).'),
      color: z.string().max(32).default('#6b7280').describe('Text color.'),
      text: z
        .string()
        .max(120)
        .optional()
        .describe('Label text. Defaults to the dimensions, e.g. "600×400".'),
    },
    outputSchema: {
      svg: z.string().describe('The SVG markup.'),
      width: z.number(),
      height: z.number(),
    },
  },
  async ({ width, height, bg, color, text: label }) => {
    const bgHex = toHexColor(bg, '#e5e7eb');
    const fgHex = toHexColor(color, '#6b7280');
    const caption = xmlEscape(label && label.trim() ? label : `${width}×${height}`);
    const fontSize = Math.max(10, Math.round(Math.min(width, height) * 0.18));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${caption}">` +
      `<rect width="${width}" height="${height}" fill="${bgHex}"/>` +
      `<text x="50%" y="50%" fill="${fgHex}" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="600" text-anchor="middle" dominant-baseline="central">${caption}</text>` +
      `</svg>`;
    return out(`${svg}\n\nMore free tools (no signup): https://cleanor.app/tools?utm_source=mcp`, {
      svg,
      width,
      height,
    });
  },
);

// --- color_palette ----------------------------------------------------------

const HARMONIES = ['complementary', 'analogous', 'triadic', 'tetradic', 'monochromatic'] as const;

function paletteFor(
  h: number,
  s: number,
  l: number,
  harmony: (typeof HARMONIES)[number],
): Array<[number, number, number]> {
  const at = (hh: number, ss = s, ll = l): [number, number, number] => [
    ((hh % 360) + 360) % 360,
    ss,
    ll,
  ];
  switch (harmony) {
    case 'complementary':
      return [at(h), at(h + 180)];
    case 'analogous':
      return [at(h - 30), at(h), at(h + 30)];
    case 'triadic':
      return [at(h), at(h + 120), at(h + 240)];
    case 'tetradic':
      return [at(h), at(h + 90), at(h + 180), at(h + 270)];
    case 'monochromatic':
      return [20, 35, 50, 65, 80].map((ll) => at(h, s, ll));
  }
}

const colorPalette = defineTool(
  'color_palette',
  {
    title: 'Generate a color palette',
    annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    description:
      'Build a harmonious color palette from a base color using color-theory rules (complementary, analogous, triadic, tetradic, or monochromatic). Returns each color as hex and HSL. Use to derive a theme or design tokens from one brand color.',
    inputSchema: {
      color: z.string().min(1).max(64).describe('Base color: "#3b82f6", "rgb(...)" or "hsl(...)".'),
      harmony: z.enum(HARMONIES).default('analogous').describe('Color-harmony rule.'),
    },
    outputSchema: {
      harmony: z.string(),
      base: z.string().describe('The base color as hex.'),
      colors: z.array(z.object({ hex: z.string(), hsl: z.string() })),
    },
  },
  async ({ color, harmony }) => {
    const rgb = parseColor(color);
    if (!rgb) return errText('Could not parse color. Use hex, rgb(...) or hsl(...).');
    const base = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const colors = paletteFor(base.h, base.s, base.l, harmony).map(([h, s, l]) => {
      const c = hslToRgb(h, s, l);
      return {
        hex: rgbToHex(c.r, c.g, c.b),
        hsl: `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`,
      };
    });
    const baseHex = rgbToHex(rgb.r, rgb.g, rgb.b);
    const lines = colors.map((c) => `${c.hex}   ${c.hsl}`);
    return out(`${harmony} palette from ${baseHex}:\n` + lines.join('\n') + FOOTER, {
      harmony,
      base: baseHex,
      colors,
    });
  },
);

/** Pure developer utilities (no image encoder, no state, no network). */
export const DEV_TOOLS: ToolDef[] = [
  // Phase 1
  hash,
  uuid,
  base64,
  jsonFormat,
  jwtDecode,
  color,
  slugify,
  count,
  // Phase 2
  regexTest,
  cronDescribe,
  unitConvert,
  datetime,
  urlParse,
  baseConvert,
  diff,
  // Phase 3
  hmac,
  placeholderImage,
  colorPalette,
];
