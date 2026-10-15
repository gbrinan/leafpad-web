import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { filename, newNote, hash, okfName, okfText, bundleEntries, zip, saveToDirectory, importContent, readOptional } from '../core.js';
class Directory {
  constructor() { this.files = new Map(); this.directories = new Map(); this.failed = new Set(); }
  async getFileHandle(name, options = {}) {
    if (!this.files.has(name)) { if (!options.create) throw Object.assign(new Error('Missing'), { name: 'NotFoundError' }); this.files.set(name, ''); }
    const folder = this;
    return {
      async getFile() { const bytes = new TextEncoder().encode(folder.files.get(name)); return { size: bytes.length, lastModified: 1700000000000, arrayBuffer: async () => bytes.buffer }; },
      async createWritable() {
        if (folder.failed.has(name)) throw new Error('Locked copy');
        let value;
        return { async write(text) { value = text; }, async close() { folder.files.set(name, value); }, async abort() {} };
      }
    };
  }
  async getDirectoryHandle(name, options = {}) { if (!this.directories.has(name)) { if (!options.create) throw Object.assign(new Error('Missing'), { name: 'NotFoundError' }); this.directories.set(name, new Directory()); } return this.directories.get(name); }
}

test('unchanged files skip body reads; changed size or timestamp forces a read', async () => {
  let reads = 0, size = 5, modified = 1000;
  const directory = { async getFileHandle() { return { async getFile() { return { size, lastModified: modified, async arrayBuffer() { reads++; return new TextEncoder().encode('hello').buffer; } }; } }; } };
  const first = await readOptional(directory, 'test.md');
  assert.equal(first.text, 'hello');
  assert.equal((await readOptional(directory, 'test.md', first)).unchanged, true);
  assert.equal(reads, 1);
  modified++;
  assert.equal((await readOptional(directory, 'test.md', first)).text, 'hello');
  modified--; size++;
  assert.equal((await readOptional(directory, 'test.md', first)).text, 'hello');
  assert.equal(reads, 3);
});
test('safe filenames keep Korean and handle reserved Windows names', () => { assert.equal(filename('한글/메모'), '한글 메모.md'); assert.equal(filename('CON'), '메모 CON.md'); assert.equal(filename('../hello'), '.. hello.md'); });
test('reserved OKF names are deterministic and non-reserved', async () => { assert.match(await okfName('index.md'), /^note-index-[A-F0-9]{8}\.md$/); assert.equal(await okfName('메모.md'), '메모.md'); });
test('MD and OKF contain exactly the same body, with quoted metadata', () => { const n = newNote('한글 "제목"', '# 기록 😀\r\n<script>alert(1)</script>'); assert.ok(okfText(n).endsWith(`---\r\n${n.text}`)); assert.equal(importContent('export.md', okfText(n)).text, n.text); assert.equal(importContent('export.md', okfText(n)).title, n.title); });
test('real dual save is interoperable with desktop records', async () => {
  const d = new Directory(), n = newNote('메모 (2)', '# 한글 😀'); const result = await saveToDirectory(n, d);
  assert.equal(d.files.get(result.diskName), n.text);
  const root = d.directories.get('OKF'), copies = root.directories.get('notes'), records = root.directories.get('.leafpad');
  const record = JSON.parse(records.files.get(`${await hash(result.diskName.toUpperCase())}.json`));
  assert.equal(record.Hash, await hash(copies.files.get(result.diskName))); assert.equal(record.Source, result.diskName);
  assert.ok(root.files.get('index.md').includes('%28')); assert.ok(root.files.get('index.md').includes('%29'));
});
test('external edit is preserved and local changes become a conflict copy', async () => { const d = new Directory(), n = newNote('original', 'initial'); Object.assign(n, await saveToDirectory(n, d)); d.files.set(n.diskName, 'remote'); n.text = 'local'; const result = await saveToDirectory(n, d); assert.ok(result.conflict); assert.equal(d.files.get('original.md'), 'remote'); assert.equal(d.files.get(result.diskName), 'local'); });
test('deleted originals do not silently reappear', async () => { const d = new Directory(), n = newNote('deleted', 'initial'); Object.assign(n, await saveToDirectory(n, d)); d.files.delete('deleted.md'); n.text = 'recovered'; const r = await saveToDirectory(n, d); assert.equal(d.files.has('deleted.md'), false); assert.ok(r.conflict); });
test('OKF failure retains primary commit and retries without duplicate files', async () => { const d = new Directory(), n = newNote('retry', 'first'); Object.assign(n, await saveToDirectory(n, d)); const copies = d.directories.get('OKF').directories.get('notes'); copies.failed.add('retry.md'); n.text = 'second'; await assert.rejects(async () => { try { await saveToDirectory(n, d); } catch (e) { Object.assign(n, e.commit); throw e; } }); assert.equal(d.files.get('retry.md'), 'second'); assert.ok(n.pendingDisk); copies.failed.clear(); Object.assign(n, await saveToDirectory(n, d)); assert.equal(n.pendingDisk, false); assert.equal(d.files.size, 1); assert.ok(copies.files.get('retry.md').endsWith('---\r\nsecond')); });
test('external OKF changes are not overwritten', async () => { const d = new Directory(), n = newNote('protected', 'initial'); Object.assign(n, await saveToDirectory(n, d)); const copies = d.directories.get('OKF').directories.get('notes'); copies.files.set('protected.md', 'edited externally'); n.text = 'new primary'; await assert.rejects(saveToDirectory(n, d), /외부에서 변경/); assert.equal(copies.files.get('protected.md'), 'edited externally'); assert.equal(d.files.get('protected.md'), 'new primary'); });
test('bundle resolves duplicate filenames and contains both forms', async () => { const entries = await bundleEntries([newNote('같은 제목', 'one'), newNote('같은 제목', 'two'), newNote('index', 'reserved')]); assert.equal(new Set(entries.map(e => e.path)).size, entries.length); assert.equal(entries.length, 7); assert.ok(entries.find(e => e.path === '같은 제목 (2).md')); assert.ok(entries.find(e => e.path === 'OKF/index.md').content.includes('%28')); const bytes = zip(entries); await fs.mkdir('evidence', { recursive: true }); await fs.writeFile('evidence/test-backup.zip', bytes); assert.equal(new DataView(bytes.buffer).getUint32(0, true), 0x04034b50); });
