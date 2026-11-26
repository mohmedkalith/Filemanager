import type { FileEntry } from './models';

export type FileInfo = { exists: boolean; isDirectory?: boolean; size?: number; modificationTime?: number };
export interface FileSystemAdapter {
  readDirectory(uri: string): Promise<string[]>;
  info(uri: string): Promise<FileInfo>;
  makeDirectory(uri: string): Promise<void>;
  write(uri: string, contents: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  delete(uri: string): Promise<void>;
  read(uri: string): Promise<string>;
}

export function validateName(name: string): string {
  if (!name.trim() || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name)) throw new Error('Enter a valid name without slashes or control characters.');
  return name;
}

export function joinUri(parent: string, name: string): string {
  validateName(name);
  return `${parent.replace(/\/+$/, '')}/${encodeURIComponent(name)}`;
}

/** App-owned file:// storage only; provider URIs must use a separate adapter. */
export class FileStore {
  readonly root: string;
  constructor(private readonly fs: FileSystemAdapter, root: string) {
    if (!root.startsWith('file://')) throw new Error('An app-owned file URI is required.');
    this.root = root.replace(/\/+$/, '') + '/';
  }
  private assertInside(uri: string, allowRoot = true) {
    // URIs are built internally. Reject encoded separators and dot segments too.
    if ((!allowRoot && uri === this.root) || !uri.startsWith(this.root)) throw new Error('This path is outside the app workspace.');
    const suffix = uri.slice(this.root.length);
    for (const part of suffix.split('/').filter(Boolean)) {
      let decoded: string;
      try { decoded = decodeURIComponent(part); } catch { throw new Error('Invalid path.'); }
      validateName(decoded);
    }
  }
  async list(directory: string, showHidden = false): Promise<FileEntry[]> {
    this.assertInside(directory);
    const names = await this.fs.readDirectory(directory);
    const entries: FileEntry[] = [];
    // Limit concurrent native requests for large folders.
    for (let i = 0; i < names.length; i += 32) {
      const batch = await Promise.all(names.slice(i, i + 32).map(async (name): Promise<FileEntry | null> => {
        if (!showHidden && name.startsWith('.')) return null;
        try {
          const uri = joinUri(directory, name);
          const info = await this.fs.info(uri);
          return info.exists ? { uri, name, isDirectory: !!info.isDirectory, size: info.size ?? 0, modified: info.modificationTime } : null;
        } catch { return null; } // A file may disappear during enumeration.
      }));
      entries.push(...batch.filter((entry): entry is FileEntry => entry !== null));
    }
    return entries.sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name));
  }
  async lookup(uri: string): Promise<FileEntry | null> {
    this.assertInside(uri, false);
    const info = await this.fs.info(uri);
    if (!info.exists) return null;
    const name = decodeURIComponent(uri.replace(/\/+$/, '').split('/').pop() ?? '');
    return { uri, name, isDirectory: !!info.isDirectory, size: info.size ?? 0, modified: info.modificationTime };
  }
  private async vacant(uri: string) {
    if ((await this.fs.info(uri)).exists) throw new Error('An item with this name already exists.');
  }
  async create(parent: string, name: string, directory: boolean) {
    this.assertInside(parent);
    const target = joinUri(parent, name);
    await this.vacant(target);
    if (directory) await this.fs.makeDirectory(target); else await this.fs.write(target, '');
  }
  async rename(entry: FileEntry, name: string) {
    this.assertInside(entry.uri, false);
    const parent = entry.uri.slice(0, entry.uri.lastIndexOf('/') + 1);
    const target = joinUri(parent, name);
    if (target === entry.uri) return target;
    await this.vacant(target);
    await this.fs.move(entry.uri, target);
    return target;
  }
  async duplicate(entry: FileEntry): Promise<string> {
    this.assertInside(entry.uri, false);
    const parent = entry.uri.slice(0, entry.uri.lastIndexOf('/') + 1);
    const dot = !entry.isDirectory ? entry.name.lastIndexOf('.') : -1;
    const stem = dot > 0 ? entry.name.slice(0, dot) : entry.name;
    const extension = dot > 0 ? entry.name.slice(dot) : '';
    for (let index = 1; index <= 1000; index++) {
      const target = joinUri(parent, `${stem} copy${index === 1 ? '' : ` ${index}`}${extension}`);
      if (!(await this.fs.info(target)).exists) { await this.fs.copy(entry.uri, target); return target; }
    }
    throw new Error('Could not find an available copy name.');
  }
  async remove(uri: string) { this.assertInside(uri, false); await this.fs.delete(uri); }
  async transfer(source: string, destination: string, move: boolean) {
    this.assertInside(source, false); this.assertInside(destination);
    if (destination === source || destination.startsWith(source + '/')) throw new Error('A folder cannot be placed inside itself.');
    const item = await this.lookup(source);
    if (!item) throw new Error('The source is no longer available.');
    const target = joinUri(destination, item.name);
    await this.vacant(target);
    if (move) await this.fs.move(source, target); else await this.fs.copy(source, target);
    return target;
  }
  async importFile(source: string, parent: string, name: string) {
    this.assertInside(parent);
    const target = joinUri(parent, name);
    await this.vacant(target);
    await this.fs.copy(source, target);
    return target;
  }
  async readText(entry: FileEntry, maxBytes = 1024 * 1024) {
    this.assertInside(entry.uri, false);
    const info = await this.fs.info(entry.uri);
    if (!info.exists || info.isDirectory) throw new Error('This file is no longer available.');
    if (info.size == null || info.size > maxBytes) throw new Error('Text preview is limited to files with a known size up to 1 MB.');
    return this.fs.read(entry.uri);
  }
}
