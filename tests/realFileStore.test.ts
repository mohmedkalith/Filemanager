import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FileStore, type FileSystemAdapter } from '../src/core/fileStore';

// Node adapter exists only to exercise the store against real temporary files.
const adapter: FileSystemAdapter = {
  readDirectory: uri => fs.readdir(fileURLToPath(uri)),
  info: async uri => {
    try { const stat = await fs.stat(fileURLToPath(uri)); return { exists: true, isDirectory: stat.isDirectory(), size: stat.size, modificationTime: stat.mtimeMs / 1000 }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false }; throw error; }
  },
  makeDirectory: async uri => { await fs.mkdir(fileURLToPath(uri)); },
  write: (uri, contents) => fs.writeFile(fileURLToPath(uri), contents),
  copy: (from, to) => fs.cp(fileURLToPath(from), fileURLToPath(to), { recursive: true, errorOnExist: true, force: false }),
  move: (from, to) => fs.rename(fileURLToPath(from), fileURLToPath(to)),
  delete: uri => fs.rm(fileURLToPath(uri), { recursive: true }),
  read: uri => fs.readFile(fileURLToPath(uri), 'utf8'),
};

test('works with real temporary files including Unicode names and conflicts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fileos-'));
  try {
    const store = new FileStore(adapter, pathToFileURL(root + path.sep).href);
    await store.create(store.root, 'வணக்கம்.txt', false);
    const item = (await store.list(store.root))[0];
    assert.equal(item.name, 'வணக்கம்.txt');
    await fs.writeFile(fileURLToPath(item.uri), 'hello');
    await store.create(store.root, 'Folder', true);
    const dest = (await store.list(store.root)).find(x => x.isDirectory)!;
    await store.transfer(item.uri, dest.uri, false);
    assert.equal(await fs.readFile(path.join(root, 'Folder', 'வணக்கம்.txt'), 'utf8'), 'hello');
    await assert.rejects(store.transfer(item.uri, dest.uri, false), /already exists/);
    await store.remove(item.uri);
    assert.equal(await store.lookup(item.uri), null);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
