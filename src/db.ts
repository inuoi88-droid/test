// 端末の中の保存（IndexedDB）。電波がなくても学習でき、あとで同期する。
import { DEMO } from './config'
import type { Card } from './srs'

export interface Word {
  id: number
  word: string
  /** [[品詞, 意味], ...] */
  meanings: [string, string][]
  /** [[英語, 日本語], ...] */
  phrases: [string, string][]
  grp: number
}

export interface Settings {
  /** 一周を終える目標日（YYYY-MM-DD） */
  targetDay: string
  updated_at: number
}

const DB_NAME = DEMO ? 'toeic4000-demo' : 'toeic4000'
const VERSION = 1

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'word_id' })
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'word_id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function result<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  return result(db.transaction('kv').objectStore('kv').get(key)) as Promise<T | undefined>
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open()
  const tx = db.transaction('kv', 'readwrite')
  tx.objectStore('kv').put(value, key)
  return done(tx)
}

export async function allCards(): Promise<Card[]> {
  const db = await open()
  return result(db.transaction('cards').objectStore('cards').getAll())
}

/** 答えた記録を保存し、送信待ちにも入れる */
export async function saveCards(cards: Card[], queueForSync = true): Promise<void> {
  if (!cards.length) return
  const db = await open()
  const tx = db.transaction(['cards', 'outbox'], 'readwrite')
  const cs = tx.objectStore('cards')
  const ob = tx.objectStore('outbox')
  for (const c of cards) {
    cs.put(c)
    if (queueForSync) ob.put(c)
  }
  return done(tx)
}

export async function outbox(): Promise<Card[]> {
  const db = await open()
  return result(db.transaction('outbox').objectStore('outbox').getAll())
}

/** 送れたものを送信待ちから外す（送ったあとにまた答えたものは残す） */
export async function clearSent(sent: Card[]): Promise<void> {
  if (!sent.length) return
  const db = await open()
  const tx = db.transaction('outbox', 'readwrite')
  const ob = tx.objectStore('outbox')
  for (const c of sent) {
    const req = ob.get(c.word_id)
    req.onsuccess = () => {
      const cur = req.result as Card | undefined
      if (cur && cur.updated_at === c.updated_at) ob.delete(c.word_id)
    }
  }
  return done(tx)
}

/** 別の人がログインしたときなどに、端末の記録を消す */
export async function clearAll(): Promise<void> {
  const db = await open()
  const tx = db.transaction(['kv', 'cards', 'outbox'], 'readwrite')
  tx.objectStore('kv').clear()
  tx.objectStore('cards').clear()
  tx.objectStore('outbox').clear()
  return done(tx)
}
