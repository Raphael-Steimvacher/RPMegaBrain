import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workflow } from '../src/application/workflow.js';
import { RunStore } from '../src/infrastructure/run-store.js';
import { coreRoot, parseFile } from '../src/infrastructure/validation.js';
import type { TaskInput } from '../src/domain/contracts.js';
const root = mkdtempSync(join(tmpdir(), 'megabrain-demo-'));
const app = new Workflow(new RunStore(join(root, 'state')));
let cp = await app.create(parseFile<TaskInput>(join(coreRoot, 'evals/fixtures/wac.json'), 'task-input'), 'synthetic', 'teach');
const id = cp.manifest.run_id;
console.log('DEMO SINTÉTICA: as aprovações abaixo são dados de teste. Nenhuma IA é chamada.');
console.log(`Run: ${id}\nEstado local: ${app.store.root}`);
const show = () => console.log(`${cp.state.state} → ${cp.state.next_action}`);
show();
cp = await app.approve(id, 'definition', cp.state.definition.artifact_hash); show();
cp = await app.resume(id); show();
cp = await app.resume(id); show();
cp = await app.approve(id, 'plan', cp.state.plan.artifact_hash); show();
cp = await app.resume(id); show();
cp = await app.review(id); show();
cp = await app.resume(id); show();
cp = await app.evaluate(id, { schema_version: 1, run_id: id, verdict: 'accepted', hard_failures: [],
  scores: { technical_correctness: 4, requirement_coverage: 4, actionability: 4, teaching_clarity: 4, efficiency: 4 },
  corrections: [], user_notes: 'Avaliação fictícia da demonstração, não um baseline de qualidade.' }); show();
console.log(`${cp.events.length} eventos; ${cp.storage_revision} checkpoints.\nNenhum código-alvo foi editado ou testado.`);
console.log(`Inspecionar: npm start -- trace ${id} --state-dir "${app.store.root}"`);
