import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { IndexedDBPersistence } from '../src/browser/persistence';
import { Simulation } from '../src/core/simulation';
import type { SlotId, Snapshot } from '../src/core/types';

let factory: IDBFactory;
let storage: IndexedDBPersistence;
let snapshot: Snapshot;

beforeEach(async () => {
 factory = new IDBFactory();
 vi.stubGlobal('indexedDB', factory);
 storage = new IndexedDBPersistence();
 const simulation = await Simulation.create(1701);
 snapshot = simulation.snapshot();
 simulation.dispose();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function rawRecord(slot: SlotId, value: unknown): Promise<void> {
 const database = await new Promise<IDBDatabase>((resolve, reject) => {
  const request = factory.open('bold-and-brave', 1);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
 });
 try {
  await new Promise<void>((resolve, reject) => {
   const transaction = database.transaction('campaigns', 'readwrite');
   transaction.objectStore('campaigns').put({ slot, savedAt: '2026-09-04T12:00:00.000Z', snapshot: value });
   transaction.oncomplete = () => resolve();
   transaction.onabort = () => reject(transaction.error);
  });
 } finally { database.close(); }
}

describe('IndexedDB campaign persistence', () => {
 it('keeps all manual slots separate from rolling autosave and restores exact campaign fields', async () => {
  const entries = new Map<SlotId, Snapshot>();
  for (const [index, slot] of (['1', '2', '3', 'autosave'] as const).entries()) {
   const saved = structuredClone(snapshot);
   saved.campaign.position = { x: index + 1, z: 5 };
   saved.campaign.time = 8 + index + .125;
   saved.campaign.provisionRemainder = .125 + index * .05;
   saved.campaign.randomState = 1701 + index;
   entries.set(slot, saved);
   expect(await storage.write(slot, saved)).toEqual({ ok: true, value: undefined });
  }
  const replacement = structuredClone(snapshot);
  replacement.campaign.position.x = 9;
  expect((await storage.write('autosave', replacement)).ok).toBe(true);
  entries.set('autosave', replacement);
  const reopened = new IndexedDBPersistence();
  for (const [slot, saved] of entries) expect(await reopened.read(slot)).toEqual({ ok: true, value: saved });
  const list = await reopened.list();
  expect(list.ok).toBe(true);
  if (!list.ok) throw new Error(list.error);
  expect(list.value.map((entry) => entry.slot)).toEqual(['1', '2', '3', 'autosave']);
  expect(list.value.every((entry) => entry.snapshot !== null)).toBe(true);
 });

 it('captures writes before callers can mutate queued inputs and isolates returned snapshots', async () => {
  const expected = structuredClone(snapshot);
  const pending = storage.write('1', snapshot);
  snapshot.campaign.coin = 0;
  expect((await pending).ok).toBe(true);
  const first = await storage.read('1');
  expect(first).toEqual({ ok: true, value: expected });
  if (!first.ok) throw new Error(first.error);
  first.value.campaign.coin = 1;
  expect(await storage.read('1')).toEqual({ ok: true, value: expected });
 });

 it('marks old or corrupt records unavailable without resetting valid neighboring entries', async () => {
  expect((await storage.write('3', snapshot)).ok).toBe(true);
  await rawRecord('1', { ...snapshot, version: 0 });
  const corrupt = structuredClone(snapshot);
  corrupt.campaign.provisions = -1;
  await rawRecord('2', corrupt);
  const list = await storage.list();
  expect(list.ok).toBe(true);
  if (!list.ok) throw new Error(list.error);
  for (const slot of ['1', '2'] as const) {
   const entry = list.value.find((entry) => entry.slot === slot)!;
   expect(entry.snapshot).toBeNull();
   expect(typeof entry.reason).toBe('string');
   expect(await storage.read(slot)).toMatchObject({ ok: false, code: 'invalid' });
  }
  const empty = list.value.find((entry) => entry.slot === 'autosave')!;
  expect(empty.snapshot).toBeNull();
  expect(empty.reason).toBeUndefined();
  expect(await storage.read('autosave')).toMatchObject({ ok: false, code: 'missing' });
  expect(await storage.read('3')).toEqual({ ok: true, value: snapshot });
  expect(await new IndexedDBPersistence().read('1')).toMatchObject({ ok: false, code: 'invalid' });
  expect((await storage.delete('1')).ok).toBe(true);
  expect(await storage.read('1')).toMatchObject({ ok: false, code: 'missing' });
  expect((await storage.write('2', snapshot)).ok).toBe(true);
  expect(await storage.read('2')).toEqual({ ok: true, value: snapshot });
  const repaired = await storage.list();
  expect(repaired.ok).toBe(true);
  if (!repaired.ok) throw new Error(repaired.error);
  expect(repaired.value.find((entry) => entry.slot === '1')!.reason).toBeUndefined();
  expect(repaired.value.find((entry) => entry.slot === '2')!.reason).toBeUndefined();
 });

 it('latches storage denial, keeps the in-memory campaign playable, and requires explicit Retry', async () => {
  const denied = vi.spyOn(factory, 'open').mockImplementation(() => { throw new DOMException('Permission denied', 'SecurityError'); });
  expect(await storage.write('1', snapshot)).toMatchObject({ ok: false, code: 'denied' });
  const simulation = await Simulation.create(1702);
  try {
   simulation.submit({ type: 'travel', point: { x: 2, z: 2 } }, 1);
   for (let tick = 0; tick < 60; tick++) simulation.advance();
   expect(simulation.project().campaign.position.x).toBeGreaterThan(0);
   denied.mockRestore();
   expect(await storage.list()).toMatchObject({ ok: false, code: 'denied' });
   expect((await storage.retry()).ok).toBe(true);
   expect((await storage.write('1', simulation.snapshot())).ok).toBe(true);
   expect(await storage.read('1')).toEqual({ ok: true, value: simulation.snapshot() });
  } finally { simulation.dispose(); }
 });

 it('never reports a quota-aborted write as success and preserves the previous committed slot', async () => {
  expect((await storage.write('1', snapshot)).ok).toBe(true);
  const full = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Disk full', 'QuotaExceededError'); });
  const changed = structuredClone(snapshot);
  changed.campaign.provisions = 2.5;
  expect(await storage.write('1', changed)).toMatchObject({ ok: false, code: 'quota' });
  full.mockRestore();
  expect(await storage.read('1')).toMatchObject({ ok: false, code: 'quota' });
  expect(await new IndexedDBPersistence().read('1')).toEqual({ ok: true, value: snapshot });
  expect((await storage.retry()).ok).toBe(true);
  expect((await storage.write('1', changed)).ok).toBe(true);
  expect(await storage.read('1')).toEqual({ ok: true, value: changed });
 });

 it('deletes only the selected manual slot, and reset removes manual slots and autosave', async () => {
  for (const slot of ['1', '2', '3', 'autosave'] as const) expect((await storage.write(slot, snapshot)).ok).toBe(true);
  expect((await storage.delete('2')).ok).toBe(true);
  expect(await storage.read('2')).toMatchObject({ ok: false, code: 'missing' });
  for (const slot of ['1', '3', 'autosave'] as const) expect(await storage.read(slot)).toEqual({ ok: true, value: snapshot });
  expect((await storage.reset()).ok).toBe(true);
  for (const slot of ['1', '2', '3', 'autosave'] as const) expect(await storage.read(slot)).toMatchObject({ ok: false, code: 'missing' });
  const cleared = await storage.list();
  expect(cleared.ok).toBe(true);
  if (!cleared.ok) throw new Error(cleared.error);
  for (const entry of cleared.value) {
   expect(entry.snapshot).toBeNull();
   expect(entry.reason).toBeUndefined();
  }
 });
});
