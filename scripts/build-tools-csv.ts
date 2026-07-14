// Generates data/tools.csv, the flat machine-readable index of every tool this
// server exposes.
//
// Nothing here is hand-maintained. The tools are registered against a stub
// server so we can read back the real Zod input/output schemas, which means the
// CSV cannot describe a tool, a parameter or an output field that the code does
// not actually have.
//
//   npm run tools:csv         rewrite data/tools.csv
//   npm run tools:csv:check   fail (exit 1) if data/tools.csv is stale
//
// The check mode exists so that adding a tool without refreshing the CSV is a
// hard error rather than a silent drift.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTools } from '../src/tools/index';
import { DATA_TOOLS } from '../src/tools/data-tools';
import { DEV_TOOLS } from '../src/tools/dev-tools';
import type { ImageEncoder } from '../src/tools/optimize';

const CSV_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tools.csv');

export const CSV_COLUMNS = [
  'tool',
  'title',
  'category',
  'summary',
  'required_params',
  'optional_params',
  'output_fields',
] as const;

/** The tool list is built for its schemas only, so the encoder is never called. */
const noopEncoder: ImageEncoder = async () => {
  throw new Error('build-tools-csv never encodes: it only reads schemas.');
};

/** Reads back the config each tool hands to McpServer.registerTool. */
function captureToolConfigs() {
  const captured: Array<{ name: string; config: any }> = [];
  const stub = {
    registerTool: (name: string, config: any) => captured.push({ name, config }),
  } as any;
  for (const tool of buildTools(noopEncoder)) tool.register(stub);
  return captured;
}

/** The three groupings the source actually uses (see src/tools/index.ts). */
function categoryOf(name: string): 'image' | 'data' | 'dev' {
  if (DATA_TOOLS.some((t) => t.name === name)) return 'data';
  if (DEV_TOOLS.some((t) => t.name === name)) return 'dev';
  return 'image';
}

const csvCell = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function buildCsv(): string {
  const rows: string[][] = [[...CSV_COLUMNS]];

  for (const { name, config } of captureToolConfigs()) {
    // A Zod field with .default() or .optional() accepts undefined, so it is not
    // a required input. That is what isOptional() reports.
    const required: string[] = [];
    const optional: string[] = [];
    for (const [param, schema] of Object.entries<any>(config.inputSchema ?? {})) {
      (schema.isOptional() ? optional : required).push(param);
    }

    rows.push([
      name,
      config.title,
      categoryOf(name),
      String(config.description).replace(/\s+/g, ' ').trim(),
      required.join(', '),
      optional.join(', '),
      Object.keys(config.outputSchema ?? {}).join(', '),
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

const csv = buildCsv();
const toolCount = csv.trimEnd().split('\n').length - 1;

if (process.argv.includes('--check')) {
  let committed: string;
  try {
    committed = readFileSync(CSV_PATH, 'utf8');
  } catch {
    console.error('data/tools.csv is missing. Run: npm run tools:csv');
    process.exit(1);
  }
  if (committed !== csv) {
    console.error(
      'data/tools.csv is out of date with src/tools/. Run: npm run tools:csv\n' +
        `(the source currently defines ${toolCount} tools)`,
    );
    process.exit(1);
  }
  console.log(`data/tools.csv is up to date (${toolCount} tools).`);
} else {
  mkdirSync(dirname(CSV_PATH), { recursive: true });
  writeFileSync(CSV_PATH, csv);
  console.log(`Wrote data/tools.csv (${toolCount} tools).`);
}
