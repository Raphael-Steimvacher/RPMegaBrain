import { coreRoot, parseFile } from '../src/infrastructure/validation.js';
import { join } from 'node:path';
const documents: [string, string][] = [
  ['profiles/synthetic.json', 'profile'],
  ['profiles/templates/work/profile.yaml', 'profile'],
  ['profiles/templates/work/sources.yaml', 'source'],
  ['profiles/templates/personal/profile.yaml', 'profile'],
  ['profiles/templates/personal/sources.yaml', 'source'],
  ['evals/fixtures/wac.json', 'task-input'],
];
for (const [path, schema] of documents) parseFile(join(coreRoot, path), schema);
console.log(`${documents.length} documentos de configuração/fixtures válidos.`);
