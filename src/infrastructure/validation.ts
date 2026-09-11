import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';
import { DomainError } from '../domain/policy.js';

export const coreRoot = fileURLToPath(new URL('../../../', import.meta.url));
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats.default(ajv);
const schemaNames = ['task-input', 'profile', 'source', 'run-manifest', 'task-state', 'trace-event', 'evaluation', 'checkpoint', 'feedback-proposal'];
for (const name of schemaNames) {
  ajv.addSchema(JSON.parse(readFileSync(resolve(coreRoot, 'schemas', `${name}.schema.json`), 'utf8')), name);
}
export function validate<T>(schema: string, value: unknown): T {
  const validator = ajv.getSchema(schema);
  if (!validator) throw new DomainError('UNKNOWN_SCHEMA', 'Schema desconhecido.');
  if (!validator(value)) {
    // No instance data or raw error objects: these can contain sensitive values.
    const issues = validator.errors?.map(error => `${error.instancePath || '/'}: ${error.keyword}`).join('; ');
    throw new DomainError('INVALID_DOCUMENT', `Documento inválido (${schema}): ${issues}`);
  }
  return value as T;
}
export function parseFile<T>(path: string, schema: string): T {
  const raw = readFileSync(path, 'utf8');
  if (Buffer.byteLength(raw) > 1_000_000) throw new DomainError('INPUT_TOO_LARGE', 'Documento maior que 1 MB.');
  const doc = parseDocument(raw, { uniqueKeys: true });
  if (doc.errors.length) throw new DomainError('INVALID_YAML', 'YAML/JSON inválido ou com chaves duplicadas.');
  return validate<T>(schema, doc.toJS({ maxAliasCount: 50 }));
}
