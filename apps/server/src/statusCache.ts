interface StatusCacheEntry<T> {
  expiresAt: number;
  inFlight?: Promise<T>;
  value?: T;
}

export async function readThroughStatusCache<T>(
  cache: Map<string, StatusCacheEntry<T>>,
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);
  if (entry?.value && entry.expiresAt > now) return entry.value;
  if (entry?.inFlight) return entry.inFlight;

  const inFlight = load().then(
    (value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    (error) => {
      if (entry?.value) cache.set(key, { value: entry.value, expiresAt: entry.expiresAt });
      else cache.delete(key);
      throw error;
    }
  );

  cache.set(key, { value: entry?.value, expiresAt: entry?.expiresAt ?? 0, inFlight });
  return inFlight;
}

export function invalidateStatusCache<T>(cache: Map<string, StatusCacheEntry<T>>, key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
