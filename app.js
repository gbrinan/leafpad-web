import { newNote, filename, importContent, readOptional, saveToDirectory, bundleEntries, okfText, okfName, zip, MAX_BYTES } from './core.js';
import * as storage from './storage.js';
const $ = id => document.getElementById(id);
let state = { notes: [], tabs: [], active: null }, connection = null, savedConnection = null, queue = Promise.resolve(), debounce, dirtyCache = false, busyFolder = false, cacheRevision = 0;
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('leafpad-web-writes') : null;
let anotherTab = false;
channel?.addEventListener('message', event => { if (event.data === 'writer-check' && ownsLock) channel.postMessage('writer-active'); else if (event.data === 'writer-active' && !ownsLock) disableWriting(); });
let ownsLock = false;
function disableWriting() { anotherTab = true; $('editor').readOnly = true; for (const id of ['new-note', 'empty-new', 'rename', 'import', 'connect-folder', 'save']) $(id).disabled = true; status('다른 창에서 LeafPad를 사용 중입니다. 그 창을 닫고 이 페이지를 새로 고침하세요.', true); }
const active = () => state.notes.find(n => n.id === state.active);
function status(message, error = false) { $('save-status').textContent = message; document.querySelector('.statusbar').classList.toggle('error', error); }
function counter() { const note = active(); $('character-count').textContent = `${(note?.text.length || 0).toLocaleString()}자 · UTF-8`; }
function rows() {
  const query = $('search').value.toLocaleLowerCase(); $('note-list').replaceChildren(); $('note-count').textContent = state.notes.length;
  for (const note of state.notes) {
    if (query && !`${note.title}\n${note.text}`.toLocaleLowerCase().includes(query)) continue;
    const button = document.createElement('button'); button.className = `note-row${note.id === state.active ? ' active' : ''}`;
    const title = document.createElement('strong'); title.textContent = note.title;
    const preview = document.createElement('small'); preview.textContent = note.text.split(/\r?\n/).find(line => line.trim()) || '아직 비어 있는 메모';
    button.append(title, preview); button.title = note.title; button.onclick = () => openNote(note.id); $('note-list').append(button);
  }
}
function tabs() {
  $('tabs').replaceChildren();
  for (const id of state.tabs) {
    const note = state.notes.find(n => n.id === id); if (!note) continue;
    const tab = document.createElement('div'); tab.className = `tab${id === state.active ? ' selected' : ''}`;
    const select = document.createElement('button'); select.className = 'tab-select'; select.setAttribute('role', 'tab'); select.setAttribute('aria-selected', String(id === state.active)); select.title = note.title; select.textContent = note.title; select.onclick = () => openNote(id);
    const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.setAttribute('aria-label', `${note.title} 탭 닫기`); close.onclick = () => closeTab(id);
    tab.append(select, close); $('tabs').append(tab);
  }
}
function render() {
  const note = active(); $('document-title').textContent = note?.title || '작은 메모, 새로운 시작';
  $('empty').hidden = Boolean(note); $('editor').hidden = !note;
  if (note && $('editor').value !== note.text) $('editor').value = note.text;
  for (const id of ['rename', 'save', 'download-md', 'download-okf']) $(id).disabled = !note;
  rows(); tabs(); counter();
}
async function persist() {
  if (anotherTab) return;
  const revision = cacheRevision;
  await storage.set('state', structuredClone(state)); if (cacheRevision === revision) dirtyCache = false;
}
function enqueue(id, show = true) {
  queue = queue.catch(() => {}).then(async () => {
    const note = state.notes.find(n => n.id === id); if (!note) { await persist(); return; }
    const snapshot = structuredClone(note);
    try {
      await persist();
      if (show) status('브라우저에 저장됨');
      const destination = connection;
      if (destination && note.directoryId === destination.id && !anotherTab) {
        if ((await destination.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') { status('브라우저 저장됨 · 폴더 권한을 다시 연결해 주세요.', true); return; }
        try {
          const commit = await saveToDirectory(snapshot, destination.handle);
          Object.assign(note, commit); note.pendingDisk = note.text !== snapshot.text || note.title !== snapshot.title;
          await persist(); if (show) status(commit.conflict ? '충돌 사본으로 MD + OKF 저장됨' : 'MD + OKF 파일 저장됨 · Drive에서 업로드 확인');
        } catch (error) { if (error.commit) Object.assign(note, error.commit); await persist(); throw error; }
      }
      rows();
    } catch (error) { status(`${error.commit ? 'MD 저장됨 · OKF 저장 대기' : '저장 대기'} · ${error.message}`, true); throw error; }
  });
  queue.catch(() => {}); return queue;
}
function openNote(id) {
  if (!state.tabs.includes(id)) state.tabs.push(id); state.active = id; render();
  $('sidebar').classList.remove('open'); $('toggle-sidebar').setAttribute('aria-expanded', 'false');
  persist().catch(error => status(error.message, true));
}
function create() {
  if (anotherTab) return;
  const count = state.notes.filter(n => n.title.startsWith('새 메모')).length;
  const note = newNote(`새 메모${count ? ` ${count + 1}` : ''}`);
  if (connection) { note.directoryId = connection.id; note.pendingDisk = true; }
  state.notes.push(note); openNote(note.id); enqueue(note.id); $('editor').focus();
}
function closeTab(id) {
  enqueue(id, false); const index = state.tabs.indexOf(id); state.tabs = state.tabs.filter(t => t !== id);
  if (state.active === id) state.active = state.tabs[Math.min(index, state.tabs.length - 1)] || null;
  render(); persist().catch(error => status(error.message, true));
}
function download(name, content, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function importFiles(files) {
  let imported = 0;
  for (const file of files) {
    if (!/\.md$/i.test(file.name)) continue;
    if (file.size > MAX_BYTES) { status(`${file.name}: 8MB 이하의 파일을 선택해 주세요.`, true); continue; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()), content = importContent(file.name, text);
    const existing = state.notes.find(n => n.fileName === filename(file.name) && n.text === content.text);
    if (existing) { state.active = existing.id; if (!state.tabs.includes(existing.id)) state.tabs.push(existing.id); continue; }
    const note = newNote(content.title, content.text); note.fileName = filename(file.name);
    if (connection) { note.directoryId = connection.id; note.pendingDisk = true; }
    state.notes.push(note); state.tabs.push(note.id); state.active = note.id; imported++;
  }
  await persist(); render(); status(`${imported}개 메모를 브라우저에 저장했습니다.`);
  if (connection) for (const note of state.notes.filter(n => n.directoryId === connection.id && n.pendingDisk)) enqueue(note.id, false);
}
function storageLabel() {
  $('storage-label').textContent = connection ? connection.handle.name : '이 브라우저';
  $('storage-detail').textContent = connection ? 'MD + OKF를 저장합니다. Drive 폴더라면 Drive 앱이 동기화합니다.' : '메모는 이 기기에 자동 저장됩니다.';
  $('disconnect-folder').hidden = !connection; $('connect-folder').textContent = connection ? '다른 폴더 연결' : '폴더 연결';
}
async function connect() {
  if (!window.showDirectoryPicker) { $('help-dialog').showModal(); status('이 브라우저에서는 다운로드로 파일을 보관할 수 있습니다.'); return; }
  if (busyFolder) return;
  const handle = savedConnection && !connection ? savedConnection.handle : await window.showDirectoryPicker({ mode: 'readwrite', id: 'leafpad-notes' });
  if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('폴더 연결 권한이 필요합니다.');
  let id = crypto.randomUUID();
  if (savedConnection && await handle.isSameEntry(savedConnection.handle)) id = savedConnection.id;
  await queue.catch(() => {});
  await loadDirectory({ id, handle });
}
async function loadDirectory(nextConnection) {
  busyFolder = true; connection = nextConnection; savedConnection = nextConnection; anotherTab = false;
  storageLabel(); status('폴더의 메모를 불러오는 중…');
  try {
    await storage.set('directory', nextConnection);
    for await (const [name, handle] of connection.handle.entries()) {
      if (handle.kind !== 'file' || !/\.md$/i.test(name)) continue;
      const content = await readOptional(connection.handle, name); if (!content) continue;
      const note = state.notes.find(n => n.directoryId === connection.id && n.diskName === name);
      if (note) {
        if (!note.pendingDisk) { note.text = content.text; note.diskText = content.text; note.updatedAt = content.modifiedAt; }
      } else {
        const imported = newNote(name.slice(0, -3), content.text);
        Object.assign(imported, { fileName: name, directoryId: connection.id, diskName: name, diskText: content.text, pendingDisk: true, updatedAt: content.modifiedAt });
        state.notes.push(imported);
      }
    }
    for (const note of state.notes) if (!note.directoryId) { note.directoryId = connection.id; note.pendingDisk = true; }
    if (!state.active && state.notes.length) { state.active = state.notes[0].id; state.tabs.push(state.active); }
    await persist(); render();
    for (const note of state.notes.filter(n => n.directoryId === connection.id)) enqueue(note.id, false);
    await queue; status('폴더 연결됨 · MD + OKF 파일 저장 완료');
  } finally { busyFolder = false; }
}
$('new-note').onclick = create; $('empty-new').onclick = create; $('search').oninput = rows;
$('editor').addEventListener('input', () => {
  const note = active(); if (!note || anotherTab) return; note.text = $('editor').value; note.updatedAt = new Date().toISOString(); note.pendingDisk = Boolean(note.directoryId); dirtyCache = true; cacheRevision++;
  status('편집 중 · 자동 저장 대기'); counter(); clearTimeout(debounce); debounce = setTimeout(() => enqueue(note.id), 600);
});
$('editor').addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); const field = $('editor'); field.setRangeText('  ', field.selectionStart, field.selectionEnd, 'end'); field.dispatchEvent(new Event('input')); } });
$('save').onclick = () => { if (active()) { clearTimeout(debounce); enqueue(active().id); } };
$('import').onclick = () => $('file-input').click();
$('file-input').onchange = () => { const files = [...$('file-input').files]; importFiles(files).catch(error => status(error.message, true)); $('file-input').value = ''; };
$('download-md').onclick = () => { if (active()) download(active().fileName, active().text); };
$('download-okf').onclick = async () => { if (active()) { const note = active(); download(await okfName(note.fileName), okfText(note)); } };
$('export-all').onclick = async () => { try { await persist(); download('LeafPad-backup.zip', zip(await bundleEntries(state.notes)), 'application/zip'); status('MD + OKF 전체 백업을 다운로드했습니다.'); } catch (error) { status(error.message, true); } };
$('rename').onclick = () => { if (active()) { $('title-input').value = active().title; $('rename-dialog').showModal(); $('title-input').focus(); } };
$('rename-dialog').addEventListener('close', () => { if ($('rename-dialog').returnValue !== 'save' || !active()) return; const note = active(); note.title = $('title-input').value.trim() || '제목 없음'; if (!note.diskName) note.fileName = filename(note.title); note.pendingDisk = Boolean(note.directoryId); render(); enqueue(note.id); });
$('help').onclick = () => $('help-dialog').showModal(); $('close-help').onclick = () => $('help-dialog').close();
$('toggle-sidebar').onclick = () => { const open = $('sidebar').classList.toggle('open'); $('toggle-sidebar').setAttribute('aria-expanded', String(open)); };
$('connect-folder').onclick = () => connect().catch(error => { if (error.name !== 'AbortError') status(error.message, true); });
$('disconnect-folder').onclick = async () => { await queue.catch(() => {}); connection = null; savedConnection = null; await storage.set('directory', null); storageLabel(); status('브라우저 저장 모드로 전환했습니다.'); };
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && ['s', 'o'].includes(event.key.toLowerCase())) { event.preventDefault(); $(event.key.toLowerCase() === 's' ? 'save' : 'import').click(); }
  if (event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); create(); }
});
window.addEventListener('beforeunload', event => { if (dirtyCache) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirtyCache && active()) { clearTimeout(debounce); enqueue(active().id, false); } });
async function poll() {
  if (!connection || busyFolder || anotherTab || document.hidden) return;
  await queue.catch(() => {});
  for (const note of state.notes.filter(n => n.directoryId === connection.id)) {
    if (note.pendingDisk) { enqueue(note.id, false); continue; }
    const baseline = note.diskText, revision = note.updatedAt;
    try { const disk = await readOptional(connection.handle, note.diskName); if (disk && !note.pendingDisk && note.updatedAt === revision && note.diskText === baseline && disk.text !== baseline) { note.text = disk.text; note.diskText = disk.text; note.updatedAt = disk.modifiedAt; note.pendingDisk = true; if (note.id === state.active) $('editor').value = note.text; enqueue(note.id, false); } }
    catch (error) { status(`폴더 확인 대기 · ${error.message}`, true); }
  }
  counter();
}
setInterval(poll, 10000);
async function init() {
  try {
    const saved = await storage.get('state'); if (saved) state = saved;
    if (!saved) { const note = newNote('시작하기', '# 작은 메모, 편안한 시작\n\n생각나는 것을 여기에 적어 보세요.\n\n- 메모와 탭은 이 브라우저에 자동 저장됩니다.\n- MD와 OKF 파일을 각각 다운로드할 수 있습니다.\n- 전체 백업은 두 형태를 담은 ZIP 파일입니다.\n- Chrome·Edge에서는 폴더를 연결해 실제 파일을 저장합니다.\n\n## Google Drive와 함께 쓰기\n\n폴더 연결 → Google Drive 데스크톱의 LeafPad 폴더 선택\n\n업로드 상태는 Google Drive 앱에서 확인하세요.\n'); state.notes.push(note); state.tabs.push(note.id); state.active = note.id; await persist(); }
    state.tabs = state.tabs.filter(id => state.notes.some(n => n.id === id)); if (!state.tabs.includes(state.active)) state.active = state.tabs[0] || null;
    render(); status('브라우저에 저장됨'); savedConnection = await storage.get('directory');
    if (savedConnection && window.showDirectoryPicker && !anotherTab) {
      if ((await savedConnection.handle.queryPermission({ mode: 'readwrite' })) === 'granted') await loadDirectory(savedConnection);
      else status('브라우저 저장됨 · 폴더 연결을 눌러 권한을 복원하세요.');
    }
  } catch (error) { render(); status(`브라우저 저장을 확인해 주세요 · ${error.message}`, true); }
}
if (navigator.locks) {
  navigator.locks.request('leafpad-web-writer', { ifAvailable: true }, async lock => {
    if (!lock) { anotherTab = true; await init(); disableWriting(); return; }
    ownsLock = true; await init(); await new Promise(() => {});
  }).catch(error => status(error.message, true));
} else {
  channel?.postMessage('writer-check'); await new Promise(resolve => setTimeout(resolve, 180));
  if (!anotherTab) ownsLock = true;
  await init(); if (anotherTab) disableWriting();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
