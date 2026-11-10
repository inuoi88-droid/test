// 学習の決まり（純粋関数。画面・保存・通信からは独立）
//
// - 初めて出た単語に一発で正解 → 卒業（もう出さない）
// - 間違えた単語 → その回の最後にまとめてもう一周（数えない）→ 1日後 → 3日後 → 7日後に復習
//   （間隔は前の復習からの日数）。復習で3回続けて正解 → 卒業。途中で間違えたら1日後からやり直し
// - 1日の新出の数 = まだ出ていない語 ÷ 目標日までの残り日数（今日を含む）を切り上げ
// - 1日の区切りは朝4時（深夜0時〜4時の学習は前の日に数える）

export type Status = 'new' | 'review' | 'mastered'

/** 1単語の学習の状態（サーバーの toeic_progress の1行と同じ形） */
export interface Card {
  word_id: number
  status: Status
  /** 復習で続けて正解した回数（0〜2。3になったら卒業） */
  streak: number
  /** 次に出す学習日（YYYY-MM-DD） */
  due: string | null
  /** 当日中にもう一度出す（last_day が今日のときだけ有効） */
  relearn: boolean
  first_day: string | null
  last_day: string | null
  right_count: number
  wrong_count: number
  /** 答えた時刻（ミリ秒）。端末どうしで新しい方を残す */
  updated_at: number
}

/** 間違えたあとの復習の間隔（日）。[1回目, 2回目, 3回目] */
export const INTERVALS = [1, 3, 7] as const
/** 復習で続けて何回正解したら卒業か */
export const GRADUATE_STREAK = INTERVALS.length
/** 1日の区切りの時刻 */
export const DAY_START_HOUR = 4

const pad = (n: number) => String(n).padStart(2, '0')

/** その時刻の学習日（端末の地域時刻で、朝4時区切り） */
export function studyDay(now: Date | number): string {
  const d = new Date(typeof now === 'number' ? now : now.getTime())
  d.setHours(d.getHours() - DAY_START_HOUR)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseDay(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(day: string, n: number): string {
  const t = new Date(parseDay(day) + n * 86400000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** b − a（日） */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000)
}

export function newCard(wordId: number, now: number): Card {
  return {
    word_id: wordId,
    status: 'new',
    streak: 0,
    due: null,
    relearn: false,
    first_day: null,
    last_day: null,
    right_count: 0,
    wrong_count: 0,
    updated_at: now,
  }
}

/** 今日もう一度出す必要がある（間違えたまま、今日まだ正解していない） */
export function needsRelearn(c: Card, today: string): boolean {
  return c.status === 'review' && c.relearn && c.last_day === today
}

/** 今日の復習の対象（予定日が来ていて、今日まだ答えていない） */
export function isDue(c: Card, today: string): boolean {
  return c.status === 'review' && c.due !== null && c.due <= today && c.last_day !== today
}

export function isUnseen(c: Card | undefined): boolean {
  return !c || c.first_day === null
}

/** 問題の種類（画面の札に使う） */
export type Kind = 'new' | 'review' | 'relearn'

export function kindOf(c: Card | undefined, today: string): Kind {
  if (!c || c.status === 'new' || c.first_day === null) return 'new'
  if (needsRelearn(c, today)) return 'relearn'
  return 'review'
}

/** 答えたあとの状態 */
export function answer(prev: Card | undefined, wordId: number, correct: boolean, today: string, now: number): Card {
  const c: Card = { ...(prev ?? newCard(wordId, now)) }
  c.updated_at = Math.max(now, (prev?.updated_at ?? 0) + 1)
  const relearning = needsRelearn(c, today)
  const first = c.status === 'new' || c.first_day === null
  c.last_day = today
  if (correct) c.right_count += 1
  else c.wrong_count += 1

  if (first) {
    c.first_day = today
    if (correct) {
      c.status = 'mastered'
      c.streak = 0
      c.due = null
      c.relearn = false
    } else {
      fail(c, today)
    }
    return c
  }

  if (relearning) {
    // 同じ日のやり直し。回数には数えず、予定日（翌日）はそのまま
    c.relearn = !correct
    return c
  }

  if (!correct) {
    fail(c, today)
    return c
  }

  if (c.status === 'mastered') return c
  c.streak += 1
  c.relearn = false
  if (c.streak >= GRADUATE_STREAK) {
    c.status = 'mastered'
    c.due = null
  } else {
    c.status = 'review'
    c.due = addDays(today, INTERVALS[c.streak])
  }
  return c
}

function fail(c: Card, today: string) {
  c.status = 'review'
  c.streak = 0
  c.due = addDays(today, INTERVALS[0])
  c.relearn = true
}

export interface DailyPlan {
  /** 今日の新出の目標 */
  quota: number
  /** 今日すでに出した新出 */
  seenToday: number
  /** 今日あと何語の新出を出すか */
  newLeft: number
  /** まだ一度も出ていない語 */
  unseen: number
  /** 目標日まで（今日を含む） */
  daysLeft: number
}

export function dailyPlan(totalWords: number, cards: Iterable<Card>, today: string, targetDay: string): DailyPlan {
  let seen = 0
  let seenToday = 0
  for (const c of cards) {
    if (c.first_day === null) continue
    seen += 1
    if (c.first_day === today) seenToday += 1
  }
  const unseen = Math.max(0, totalWords - seen)
  const daysLeft = Math.max(1, daysBetween(today, targetDay) + 1)
  const quota = Math.ceil((unseen + seenToday) / daysLeft)
  const newLeft = Math.max(0, Math.min(unseen, quota - seenToday))
  return { quota, seenToday, newLeft, unseen, daysLeft }
}

export interface TodayCounts {
  due: number
  relearn: number
  plan: DailyPlan
}

export function todayCounts(wordIds: readonly number[], cards: ReadonlyMap<number, Card>, today: string, targetDay: string): TodayCounts {
  let due = 0
  let relearn = 0
  for (const c of cards.values()) {
    if (needsRelearn(c, today)) relearn += 1
    else if (isDue(c, today)) due += 1
  }
  return { due, relearn, plan: dailyPlan(wordIds.length, cards.values(), today, targetDay) }
}

/**
 * 今日出す問題の並び（まとめの一周の前まで）。復習（予定日の古い順）→ 新出（本の順）。
 * 今日間違えた単語は入れず、最後に relearnQueue() でまとめて出す。
 * extraNew は「今日の分のあとにさらに進める」語数。
 */
export function buildQueue(
  wordIds: readonly number[],
  cards: ReadonlyMap<number, Card>,
  today: string,
  targetDay: string,
  extraNew = 0,
): number[] {
  const due: Card[] = []
  for (const c of cards.values()) {
    if (!needsRelearn(c, today) && isDue(c, today)) due.push(c)
  }
  due.sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.word_id - b.word_id))

  const plan = dailyPlan(wordIds.length, cards.values(), today, targetDay)
  const want = plan.newLeft + extraNew
  const fresh: number[] = []
  for (const id of wordIds) {
    if (fresh.length >= want) break
    if (isUnseen(cards.get(id))) fresh.push(id)
  }
  return [...due.map((c) => c.word_id), ...fresh]
}

/** まとめの一周：今日間違えたまま、まだ正解していない単語（間違えた順） */
export function relearnQueue(cards: ReadonlyMap<number, Card>, today: string): number[] {
  const list: Card[] = []
  for (const c of cards.values()) if (needsRelearn(c, today)) list.push(c)
  list.sort((a, b) => a.updated_at - b.updated_at || a.word_id - b.word_id)
  return list.map((c) => c.word_id)
}

/** 端末どうしの記録を合わせる：新しい方 */
export function newer(a: Card | undefined, b: Card | undefined): Card | undefined {
  if (!a) return b
  if (!b) return a
  return b.updated_at > a.updated_at ? b : a
}
