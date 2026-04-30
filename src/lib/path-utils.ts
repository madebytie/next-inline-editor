export function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function setByPath<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone: unknown = Array.isArray(obj) ? [...(obj as unknown[])] : { ...(obj as object) };
  let cursor: unknown = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const idx = Array.isArray(cursor) ? Number(key) : key;
    const cur = (cursor as Record<string | number, unknown>)[idx];
    const next = Array.isArray(cur) ? [...cur] : { ...(cur as object) };
    (cursor as Record<string | number, unknown>)[idx] = next;
    cursor = next;
  }
  const lastKey = keys[keys.length - 1];
  const lastIdx = Array.isArray(cursor) ? Number(lastKey) : lastKey;
  (cursor as Record<string | number, unknown>)[lastIdx] = value;
  return clone as T;
}
