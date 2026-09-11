import { chmodSync, existsSync, mkdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../../domain/policy.js';
import { assertNoLinks, within } from './paths.js';

export function atomicWrite(path: string, content: string): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertNoLinks(parent);
  const temp = join(parent, `.pending-${randomUUID()}`);
  writeFileSync(temp, content, { flag: 'wx', mode: 0o600 });
  try {
    if (existsSync(path)) {
      const backup = join(parent, `.replace-${randomUUID()}`);
      renameSync(path, backup);
      try { renameSync(temp, path); rmSync(backup); }
      catch (error) { if (!existsSync(path) && existsSync(backup)) renameSync(backup, path); throw error; }
    } else renameSync(temp, path);
    try { chmodSync(path, 0o600); } catch { /* ACLs govern Windows. */ }
  } catch (error) {
    if (within(parent, temp) && existsSync(temp)) rmSync(temp);
    throw error;
  }
}
export function withDirectoryLock<T>(lockPath: string, fn: () => T): T {
  try { mkdirSync(lockPath, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new DomainError('RESOURCE_BUSY', 'Recurso em uso; confira o processo antes de recuperar o lock.');
    throw error;
  }
  try { return fn(); } finally { rmdirSync(lockPath); }
}
