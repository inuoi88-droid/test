// アプリの状態（単語・学習の記録・設定・同期）。画面は useApp() で読む。
import { useSyncExternalStore } from 'react'
import { DEFAULT_TARGET_DAY, DEMO } from './config'
import * as db from './db'
import type { Settings, Word } from './db'
import { DEMO_WORDS } from './demo'
import { newCard, type Card } from './srs'
import { supabase } from './supabase'

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export interface AppState {
  ready: boolean
  /** 読み込みの途中経過・失敗の文 */
  loadingText: string | null
  loadError: string | null
  words: Word[]
  wordById: Map<number, Word>
  wordIds: number[]
  cards: Map<number, Card>
  settings: Settings
  sync: { status: SyncStatus; pending: number; lastSynced: number | null; message: string | null }
}

let state: AppState = {
  ready: false,
  loadingText: null,
  loadError: null,
  words: [],
  wordById: new Map(),
  wordIds: [],
  cards: new Map(),
  settings: { targetDay: DEFAULT_TARGET_DAY, updated_at: 0 },
  sync: { status: 'idle', pending: 0, lastSynced: null, message: null },
}

const listeners = new Set<() => void>()
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function setSync(patch: Partial<AppState['sync']>) {
  set({ sync: { ...state.sync, ...patch } })
}
export function getState() {
  return state
}
export function useApp(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

function setWords(words: Word[]) {
  const sorted = words.slice().sort((a, b) => a.id - b.id)
  set({ words: sorted, wordById: new Map(sorted.map((w) => [w.id, w])), wordIds: sorted.map((w) => w.id) })
}

// ---------- 起動 ----------

let currentUser: string | null = null

/** ログインした人の記録を端末から読み、単語を用意し、同期を始める */
export async function start(userId: string): Promise<void> {
  if (currentUser === userId && state.ready) return
  currentUser = userId
  set({ ready: false, loadError: null, loadingText: '端末の記録を読み込み中…' })
  const owner = await db.kvGet<string>('userId')
  if (owner && owner !== userId) await db.clearAll()
  await db.kvSet('userId', userId)

  const [cards, words, settings, pending] = await Promise.all([
    db.allCards(),
    db.kvGet<Word[]>('words'),
    db.kvGet<Settings>('settings'),
    db.outbox(),
  ])
  set({ cards: new Map(cards.map((c) => [c.word_id, c])) })
  if (settings) set({ settings })
  setSync({ pending: pending.length })

  if (DEMO) {
    setWords(DEMO_WORDS)
    set({ ready: true, loadingText: null })
    return
  }

  if (words?.length) {
    // 端末に単語があればすぐ始められる。新しい版は裏で取りに行く
    setWords(words)
    set({ ready: true, loadingText: null })
    void refreshWords().then(() => syncNow())
  } else {
    try {
      await refreshWords(true)
      set({ ready: true, loadingText: null })
    } catch (e) {
      set({ loadError: messageOf(e), loadingText: null })
      return
    }
    void syncNow()
  }
}

export function stop() {
  currentUser = null
  set({ ready: false })
}

/** ログアウト：端末の記録も消す（送っていない記録があるときは画面で確認してから） */
export async function signOut(): Promise<void> {
  await syncNow()
  await supabase.auth.signOut()
  await db.clearAll()
  stop()
  set({ cards: new Map(), words: [], wordById: new Map(), wordIds: [], settings: { targetDay: DEFAULT_TARGET_DAY, updated_at: 0 } })
}

// ---------- 単語 ----------

const PAGE = 1000

async function refreshWords(force = false): Promise<void> {
  if (DEMO) return
  if (!navigator.onLine && !force) return
  const { data: version, error: vErr } = await supabase.rpc('toeic_words_version')
  if (vErr) throw vErr
  const have = await db.kvGet<string>('wordsVersion')
  if (!force && have === version) return
  if (version === '0' || version === '0-') {
    throw new Error('単語を読めませんでした。このメールアドレスは利用者として登録されていないか、メールの確認がまだです。')
  }
  set({ loadingText: '単語データを読み込み中…' })
  const all: Word[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('toeic_words')
      .select('id, word, meanings, phrases, grp')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as Word[]))
    set({ loadingText: `単語データを読み込み中…（${all.length}語）` })
    if (!data || data.length < PAGE) break
  }
  if (!all.length) throw new Error('単語が見つかりませんでした。')
  await db.kvSet('words', all)
  await db.kvSet('wordsVersion', version)
  setWords(all)
}

/** 単語データを取り直す（設定画面から） */
export async function reloadWords(): Promise<void> {
  await refreshWords(true)
  set({ loadingText: null })
}

// ---------- 学習の記録 ----------

/** 答えた（または戻した）記録を保存する */
export async function putCard(card: Card): Promise<void> {
  const cards = new Map(state.cards)
  cards.set(card.word_id, card)
  set({ cards })
  await db.saveCards([card], !DEMO)
  if (!DEMO) {
    setSync({ pending: (await db.outbox()).length })
    scheduleSync()
  }
}

/** 「1つ前に戻る」：答える前の状態に戻す（時刻だけ新しくして同期させる） */
export async function restoreCard(wordId: number, prev: Card | undefined): Promise<void> {
  const cur = state.cards.get(wordId)
  const now = Math.max(Date.now(), (cur?.updated_at ?? 0) + 1)
  const card = prev ? { ...prev, updated_at: now } : newCard(wordId, now)
  await putCard(card)
}

// ---------- 設定 ----------

export async function setTargetDay(targetDay: string): Promise<void> {
  const settings: Settings = { targetDay, updated_at: Date.now() }
  set({ settings })
  await db.kvSet('settings', settings)
  if (DEMO) return
  await db.kvSet('settingsDirty', true)
  scheduleSync()
}

// ---------- 同期 ----------

let timer: ReturnType<typeof setTimeout> | null = null
let running: Promise<void> | null = null
let again = false

function scheduleSync(delay = 2500) {
  if (DEMO) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void syncNow()
  }, delay)
}

/** 送信待ちを送り、ほかの端末の記録を取り込む */
export function syncNow(): Promise<void> {
  if (DEMO || !currentUser) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await syncOnce()
    } while (again)
  })().finally(() => {
    running = null
  })
  return running
}

interface Row {
  word_id: number
  status: Card['status']
  streak: number
  due: string | null
  relearn: boolean
  first_day: string | null
  last_day: string | null
  right_count: number
  wrong_count: number
  updated_at: string
  synced_at?: string
}

const toRow = (c: Card): Row => ({
  word_id: c.word_id,
  status: c.status,
  streak: c.streak,
  due: c.due,
  relearn: c.relearn,
  first_day: c.first_day,
  last_day: c.last_day,
  right_count: c.right_count,
  wrong_count: c.wrong_count,
  updated_at: new Date(c.updated_at).toISOString(),
})

const fromRow = (r: Row): Card => ({
  word_id: r.word_id,
  status: r.status,
  streak: r.streak,
  due: r.due,
  relearn: r.relearn,
  first_day: r.first_day,
  last_day: r.last_day,
  right_count: r.right_count,
  wrong_count: r.wrong_count,
  updated_at: Date.parse(r.updated_at),
})

const PUSH_BATCH = 2000
/** 取り込みの目印を少し戻して、同時に書かれた行の取りこぼしを防ぐ */
const PULL_OVERLAP_MS = 10_000

async function syncOnce(): Promise<void> {
  if (!navigator.onLine) {
    setSync({ status: 'offline', message: null })
    return
  }
  setSync({ status: 'syncing', message: null })
  try {
    // 送る
    const out = await db.outbox()
    const settingsDirty = (await db.kvGet<boolean>('settingsDirty')) === true
    const s = state.settings
    for (let i = 0; i < out.length || (i === 0 && settingsDirty); i += PUSH_BATCH) {
      const batch = out.slice(i, i + PUSH_BATCH)
      const { error } = await supabase.rpc('toeic_push', {
        rows: batch.map(toRow),
        settings: i === 0 && settingsDirty ? { data: { targetDay: s.targetDay }, updated_at: new Date(s.updated_at).toISOString() } : null,
      })
      if (error) throw error
      await db.clearSent(batch)
      if (i === 0 && settingsDirty && state.settings.updated_at === s.updated_at) await db.kvSet('settingsDirty', false)
    }

    // 取り込む
    const cursor = await db.kvGet<string>('pullCursor')
    let since = cursor ? new Date(Date.parse(cursor) - PULL_OVERLAP_MS).toISOString() : null
    let newest = cursor ?? null
    const merged: Card[] = []
    for (;;) {
      let q = supabase.from('toeic_progress').select('*').order('synced_at').limit(PAGE)
      if (since) q = q.gt('synced_at', since)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as Row[]
      for (const r of rows) {
        const remote = fromRow(r)
        const local = state.cards.get(remote.word_id)
        if (!local || remote.updated_at > local.updated_at) merged.push(remote)
        if (!newest || Date.parse(r.synced_at!) > Date.parse(newest)) newest = r.synced_at!
      }
      if (rows.length < PAGE) break
      since = rows[rows.length - 1].synced_at!
    }
    if (merged.length) {
      const cards = new Map(state.cards)
      const keep: Card[] = []
      for (const c of merged) {
        const local = cards.get(c.word_id)
        if (!local || c.updated_at > local.updated_at) {
          cards.set(c.word_id, c)
          keep.push(c)
        }
      }
      set({ cards })
      await db.saveCards(keep, false)
    }
    if (newest) await db.kvSet('pullCursor', newest)

    // 設定
    const { data: srow, error: sErr } = await supabase.from('toeic_settings').select('data, updated_at').maybeSingle()
    if (sErr) throw sErr
    if (srow) {
      const remote: Settings = {
        targetDay: (srow.data as { targetDay?: string })?.targetDay ?? DEFAULT_TARGET_DAY,
        updated_at: Date.parse(srow.updated_at as string),
      }
      if (remote.updated_at > state.settings.updated_at) {
        set({ settings: remote })
        await db.kvSet('settings', remote)
      }
    }

    setSync({ status: 'idle', pending: (await db.outbox()).length, lastSynced: Date.now(), message: null })
  } catch (e) {
    setSync({ status: navigator.onLine ? 'error' : 'offline', message: messageOf(e), pending: (await db.outbox()).length })
  }
}

function messageOf(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message)
    if (/not allowed/.test(m)) return 'このアカウントは利用者として登録されていません。'
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '通信できませんでした。'
    return m
  }
  return String(e)
}

// 画面が戻ったとき・電波が戻ったとき・1分ごとに同期
if (typeof window !== 'undefined' && !DEMO) {
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => setSync({ status: 'offline' }))
  // 開いたとき（ほかの端末の記録を取り込む）と、閉じる・切り替えるとき（送る）
  document.addEventListener('visibilitychange', () => void syncNow())
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 60_000)
}
