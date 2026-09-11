import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { ConnectorBinding, ConnectorRegistryDocument, ConnectorState, ToolCatalog } from '../../../domain/v3/contracts.js';
import type { ProviderIdentity } from '../../../domain/v3/ports.js';
import { DomainError } from '../../../domain/policy.js';
import { hash, stableJson } from '../../../infrastructure/hashing.js';
import { RunStore } from '../../../infrastructure/run-store.js';
import { atomicWrite, withDirectoryLock } from '../../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../../infrastructure/v2/paths.js';
import { validateV3 } from '../../../infrastructure/v3/validation.js';
import { IntegrationEventLog } from '../../../infrastructure/v3/events.js';

export class ConnectorRegistryStore {
  readonly stateRoot: string;
  readonly root: string;
  readonly events: IntegrationEventLog;
  private readonly registryPath: string;
  private readonly lockPath: string;
  constructor(stateRoot: string | undefined, readonly profileId: string) {
    assertIdentifier(profileId, 'profile_id'); this.stateRoot = new RunStore(stateRoot).root;
    this.root = join(this.stateRoot, 'profiles', profileId, 'connectors'); ensurePrivateDirectory(this.root);
    ensurePrivateDirectory(join(this.root, 'catalogs')); ensurePrivateDirectory(join(this.stateRoot, 'locks'));
    this.registryPath = join(this.root, 'registry.yaml'); this.lockPath = join(this.stateRoot, 'locks', `connector-registry-${profileId}`);
    this.events = new IntegrationEventLog(this.stateRoot, profileId);
  }
  read(): ConnectorRegistryDocument {
    if (!existsSync(this.registryPath)) return { schema_version: 1, profile_id: this.profileId, integration_mode: 'disabled', connectors: [] };
    const value = validateV3<ConnectorRegistryDocument>('connector-registry', parse(readFileSync(this.registryPath, 'utf8')));
    if (value.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Registry pertence a outro perfil.');
    return value;
  }
  private write(document: ConnectorRegistryDocument): void { validateV3('connector-registry', document); atomicWrite(this.registryPath, stringify(document)); }
  setMode(mode: ConnectorRegistryDocument['integration_mode']): ConnectorRegistryDocument {
    if (this.profileId === 'work.colmeia' && mode === 'enabled') throw new DomainError('ORGANIZATIONAL_AUTHORIZATION_REQUIRED', 'work.colmeia permanece disabled nesta alpha até existir um binding de autorização organizacional verificável.');
    return withDirectoryLock(this.lockPath, () => { const document = this.read(); const next = { ...document, integration_mode: mode }; this.write(next); return next; });
  }
  add(binding: ConnectorBinding): ConnectorBinding {
    validateV3('connector-binding', binding);
    if (binding.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Connector pertence a outro perfil.');
    if (binding.state === 'healthy' || binding.identity_verified || binding.granted_scopes.length || binding.verified_at) throw new DomainError('UNVERIFIED_CONNECTOR', 'Connector novo deve iniciar sem autenticação verificada.');
    if (binding.secret_ref.includes('@') || /(?:bearer|token=|secret=)/i.test(binding.secret_ref)) throw new DomainError('SECRET_REF_INVALID', 'Use somente referência opaca de segredo.');
    return withDirectoryLock(this.lockPath, () => {
      const document = this.read(); if (document.connectors.some(item => item.connector_id === binding.connector_id)) throw new DomainError('CONNECTOR_EXISTS', 'Connector já existe.');
      this.write({ ...document, connectors: [...document.connectors, structuredClone(binding)] });
      this.events.emit({ event: 'connector.configured', run_id: null, task_id: null, connector_id: binding.connector_id, attributes: { provider: binding.provider, status: binding.state } });
      return binding;
    });
  }
  list(): ConnectorBinding[] { return this.read().connectors; }
  get(connectorId: string): ConnectorBinding {
    assertIdentifier(connectorId, 'connector_id'); const found = this.read().connectors.find(item => item.connector_id === connectorId);
    if (!found) throw new DomainError('CONNECTOR_NOT_FOUND', 'Connector não encontrado nesse perfil.'); return found;
  }
  update(connectorId: string, fn: (current: ConnectorBinding) => ConnectorBinding): ConnectorBinding {
    return withDirectoryLock(this.lockPath, () => {
      const document = this.read(); const index = document.connectors.findIndex(item => item.connector_id === connectorId);
      if (index < 0) throw new DomainError('CONNECTOR_NOT_FOUND', 'Connector não encontrado nesse perfil.');
      const next = fn(structuredClone(document.connectors[index]!)); validateV3('connector-binding', next);
      if (next.connector_id !== connectorId || next.profile_id !== this.profileId) throw new DomainError('CONNECTOR_IDENTITY_IMMUTABLE', 'Connector não pode mudar ID ou perfil.');
      const connectors = [...document.connectors]; connectors[index] = next; this.write({ ...document, connectors }); return next;
    });
  }
  setState(connectorId: string, state: ConnectorState, event?: string): ConnectorBinding {
    const next = this.update(connectorId, current => ({ ...current, state }));
    this.events.emit({ event: event ?? `connector.${state}`, run_id: null, task_id: null, connector_id: connectorId, attributes: { provider: next.provider, status: state } }); return next;
  }
  verify(connectorId: string, identity: ProviderIdentity): ConnectorBinding {
    const current = this.get(connectorId); const expectedScopes = [...current.expected_scopes].sort(); const granted = [...identity.granted_scopes].sort();
    if (current.state === 'revoked') throw new DomainError('AUTH_REQUIRED', 'Connector revogado exige reconexão explícita antes da verificação.');
    if (current.state === 'quarantined') throw new DomainError('CONNECTOR_QUARANTINED', 'Revise a causa da quarentena antes de verificar novamente.');
    const accountMismatch = identity.account_subject_hash !== current.account_subject_hash;
    const tenantMismatch = identity.tenant_or_org_id_hash !== current.tenant_or_org_id_hash;
    const scopeMismatch = stableJson(expectedScopes) !== stableJson(granted);
    if (accountMismatch || tenantMismatch || scopeMismatch) {
      const reason = accountMismatch ? 'ACCOUNT_MISMATCH' : tenantMismatch ? 'TENANT_MISMATCH' : 'SCOPE_MISMATCH';
      const next = this.update(connectorId, value => ({ ...value, granted_scopes: identity.granted_scopes, identity_verified: false, verified_at: new Date().toISOString(), state: 'quarantined' }));
      this.events.emit({ event: accountMismatch || tenantMismatch ? 'connector.identity_mismatch' : 'connector.quarantined', run_id: null, task_id: null, connector_id: connectorId, attributes: { reason_code: reason, status: next.state } }); return next;
    }
    const next = this.update(connectorId, value => ({ ...value, granted_scopes: identity.granted_scopes, identity_verified: true, verified_at: new Date().toISOString(), state: 'healthy' }));
    this.events.emit({ event: 'connector.identity_verified', run_id: null, task_id: null, connector_id: connectorId, attributes: { provider: next.provider, status: next.state } }); return next;
  }
  disconnect(connectorId: string): ConnectorBinding { const next = this.update(connectorId, value => ({ ...value, state: 'revoked', identity_verified: false, granted_scopes: [] })); this.events.emit({ event: 'connector.revoked', run_id: null, task_id: null, connector_id: connectorId, attributes: { provider: next.provider, status: next.state } }); return next; }
  catalogPath(connectorId: string): string { assertIdentifier(connectorId, 'connector_id'); return join(this.root, 'catalogs', `${connectorId}.json`); }
  putCatalog(catalog: ToolCatalog, reviewed = false): ToolCatalog {
    validateV3('tool-catalog', catalog); const connector = this.get(catalog.connector_id);
    const computed = hash(stableJson(catalog.entries)); if (computed !== catalog.catalog_hash) throw new DomainError('CATALOG_HASH_INVALID', 'Hash do catálogo não confere.');
    if (connector.catalog_hash !== catalog.catalog_hash && !reviewed) {
      this.setState(connector.connector_id, 'quarantined', 'tool_catalog.drift_detected');
      throw new DomainError('TOOL_CATALOG_DRIFT', 'Catálogo mudou e foi colocado em quarentena.');
    }
    atomicWrite(this.catalogPath(catalog.connector_id), JSON.stringify(catalog, null, 2) + '\n');
    if (reviewed) this.update(connector.connector_id, value => ({ ...value, catalog_hash: catalog.catalog_hash, state: value.state === 'revoked' ? 'revoked' : value.identity_verified ? 'healthy' : 'configured' }));
    this.events.emit({ event: reviewed ? 'tool_catalog.reviewed' : 'tool_catalog.locked', run_id: null, task_id: null, connector_id: catalog.connector_id, attributes: { catalog_hash: catalog.catalog_hash } }); return catalog;
  }
  getCatalog(connectorId: string): ToolCatalog {
    const path = this.catalogPath(connectorId); if (!existsSync(path)) throw new DomainError('TOOL_CATALOG_MISSING', 'Catálogo do connector ausente.');
    const value = validateV3<ToolCatalog>('tool-catalog', JSON.parse(readFileSync(path, 'utf8')));
    if (value.connector_id !== connectorId || hash(stableJson(value.entries)) !== value.catalog_hash) throw new DomainError('TOOL_CATALOG_DRIFT', 'Catálogo inválido ou alterado.'); return value;
  }
}
