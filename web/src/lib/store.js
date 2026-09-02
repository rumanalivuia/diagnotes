/**
 * IndexedDB-backed local store for DiagNotes.
 * Tables: kv, comments, categories, queue, recently.
 * The store is the offline source of truth; sync reconciles with the server.
 */

const DB_NAME = 'diagnotes';
const DB_VERSION = 2;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv', { keyPath: 'key' });
      } else {
        // v1 shipped kv with out-of-line keys; rebuild it with keyPath.
        db.deleteObjectStore('kv');
        db.createObjectStore('kv', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('comments')) {
        const s = db.createObjectStore('comments', { keyPath: 'id' });
        s.createIndex('updated_at', 'updated_at');
        s.createIndex('type', 'type');
        s.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('recently')) {
        db.createObjectStore('recently', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let result;
        const wrapped = (req) => {
          req.onsuccess = () => { result = req.result; };
          return req;
        };
        fn(os, wrapped);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export const store = {
  async get(storeName, key) {
    return tx(storeName, 'readonly', (os, w) => w(os.get(key)));
  },
  async getAll(storeName) {
    return tx(storeName, 'readonly', (os, w) => w(os.getAll()));
  },
  async put(storeName, value) {
    return tx(storeName, 'readwrite', (os) => os.put(value));
  },
  async putMany(storeName, values) {
    return tx(storeName, 'readwrite', (os) => values.forEach((v) => os.put(v)));
  },
  async delete(storeName, key) {
    return tx(storeName, 'readwrite', (os) => os.delete(key));
  },
  async clear(storeName) {
    return tx(storeName, 'readwrite', (os) => os.clear());
  },
  async kvGet(key) {
    const v = await this.get('kv', key);
    return v ? v.value : undefined;
  },
  async kvSet(key, value) {
    return tx('kv', 'readwrite', (os) => os.put({ key, value }));
  },
};
