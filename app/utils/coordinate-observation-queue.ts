import type { CreateCoordinateObservationPayload } from '~~/shared/types/server'

const DATABASE_NAME = 'yeu-field-verification'
const STORE_NAME = 'coordinate-observations'
const DATABASE_VERSION = 2

export type NewCoordinateObservationPayload = Omit<
  CreateCoordinateObservationPayload,
  'clientObservationId'
> & {
  clientObservationId?: string
}

export type CoordinateObservationSubmissionPayload = NewCoordinateObservationPayload & {
  clientObservationId: string
}

export interface QueuedCoordinateObservation {
  id: string
  payload: CoordinateObservationSubmissionPayload
  queuedAt: string
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function ensureCoordinateObservationClientId(
  payload: NewCoordinateObservationPayload
): CoordinateObservationSubmissionPayload {
  return {
    ...payload,
    clientObservationId: isUuid(payload.clientObservationId)
      ? payload.clientObservationId
      : crypto.randomUUID()
  }
}

function migrateLegacyRecords(store: IDBObjectStore): void {
  const request = store.openCursor()
  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) return

    const record = cursor.value as Partial<QueuedCoordinateObservation> & {
      payload?: NewCoordinateObservationPayload
    }
    if (record.payload && !isUuid(record.payload.clientObservationId)) {
      record.payload = ensureCoordinateObservationClientId({
        ...record.payload,
        clientObservationId: isUuid(record.id) ? record.id : undefined
      })
      cursor.update(record)
    }
    cursor.continue()
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'))

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Unable to open field queue'))
    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      migrateLegacyRecords(store)
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Field queue transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Field queue transaction was aborted'))
  })
}

export async function enqueueCoordinateObservation(
  payload: CoordinateObservationSubmissionPayload
): Promise<QueuedCoordinateObservation> {
  const database = await openDatabase()
  const record: QueuedCoordinateObservation = {
    id: payload.clientObservationId,
    payload,
    queuedAt: new Date().toISOString()
  }
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).put(record)
  await waitForTransaction(transaction)
  database.close()
  return record
}

export async function listQueuedCoordinateObservations(): Promise<QueuedCoordinateObservation[]> {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readonly')
  const request = transaction.objectStore(STORE_NAME).getAll()
  const records = await new Promise<QueuedCoordinateObservation[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as QueuedCoordinateObservation[])
    request.onerror = () => reject(request.error ?? new Error('Unable to read field queue'))
  })
  await waitForTransaction(transaction)
  database.close()
  return records.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
}

export async function removeQueuedCoordinateObservation(id: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  transaction.objectStore(STORE_NAME).delete(id)
  await waitForTransaction(transaction)
  database.close()
}
