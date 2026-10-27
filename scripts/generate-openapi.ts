import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { format, resolveConfig } from 'prettier';
import { stringify } from 'yaml';

import { createOpenApiDocument } from '../src/openapi/document.js';

const outputPath = resolve('openapi/openapi.yaml');
await mkdir(dirname(outputPath), { recursive: true });
const generated = stringify(createOpenApiDocument(), { lineWidth: 100 });
const prettierConfig = (await resolveConfig(outputPath)) ?? {};
const formatted = await format(generated, { ...prettierConfig, filepath: outputPath });
await writeFile(outputPath, formatted, 'utf8');
process.stdout.write(`Generated ${outputPath}\n`);
