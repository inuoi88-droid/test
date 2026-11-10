import { describe, expect, it } from 'vitest'
import {
  addDays,
  answer,
  buildQueue,
  dailyPlan,
  daysBetween,
  isDue,
  kindOf,
  needsRelearn,
  reinsert,
  studyDay,
  type Card,
} from '../src/srs'

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1)
const mapOf = (cards: Card[]) => new Map(cards.map((c) => [c.word_id, c]))

describe('学習日', () => {
  it('朝4時で区切る', () => {
    expect(studyDay(new Date(2026, 10, 10, 3, 59))).toBe('2026-11-09')
    expect(studyDay(new Date(2026, 10, 10, 4, 0))).toBe('2026-11-10')
    expect(studyDay(new Date(2026, 10, 10, 23, 59))).toBe('2026-11-10')
  })
  it('日付の足し算と差', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 7)).toBe('2027-01-07')
    expect(daysBetween('2026-11-10', '2026-12-07')).toBe(27)
  })
})

describe('答えたあとの状態', () => {
  const t0 = '2026-11-10'
  it('初めての単語に一発で正解したら卒業', () => {
    const c = answer(undefined, 1, true, t0, 1000)
    expect(c.status).toBe('mastered')
    expect(c.first_day).toBe(t0)
    expect(c.due).toBeNull()
  })

  it('初めての単語を間違えたら、当日中にもう一度 → 1日後', () => {
    const c = answer(undefined, 1, false, t0, 1000)
    expect(c.status).toBe('review')
    expect(c.due).toBe('2026-11-11')
    expect(needsRelearn(c, t0)).toBe(true)
    expect(kindOf(c, t0)).toBe('relearn')
    expect(isDue(c, t0)).toBe(false)
  })

  it('当日中のやり直しは3回に数えない（間違え続けても予定日は翌日のまま）', () => {
    let c = answer(undefined, 1, false, t0, 1000)
    c = answer(c, 1, false, t0, 2000)
    expect(needsRelearn(c, t0)).toBe(true)
    expect(c.due).toBe('2026-11-11')
    c = answer(c, 1, true, t0, 3000)
    expect(needsRelearn(c, t0)).toBe(false)
    expect(c.streak).toBe(0)
    expect(c.due).toBe('2026-11-11')
    expect(c.status).toBe('review')
  })

  it('復習で3回続けて正解したら卒業（1日後 → 3日後 → 7日後）', () => {
    let c = answer(undefined, 1, false, t0, 1000)
    c = answer(c, 1, true, t0, 2000) // 当日中のやり直し
    const d1 = '2026-11-11'
    expect(isDue(c, d1)).toBe(true)
    c = answer(c, 1, true, d1, 3000)
    expect(c.streak).toBe(1)
    expect(c.due).toBe('2026-11-14')
    expect(isDue(c, '2026-11-13')).toBe(false)
    const d2 = '2026-11-14'
    c = answer(c, 1, true, d2, 4000)
    expect(c.streak).toBe(2)
    expect(c.due).toBe('2026-11-21')
    const d3 = '2026-11-21'
    c = answer(c, 1, true, d3, 5000)
    expect(c.status).toBe('mastered')
    expect(c.due).toBeNull()
  })

  it('復習の途中で間違えたら最初の間隔からやり直し', () => {
    let c = answer(undefined, 1, false, t0, 1000)
    c = answer(c, 1, true, '2026-11-11', 2000)
    c = answer(c, 1, true, '2026-11-14', 3000)
    expect(c.streak).toBe(2)
    c = answer(c, 1, false, '2026-11-21', 4000)
    expect(c.streak).toBe(0)
    expect(c.due).toBe('2026-11-22')
    expect(needsRelearn(c, '2026-11-21')).toBe(true)
  })

  it('遅れて復習しても、答えた日から次の間隔を数える', () => {
    let c = answer(undefined, 1, false, t0, 1000)
    c = answer(c, 1, true, '2026-11-15', 2000) // 予定は11日だったが15日に
    expect(c.due).toBe('2026-11-18')
  })

  it('前の日に当日中のやり直しをしなかった単語は、予定日にふつうの復習として出る', () => {
    const c = answer(undefined, 1, false, t0, 1000)
    expect(needsRelearn(c, '2026-11-11')).toBe(false)
    expect(isDue(c, '2026-11-11')).toBe(true)
  })

  it('updated_at は必ず前より大きい', () => {
    const a = answer(undefined, 1, false, t0, 5000)
    const b = answer(a, 1, true, t0, 4000)
    expect(b.updated_at).toBeGreaterThan(a.updated_at)
  })
})

describe('1日の新出の数', () => {
  it('目標日までに一周できるように割る（今日と目標日を含む）', () => {
    // 11/10〜12/7 は28日。4010 / 28 = 143.2 → 144
    const p = dailyPlan(4010, [], '2026-11-10', '2026-12-07')
    expect(p.daysLeft).toBe(28)
    expect(p.quota).toBe(144)
    expect(p.newLeft).toBe(144)
  })

  it('今日すでに出した分を引く。日中に目標が動かない', () => {
    const seen = ids(50).map((id) => answer(undefined, id, id % 2 === 0, '2026-11-10', id))
    const p = dailyPlan(4010, seen, '2026-11-10', '2026-12-07')
    expect(p.quota).toBe(144)
    expect(p.seenToday).toBe(50)
    expect(p.newLeft).toBe(94)
  })

  it('休んだ日の分は残りの日に振り分ける', () => {
    const seen = ids(144).map((id) => answer(undefined, id, true, '2026-11-10', id))
    // 11/11 を休んで 11/12 に開く：残り 3866 / 26日 = 148.7 → 149
    const p = dailyPlan(4010, seen, '2026-11-12', '2026-12-07')
    expect(p.daysLeft).toBe(26)
    expect(p.quota).toBe(149)
  })

  it('目標日を過ぎたら残りを全部', () => {
    const p = dailyPlan(100, [], '2026-12-10', '2026-12-07')
    expect(p.daysLeft).toBe(1)
    expect(p.newLeft).toBe(100)
  })
})

describe('今日の問題の並び', () => {
  it('復習（予定日の古い順）→ 今日間違えたもの → 新出（本の順）', () => {
    const today = '2026-11-12'
    const cards = mapOf([
      answer(undefined, 5, false, '2026-11-11', 1), // 予定 11/12
      answer(undefined, 3, false, '2026-11-10', 2), // 予定 11/11（遅れ）
      answer(undefined, 9, false, today, 3), // 今日間違えた
      answer(undefined, 1, true, '2026-11-10', 4), // 卒業
    ])
    const q = buildQueue(ids(20), cards, today, today)
    expect(q.slice(0, 3)).toEqual([3, 5, 9])
    expect(q.slice(3, 6)).toEqual([2, 4, 6])
    expect(q).not.toContain(1)
    // 新出：残り 20 − 4 = 16 + 今日の1 = 17（目標日が今日なので全部）
    expect(q.length).toBe(3 + 16)
  })

  it('今日の分が終わったら新出は出ない。先取りすると出る', () => {
    const today = '2026-11-10'
    const cards = mapOf(ids(10).map((id) => answer(undefined, id, true, today, id)))
    expect(buildQueue(ids(100), cards, today, '2026-11-19')).toEqual([])
    expect(buildQueue(ids(100), cards, today, '2026-11-19', 3)).toEqual([11, 12, 13])
  })

  it('間違えた問題は少しあとにもう一度', () => {
    expect(reinsert([1, 2, 3, 4, 5, 6, 7, 8, 9], 0, 1, 3)).toEqual([1, 2, 3, 4, 1, 5, 6, 7, 8, 9])
    expect(reinsert([1, 2], 1, 2, 6)).toEqual([1, 2, 2])
  })
})
