import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';
import { coreRoot } from '../validation.js';
import { DomainError } from '../../domain/policy.js';

const names = ['connector-binding', 'connector-registry', 'capability', 'capability-request', 'policy-decision', 'consent-receipt', 'external-ref', 'tool-catalog', 'normalized-result', 'integration-manifest'];
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats.default(ajv);
for (const name of names) ajv.addSchema(JSON.parse(readFileSync(join(coreRoot, 'core', 'schemas', `${name}.schema.json`), 'utf8')), `v3-${name}`);
export function validateV3<T>(name: string, value: unknown): T {
  const fn = ajv.getSchema(`v3-${name}`);
  if (!fn) throw new DomainError('UNKNOWN_SCHEMA', 'Schema v0.3 desconhecido.');
  if (!fn(value)) {
    const issues = fn.errors?.map(error => `${error.instancePath || '/'}: ${error.keyword}`).join('; ');
    throw new DomainError('INVALID_DOCUMENT', `Documento v0.3 inválido (${name}): ${issues}`);
  }
  return value as T;
}
export function parseV3File<T>(path: string, name: string): T {
  const raw = readFileSync(path, 'utf8');
  if (Buffer.byteLength(raw) > 2_000_000) throw new DomainError('INPUT_TOO_LARGE', 'Documento maior que 2 MB.');
  const doc = parseDocument(raw, { uniqueKeys: true });
  if (doc.errors.length) throw new DomainError('INVALID_YAML', 'YAML/JSON inválido ou com chaves duplicadas.');
  return validateV3<T>(name, doc.toJS({ maxAliasCount: 50 }));
}
