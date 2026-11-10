import { useMemo, useState } from 'react'
import type { Card } from '../srs'
import { useApp } from '../store'
import { Answer } from './common'

const LIMIT = 50

export function Search({ onBack }: { onBack: () => void }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const starts: number[] = []
    const rest: number[] = []
    for (const w of app.words) {
      const en = w.word.toLowerCase()
      if (en.startsWith(s)) starts.push(w.id)
      else if (en.includes(s) || w.meanings.some(([, ja]) => ja.includes(s))) rest.push(w.id)
      if (starts.length >= LIMIT) break
    }
    return [...starts, ...rest].slice(0, LIMIT)
  }, [q, app.words])

  return (
    <div className="screen search">
      <header className="topbar">
        <button className="btn ghost small" onClick={onBack}>
          ← もどる
        </button>
        <div className="title">単語を探す</div>
        <span />
      </header>
      <main className="search-main">
        <input
          className="search-input"
          type="search"
          autoFocus
          placeholder="英語か日本語で検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="hits">
          {hits.map((id) => {
            const w = app.wordById.get(id)!
            return (
              <li key={id}>
                <button className="hit" onClick={() => setOpen(open === id ? null : id)}>
                  <span className="hit-word">{w.word}</span>
                  <StatusText card={app.cards.get(id)} />
                </button>
                {open === id && <Answer word={w} />}
              </li>
            )
          })}
        </ul>
        {q.trim() && !hits.length && <p className="muted center">見つかりませんでした</p>}
      </main>
    </div>
  )
}

function StatusText({ card }: { card: Card | undefined }) {
  if (!card || card.first_day === null) return <span className="hit-status">未学習</span>
  if (card.status === 'mastered') return <span className="hit-status mastered">覚えた</span>
  return <span className="hit-status learning">復習中{card.due ? `（次 ${card.due.slice(5).replace('-', '/')}）` : ''}</span>
}
