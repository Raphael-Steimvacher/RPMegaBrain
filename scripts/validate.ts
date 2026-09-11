import { coreRoot, parseFile } from '../src/infrastructure/validation.js';
import { parseV2File } from '../src/infrastructure/v2/validation.js';
import { parseV3File, validateV3 } from '../src/infrastructure/v3/validation.js';
import { hash, stableJson } from '../src/infrastructure/hashing.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
const documents: [string, string][] = [
  ['profiles/synthetic.json', 'profile'],
  ['profiles/templates/work/profile.yaml', 'profile'],
  ['profiles/templates/work/sources.yaml', 'source'],
  ['profiles/templates/personal/profile.yaml', 'profile'],
  ['profiles/templates/personal/sources.yaml', 'source'],
  ['evals/fixtures/wac.json', 'task-input'],
];
for (const [path, schema] of documents) parseFile(join(coreRoot, path), schema);
const v2Documents: [string, string][] = [
  ['evals/fixtures/v2/memory-candidate.json', 'memory-candidate'],
  ['evals/fixtures/v2/retrieval-request.json', 'retrieval-request'],
];
for (const [path, schema] of v2Documents) parseV2File(join(coreRoot, path), schema);
parseV3File(join(coreRoot, 'evals/fixtures/v3-capability-request.json'), 'capability-request');
const personalConnectors = parseDocument(readFileSync(join(coreRoot, 'profiles/personal/connectors.example.yaml'), 'utf8'), { uniqueKeys: true });
if (personalConnectors.errors.length) throw new Error('Template de connector pessoal inválido.');
validateV3('connector-registry', personalConnectors.toJS({ maxAliasCount: 50 }));
for (const name of readdirSync(join(coreRoot, 'evals/fixtures/providers')).filter(value => value.endsWith('.json'))) {
  const fixture = JSON.parse(readFileSync(join(coreRoot, 'evals/fixtures/providers', name), 'utf8')) as { tools?: unknown[] };
  if (!Array.isArray(fixture.tools)) throw new Error(`Fixture ${name} sem tools.`);
  const entries = fixture.tools; validateV3('tool-catalog', { schema_version: 1, connector_id: `fixture.${name.slice(0, -5)}`, catalog_hash: hash(stableJson(entries)), reviewed_at: '2026-09-11T00:00:00.000Z', entries });
}
const catalog = JSON.parse(readFileSync(join(coreRoot, 'evals/cases/v0.2/catalog.json'), 'utf8')) as { cases?: unknown[] };
if (!Array.isArray(catalog.cases) || catalog.cases.length !== 24) throw new Error('Catálogo v0.2 deve conter os 24 casos normativos.');
const catalogV3 = JSON.parse(readFileSync(join(coreRoot, 'evals/cases/v0.3/catalog.json'), 'utf8')) as { cases?: { id?: string }[] };
if (!Array.isArray(catalogV3.cases) || catalogV3.cases.length !== 37 || new Set(catalogV3.cases.map(item => item.id)).size !== 37) throw new Error('Catálogo v0.3 deve conter os 37 casos normativos sem IDs duplicados.');
const skillRaw = readFileSync(join(coreRoot, '.agents/skills/memory-curator/SKILL.md'), 'utf8');
const frontmatterEnd = skillRaw.indexOf('\n---\n', 4);
if (!skillRaw.startsWith('---\n') || frontmatterEnd < 0) throw new Error('SKILL.md sem front matter válido.');
const skillMeta = parseDocument(skillRaw.slice(4, frontmatterEnd), { uniqueKeys: true });
if (skillMeta.errors.length || !skillMeta.get('name') || !skillMeta.get('description')) throw new Error('Metadados da skill inválidos.');
const skillUi = parseDocument(readFileSync(join(coreRoot, '.agents/skills/memory-curator/agents/openai.yaml'), 'utf8'), { uniqueKeys: true });
if (skillUi.errors.length || skillUi.getIn(['policy','allow_implicit_invocation']) !== false) throw new Error('memory-curator deve ser explicit-only.');
console.log(`${documents.length + v2Documents.length + 2} documentos, 24 casos v0.2, 37 casos v0.3 e skill memory-curator válidos.`);
