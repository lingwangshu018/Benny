export function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readText(key: string, fallback: string) {
  return window.localStorage.getItem(key) ?? fallback;
}

export function writeText(key: string, value: string) {
  window.localStorage.setItem(key, value);
}
