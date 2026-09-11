import type { FullSource, RetrievalRejection, SourceRegistryDocument, SourceSearchResult, SourceSnapshot } from './contracts.js';
export interface SourceDoctorResult { source_id: string; available: boolean; root: string; issues: string[]; }
export interface SourceSearchResponse { items: SourceSearchResult[]; rejected: RetrievalRejection[]; snapshot: SourceSnapshot | null; }
export interface FullSourcePort {
  list(): FullSource[];
  inspect(sourceId: string): FullSource;
  doctor(sourceId: string): SourceDoctorResult;
  search(sourceId: string, query: string, workflow: string, allowedSensitivity: string): SourceSearchResponse;
  snapshot(sourceId: string, selectedHashes?: string[]): SourceSnapshot;
  document(): SourceRegistryDocument;
}
