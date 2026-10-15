import { useSyncExternalStore } from 'react';
import { db, selectDatabase, ProgressDatabase, readData } from '../storage';
import { snapshotSchema, type Snapshot } from './schema';
import { mergeSnapshots } from './merge';
export type AccountUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
type AccountState = {
  ready: boolean;
  user: AccountUser | null;
  status: 'guest' | 'syncing' | 'synced' | 'offline' | 'error';
  message: string;
  lastSync: string | null;
  guestAvailable: boolean;
  conversation: boolean;
  voice: boolean;
  transcription: boolean;
  communitySpace: string | null;
};
let state: AccountState = {
  ready: false,
  user: null,
  status: 'guest',
  message: '',
  lastSync: null,
  guestAvailable: false,
  conversation: false,
  voice: false,
  transcription: false,
  communitySpace: null,
};
const listeners = new Set<() => void>();
function update(patch: Partial<AccountState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}
export function useAccount() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
export const accountState = () => state;
const REMEMBER = 'paso-account-v1';
let mutation = 0;
let boot: Promise<void> | null = null,
  active: Promise<void> | null = null,
  timer: ReturnType<typeof setTimeout> | undefined;
let channel: BroadcastChannel | null = null;
export function changed() {
  window.dispatchEvent(new Event('paso-data-changed'));
}
function remember(user: AccountUser | null) {
  try {
    if (user) localStorage.setItem(REMEMBER, JSON.stringify(user));
    else localStorage.removeItem(REMEMBER);
  } catch {
    /* IndexedDB is authoritative. */
  }
}
function remembered(): AccountUser | null {
  try {
    const value = JSON.parse(localStorage.getItem(REMEMBER) ?? 'null');
    return value && typeof value.userId === 'string' && typeof value.displayName === 'string'
      ? value
      : null;
  } catch {
    return null;
  }
}
async function fetchAccount() {
  const response = await fetch('/api/account', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Error('Account service unavailable');
  return response.json() as Promise<{
    user: AccountUser | null;
    conversation: boolean;
    voice: boolean;
    transcription: boolean;
    communitySpace: string | null;
  }>;
}
async function snapshot(database = db) {
  return database.transaction(
    'r',
    [
      database.lessons,
      database.cards,
      database.sessions,
      database.events,
      database.settings,
      database.mistakes,
      database.placements,
      database.conversations,
    ],
    async () => snapshotSchema.parse(await readData(database)),
  );
}
async function guestFingerprint(value: Snapshot) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function guestMarker(userId: string, value?: string) {
  try {
    const key = `paso-guest-import-${encodeURIComponent(userId)}`;
    if (value) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
async function mergeLocal(remote: Snapshot) {
  await db.transaction(
    'rw',
    [
      db.lessons,
      db.cards,
      db.sessions,
      db.events,
      db.settings,
      db.mistakes,
      db.placements,
      db.conversations,
    ],
    async () => {
      const merged = snapshotSchema.parse(mergeSnapshots(await readData(), remote));
      await db.lessons.bulkPut(merged.progress);
      await db.cards.bulkPut(merged.cards);
      await db.sessions.bulkPut(merged.sessions);
      await db.events.bulkPut(merged.events);
      await db.mistakes.bulkPut(merged.mistakes);
      await db.settings.put(merged.settings);
      await db.placements.bulkPut(merged.placements);
      await db.conversations.bulkPut(merged.conversations);
    },
  );
  changed();
}
export async function initializeAccount() {
  if (boot) return boot;
  boot = (async () => {
    let user: AccountUser | null = null;
    try {
      const info = await fetchAccount();
      user = info.user;
      remember(user);
      update({
        conversation: info.conversation,
        voice: info.voice,
        transcription: !!info.transcription,
        communitySpace: info.communitySpace ?? null,
      });
    } catch {
      user = remembered();
      update({
        status: 'offline',
        message: 'Offline — changes stay on this device until you reconnect.',
      });
    }
    selectDatabase(user ? `paso-account-${encodeURIComponent(user.userId)}` : 'paso-learning-v1');
    let guestAvailable = false;
    if (user) {
      const guest = new ProgressDatabase();
      try {
        const saved = await snapshot(guest);
        guestAvailable =
          saved.progress.length +
            saved.events.length +
            saved.placements.length +
            saved.conversations.length >
            0 && guestMarker(user.userId) !== (await guestFingerprint(saved));
      } finally {
        guest.close();
      }
    }
    update({
      ready: true,
      user,
      guestAvailable,
      status: user ? (state.status === 'offline' ? 'offline' : 'syncing') : 'guest',
    });
    if (user) void syncNow();
    window.addEventListener('online', () => void syncNow());
    window.addEventListener('focus', () => void syncNow());
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('paso-progress-v4');
      channel.onmessage = () => {
        changed();
        void syncNow();
      };
    }
  })();
  return boot;
}
async function performSync() {
  const owner = state.user;
  if (!owner) return;
  update({ status: 'syncing', message: 'Syncing your progress…' });
  try {
    const info = await fetchAccount();
    if (info.user?.userId !== owner.userId) {
      update({
        status: 'error',
        message: 'Your signed-in account changed. Reload Paso to switch safely.',
      });
      return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch('/api/progress', {
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw Error(
          response.status === 401
            ? 'Sign in again to sync.'
            : 'Sync is unavailable. Your local progress is safe.',
        );
      const remote = (await response.json()) as {
        revision: number;
        snapshot: unknown;
        updatedAt: string | null;
      };
      const local = await snapshot();
      const merged = remote.snapshot
        ? snapshotSchema.parse(mergeSnapshots(local, snapshotSchema.parse(remote.snapshot)))
        : local;
      // A read-only device pulls without generating a new remote revision.
      if (
        remote.snapshot &&
        JSON.stringify(merged) === JSON.stringify(snapshotSchema.parse(remote.snapshot))
      ) {
        await mergeLocal(merged);
        update({ status: 'synced', message: 'All progress synced', lastSync: remote.updatedAt });
        return;
      }
      const put = await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Paso-Request': '1' },
        body: JSON.stringify({ revision: remote.revision, snapshot: merged }),
        signal: AbortSignal.timeout(20000),
      });
      if (put.status === 409) continue;
      if (!put.ok) {
        const error = (await put.json().catch(() => ({}))) as { error?: string };
        throw Error(error.error ?? 'Could not sync. Your local progress is safe.');
      }
      const saved = (await put.json()) as { updatedAt: string };
      await mergeLocal(merged);
      update({ status: 'synced', message: 'All progress synced', lastSync: saved.updatedAt });
      if (JSON.stringify(await snapshot()) !== JSON.stringify(merged)) queueSync();
      return;
    }
    throw Error('Another device is syncing. Try again in a moment.');
  } catch (error) {
    update({
      status: navigator.onLine ? 'error' : 'offline',
      message:
        error instanceof Error ? error.message : 'Offline — changes are saved on this device.',
    });
  }
}
export function syncNow() {
  if (!state.user) return Promise.resolve();
  if (active) return active;
  const started = mutation;
  active = (async () => {
    if (navigator.locks)
      await navigator.locks.request(`paso-sync-${state.user!.userId}`, performSync);
    else await performSync();
  })().finally(() => {
    active = null;
    if (mutation !== started) queueSync();
  });
  return active;
}
export function queueSync() {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 700);
}
export function notifyLocalChange() {
  mutation++;
  channel?.postMessage({ database: db.name });
  queueSync();
}
export async function importGuestProgress() {
  if (!state.user) throw Error('Sign in first');
  // Finish the initial account pull before importing into its database.
  if (active) await active;
  update({ status: 'syncing', message: 'Adding your guest progress…' });
  const guest = new ProgressDatabase();
  try {
    const saved = await snapshot(guest);
    await mergeLocal(saved);
    guestMarker(state.user.userId, await guestFingerprint(saved));
    update({ guestAvailable: false });
    notifyLocalChange();
    await syncNow();
  } finally {
    guest.close();
  }
}
export function signOut() {
  remember(null);
}
