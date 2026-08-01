import type {
  VaultAlbumAsset,
  VaultBeautyWallpaper,
  VaultVoiceAsset,
} from "../types/vault";

const DATABASE_NAME = "bunny-aether-large-storage";
const DATABASE_VERSION = 2;
const PHOTO_STORE = "album-media";
const VOICE_STORE = "voice-media";
const BEAUTY_STORE = "beauty-media";
const META_STORE = "vault-meta";
const PREVIOUS_ARCHIVE_KEY = "previous-archive";
const PHOTO_PREFIX = "indexeddb://album/";
const VOICE_PREFIX = "indexeddb://voice/";
const WALLPAPER_PREFIX = "indexeddb://beauty/";
const WALLPAPER_ID = "desktop-wallpaper";

interface StoredPhoto {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
  updatedAt: number;
}

interface StoredMeta {
  id: string;
  value: string;
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("当前浏览器不支持大容量相册存储。"));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE)) {
        database.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(VOICE_STORE)) {
        database.createObjectStore(VOICE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(BEAUTY_STORE)) {
        database.createObjectStore(BEAUTY_STORE, { keyPath: "id" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("无法打开大容量本地存储。")),
    );
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("本地存储操作失败。")),
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("本地存储事务已取消。")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("本地存储事务失败。")),
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("照片无法转换为备份格式。")),
    );
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("照片读取失败。")),
    );
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(data: string): Promise<Blob> {
  const response = await fetch(data);
  if (!response.ok) throw new Error("备份中的照片无法读取。");
  return response.blob();
}

function photoIdFromReference(reference: string) {
  return reference.startsWith(PHOTO_PREFIX)
    ? decodeURIComponent(reference.slice(PHOTO_PREFIX.length))
    : null;
}

function idFromReference(reference: string, prefix: string) {
  return reference.startsWith(prefix)
    ? decodeURIComponent(reference.slice(prefix.length))
    : null;
}

async function saveBinary(storeName: string, id: string, blob: Blob) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  const existing = await requestResult<StoredPhoto | undefined>(store.get(id));
  const timestamp = Date.now();
  store.put({
    id,
    blob,
    mimeType: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies StoredPhoto);
  await transactionDone(transaction);
  database.close();
}

async function readBinary(storeName: string, id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const record = await requestResult<StoredPhoto | undefined>(
    transaction.objectStore(storeName).get(id),
  );
  await transactionDone(transaction);
  database.close();
  return record?.blob ?? null;
}

async function removeBinary(storeName: string, id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
  database.close();
}

async function exportBinaryStore(storeName: string): Promise<VaultAlbumAsset[]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const records = await requestResult<StoredPhoto[]>(
    transaction.objectStore(storeName).getAll(),
  );
  await transactionDone(transaction);
  database.close();
  return Promise.all(
    records.map(async (record) => ({
      id: record.id,
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt,
      data: await blobToDataUrl(record.blob),
    })),
  );
}

async function replaceBinaryStore(
  storeName: string,
  assets: VaultAlbumAsset[],
) {
  const decoded = await Promise.all(
    assets.map(async (asset) => ({
      id: asset.id,
      blob: await dataUrlToBlob(asset.data),
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt,
      updatedAt: Date.now(),
    } satisfies StoredPhoto)),
  );
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  store.clear();
  decoded.forEach((record) => store.put(record));
  await transactionDone(transaction);
  database.close();
}

async function binaryUsage(storeName: string) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const records = await requestResult<StoredPhoto[]>(
    transaction.objectStore(storeName).getAll(),
  );
  await transactionDone(transaction);
  database.close();
  return {
    count: records.length,
    bytes: records.reduce((total, record) => total + record.size, 0),
  };
}

export const largeStorageRepository = {
  photoReference(id: string) {
    return `${PHOTO_PREFIX}${encodeURIComponent(id)}`;
  },

  isPhotoReference(reference: string) {
    return photoIdFromReference(reference) !== null;
  },

  async savePhoto(id: string, blob: Blob) {
    const database = await openDatabase();
    const transaction = database.transaction(PHOTO_STORE, "readwrite");
    const store = transaction.objectStore(PHOTO_STORE);
    const existing = await requestResult<StoredPhoto | undefined>(store.get(id));
    const timestamp = Date.now();
    store.put({
      id,
      blob,
      mimeType: blob.type || "application/octet-stream",
      size: blob.size,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    } satisfies StoredPhoto);
    await transactionDone(transaction);
    database.close();
    return this.photoReference(id);
  },

  async readPhoto(referenceOrId: string): Promise<Blob | null> {
    const id = photoIdFromReference(referenceOrId) ?? referenceOrId;
    const database = await openDatabase();
    const transaction = database.transaction(PHOTO_STORE, "readonly");
    const record = await requestResult<StoredPhoto | undefined>(
      transaction.objectStore(PHOTO_STORE).get(id),
    );
    await transactionDone(transaction);
    database.close();
    return record?.blob ?? null;
  },

  async removePhoto(referenceOrId: string) {
    const id = photoIdFromReference(referenceOrId) ?? referenceOrId;
    const database = await openDatabase();
    const transaction = database.transaction(PHOTO_STORE, "readwrite");
    transaction.objectStore(PHOTO_STORE).delete(id);
    await transactionDone(transaction);
    database.close();
  },

  async exportPhotos(): Promise<VaultAlbumAsset[]> {
    const database = await openDatabase();
    const transaction = database.transaction(PHOTO_STORE, "readonly");
    const records = await requestResult<StoredPhoto[]>(
      transaction.objectStore(PHOTO_STORE).getAll(),
    );
    await transactionDone(transaction);
    database.close();
    return Promise.all(
      records.map(async (record) => ({
        id: record.id,
        mimeType: record.mimeType,
        size: record.size,
        createdAt: record.createdAt,
        data: await blobToDataUrl(record.blob),
      })),
    );
  },

  async replacePhotos(assets: VaultAlbumAsset[]) {
    const decoded = await Promise.all(
      assets.map(async (asset) => ({
        id: asset.id,
        blob: await dataUrlToBlob(asset.data),
        mimeType: asset.mimeType,
        size: asset.size,
        createdAt: asset.createdAt,
        updatedAt: Date.now(),
      } satisfies StoredPhoto)),
    );
    const database = await openDatabase();
    const transaction = database.transaction(PHOTO_STORE, "readwrite");
    const store = transaction.objectStore(PHOTO_STORE);
    store.clear();
    decoded.forEach((record) => store.put(record));
    await transactionDone(transaction);
    database.close();
  },

  async photoUsage() {
    const database = await openDatabase();
    const transaction = database.transaction(PHOTO_STORE, "readonly");
    const records = await requestResult<StoredPhoto[]>(
      transaction.objectStore(PHOTO_STORE).getAll(),
    );
    await transactionDone(transaction);
    database.close();
    return {
      count: records.length,
      bytes: records.reduce((total, record) => total + record.size, 0),
    };
  },

  async savePreviousArchive(value: string) {
    const database = await openDatabase();
    const transaction = database.transaction(META_STORE, "readwrite");
    transaction.objectStore(META_STORE).put({
      id: PREVIOUS_ARCHIVE_KEY,
      value,
      updatedAt: Date.now(),
    } satisfies StoredMeta);
    await transactionDone(transaction);
    database.close();
  },

  async readPreviousArchive(): Promise<string | null> {
    const database = await openDatabase();
    const transaction = database.transaction(META_STORE, "readonly");
    const record = await requestResult<StoredMeta | undefined>(
      transaction.objectStore(META_STORE).get(PREVIOUS_ARCHIVE_KEY),
    );
    await transactionDone(transaction);
    database.close();
    return record?.value ?? null;
  },

  voiceReference(id: string) {
    return `${VOICE_PREFIX}${encodeURIComponent(id)}`;
  },

  isVoiceReference(reference: string) {
    return idFromReference(reference, VOICE_PREFIX) !== null;
  },

  async saveVoice(id: string, blob: Blob) {
    await saveBinary(VOICE_STORE, id, blob);
    return this.voiceReference(id);
  },

  async readVoice(referenceOrId: string) {
    const id = idFromReference(referenceOrId, VOICE_PREFIX) ?? referenceOrId;
    return readBinary(VOICE_STORE, id);
  },

  async removeVoice(referenceOrId: string) {
    const id = idFromReference(referenceOrId, VOICE_PREFIX) ?? referenceOrId;
    return removeBinary(VOICE_STORE, id);
  },

  async exportVoices(): Promise<VaultVoiceAsset[]> {
    return exportBinaryStore(VOICE_STORE);
  },

  async replaceVoices(assets: VaultVoiceAsset[]) {
    return replaceBinaryStore(VOICE_STORE, assets);
  },

  async voiceUsage() {
    return binaryUsage(VOICE_STORE);
  },

  wallpaperReference() {
    return `${WALLPAPER_PREFIX}${WALLPAPER_ID}`;
  },

  async saveWallpaper(blob: Blob) {
    await saveBinary(BEAUTY_STORE, WALLPAPER_ID, blob);
    return this.wallpaperReference();
  },

  async readWallpaper() {
    return readBinary(BEAUTY_STORE, WALLPAPER_ID);
  },

  async removeWallpaper() {
    return removeBinary(BEAUTY_STORE, WALLPAPER_ID);
  },

  async exportWallpaper(): Promise<VaultBeautyWallpaper | null> {
    return (await exportBinaryStore(BEAUTY_STORE))[0] ?? null;
  },

  async replaceWallpaper(asset: VaultBeautyWallpaper | null) {
    return replaceBinaryStore(BEAUTY_STORE, asset ? [asset] : []);
  },

  async beautyUsage() {
    return binaryUsage(BEAUTY_STORE);
  },
};
