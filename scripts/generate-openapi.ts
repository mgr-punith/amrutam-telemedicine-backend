import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { serializeOpenApiDocument } from '../src/openapi/serialize.js';

const outputPath = resolve('openapi/openapi.yaml');
await mkdir(dirname(outputPath), { recursive: true });
const formatted = await serializeOpenApiDocument(outputPath);
await writeFile(outputPath, formatted, 'utf8');
process.stdout.write(`Generated ${outputPath}\n`);
