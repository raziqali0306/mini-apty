import type { PlayerStep } from '../shared/player';
import type { SaveWalkthroughInput } from '../shared/messages';

/**
 * Local-first storage for authoring: a per-origin **mirror** of saved
 * walkthroughs (so "extension storage" holds them and they're readable offline)
 * plus a FIFO **queue** of saves that couldn't reach the backend. The service
 * worker drains the queue when connectivity returns. Storage-only — no network.
 */

export type SyncStatus = 'synced' | 'pending';

export interface MirrorEntry {
  id: string;
  name: string;
  origin: string;
  pathPattern: string;
  steps: PlayerStep[];
  version: number;
  syncStatus: SyncStatus;
  updatedAt: number;
}

export interface QueueItem {
  tempId: string;
  payload: SaveWalkthroughInput;
}

const SAVED_PREFIX = 'mini-apty:saved:';
const QUEUE_KEY = 'mini-apty:queue';

const savedKey = (origin: string): string => `${SAVED_PREFIX}${origin}`;

export async function readMirror(origin: string): Promise<MirrorEntry[]> {
  const key = savedKey(origin);
  const result = await chrome.storage.local.get(key);
  return (result[key] as MirrorEntry[] | undefined) ?? [];
}

async function writeMirror(origin: string, entries: MirrorEntry[]): Promise<void> {
  await chrome.storage.local.set({ [savedKey(origin)]: entries });
}

/** Insert or replace a mirror entry by id. */
export async function upsertMirror(origin: string, entry: MirrorEntry): Promise<void> {
  const entries = await readMirror(origin);
  const i = entries.findIndex((e) => e.id === entry.id);
  if (i >= 0) entries[i] = entry;
  else entries.push(entry);
  await writeMirror(origin, entries);
}

export async function removeMirrorEntry(origin: string, id: string): Promise<void> {
  const entries = await readMirror(origin);
  await writeMirror(
    origin,
    entries.filter((e) => e.id !== id),
  );
}

export async function readQueue(): Promise<QueueItem[]> {
  const result = await chrome.storage.local.get(QUEUE_KEY);
  return (result[QUEUE_KEY] as QueueItem[] | undefined) ?? [];
}

export async function writeQueue(items: QueueItem[]): Promise<void> {
  await chrome.storage.local.set({ [QUEUE_KEY]: items });
}

export async function enqueue(item: QueueItem): Promise<void> {
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
}
