import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTreeEntries } from '../src/core/treeEntries';
import type { FileEntry } from '../src/core/models';

test('keeps content URIs opaque and sorts provider entries while honoring hidden preference', () => {
  const entries: FileEntry[] = [
    { uri: 'content://provider/tree/id/document/opaque%2F123', name: 'report.txt', isDirectory: false, size: -1 },
    { uri: 'content://provider/tree/id/document/other', name: '.private', isDirectory: false, size: 1 },
    { uri: 'content://provider/tree/id/document/dir', name: 'Folder', isDirectory: true, size: -1 },
  ];
  const visible = prepareTreeEntries(entries, false);
  assert.deepEqual(visible.map(e => e.name), ['Folder', 'report.txt']);
  assert.equal(visible[1].uri, entries[0].uri);
  assert.equal(prepareTreeEntries(entries, true).length, 3);
});
