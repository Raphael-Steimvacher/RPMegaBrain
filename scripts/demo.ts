import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workflow } from '../src/application/workflow.js';
import { RunStore } from '../src/infrastructure/run-store.js';
import { coreRoot, parseFile } from '../src/infrastructure/validation.js';
import type { TaskInput } from '../src/domain/contracts.js';
import type { CapabilityRequest, ConnectorBinding } from '../src/domain/v3/contracts.js';
import type { FakeProviderFixture } from '../src/adapters/integrations/fake-provider.js';
import { FakeConnectorAdapter } from '../src/adapters/integrations/fake-provider.js';
import { ConnectorRegistryStore } from '../src/adapters/filesystem/v3/connector-registry.js';
import { IntegrationService } from '../src/application/integrations/service.js';
import { hash, stableJson } from '../src/infrastructure/hashing.js';
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

const fixture = JSON.parse(readFileSync(join(coreRoot, 'evals/fixtures/providers/github.json'), 'utf8')) as FakeProviderFixture;
const catalogHash = hash(stableJson(fixture.tools));
const binding: ConnectorBinding = { schema_version: 1, connector_id: 'personal.fake.github', provider: 'github', transport: 'fake', profile_id: 'personal', account_alias: 'synthetic-github',
  account_subject_hash: fixture.identity.account_subject_hash, tenant_or_org_id_hash: fixture.identity.tenant_or_org_id_hash, endpoint: 'https://github.example.invalid', expected_scopes: fixture.identity.granted_scopes,
  granted_scopes: [], resource_allowlist: { repositories: ['example/repository'] }, capability_allowlist: ['scm.issue.read'], allowed_workflows: ['planning'], consent_mode: 'standing_read',
  max_sensitivity: 'personal', persistence_mode: 'reference_only', state: 'configured', catalog_hash: catalogHash, secret_ref: 'host-managed:fake', draft_enabled: false,
  identity_verified: false, verified_at: null, created_at: new Date().toISOString() };
const registry = new ConnectorRegistryStore(join(root, 'state'), 'personal'); registry.add(binding);
registry.putCatalog({ schema_version: 1, connector_id: binding.connector_id, catalog_hash: catalogHash, reviewed_at: new Date().toISOString(), entries: fixture.tools }); registry.verify(binding.connector_id, fixture.identity); registry.setMode('enabled');
const adapter = new FakeConnectorAdapter(registry.get(binding.connector_id), fixture); const integrations = new IntegrationService(registry, new Map([[binding.connector_id, adapter]]));
const integrationRequest: CapabilityRequest = { schema_version: 1, request_id: 'ireq_demo', run_id: 'RUN-DEMO-V3', task_id: 'TASK-DEMO-V3', profile_id: 'personal', workflow: 'planning', connector_id: binding.connector_id,
  capability: 'scm.issue.read', purpose: 'Demonstrar leitura externa sintética', resources: { repository: 'example/repository' }, query: null, requested_fields: ['title','state'], pagination: { page_size: 1, max_pages: 1, max_items: 1 },
  sensitivity_ceiling: 'personal', destination: 'current_context', payload_hash: null, created_at: new Date().toISOString() };
const external = await integrations.execute(integrationRequest);
console.log(`Gateway v0.3: ${external.decision.decision}; ${external.external_refs.length} external ref; conteúdo marcado ${external.context[0]?.trust ?? 'ausente'}.`);
console.log('Provider fake: nenhuma rede, OAuth, conta real ou escrita externa foi usada.');
