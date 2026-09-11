import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hash, stableJson } from './hashing.js';

export function componentHashes(root: string): Record<string, string> {
  const files: string[] = ['VERSION', 'package.json', 'package-lock.json'];
  function visit(directory: string): void {
    for (const item of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.isFile()) files.push(path);
      else throw new Error('Componentes do núcleo devem ser arquivos regulares.');
    }
  }
  for (const directory of ['src', 'schemas', 'policies', 'profiles']) visit(directory);
  return Object.fromEntries(files.sort().map(path => [relative(root, join(root, path)).replaceAll('\\', '/'), hash(readFileSync(join(root, path), 'utf8').replaceAll('\r\n', '\n'))]));
}
export function runtimeFingerprint(root: string): string { return hash(stableJson(componentHashes(root))); }
