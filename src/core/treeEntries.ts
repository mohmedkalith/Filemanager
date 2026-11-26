import type { FileEntry } from './models';

/** Keep provider URIs opaque; only use the returned display name for UI. */
export function prepareTreeEntries(entries: FileEntry[], showHidden: boolean): FileEntry[] {
  return entries.filter(item => showHidden || !item.name.startsWith('.')).sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
}
