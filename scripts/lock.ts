import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { componentHashes } from '../src/infrastructure/integrity.js';
import { stableJson } from '../src/infrastructure/hashing.js';
import { coreRoot } from '../src/infrastructure/validation.js';
const pkg = JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8'));
const value = { schema_version: 1, runtime_version: pkg.version, node_minimum: '24.0.0', codex_sdk_version: null,
  eval_suite_version: '0.1.0-alpha.1-deterministic', components: componentHashes(coreRoot) };
const path = join(coreRoot, 'megabrain.lock.yaml');
if (process.argv.includes('--check')) {
  if (stableJson(parse(readFileSync(path, 'utf8'))) !== stableJson(value)) throw new Error('Lock desatualizado. Revise as alterações e execute npm run lock.');
  console.log('Versões e hashes do lock conferem.');
} else { writeFileSync(path, stringify(value)); console.log('megabrain.lock.yaml atualizado.'); }
