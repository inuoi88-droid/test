import { describe, expect, it } from 'vitest'
import { bookGroups, bookLevels, levelOf, serial } from '../src/book'
import type { Word } from '../src/db'

const w = (id: number, grp: number): Word => ({ id, word: `w${id}`, meanings: [['名', '意味']], phrases: [], grp })

describe('単語帳', () => {
  it('本の目次どおりのスコアレベル', () => {
    expect([1, 4, 5, 34, 35, 70, 71, 80, 81, 82].map(levelOf)).toEqual([350, 350, 470, 470, 600, 600, 730, 730, 860, 860])
  })

  it('並びはいつも番号順で、GROUP ごとにまとまる（受け取った順に関係なく）', () => {
    const words = [w(5, 2), w(1, 1), w(3, 1), w(2, 1), w(4, 2), w(6, 5)]
    const groups = bookGroups(words)
    expect(groups.map((g) => g.grp)).toEqual([1, 2, 5])
    expect(groups[0]).toEqual({ grp: 1, ids: [1, 2, 3], first: 1, last: 3 })
    expect(groups[1].ids).toEqual([4, 5])
    expect(bookGroups([...words].reverse())).toEqual(groups)
  })

  it('レベルごとに GROUP を並べる', () => {
    const levels = bookLevels(bookGroups([w(1, 1), w(2, 4), w(3, 5), w(4, 81)]))
    expect(levels.map((l) => [l.score, l.groups.map((g) => g.grp)])).toEqual([
      [350, [1, 4]],
      [470, [5]],
      [860, [81]],
    ])
  })

  it('番号は4桁', () => {
    expect(serial(7)).toBe('0007')
    expect(serial(4010)).toBe('4010')
  })
})
