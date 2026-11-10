// 単語帳の並び（本と同じ番号順・GROUP 区切り）。純粋関数。
import type { Word } from './db'

export interface BookGroup {
  grp: number
  /** この GROUP の単語（番号順） */
  ids: number[]
  first: number
  last: number
}

export interface BookLevel {
  /** 目標スコアレベル（本の目次の区切り） */
  score: number
  groups: BookGroup[]
}

/** 本の目次：スコアレベルごとの最後の GROUP */
const LEVELS: [score: number, lastGroup: number][] = [
  [350, 4],
  [470, 34],
  [600, 70],
  [730, 80],
  [860, Infinity],
]

export function levelOf(grp: number): number {
  for (const [score, last] of LEVELS) if (grp <= last) return score
  return LEVELS[LEVELS.length - 1][0]
}

/** 単語を GROUP ごと・レベルごとにまとめる（並びはいつも番号順） */
export function bookGroups(words: readonly Word[]): BookGroup[] {
  const by = new Map<number, number[]>()
  for (const w of [...words].sort((a, b) => a.id - b.id)) {
    const list = by.get(w.grp)
    if (list) list.push(w.id)
    else by.set(w.grp, [w.id])
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([grp, ids]) => ({ grp, ids, first: ids[0], last: ids[ids.length - 1] }))
}

export function bookLevels(groups: readonly BookGroup[]): BookLevel[] {
  const levels: BookLevel[] = []
  for (const g of groups) {
    const score = levelOf(g.grp)
    const cur = levels[levels.length - 1]
    if (cur && cur.score === score) cur.groups.push(g)
    else levels.push({ score, groups: [g] })
  }
  return levels
}

export function serial(id: number): string {
  return String(id).padStart(4, '0')
}
