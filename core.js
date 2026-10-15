export const MAX_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
export function filename(title) {
  let value = String(title).replace(/\.md$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 90) || '제목 없음';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)) value = `메모 ${value}`;
  return `${value}.md`;
}
export function newNote(title = '새 메모', text = '') {
  return { id: crypto.randomUUID(), title, fileName: filename(title), text, updatedAt: new Date().toISOString(), diskName: null, diskText: null, directoryId: null, pendingDisk: false };
}
export async function hash(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export async function okfName(name) {
  if (/^(index|log)\.md$/i.test(name)) return `note-${name.slice(0, -3)}-${(await hash(name.toUpperCase())).slice(0, 8)}.md`;
  return name;
}
export function okfText(note, sourceName = note.fileName, modifiedAt = note.updatedAt) {
  return `---\r\ntype: Note\r\ntitle: ${JSON.stringify(note.title)}\r\nstatus: draft\r\nleafpad_export: true\r\nsources:\r\n  - resource: ${JSON.stringify(`../../${sourceName}`)}\r\ngenerated:\r\n  by: process:leafpad-web\r\n  at: ${JSON.stringify(modifiedAt)}\r\n---\r\n${note.text}`;
}
export function linkLine(title, output) {
  const label = title.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/[\r\n]/g, ' ');
  const url = encodeURIComponent(output).replace(/\(/g, '%28').replace(/\)/g, '%29');
  return `- [${label}](notes/${url}) - 메모`;
}
export function indexText(lines) {
  return `---\r\nokf_version: "0.2"\r\n---\r\n\r\n<!-- LeafPad generated index -->\r\n# 메모\r\n\r\n${lines.join('\r\n')}\r\n`;
}
export async function readOptional(directory, name, known = null) {
  try {
    const handle = await directory.getFileHandle(name);
    const file = await handle.getFile();
    if (file.size > MAX_BYTES + 16384) throw new Error('8MB 이하의 메모를 사용해 주세요.');
    const stamp = { diskModifiedAt: file.lastModified, diskSize: file.size };
    if (known && known.diskModifiedAt === file.lastModified && known.diskSize === file.size) return { unchanged: true, ...stamp };
    return { ...stamp, text: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()), modifiedAt: new Date(file.lastModified).toISOString() };
  } catch (error) { if (error.name === 'NotFoundError') return null; throw error; }
}
async function write(directory, name, text) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try { await writable.write(text); await writable.close(); }
  catch (error) { try { await writable.abort(); } catch {} throw error; }
}
async function availableName(directory, name) {
  if (!(await readOptional(directory, name))) return name;
  const base = name.replace(/\.md$/i, '').slice(0, 65);
  for (let i = 0; i < 100; i++) {
    const candidate = `${base} (충돌 ${crypto.randomUUID().slice(0, 8)}).md`;
    if (!(await readOptional(directory, candidate))) return candidate;
  }
  throw new Error('새 파일 이름을 만들지 못했습니다.');
}
export async function saveToDirectory(note, directory) {
  if (encoder.encode(note.text).length > MAX_BYTES) throw new Error('8MB 이하의 메모를 사용해 주세요.');
  let name = note.diskName || note.fileName;
  const old = await readOptional(directory, name);
  const conflict = note.diskName ? (!old || (old.text !== note.diskText && old.text !== note.text)) : (old && old.text !== note.text);
  if (conflict) name = await availableName(directory, `${name.replace(/\.md$/i, '').slice(0, 65)} (충돌).md`);
  if (!old || old.text !== note.text || name !== (note.diskName || note.fileName)) await write(directory, name, note.text);
  const saved = await readOptional(directory, name);
  const commit = { diskName: name, diskText: note.text, fileName: name, diskModifiedAt: saved.diskModifiedAt, diskSize: saved.diskSize, pendingDisk: true, conflict: Boolean(conflict) };
  try {
    const root = await directory.getDirectoryHandle('OKF', { create: true });
    const notes = await root.getDirectoryHandle('notes', { create: true });
    const records = await root.getDirectoryHandle('.leafpad', { create: true });
    const output = await okfName(name), recordName = `${await hash(name.toUpperCase())}.json`;
    const content = okfText(note, name, saved.modifiedAt), expected = await hash(content);
    const existing = await readOptional(notes, output), previous = await readOptional(records, recordName);
    const record = previous ? JSON.parse(previous.text) : null;
    if (existing) {
      const actual = await hash(existing.text);
      if (actual !== expected && (record?.Hash !== actual || record?.Source !== name || record?.Output !== output)) throw new Error('OKF 사본이 외부에서 변경되어 보존했습니다. 원본 MD를 편집해 주세요.');
      if (actual !== expected) await write(notes, output, content);
    } else await write(notes, output, content);
    const recordText = JSON.stringify({ Source: name, Output: output, Hash: expected });
    if (previous?.text !== recordText) await write(records, recordName, recordText);
    const oldIndex = await readOptional(root, 'index.md');
    if (oldIndex && !oldIndex.text.includes('<!-- LeafPad generated index -->')) throw new Error('기존 OKF 목록을 보존했습니다. 다른 저장 폴더를 선택해 주세요.');
    const lines = new Map();
    for (const line of oldIndex?.text.split(/\r?\n/) || []) {
      const match = line.match(/^- \[.*\]\(notes\/([^)]*)\) - /);
      if (match) lines.set(decodeURIComponent(match[1]), line);
    }
    lines.set(output, linkLine(note.title, output));
    const nextIndex = indexText([...lines.values()]);
    if (oldIndex?.text !== nextIndex) await write(root, 'index.md', nextIndex);
    return { ...commit, pendingDisk: false };
  } catch (error) { error.commit = commit; throw error; }
}
export function importContent(name, text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  let title = name.replace(/\.md$/i, '');
  if (match && /^leafpad_export: true$/m.test(match[1].replace(/\r/g, ''))) {
    const field = match[1].match(/^title: (.+)$/m);
    try { const parsed = JSON.parse(field[1].trim()); if (typeof parsed === 'string' && parsed.trim()) title = parsed; } catch {}
    text = text.slice(match[0].length);
  }
  return { title, text };
}
export async function bundleEntries(notes) {
  const used = new Set(), entries = [], lines = [];
  for (const note of notes) {
    const base = filename(note.fileName || note.title).slice(0, -3);
    let name = `${base}.md`, suffix = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${suffix++}).md`;
    used.add(name.toLowerCase());
    const output = await okfName(name);
    entries.push({ path: name, content: note.text }, { path: `OKF/notes/${output}`, content: okfText(note, name) });
    lines.push(linkLine(note.title, output));
  }
  entries.push({ path: 'OKF/index.md', content: indexText(lines) });
  return entries;
}
function crc32(bytes) { let crc = 0xffffffff; for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
export function zip(entries) {
  const chunks = [], central = [], names = new Set(); let offset = 0, centralSize = 0;
  for (const entry of entries) {
    if (names.has(entry.path) || entry.path.startsWith('/') || entry.path.split('/').some(p => p === '..')) throw new Error('잘못된 백업 파일 경로입니다.');
    names.add(entry.path);
    const name = encoder.encode(entry.path), data = encoder.encode(entry.content), checksum = crc32(data);
    if (offset + data.length > 256 * 1024 * 1024 || name.length > 65535) throw new Error('백업이 너무 큽니다. 메모를 나누어 저장해 주세요.');
    const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(12, 33, true);
    view.setUint32(14, checksum, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); local.set(name, 30);
    const header = new Uint8Array(46 + name.length), cv = new DataView(header.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(14, 33, true);
    cv.setUint32(16, checksum, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); header.set(name, 46);
    chunks.push(local, data); central.push(header); offset += local.length + data.length; centralSize += header.length;
  }
  if (entries.length > 65535) throw new Error('백업 파일 수가 제한을 초과했습니다.');
  const end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length); let pos = 0;
  for (const bytes of [...chunks, ...central, end]) { result.set(bytes, pos); pos += bytes.length; }
  return result;
}
