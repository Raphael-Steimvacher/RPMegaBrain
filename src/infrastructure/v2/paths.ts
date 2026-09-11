import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { DomainError } from '../../domain/policy.js';

export function assertIdentifier(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value)) throw new DomainError('INVALID_IDENTIFIER', `${label} inválido.`);
  return value;
}
export function within(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
export function assertNoLinks(path: string, stopAt?: string): void {
  let current = resolve(path);
  const stop = stopAt ? resolve(stopAt) : undefined;
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new DomainError('UNSAFE_PATH', 'Symlink ou junction não permitido neste caminho.');
    if (stop && current === stop) return;
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
export function ensurePrivateDirectory(path: string): void {
  assertNoLinks(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertNoLinks(path);
}
export function resolveInside(root: string, path: string): string {
  const canonicalRoot = realpathSync(root);
  const canonical = realpathSync(path);
  if (!within(canonicalRoot, canonical)) throw new DomainError('PATH_BLOCKED', 'Caminho resolvido fora da raiz permitida.');
  return canonical;
}
export function defaultCacheRoot(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (env.MEGABRAIN_CACHE_HOME) return resolve(env.MEGABRAIN_CACHE_HOME);
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'megabrain', 'cache');
  const xdg = env.XDG_CACHE_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.cache'), 'megabrain');
}
