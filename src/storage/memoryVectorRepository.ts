import type { MemoryVector } from "../types/vector";

const DATABASE_NAME = "aether-vector-memory";
const STORE_NAME = "vectors";
const DATABASE_VERSION = 1;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB 操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB 写入失败"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB 写入已取消"));
  });
}

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("当前浏览器不支持 IndexedDB"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "memoryId",
        });
        store.createIndex("characterId", "characterId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开向量数据库"));
  });
}

export const memoryVectorRepository = {
  async forCharacter(characterId: string, modelKey: string) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const index = transaction.objectStore(STORE_NAME).index("characterId");
      const rows = await requestResult<MemoryVector[]>(
        index.getAll(characterId),
      );
      return rows.filter((row) => row.modelKey === modelKey);
    } finally {
      database.close();
    }
  },

  async putMany(vectors: MemoryVector[]) {
    if (vectors.length === 0) return;
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const vector of vectors) store.put(vector);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  },

  async remove(memoryId: string) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(memoryId);
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  },

  async clear() {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  },
};
