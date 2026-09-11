import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { MemoryRecord } from '../../domain/v2/contracts.js';
import { ensurePrivateDirectory } from '../../infrastructure/v2/paths.js';

export interface IndexedMemory { memory_id: string; rank: number; }
export class SqliteWarmIndex {
  constructor(readonly path: string, readonly profileId: string) { ensurePrivateDirectory(dirname(path)); }
  private open(): DatabaseSync {
    const db = new DatabaseSync(this.path);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE VIRTUAL TABLE IF NOT EXISTS warm_fts USING fts5(memory_id UNINDEXED, profile_id UNINDEXED, scope_id, kind, subject, statement, limits, tags, status UNINDEXED, revision UNINDEXED, content_hash UNINDEXED, valid_until UNINDEXED);');
    return db;
  }
  rebuild(records: MemoryRecord[]): number {
    const db = this.open();
    try {
      db.exec('BEGIN IMMEDIATE; DELETE FROM warm_fts;');
      const insert = db.prepare('INSERT INTO warm_fts(memory_id,profile_id,scope_id,kind,subject,statement,limits,tags,status,revision,content_hash,valid_until) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const r of records) insert.run(r.memory_id, r.profile_id, r.scope_id, r.kind, r.subject, r.statement, r.limits, r.tags.join(' '), r.status, r.revision, r.content_hash, r.valid_until ?? '');
      db.exec('COMMIT;');
      return records.length;
    } catch (error) { try { db.exec('ROLLBACK;'); } catch { /* ignore */ } throw error; }
    finally { db.close(); }
  }
  search(query: string, limit = 50): IndexedMemory[] {
    if (!existsSync(this.path)) return [];
    const tokens = query.normalize('NFKC').toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
    if (!tokens.length) return [];
    const fts = [...new Set(tokens)].map(token => `"${token.replaceAll('"', '""')}"`).join(' OR ');
    const db = this.open();
    try {
      return db.prepare('SELECT memory_id, bm25(warm_fts) AS rank FROM warm_fts WHERE warm_fts MATCH ? AND profile_id = ? AND status = ? ORDER BY rank, memory_id LIMIT ?')
        .all(fts, this.profileId, 'active', limit) as unknown as IndexedMemory[];
    } finally { db.close(); }
  }
}
