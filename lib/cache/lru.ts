export interface LruEntry<T> {
  value: T;
  expiresAt: number;
}

/** Small bounded LRU cache used in front of the persistent JSON store. */
export class LruCache<T> {
  private readonly entries = new Map<string, LruEntry<T>>();

  constructor(private readonly maxEntries = 256) {}

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt > 0 && entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs = 0): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void { this.entries.delete(key); }
  clear(): void { this.entries.clear(); }
}
