import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { atomicWrite } from '../../../infrastructure/v2/atomic.js';
import { assertIdentifier, ensurePrivateDirectory } from '../../../infrastructure/v2/paths.js';
import { defaultStateRoot } from '../../../infrastructure/run-store.js';
import { DomainError } from '../../../domain/policy.js';
import { coreRoot } from '../../../infrastructure/validation.js';
import { stableJson } from '../../../infrastructure/hashing.js';

export class V4Store<T extends object> {
  readonly root: string;
  constructor(stateRoot = defaultStateRoot(), readonly profileId: string, readonly kind: string) {
    assertIdentifier(profileId, 'profile_id');
    const base = resolve(stateRoot); this.assertOutsideRepository(base); this.root = join(base, 'profiles', profileId, 'evaluation', kind);
    ensurePrivateDirectory(this.root);
  }
  path(id: string): string { assertIdentifier(id, `${this.kind}_id`); return join(this.root, `${id}.yaml`); }
  put(value: T, id: string): T {
    const path = this.path(id);
    if (existsSync(path)) {
      const existing = parse(readFileSync(path, 'utf8')) as T;
      if (stableJson(existing) === stableJson(value)) return existing;
      throw new DomainError('IMMUTABLE_RECORD', 'Registro v0.4 é imutável; crie uma nova versão.');
    }
    atomicWrite(path, stringify(value)); return value;
  }
  replace(value: T, id: string): T { atomicWrite(this.path(id), stringify(value)); return value; }
  get(id: string): T { try { return parse(readFileSync(this.path(id), 'utf8')) as T; } catch { throw new DomainError('V4_RECORD_NOT_FOUND', 'Registro v0.4 não encontrado.'); } }
  list(): T[] { if (!existsSync(this.root)) return []; return readdirSync(this.root).filter(name => name.endsWith('.yaml')).sort().map(name => parse(readFileSync(join(this.root, name), 'utf8')) as T); }
  has(id: string): boolean { return existsSync(this.path(id)); }
  newId(prefix: string): string { return `${prefix}_${randomUUID()}`; }
  private assertOutsideRepository(path: string): void {
    const rel = relative(resolve(coreRoot), path); if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) throw new DomainError('STATE_IN_REPOSITORY', 'Estado v0.4 deve ficar fora do repositório.');
    let current = path;
    while (true) { const marker = join(current, '.git'); const runnerSentinel = current === resolve(tmpdir()) && existsSync(marker) && !existsSync(join(marker, 'HEAD')) && !existsSync(join(marker, 'config')); if (existsSync(marker) && !runnerSentinel) throw new DomainError('STATE_IN_REPOSITORY', 'Estado v0.4 deve ficar fora de repositórios Git.'); const parent = dirname(current); if (parent === current) return; current = parent; }
  }
}
