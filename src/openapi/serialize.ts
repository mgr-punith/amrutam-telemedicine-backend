import { format, resolveConfig } from 'prettier';
import { stringify } from 'yaml';

import { createOpenApiDocument } from './document.js';

export async function serializeOpenApiDocument(outputPath: string): Promise<string> {
  const generated = stringify(createOpenApiDocument(), { lineWidth: 100 });
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  return format(generated, { ...prettierConfig, filepath: outputPath });
}
