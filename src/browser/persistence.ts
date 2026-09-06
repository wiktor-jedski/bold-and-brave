import { validateSnapshot } from '../core/snapshot';
import type { PersistencePort, SaveEntry, SlotId, Snapshot } from '../core/types';

export type StorageFailureCode = 'denied' | 'quota' | 'unavailable' | 'invalid' | 'missing';
export type PersistenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: StorageFailureCode; error: string };

const SLOTS: readonly SlotId[] = ['1', '2', '3', 'autosave'];
const DATABASE = 'bold-and-brave';
const STORE = 'campaigns';
const PROBE = '__availability_probe__';

class StorageFailure extends Error {
  constructor(readonly code: StorageFailureCode, message: string) {
    super(message);
  }
}

function failure(error: unknown): StorageFailure {
  if (error instanceof StorageFailure) return error;
  const name = error instanceof Error ? error.name : '';
  const detail = error instanceof Error ? error.message : String(error);
  if (name === 'SecurityError' || name === 'NotAllowedError') {
    return new StorageFailure('denied', `Saving unavailable: browser storage was denied. ${detail}`);
  }
  if (name === 'QuotaExceededError') {
    return new StorageFailure('quota', `Saving unavailable: browser storage is full. Free space, then select Retry. ${detail}`);
  }
  return new StorageFailure('unavailable', `Saving unavailable: ${detail || 'IndexedDB could not complete the operation.'} Select Retry after storage is available.`);
}

function assertSlot(slot: SlotId): void {
  if (!SLOTS.includes(slot)) throw new StorageFailure('invalid', 'Unknown save slot.');
}

function entry(slot: SlotId, value: unknown): SaveEntry {
  if (value === undefined) return { slot, savedAt: '', snapshot: null };
  let savedAt = '';
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('The save record is corrupt.');
    const record = value as Record<string, unknown>;
    if (typeof record.savedAt === 'string') savedAt = record.savedAt;
    if (record.slot !== slot || !savedAt || !Number.isFinite(Date.parse(savedAt))) {
      throw new Error('The save record has invalid slot or timestamp metadata.');
    }
    return { slot, savedAt, snapshot: validateSnapshot(record.snapshot) };
  } catch (error) {
    return { slot, savedAt, snapshot: null, reason: error instanceof Error ? error.message : 'The save entry is unreadable.' };
  }
}

/** Storage only: callers own save-safe boundaries, confirmation, and campaign restoration. */
export class IndexedDBPersistence implements PersistencePort {
  private database: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;
  private unavailable: StorageFailure | null = null;
  private pending: Promise<void> = Promise.resolve();

  private connect(): Promise<IDBDatabase> {
    if (this.database) return Promise.resolve(this.database);
    if (this.opening) return this.opening;
    this.opening = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      let request: IDBOpenDBRequest;
      try {
        if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable in this browser.');
        request = globalThis.indexedDB.open(DATABASE, 1);
      } catch (error) {
        fail(error);
        return;
      }
      request.onblocked = () => fail(new Error('Another tab is blocking local storage. Close it and select Retry.'));
      request.onerror = () => fail(request.error ?? new Error('Opening local storage failed.'));
      request.onupgradeneeded = (event) => {
        if (settled || event.oldVersion !== 0) {
          request.transaction?.abort();
          fail(new Error('The local database version is unsupported. No migration was attempted.'));
          return;
        }
        try {
          request.result.createObjectStore(STORE, { keyPath: 'slot' });
        } catch (error) {
          request.transaction?.abort();
          fail(error);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        if (!database.objectStoreNames.contains(STORE)) {
          database.close();
          fail(new Error('The local database is unreadable. No reset was attempted.'));
          return;
        }
        settled = true;
        this.database = database;
        database.onversionchange = () => {
          database.close();
          if (this.database === database) this.database = null;
          this.unavailable = failure(new Error('Local storage changed in another tab.'));
        };
        database.onclose = () => {
          if (this.database !== database) return;
          this.database = null;
          this.unavailable = failure(new Error('The browser closed local storage unexpectedly.'));
        };
        resolve(database);
      };
    }).finally(() => { this.opening = null; });
    return this.opening;
  }

  private async transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
    const database = await this.connect();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode, { durability: 'strict' });
      let result: T;
      let error: unknown;
      transaction.oncomplete = () => error ? reject(error) : resolve(result);
      transaction.onerror = (event) => {
        if (!event.defaultPrevented) error = (event.target as IDBRequest).error ?? transaction.error;
      };
      transaction.onabort = () => reject(error ?? transaction.error ?? new Error('The storage transaction was aborted.'));
      try {
        work(transaction.objectStore(STORE), (value) => { result = value; });
      } catch (cause) {
        error = cause;
        try { transaction.abort(); } catch { reject(cause); }
      }
    });
  }

  private run<T>(work: () => Promise<T>, recovery = false): Promise<PersistenceResult<T>> {
    const operation = this.pending.then(async (): Promise<PersistenceResult<T>> => {
      if (this.unavailable && !recovery) {
        return { ok: false, code: this.unavailable.code, error: this.unavailable.message };
      }
      try {
        return { ok: true, value: await work() };
      } catch (error) {
        const problem = failure(error);
        if (problem.code !== 'invalid' && problem.code !== 'missing') this.unavailable = problem;
        return { ok: false, code: problem.code, error: problem.message };
      }
    });
    this.pending = operation.then(() => undefined);
    return operation;
  }

  list(): Promise<PersistenceResult<SaveEntry[]>> {
    return this.run(() => this.transaction('readonly', (store, result) => {
      const entries = SLOTS.map((slot) => entry(slot, undefined));
      result(entries);
      SLOTS.forEach((slot, index) => {
        const request = store.get(slot);
        request.onsuccess = () => { entries[index] = entry(slot, request.result); };
        request.onerror = (event) => {
          if (request.error?.name !== 'DataCloneError' && request.error?.name !== 'DataError') return;
          event.preventDefault();
          entries[index] = { slot, savedAt: '', snapshot: null, reason: `Unreadable save entry: ${request.error.message}` };
        };
      });
    }));
  }

  read(slot: SlotId): Promise<PersistenceResult<Snapshot>> {
    return this.run(async () => {
      assertSlot(slot);
      const saved = await this.transaction<SaveEntry>('readonly', (store, result) => {
        const request = store.get(slot);
        request.onsuccess = () => result(entry(slot, request.result));
        request.onerror = (event) => {
          if (request.error?.name !== 'DataCloneError' && request.error?.name !== 'DataError') return;
          event.preventDefault();
          result({ slot, savedAt: '', snapshot: null, reason: `Unreadable save entry: ${request.error.message}` });
        };
      });
      if (!saved.snapshot) throw new StorageFailure(saved.reason === undefined ? 'missing' : 'invalid', saved.reason ?? 'Empty slot');
      return saved.snapshot;
    });
  }

  write(slot: SlotId, snapshot: Snapshot): Promise<PersistenceResult<void>> {
    // Capture immediately, before queued operations yield to a caller that may reuse its object.
    let captured: Snapshot;
    try {
      assertSlot(slot);
      captured = structuredClone(validateSnapshot(snapshot));
    } catch (error) {
      return Promise.resolve({ ok: false, code: 'invalid', error: error instanceof Error ? error.message : 'Invalid snapshot.' });
    }
    return this.run(() => this.transaction<void>('readwrite', (store, result) => {
      store.put({ slot, savedAt: new Date().toISOString(), snapshot: captured });
      result(undefined);
    }));
  }

  delete(slot: Exclude<SlotId, 'autosave'>): Promise<PersistenceResult<void>> {
    return this.run(async () => {
      assertSlot(slot);
      if ((slot as SlotId) === 'autosave') throw new StorageFailure('invalid', 'Autosave can only be deleted by resetting all local campaign data.');
      await this.transaction<void>('readwrite', (store, result) => { store.delete(slot); result(undefined); });
    }, true);
  }

  reset(): Promise<PersistenceResult<void>> {
    return this.run(() => this.transaction<void>('readwrite', (store, result) => { store.clear(); result(undefined); }), true);
  }

  retry(): Promise<PersistenceResult<void>> {
    return this.run(async () => {
      this.database?.close();
      this.database = null;
      // Commit a real small write before removing it: an open/read alone cannot prove saving works.
      await this.transaction<void>('readwrite', (store, result) => {
        store.put({ slot: PROBE, bytes: new Uint8Array(1024) });
        result(undefined);
      });
      await this.transaction<void>('readwrite', (store, result) => { store.delete(PROBE); result(undefined); });
      this.unavailable = null;
    }, true);
  }
}
