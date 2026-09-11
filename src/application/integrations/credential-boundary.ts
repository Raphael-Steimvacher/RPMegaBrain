import type { ConnectorPort } from '../../domain/v3/ports.js';
import type { ConnectorBinding } from '../../domain/v3/contracts.js';
import { ConnectorRegistryStore } from '../../adapters/filesystem/v3/connector-registry.js';
import { DomainError } from '../../domain/policy.js';

export class CredentialBoundary {
  async verify(registry: ConnectorRegistryStore, connector: ConnectorBinding, adapter: ConnectorPort): Promise<ConnectorBinding> {
    if (!/^(host-managed|keyring|env):[A-Za-z0-9._-]+$/.test(connector.secret_ref)) throw new DomainError('SECRET_REF_INVALID', 'Connector não possui referência opaca válida.');
    if (adapter.provider !== connector.provider) throw new DomainError('PROVIDER_MISMATCH', 'Adapter não corresponde ao connector.');
    return registry.verify(connector.connector_id, await adapter.verifyIdentity());
  }
  async disconnect(registry: ConnectorRegistryStore, connector: ConnectorBinding, adapter: ConnectorPort): Promise<ConnectorBinding> {
    await adapter.disconnect(); return registry.disconnect(connector.connector_id);
  }
}
