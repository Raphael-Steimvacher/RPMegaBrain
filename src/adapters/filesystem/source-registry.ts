import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, matchesGlob, relative, resolve } from 'node:path';
import type { FullSourcePort, SourceDoctorResult, SourceSearchResponse } from '../../domain/v2/source-registry.js';
import type { FullSource, SourceRegistryDocument, SourceSearchResult, SourceSnapshot } from '../../domain/v2/contracts.js';
import { DomainError } from '../../domain/policy.js';
import { hash } from '../../infrastructure/hashing.js';
import { EventLogV2 } from '../../infrastructure/v2/events.js';
import { assertIdentifier, resolveInside, within } from '../../infrastructure/v2/paths.js';
import { parseV2File } from '../../infrastructure/v2/validation.js';

const sensitivityRank = { public: 0, personal: 1, confidential: 2 } as const;
function normalized(path: string): string { return path.replaceAll('\\', '/').replace(/^\.\//, ''); }
function matches(source: FullSource, logical: string): boolean {
  const path = normalized(logical);
  return source.include.some(pattern => matchesGlob(path, pattern)) && !source.exclude.some(pattern => matchesGlob(path, pattern) || matchesGlob(path.split('/').at(-1) ?? path, pattern));
}
interface FileHit { logical: string; line: number; }

function filesystemSearch(source: FullSource, root: string, query: string): FileHit[] {
  const hits: FileHit[] = []; const stack = [root]; let visited = 0;
  while (stack.length && visited < 100_000) {
    const directory = stack.pop()!;
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const directories: string[] = [];
    for (const entry of entries) {
      visited += 1; const path = join(directory, entry.name); const logical = normalized(relative(root, path));
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!source.exclude.some(pattern => matchesGlob(logical, pattern) || matchesGlob(`${logical}/x`, pattern))) directories.push(path);
        continue;
      }
      if (!entry.isFile() || !matches(source, logical)) continue;
      const canonical = resolveInside(root, path); const metadata = statSync(canonical);
      if (metadata.size > source.max_item_bytes) continue;
      const bytes = readFileSync(canonical); if (bytes.includes(0)) continue;
      const lines = bytes.toString('utf8').split(/\r?\n/); let found = 0;
      for (let index = 0; index < lines.length && found < 3; index += 1) {
        if (lines[index]!.includes(query)) { hits.push({ logical, line: index + 1 }); found += 1; }
      }
    }
    directories.reverse().forEach(path => stack.push(path));
  }
  return hits;
}
export class FilesystemSourceRegistry implements FullSourcePort {
  private readonly registry: SourceRegistryDocument;
  constructor(path: string, readonly profileId: string, private readonly events?: EventLogV2) {
    assertIdentifier(profileId, 'profile_id');
    this.registry = parseV2File(path, 'source-registry');
    if (this.registry.profile_id !== profileId) throw new DomainError('PROFILE_MISMATCH', 'Registry pertence a outro perfil.');
    const ids = this.registry.sources.map(s => s.source_id);
    if (new Set(ids).size !== ids.length) throw new DomainError('DUPLICATE_SOURCE', 'Registry contém source_id duplicado.');
    for (const source of this.registry.sources) if (!isAbsolute(source.root)) throw new DomainError('SOURCE_ROOT_NOT_ABSOLUTE', `A root de ${source.source_id} deve ser absoluta.`);
  }
  document(): SourceRegistryDocument { return structuredClone(this.registry); }
  list(): FullSource[] { return structuredClone(this.registry.sources); }
  inspect(sourceId: string): FullSource {
    assertIdentifier(sourceId, 'source_id');
    const source = this.registry.sources.find(s => s.source_id === sourceId);
    if (!source) throw new DomainError('SOURCE_NOT_ALLOWED', 'Fonte não declarada neste perfil.');
    return structuredClone(source);
  }
  doctor(sourceId: string): SourceDoctorResult {
    const source = this.inspect(sourceId); const issues: string[] = [];
    if (!existsSync(source.root)) return { source_id: sourceId, available: false, root: source.root, issues: ['SOURCE_UNAVAILABLE'] };
    let root: string;
    try { root = realpathSync(source.root); } catch { return { source_id: sourceId, available: false, root: source.root, issues: ['SOURCE_UNAVAILABLE'] }; }
    if (!statSync(root).isDirectory()) issues.push('ROOT_NOT_DIRECTORY');
    const stack = [root]; let visited = 0;
    while (stack.length && visited < 100_000) {
      const directory = stack.pop()!;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        visited += 1; const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          try { if (!within(root, realpathSync(path))) issues.push(`PATH_BLOCKED:${normalized(relative(root, path))}`); }
          catch { issues.push(`BROKEN_LINK:${normalized(relative(root, path))}`); }
        } else if (entry.isDirectory()) {
          const logical = normalized(relative(root, path));
          if (!source.exclude.some(pattern => matchesGlob(logical, pattern) || matchesGlob(`${logical}/x`, pattern))) stack.push(path);
        }
      }
    }
    if (visited >= 100_000) issues.push('SCAN_LIMIT_REACHED');
    return { source_id: sourceId, available: !issues.some(i => i.startsWith('SOURCE_UNAVAILABLE') || i.startsWith('ROOT_NOT_DIRECTORY') || i.startsWith('PATH_BLOCKED')), root, issues };
  }
  private revision(source: FullSource): string {
    if (source.freshness.strategy === 'git-commit' || source.adapter === 'git-repository') {
      try {
        const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source.root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
        const branch = execFileSync('git', ['branch', '--show-current'], { cwd: source.root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim() || 'detached';
        const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: source.root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim() ? 'dirty' : 'clean';
        return `git:${commit}:${branch}:${dirty}`;
      } catch { return 'git:unavailable'; }
    }
    return `filesystem:${hash(source.root).slice(7, 23)}`;
  }
  snapshot(sourceId: string, selectedHashes: string[] = []): SourceSnapshot {
    const source = this.inspect(sourceId);
    const value = { source_id: sourceId, revision: this.revision(source), selected_hashes: [...selectedHashes].sort(), captured_at: new Date().toISOString() };
    this.events?.emit({ event: 'source.snapshot_created', run_id: null, task_id: null, checkpoint_id: null, attributes: { source_id: sourceId } });
    return value;
  }
  search(sourceId: string, query: string, workflow: string, allowedSensitivity: string): SourceSearchResponse {
    const source = this.inspect(sourceId);
    const reject = (reason_code: SourceSearchResponse['rejected'][number]['reason_code']): SourceSearchResponse => ({ items: [], rejected: [{ item_id: sourceId, source_id: sourceId, reason_code }], snapshot: null });
    if (!source.allowed_workflows.includes(workflow)) return reject('WORKFLOW_NOT_ALLOWED');
    if (!(allowedSensitivity in sensitivityRank) || sensitivityRank[source.sensitivity] > sensitivityRank[allowedSensitivity as keyof typeof sensitivityRank]) return reject('SENSITIVITY_BLOCKED');
    const health = this.doctor(sourceId);
    if (!health.available) {
      const reason = health.issues.some(i => i.startsWith('PATH_BLOCKED')) ? 'PATH_BLOCKED' : 'SOURCE_UNAVAILABLE';
      this.events?.emit({ event: reason === 'PATH_BLOCKED' ? 'source.path_blocked' : 'source.unavailable', run_id: null, task_id: null, checkpoint_id: null, attributes: { source_id: sourceId, reason_code: reason } });
      return reject(reason);
    }
    const root = realpathSync(source.root);
    const args = ['--json','--fixed-strings','--line-number','--max-count','3','--max-filesize',String(source.max_item_bytes)];
    for (const pattern of source.include) args.push('-g', pattern);
    for (const pattern of source.exclude) args.push('-g', `!${pattern}`);
    args.push('--', query, '.');
    const run = spawnSync(process.env.MEGABRAIN_RG_COMMAND ?? 'rg', args, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    let backend = 'rg'; const hits: FileHit[] = [];
    if (run.error && (run.error as NodeJS.ErrnoException).code === 'ENOENT') {
      backend = 'filesystem'; hits.push(...filesystemSearch(source, root, query));
    } else {
      if (run.status !== 0 && run.status !== 1) throw new DomainError('SOURCE_SEARCH_FAILED', 'Falha ao pesquisar a fonte FULL.');
      for (const line of run.stdout.split(/\r?\n/).filter(Boolean)) {
        let event: { type?: string; data?: { path?: { text?: string }; line_number?: number } };
        try { event = JSON.parse(line) as typeof event; } catch { continue; }
        if (event.type !== 'match' || typeof event.data?.path?.text !== 'string' || typeof event.data.line_number !== 'number') continue;
        const logical = normalized(event.data.path.text); if (matches(source, logical)) hits.push({ logical, line: event.data.line_number });
      }
    }
    const items: SourceSearchResult[] = []; const blocked = [];
    for (const hit of hits) {
      const logical = hit.logical;
      const candidate = resolve(root, logical);
      try {
        const canonical = resolveInside(root, candidate);
        if (lstatSync(candidate).isSymbolicLink() && !within(root, canonical)) throw new DomainError('PATH_BLOCKED', 'Link externo.');
        if (statSync(canonical).size > source.max_item_bytes) continue;
        const lines = readFileSync(canonical, 'utf8').split(/\r?\n/);
        const lineNo = hit.line; const from = Math.max(0, lineNo - 2); const to = Math.min(lines.length, lineNo + 1);
        const content = lines.slice(from, to).join('\n').trim(); if (!content) continue;
        const sourceHash = hash(readFileSync(canonical));
        items.push({ item_id: `src_${hash(`${sourceId}:${logical}:${lineNo}:${sourceHash}`).slice(7, 31)}`, type: 'full', profile_id: this.profileId,
          scope_id: `source:${sourceId}`, source_id: sourceId, logical_path: logical, line: lineNo, content, source_hash: sourceHash,
          revision: this.revision(source), sensitivity: source.sensitivity, confidence: source.trust === 'authoritative' ? 'confirmed' : source.trust === 'maintained' ? 'supported' : 'tentative', trust: source.trust,
          rank_factors: ['term_match', `${source.trust}_source`] });
      } catch { blocked.push({ item_id: logical, source_id: sourceId, reason_code: 'PATH_BLOCKED' as const }); }
    }
    const dedup = [...new Map(items.map(item => [`${item.logical_path}:${item.line}`, item])).values()];
    const snapshot = this.snapshot(sourceId, dedup.map(i => i.source_hash));
    this.events?.emit({ event: 'source.scanned', run_id: null, task_id: null, checkpoint_id: null, attributes: { source_id: sourceId, count: dedup.length, search_backend: backend } });
    return { items: dedup, rejected: blocked, snapshot };
  }
}
