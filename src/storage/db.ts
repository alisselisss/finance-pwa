import type { AppState } from '../domain/types'
import { emptyState } from '../domain/engine'

const DB_NAME = 'finance-pwa'
const DB_VERSION = 1
const STORE = 'kv'
const STATE_KEY = 'app-state'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть базу данных'))
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const store = tx.objectStore(STORE)
        const request = fn(store)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Ошибка хранилища'))
        tx.oncomplete = () => db.close()
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('Ошибка транзакции'))
        }
      }),
  )
}

export async function loadState(): Promise<AppState> {
  const stored = await withStore<AppState | undefined>('readonly', (store) => store.get(STATE_KEY))
  return stored ?? emptyState()
}

export async function saveState(state: AppState): Promise<void> {
  await withStore('readwrite', (store) => store.put(state, STATE_KEY))
}

export async function replaceState(state: AppState): Promise<void> {
  await saveState(state)
}
