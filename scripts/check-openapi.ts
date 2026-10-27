import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { serializeOpenApiDocument } from '../src/openapi/serialize.js';

const outputPath = resolve('openapi/openapi.yaml');
const [committedArtifact, generatedArtifact] = await Promise.all([
  readFile(outputPath, 'utf8'),
  serializeOpenApiDocument(outputPath),
]);

if (committedArtifact !== generatedArtifact) {
  process.stderr.write(
    'OpenAPI artifact is stale. Run `npm run openapi:generate` and include the result.\n',
  );
  process.exitCode = 1;
} else {
  process.stdout.write('OpenAPI artifact matches the generated document.\n');
}
