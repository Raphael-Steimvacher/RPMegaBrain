import { existsSync, readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import type { CapabilityRequest, ConnectorBinding, DraftPayload, ToolCatalog } from '../domain/v3/contracts.js';
import type { FakeProviderFixture } from '../adapters/integrations/fake-provider.js';
import { FakeConnectorAdapter } from '../adapters/integrations/fake-provider.js';
import { ConnectorRegistryStore } from '../adapters/filesystem/v3/connector-registry.js';
import { ExternalRefStore } from '../adapters/filesystem/v3/external-ref-store.js';
import { IntegrationService } from '../application/integrations/service.js';
import { capabilityCatalog } from '../domain/v3/catalog.js';
import { integrationPolicyHash } from '../application/integrations/policy-gateway.js';
import { DomainError } from '../domain/policy.js';
import { CredentialBoundary } from '../application/integrations/credential-boundary.js';
import { hash, stableJson } from '../infrastructure/hashing.js';
import { parseV3File } from '../infrastructure/v3/validation.js';

type Args = { positionals: string[]; options: Record<string, string | true> };
function parse(argv: string[]): Args { const positionals: string[] = []; const options: Record<string, string | true> = {};
  for (let index = 0; index < argv.length; index += 1) { const value = argv[index]!; if (!value.startsWith('--')) { positionals.push(value); continue; }
    const key = value.slice(2); if (!key || key in options) throw new DomainError('INVALID_ARGUMENTS', `Opção duplicada ou vazia: ${value}`); const next = argv[++index]; if (!next || next.startsWith('--')) throw new DomainError('MISSING_ARGUMENT', `${value} exige valor.`); options[key] = next; }
  return { positionals, options }; }
function option(args: Args, name: string, required = false): string | undefined { const value = args.options[name]; if (required && typeof value !== 'string') throw new DomainError('MISSING_ARGUMENT', `Informe --${name}.`); return typeof value === 'string' ? value : undefined; }
function allow(args: Args, names: string[]): void { for (const name of Object.keys(args.options)) if (!names.includes(name)) throw new DomainError('UNEXPECTED_FLAG', `--${name} não se aplica a este comando.`); }
function positions(args: Args, count: number): void { if (args.positionals.length !== count) throw new DomainError('INVALID_ARGUMENTS', 'Quantidade incorreta de argumentos.'); }
function structured<T>(path: string): T { const raw = readFileSync(path, 'utf8'); if (Buffer.byteLength(raw) > 2_000_000) throw new DomainError('INPUT_TOO_LARGE', 'Arquivo maior que 2 MB.'); const doc = parseDocument(raw, { uniqueKeys: true }); if (doc.errors.length) throw new DomainError('INVALID_YAML', 'YAML/JSON inválido.'); return doc.toJS({ maxAliasCount: 50 }) as T; }
function output(value: unknown): void { console.log(JSON.stringify(value, null, 2)); }
function profileServices(args: Args): { registry: ConnectorRegistryStore; service: IntegrationService } {
  const profile = option(args, 'profile', true)!; const registry = new ConnectorRegistryStore(option(args, 'state-dir'), profile); const adapters = new Map();
  const fixturePath = option(args, 'provider-fixture'); const requestPath = option(args, 'request');
  const connectorId = requestPath ? structured<CapabilityRequest>(requestPath).connector_id
    : args.positionals[0] === 'external-ref' && args.positionals[1] === 'revalidate' && args.positionals[2]
      ? new ExternalRefStore(registry.stateRoot, profile).get(args.positionals[2]).connector_id : args.positionals[2];
  if (fixturePath && connectorId) { const binding = registry.get(connectorId); adapters.set(connectorId, new FakeConnectorAdapter(binding, structured<FakeProviderFixture>(fixturePath))); }
  return { registry, service: new IntegrationService(registry, adapters) };
}
function request(args: Args): CapabilityRequest { return parseV3File<CapabilityRequest>(option(args, 'request', true)!, 'capability-request'); }

export async function handleV3(argv: string[]): Promise<boolean> {
  const command = argv[0]; if (!command || !['connector','capability','policy','integration','external-ref','consent','mail','privacy'].includes(command)) return false;
  const args = parse(argv); const sub = args.positionals[1];
  if (command === 'connector') {
    const { registry } = profileServices(args);
    if (sub === 'list') { allow(args, ['profile','state-dir']); positions(args, 2); output(registry.read()); }
    else if (sub === 'inspect') { allow(args, ['profile','state-dir']); positions(args, 3); output(registry.get(args.positionals[2]!)); }
    else if (sub === 'add') { allow(args, ['profile','state-dir','file']); positions(args, 3); const value = parseV3File<ConnectorBinding>(option(args, 'file', true)!, 'connector-binding'); if (args.positionals[2] !== 'fake' && value.provider !== args.positionals[2]) throw new DomainError('PROVIDER_MISMATCH', 'Provider do binding difere do comando.'); output(registry.add(value)); }
    else if (sub === 'mode') { allow(args, ['profile','state-dir','value']); positions(args, 2); const mode = option(args, 'value', true)!; if (!['disabled','shadow','enabled'].includes(mode)) throw new DomainError('INVALID_MODE', 'Use disabled, shadow ou enabled.'); output(registry.setMode(mode as 'disabled' | 'shadow' | 'enabled')); }
    else if (sub === 'verify') { allow(args, ['profile','state-dir','provider-fixture']); positions(args, 3); const connector = registry.get(args.positionals[2]!); const adapter = new FakeConnectorAdapter(connector, structured<FakeProviderFixture>(option(args, 'provider-fixture', true)!)); output(await new CredentialBoundary().verify(registry, connector, adapter)); }
    else if (sub === 'doctor') { allow(args, ['profile','state-dir','provider-fixture']); positions(args, 3); const connector = registry.get(args.positionals[2]!); const adapter = new FakeConnectorAdapter(connector, structured<FakeProviderFixture>(option(args, 'provider-fixture', true)!)); output({ connector_id: connector.connector_id, state: connector.state, health: await adapter.healthCheck(), identity_verified: connector.identity_verified, catalog_locked: existsSync(registry.catalogPath(connector.connector_id)) }); }
    else if (sub === 'catalog' || sub === 'review-drift') { allow(args, ['profile','state-dir','provider-fixture']); positions(args, 3); const connector = registry.get(args.positionals[2]!); const fixturePath = option(args, 'provider-fixture'); if (!fixturePath) { output(registry.getCatalog(connector.connector_id)); return true; } const entries = new FakeConnectorAdapter(connector, structured<FakeProviderFixture>(fixturePath)).discoverCapabilities(); const catalog: ToolCatalog = { schema_version: 1, connector_id: connector.connector_id, catalog_hash: hash(stableJson(entries)), reviewed_at: new Date().toISOString(), entries }; output(registry.putCatalog(catalog, sub === 'review-drift')); }
    else if (sub === 'quarantine') { allow(args, ['profile','state-dir']); positions(args, 3); output(registry.setState(args.positionals[2]!, 'quarantined')); }
    else if (sub === 'disconnect') { allow(args, ['profile','state-dir']); positions(args, 3); output(registry.disconnect(args.positionals[2]!)); }
    else if (sub === 'login') { allow(args, ['profile','state-dir']); positions(args, 3); registry.get(args.positionals[2]!); throw new DomainError('AUTH_EXTERNAL_REQUIRED', 'Login deve ser concluído pelo host/provider; esta alpha não simula OAuth.'); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando connector desconhecido.'); return true;
  }
  const { registry, service } = profileServices(args);
  if (command === 'capability') {
    if (sub === 'list') { allow(args, ['profile','state-dir']); positions(args, 3); const connector = registry.get(args.positionals[2]!); output(connector.capability_allowlist.map(name => capabilityCatalog.get(name))); }
    else if (sub === 'explain') { allow(args, ['profile','state-dir']); positions(args, 3); const item = capabilityCatalog.get(args.positionals[2]!); if (!item) throw new DomainError('CAPABILITY_UNKNOWN', 'Capability desconhecida.'); output(item); }
    else if (sub === 'test') { allow(args, ['profile','state-dir','request']); positions(args, 4); const value = request(args); if (value.connector_id !== args.positionals[2] || value.capability !== args.positionals[3]) throw new DomainError('REQUEST_MISMATCH', 'Request não corresponde aos argumentos.'); output(service.check(value)); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando capability desconhecido.'); return true;
  }
  if (command === 'policy') {
    if (sub === 'check') { allow(args, ['profile','state-dir','request']); positions(args, 2); output(service.check(request(args))); }
    else if (sub === 'explain') { allow(args, ['profile','state-dir']); positions(args, 3); output(service.decisions.get(args.positionals[2]!)); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando policy desconhecido.'); return true;
  }
  if (command === 'integration') {
    if (sub === 'preflight') { allow(args, ['profile','state-dir']); positions(args, 2); const document = registry.read(); output({ integration_mode: document.integration_mode, connectors: document.connectors.map(item => ({ connector_id: item.connector_id, state: item.state, identity_verified: item.identity_verified, catalog_locked: existsSync(registry.catalogPath(item.connector_id)) })) }); }
    else if (sub === 'call') { allow(args, ['profile','state-dir','request','provider-fixture']); positions(args, 2); output(await service.execute(request(args))); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando integration desconhecido.'); return true;
  }
  if (command === 'external-ref') {
    if (sub === 'inspect') { allow(args, ['profile','state-dir']); positions(args, 3); output(service.refs.get(args.positionals[2]!)); }
    else if (sub === 'revalidate') { allow(args, ['profile','state-dir','provider-fixture']); positions(args, 3); output(await service.revalidate(args.positionals[2]!)); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando external-ref desconhecido.'); return true;
  }
  if (command === 'consent') {
    if (sub === 'list') { allow(args, ['profile','state-dir']); positions(args, 2); output(service.consents.list()); }
    else if (sub === 'inspect') { allow(args, ['profile','state-dir']); positions(args, 3); output(service.consents.get(args.positionals[2]!)); }
    else if (sub === 'revoke') { allow(args, ['profile','state-dir']); positions(args, 3); output(service.consents.revoke(args.positionals[2]!)); }
    else if (sub === 'purge-expired') { allow(args, ['profile','state-dir']); positions(args, 2); output({ purged: service.consents.purgeExpired() }); }
    else if (sub === 'grant') { allow(args, ['profile','state-dir','request','expires-at','bind-to','interaction']); positions(args, 2); const value = request(args); const definition = capabilityCatalog.get(value.capability); if (!definition) throw new DomainError('CAPABILITY_UNKNOWN', 'Capability desconhecida.'); output(service.consents.grant({ request: value, effect_class: definition.effect_class, actor: 'user', source_interaction: option(args, 'interaction', true)!, policy_hash: integrationPolicyHash, expires_at: option(args, 'expires-at', true)!, bind_to: option(args, 'bind-to', true)! as 'standing'|'task'|'run'|'call' })); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Subcomando consent desconhecido.'); return true;
  }
  if (command === 'mail') {
    if (sub === 'search' || sub === 'read') { allow(args, ['profile','state-dir','request','provider-fixture']); positions(args, 2); output(await service.execute(request(args))); return true; }
    if (sub === 'send') { allow(args, ['profile','state-dir']); positions(args, 2); registry.events.emit({ event: 'forbidden_send_attempted', run_id: null, task_id: null, connector_id: null, attributes: { reason_code: 'EFFECT_HARD_DENIED' } }); throw new DomainError('EFFECT_HARD_DENIED', 'mail send não existe no domínio v0.3.'); }
    if (sub !== 'draft') throw new DomainError('UNKNOWN_COMMAND', 'Send e outras mutações não existem na v0.3.'); const action = args.positionals[2];
    if (action === 'local' || action === 'external') { allow(args, ['profile','state-dir','payload','connector','task','run']); positions(args, 3); output(service.createDraftIntent({ connector_id: action === 'external' ? option(args, 'connector', true)! : null, task_id: option(args, 'task', true)!, run_id: option(args, 'run', true)!, payload: structured<DraftPayload>(option(args, 'payload', true)!), mode: action })); }
    else if (action === 'inspect') { allow(args, ['profile','state-dir']); positions(args, 4); output(service.drafts.get(args.positionals[3]!)); }
    else if (action === 'approve') { allow(args, ['profile','state-dir','request','expires-at','interaction']); positions(args, 4); const intent = service.drafts.get(args.positionals[3]!); const value = request(args); if (value.payload_hash !== intent.payload_hash) throw new DomainError('PAYLOAD_CHANGED', 'Request não contém o hash do intent.'); output(service.consents.grant({ request: value, effect_class: 'W1', actor: 'user', source_interaction: option(args, 'interaction', true)!, policy_hash: integrationPolicyHash, expires_at: option(args, 'expires-at', true)!, bind_to: 'call' })); }
    else if (action === 'create') { allow(args, ['profile','state-dir','request','provider-fixture']); positions(args, 4); output(await service.createExternalDraft(args.positionals[3]!, request(args))); }
    else throw new DomainError('UNKNOWN_COMMAND', 'Use mail draft local|external|inspect|approve|create.'); return true;
  }
  if (command === 'privacy') { if (sub !== 'purge') throw new DomainError('UNKNOWN_COMMAND', 'Use privacy purge CONNECTOR.'); allow(args, ['profile','state-dir']); positions(args, 3); output(service.privacyPurge(args.positionals[2]!)); return true; }
  return false;
}
