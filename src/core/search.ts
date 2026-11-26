import type { FileEntry } from './models';
import type { FileStore } from './fileStore';

export type SearchEvent = { type: 'match'; entry: FileEntry } | { type: 'skipped'; uri: string } | { type: 'limit' };
/** Bounded cooperative scan, not an index. Abort is checked between native calls. */
export async function* searchTree(store: FileStore, root: string, query: string, options: { showHidden?: boolean; limit?: number; signal?: AbortSignal } = {}): AsyncGenerator<SearchEvent> {
  const needle = query.trim().toLowerCase();
  if (!needle) return;
  const pending = [root]; let count = 0; const limit = options.limit ?? 500;
  if (limit < 1) throw new Error('Search limit must be positive.');
  while (pending.length && !options.signal?.aborted) {
    const directory = pending.pop()!;
    let entries: FileEntry[];
    try { entries = await store.list(directory, options.showHidden); }
    catch { yield { type: 'skipped', uri: directory }; continue; }
    for (const entry of entries) {
      if (options.signal?.aborted) return;
      if (entry.isDirectory) pending.push(entry.uri);
      if (!entry.name.toLowerCase().includes(needle)) continue;
      if (count === limit) { yield { type: 'limit' }; return; }
      count++;
      yield { type: 'match', entry };
    }
  }
}
