import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { DomainError } from '../../domain/policy.js';
import { coreRoot } from '../validation.js';

export const v5SchemaNames = ['candidate-manifest', 'candidate-request', 'candidate-authorization', 'workspace-lease', 'environment-manifest', 'change-plan', 'change-set', 'candidate-snapshot', 'regression-comparison', 'code-review-report', 'impact-report', 'candidate-decision', 'cleanup-receipt', 'run-manifest-v5'] as const;
const ajv = new Ajv({ allErrors: true, strict: true }); addFormats.default(ajv);
for (const name of v5SchemaNames) ajv.addSchema(JSON.parse(readFileSync(join(coreRoot, 'core', 'schemas', 'v5', `${name}.schema.json`), 'utf8')), `v5-${name}`);

export function validateV5<T>(name: typeof v5SchemaNames[number], value: unknown): T {
  const schema = ajv.getSchema(`v5-${name}`); if (!schema) throw new DomainError('UNKNOWN_SCHEMA', 'Schema v0.5 desconhecido.');
  if (!schema(value)) throw new DomainError('INVALID_DOCUMENT', `Documento v0.5 inválido (${name}).`);
  return value as T;
}
