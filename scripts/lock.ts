import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { componentHashes } from '../src/infrastructure/integrity.js';
import { stableJson } from '../src/infrastructure/hashing.js';
import { coreRoot } from '../src/infrastructure/validation.js';
import { integrationPolicyHash } from '../src/application/integrations/policy-gateway.js';
import { capabilityCatalog } from '../src/domain/v3/catalog.js';
const pkg = JSON.parse(readFileSync(join(coreRoot, 'package.json'), 'utf8'));
const value = { schema_version: 1, runtime_version: pkg.version, node_minimum: '24.0.0', codex_sdk_version: null,
  eval_suite_version: '0.3.0-deterministic', checkpoint_schema_version: 1, memory_schema_version: 1,
  retrieval_schema_version: 1, telemetry_schema_version: 3, integration_schema_version: 1,
  connector_registry_schema_version: 1, capability_schema_version: 1, consent_schema_version: 1,
  external_ref_schema_version: 1, components: componentHashes(coreRoot) };
const path = join(coreRoot, 'megabrain.lock.yaml');
const providerFixtures = readdirSync(join(coreRoot, 'evals/fixtures/providers')).filter(name => name.endsWith('.json')).sort().flatMap(name => {
  const fixture = JSON.parse(readFileSync(join(coreRoot, 'evals/fixtures/providers', name), 'utf8')) as { tools: { tool_name: string; tool_schema_hash: string; mapped_capability: string; effect_class: string }[] };
  return fixture.tools.map(tool => ({ fixture: name.slice(0, -5), ...tool }));
});
const integrationValue = { schema_version: 1, integration_schema_version: 1, policy_hash: integrationPolicyHash,
  connector_types: ['github','gitlab','jira','gmail','google-drive','fake'], provider_versions: { fake: 'fixture-1', live: null },
  capability_mappings: [...capabilityCatalog.values()].map(item => ({ capability: item.capability, effect_class: item.effect_class })).sort((a, b) => a.capability.localeCompare(b.capability, 'en')),
  reviewed_tools: providerFixtures, review_timestamp: '2026-09-11T00:00:00.000Z' };
const integrationPath = join(coreRoot, 'integrations.lock.yaml');
if (process.argv.includes('--check')) {
  if (stableJson(parse(readFileSync(path, 'utf8'))) !== stableJson(value)) throw new Error('Lock desatualizado. Revise as alterações e execute npm run lock.');
  if (stableJson(parse(readFileSync(integrationPath, 'utf8'))) !== stableJson(integrationValue)) throw new Error('Lock de integrações desatualizado. Revise o catálogo e execute npm run lock.');
  console.log('Versões, hashes e lock de integrações conferem.');
} else { writeFileSync(path, stringify(value)); writeFileSync(integrationPath, stringify(integrationValue)); console.log('megabrain.lock.yaml e integrations.lock.yaml atualizados.'); }
