import test from 'node:test';
import assert from 'node:assert/strict';
import { FileStore, type FileSystemAdapter, type FileInfo, joinUri, validateName } from '../src/core/fileStore';
import { kindOf, formatBytes } from '../src/core/models';

class MemoryFS implements FileSystemAdapter {
  nodes = new Map<string, { dir: boolean; data: string }>([['file:///app/', { dir: true, data: '' }]]);
  async readDirectory(uri: string) { const prefix = uri.replace(/\/$/, '') + '/'; return [...this.nodes.keys()].filter(k => k.startsWith(prefix) && k !== prefix && !k.slice(prefix.length).includes('/')).map(k => decodeURIComponent(k.slice(prefix.length))); }
  async info(uri: string): Promise<FileInfo> { const node = this.nodes.get(uri); return node ? { exists: true, isDirectory: node.dir, size: node.data.length } : { exists: false }; }
  async makeDirectory(uri: string) { this.nodes.set(uri, { dir: true, data: '' }); }
  async write(uri: string, data: string) { this.nodes.set(uri, { dir: false, data }); }
  async copy(from: string, to: string) { const entries = [...this.nodes].filter(([k]) => k === from || k.startsWith(from + '/')); if (!entries.length) throw Error('missing'); for (const [key, value] of entries) this.nodes.set(to + key.slice(from.length), { ...value }); }
  async move(from: string, to: string) { await this.copy(from, to); await this.delete(from); }
  async delete(uri: string) { for (const key of this.nodes.keys()) if (key === uri || key.startsWith(uri + '/')) this.nodes.delete(key); }
  async read(uri: string) { return this.nodes.get(uri)?.data ?? ''; }
}

test('validate names and prevent path traversal', async () => {
  const store = new FileStore(new MemoryFS(), 'file:///app/');
  assert.throws(() => validateName('../secret'));
  assert.throws(() => validateName('..'));
  assert.throws(() => validateName('a\\b'));
  await assert.rejects(store.create('file:///app/%2e%2e', 'x', false));
  await assert.rejects(store.remove('file:///app/'));
  await assert.rejects(store.remove('file:///other/file'));
  assert.equal(joinUri('file:///app/', '你好.txt'), 'file:///app/%E4%BD%A0%E5%A5%BD.txt');
});

test('creates, lists, filters hidden, and prevents overwrite', async () => {
  const fs = new MemoryFS(), store = new FileStore(fs, 'file:///app/');
  await store.create(store.root, 'note.txt', false);
  await store.create(store.root, '.hidden', false);
  await store.create(store.root, 'Folder', true);
  assert.deepEqual((await store.list(store.root)).map(x => x.name), ['Folder', 'note.txt']);
  assert.equal((await store.list(store.root, true)).length, 3);
  await assert.rejects(store.create(store.root, 'note.txt', false), /already exists/);
});

test('copies, moves, renames, and rejects copying a folder inside itself', async () => {
  const fs = new MemoryFS(), store = new FileStore(fs, 'file:///app/');
  await store.create(store.root, 'folder', true);
  await store.create('file:///app/folder', 'doc.txt', false);
  await store.create(store.root, 'dest', true);
  await assert.rejects(store.transfer('file:///app/folder', 'file:///app/folder', false), /inside itself/);
  await store.transfer('file:///app/folder', 'file:///app/dest', false);
  assert.ok((await store.lookup('file:///app/dest/folder/doc.txt')));
  await assert.rejects(store.transfer('file:///app/folder', 'file:///app/dest', false), /already exists/);
  const old = await store.lookup('file:///app/folder/doc.txt'); assert.ok(old);
  assert.equal(await store.duplicate(old), 'file:///app/folder/doc%20copy.txt');
  assert.equal(await store.duplicate(old), 'file:///app/folder/doc%20copy%202.txt');
  assert.equal(await store.rename(old, 'renamed.txt'), 'file:///app/folder/renamed.txt');
  await store.transfer('file:///app/folder/renamed.txt', 'file:///app/dest', true);
  assert.equal(await store.lookup('file:///app/folder/renamed.txt'), null);
  await store.remove('file:///app/dest/renamed.txt');
  assert.equal(await store.lookup('file:///app/dest/renamed.txt'), null);
});

test('text preview limits and file type display', async () => {
  const fs = new MemoryFS(), store = new FileStore(fs, 'file:///app/');
  await store.create(store.root, 'note.txt', false); await fs.write('file:///app/note.txt', 'hello');
  const entry = await store.lookup('file:///app/note.txt'); assert.ok(entry);
  assert.equal(await store.readText(entry), 'hello');
  await assert.rejects(store.readText(entry, 4), /limited/);
  assert.equal(kindOf(entry), 'Document'); assert.equal(formatBytes(1024), '1.0 KB');
});

test('recursive search is bounded and respects cancellation', async () => {
  const { searchTree } = await import('../src/core/search');
  const fs = new MemoryFS(), store = new FileStore(fs, 'file:///app/');
  await store.create(store.root, 'one.txt', false);
  await store.create(store.root, 'folder', true);
  await store.create('file:///app/folder', 'another.txt', false);
  const events = [];
  for await (const event of searchTree(store, store.root, '.txt', { limit: 1 })) events.push(event);
  assert.equal(events.filter(x => x.type === 'match').length, 1);
  assert.equal(events.some(x => x.type === 'limit'), true);
  const controller = new AbortController(); controller.abort();
  const cancelled = [];
  for await (const event of searchTree(store, store.root, '.txt', { signal: controller.signal })) cancelled.push(event);
  assert.equal(cancelled.length, 0);
});
