#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { Workflow } from '../application/workflow.js';
import type { Checkpoint, Evaluation, TaskInput } from '../domain/contracts.js';
import { DomainError, resolveMode } from '../domain/policy.js';
import { RunStore } from '../infrastructure/run-store.js';
import { parseFile } from '../infrastructure/validation.js';
import { handleV2 } from './v2.js';
import { handleV3 } from './v3.js';
import { handleV4 } from './v4.js';

const help = `MegaBrain 0.4.0 — avaliação local-first; model grader desativado por padrão\n
Uso após npm run build:
  npm start -- connector list --profile personal
  npm start -- connector add fake --profile personal --file connector.yaml
  npm start -- connector verify CONNECTOR --profile personal --provider-fixture provider.json
  npm start -- policy check --profile personal --request integration-request.yaml
  npm start -- integration call --profile personal --request integration-request.yaml --provider-fixture provider.json
  npm start -- consent grant --profile personal --request integration-request.yaml --bind-to run --expires-at ISO --interaction USER_ACTION
  npm start -- mail draft local --profile personal --payload payload.json --task TASK --run RUN
  npm start -- wac <task-id> --profile synthetic --task-file <fixture.json>
  npm start -- status <run-id>
  npm start -- approve <run-id> definition --hash <hash-exibido>
  npm start -- resume <run-id>
  npm start -- approve <run-id> plan --hash <hash-exibido>
  npm start -- resume <run-id> [--pode-fazer | --mode implement]
  npm start -- review <run-id>
  npm start -- eval <run-id> --file <evaluation.yaml>
  npm start -- trace <run-id>
  npm start -- contract create --profile personal --file contract.yaml
  npm start -- evidence build --profile personal --run RUN --contract CONTRACT --file evidence.yaml
  npm start -- eval run --profile personal --run RUN
  npm start -- diagnose run --profile personal --evaluation EVAL
  npm start -- pattern scan --profile personal
  npm start -- proposal list --profile personal

Opções comuns: --state-dir <diretório-fora-do-git>, --json, --help.
Engine único: --engine mock. Teach é o padrão, inclusive na retomada.
Os templates personal/work estão inativos nesta alpha.
`;
function required(value: string | undefined, name: string): string {
  if (!value) throw new DomainError('MISSING_ARGUMENT', `Informe ${name}.`);
  return value;
}
function display(cp: Checkpoint, json: boolean): void {
  if (json) { console.log(JSON.stringify(cp, null, 2)); return; }
  console.log(`SIMULAÇÃO | perfil=${cp.manifest.execution.profile} | modo=${cp.manifest.execution.mode}`);
  console.log(`Run: ${cp.manifest.run_id}\nEstado: ${cp.state.state}\nPróxima ação: ${cp.state.next_action}`);
  if (cp.state.state === 'defined') console.log(`Hash da definição: ${cp.state.definition.artifact_hash}`);
  if (cp.state.state === 'plan_ready') console.log(`Hash do plano: ${cp.state.plan.artifact_hash}`);
  console.log(`\n${cp.artifacts.result}`);
}
async function main(): Promise<void> {
  if (await handleV4(process.argv.slice(2))) return;
  if (await handleV3(process.argv.slice(2))) return;
  if (await handleV2(process.argv.slice(2))) return;
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true,
    options: { profile: { type: 'string' }, 'task-file': { type: 'string' }, mode: { type: 'string' },
      engine: { type: 'string' }, 'state-dir': { type: 'string' }, hash: { type: 'string' }, file: { type: 'string' },
      'pode-fazer': { type: 'boolean' }, json: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help || positionals.length === 0) { console.log(help); return; }
  const [command, id, artifact] = positionals;
  const optionsFor: Record<string, string[]> = {
    wac: ['profile', 'task-file', 'mode', 'pode-fazer', 'engine'], resume: ['mode', 'pode-fazer', 'engine'],
    status: [], trace: [], approve: ['hash'], review: [], eval: ['file'],
  };
  const allowed = command ? optionsFor[command] : undefined;
  if (!allowed) throw new DomainError('UNKNOWN_COMMAND', 'Comando desconhecido. Use --help.');
  for (const key of Object.keys(values)) {
    if (!['state-dir','json','help', ...allowed].includes(key)) throw new DomainError('UNEXPECTED_FLAG', `--${key} não se aplica a ${command}.`);
  }
  if (positionals.length !== (command === 'approve' ? 3 : 2)) throw new DomainError('INVALID_ARGUMENTS', 'Quantidade incorreta de argumentos. Use --help.');
  if (values.engine && values.engine !== 'mock') throw new DomainError('ENGINE_UNAVAILABLE', 'Somente --engine mock está disponível.');
  const mode = resolveMode(values.mode as string | undefined, Boolean(values['pode-fazer']));
  const store = new RunStore(values['state-dir'] as string | undefined);
  const app = new Workflow(store);
  const target = required(id, 'task-id ou run-id');
  const json = Boolean(values.json);
  switch (command) {
    case 'wac': {
      const profile = required(values.profile as string | undefined, '--profile (sem seleção silenciosa)');
      const task = parseFile<TaskInput>(required(values['task-file'] as string | undefined, '--task-file'), 'task-input');
      if (task.task_id !== target) throw new DomainError('TASK_ID_MISMATCH', 'Task ID do comando difere da fixture.');
      display(await app.create(task, profile, mode), json);
      break;
    }
    case 'resume': {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.once('SIGINT', cancel);
      try { display(await app.resume(target, mode, controller.signal), json); }
      finally { process.off('SIGINT', cancel); }
      break;
    }
    case 'status': display(store.read(target), json); break;
    case 'trace': console.log(store.read(target).events.map(event => JSON.stringify(event)).join('\n')); break;
    case 'approve':
      if (artifact !== 'definition' && artifact !== 'plan') throw new DomainError('INVALID_ARTIFACT', 'Use definition ou plan.');
      display(await app.approve(target, artifact, required(values.hash as string | undefined, '--hash')), json);
      break;
    case 'review': display(await app.review(target), json); break;
    case 'eval': display(await app.evaluate(target, parseFile<Evaluation>(required(values.file as string | undefined, '--file'), 'evaluation')), json); break;
  }
}
main().catch((error: unknown) => {
  if (error instanceof DomainError) console.error(`${error.code}: ${error.message}`);
  else if (error instanceof Error && error.name === 'AbortError') console.error('CANCELLED: Execução cancelada; checkpoint anterior preservado.');
  else console.error('OPERATION_FAILED: Não foi possível concluir. Confira argumentos, arquivos e permissões; conteúdo do erro foi omitido para proteger dados.');
  process.exitCode = 1;
});
