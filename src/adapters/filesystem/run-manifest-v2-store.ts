import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { CheckpointV2, ContextBundle, RunManifestV2 } from '../../domain/v2/contracts.js';
import { hash, stableJson } from '../../infrastructure/hashing.js';
import { validateV2 } from '../../infrastructure/v2/validation.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../infrastructure/v2/paths.js';
import { atomicWrite } from '../../infrastructure/v2/atomic.js';
import { DomainError } from '../../domain/policy.js';

export interface ManifestUpdate {
  resumed?: boolean;
  strategy?: RunManifestV2['continuity']['strategy'];
  context?: ContextBundle | null;
}

export class RunManifestV2Store {
  constructor(private readonly stateRoot: string, private readonly profileId: string) {
    assertIdentifier(profileId, 'profile_id');
  }
  private path(runId: string): string {
    assertIdentifier(runId, 'run_id');
    return join(this.stateRoot, 'profiles', this.profileId, 'runs', runId, 'run-manifest-v2.yaml');
  }
  has(runId: string): boolean { return existsSync(this.path(runId)); }
  write(checkpoint: CheckpointV2, update: ManifestUpdate = {}): RunManifestV2 {
    if (checkpoint.profile_id !== this.profileId) throw new DomainError('PROFILE_MISMATCH', 'Manifest pertence a outro perfil.');
    const context = update.context ?? null;
    const selectedIds = context?.selected.map(item => item.item_id) ?? [];
    const registryHash = hash(stableJson(context?.source_snapshots.map(item => ({ source_id: item.source_id, revision: item.revision })) ?? checkpoint.source_snapshots));
    const manifest: RunManifestV2 = {
      schema_version: 2,
      run_id: checkpoint.run_id,
      task_id: checkpoint.task_id,
      harness_version: checkpoint.harness.version,
      harness_commit: checkpoint.harness.commit,
      telemetry_schema_version: 2,
      memory_schema_version: 1,
      checkpoint_schema_version: 1,
      retrieval_schema_version: 1,
      profile_id: checkpoint.profile_id,
      mode: checkpoint.mode,
      workflow: checkpoint.stage,
      engine: { provider: checkpoint.engine.provider, model: null, reasoning_effort: null, codex_version: null, thread_id: checkpoint.engine.thread_id },
      native_codex_memory: { use: false, generate: false, external_context_generation: false, policy_reason: 'megabrain_managed_memory' },
      configuration: {
        config_hash: hash(stableJson({ profile_id: checkpoint.profile_id, policies_hash: checkpoint.harness.policies_hash, skills_hash: checkpoint.harness.skills_hash })),
        policies_hash: checkpoint.harness.policies_hash,
        skills_hash: checkpoint.harness.skills_hash,
      },
      continuity: { resumed: update.resumed ?? false, strategy: update.strategy ?? 'new', checkpoint_id: checkpoint.checkpoint_id },
      memory: { snapshot_id: context?.memory_snapshot_id ?? checkpoint.memory_snapshot_id, selected_ids: selectedIds },
      sources: { registry_hash: registryHash, snapshots: context?.source_snapshots ?? checkpoint.source_snapshots },
      eval_suite_version: '0.2.0-deterministic',
    };
    validateV2<RunManifestV2>('run-manifest-v2', manifest);
    const path = this.path(checkpoint.run_id);
    ensurePrivateDirectory(dirname(path));
    atomicWrite(path, stringify(manifest));
    return manifest;
  }
  read(runId: string): RunManifestV2 {
    const path = this.path(runId);
    if (!existsSync(path)) throw new DomainError('RUN_MANIFEST_NOT_FOUND', 'Manifest v2 não encontrado.');
    const manifest = parse(readFileSync(path, 'utf8')) as RunManifestV2;
    validateV2<RunManifestV2>('run-manifest-v2', manifest);
    if (manifest.profile_id !== this.profileId || manifest.run_id !== runId) throw new DomainError('RUN_MANIFEST_IDENTITY_MISMATCH', 'Identidade do manifest não corresponde ao caminho.');
    return manifest;
  }
  attachContext(runId: string, context: ContextBundle): RunManifestV2 {
    const manifest = this.read(runId);
    if (context.run_id !== runId || context.profile_id !== this.profileId || context.task_id !== manifest.task_id) {
      throw new DomainError('RUN_MANIFEST_IDENTITY_MISMATCH', 'Context bundle não pertence ao manifest.');
    }
    const next: RunManifestV2 = {
      ...manifest,
      memory: { snapshot_id: context.memory_snapshot_id, selected_ids: context.selected.filter(item => item.type === 'warm').map(item => item.item_id) },
      sources: {
        registry_hash: hash(stableJson(context.source_snapshots.map(item => ({ source_id: item.source_id, revision: item.revision })))),
        snapshots: context.source_snapshots,
      },
    };
    validateV2<RunManifestV2>('run-manifest-v2', next);
    atomicWrite(this.path(runId), stringify(next));
    return next;
  }
}
