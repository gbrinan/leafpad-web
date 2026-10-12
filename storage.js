const opened = new Promise((resolve, reject) => {
  const request = indexedDB.open('leafpad-web', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('app');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function get(key) {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const request = db.transaction('app').objectStore('app').get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function set(key, value) {
  const db = await opened;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('app', 'readwrite');
    transaction.objectStore('app').put(value, key);
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || new Error('브라우저 저장이 취소되었습니다.'));
  });
}
