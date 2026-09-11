import { coreRoot, parseFile } from '../src/infrastructure/validation.js';
import { parseV2File } from '../src/infrastructure/v2/validation.js';
import { readFileSync } from 'node:fs';
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
const catalog = JSON.parse(readFileSync(join(coreRoot, 'evals/cases/v0.2/catalog.json'), 'utf8')) as { cases?: unknown[] };
if (!Array.isArray(catalog.cases) || catalog.cases.length !== 24) throw new Error('Catálogo v0.2 deve conter os 24 casos normativos.');
const skillRaw = readFileSync(join(coreRoot, '.agents/skills/memory-curator/SKILL.md'), 'utf8');
const frontmatterEnd = skillRaw.indexOf('\n---\n', 4);
if (!skillRaw.startsWith('---\n') || frontmatterEnd < 0) throw new Error('SKILL.md sem front matter válido.');
const skillMeta = parseDocument(skillRaw.slice(4, frontmatterEnd), { uniqueKeys: true });
if (skillMeta.errors.length || !skillMeta.get('name') || !skillMeta.get('description')) throw new Error('Metadados da skill inválidos.');
const skillUi = parseDocument(readFileSync(join(coreRoot, '.agents/skills/memory-curator/agents/openai.yaml'), 'utf8'), { uniqueKeys: true });
if (skillUi.errors.length || skillUi.getIn(['policy','allow_implicit_invocation']) !== false) throw new Error('memory-curator deve ser explicit-only.');
console.log(`${documents.length + v2Documents.length} documentos, 24 casos e skill memory-curator válidos.`);
