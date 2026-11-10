import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import type { Word } from '../db'
import { answer, buildQueue, GRADUATE_STREAK, isUnseen, kindOf, needsRelearn, relearnQueue, studyDay, type Card } from '../srs'
import { getState, putCard, restoreCard, useApp } from '../store'
import { Answer } from './common'

/**
 * 1回の学習の進み具合。
 * main = 復習と新出。間違えた単語はここでは出し直さない。
 * review = 最後のまとめの一周（今日間違えたままの単語）。ここでも間違えたものは fails に入れて一覧にする。
 */
interface Session {
  phase: 'main' | 'review'
  queue: number[]
  pos: number
  fails: number[]
}

/** 戻るのために覚えておく1手（答える前の進み具合と、その単語の前の状態） */
interface Step {
  session: Session
  wordId: number
  prev: Card | undefined
  correct: boolean
}

const MORE_STEP = 20
const MAX_HISTORY = 200

function firstSession(extra: number): Session {
  const s = getState()
  const today = studyDay(Date.now())
  const main = buildQueue(s.wordIds, s.cards, today, s.settings.targetDay, extra)
  if (main.length) return { phase: 'main', queue: main, pos: 0, fails: [] }
  // 復習も新出も残っていなければ、すぐにまとめの一周
  return { phase: 'review', queue: relearnQueue(s.cards, today), pos: 0, fails: [] }
}

export function Study({ extra, onExit }: { extra: number; onExit: () => void }) {
  const app = useApp()
  const [session, setSession] = useState<Session>(() => firstSession(extra))
  const [revealed, setRevealed] = useState(false)
  const [history, setHistory] = useState<Step[]>([])
  const cardRef = useRef<SwipeHandle>(null)

  const { phase, queue, pos } = session
  const id = queue[pos] as number | undefined
  const word = id !== undefined ? app.wordById.get(id) : undefined
  const card = id !== undefined ? app.cards.get(id) : undefined
  const today = studyDay(Date.now())
  /** main が終わったときに、まとめの一周で出す単語 */
  const pending = !word && phase === 'main' ? relearnQueue(app.cards, today) : []

  const judge = useCallback(
    (correct: boolean) => {
      if (id === undefined) return
      const now = Date.now()
      const prev = getState().cards.get(id)
      void putCard(answer(prev, id, correct, studyDay(now), now))
      setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { session, wordId: id, prev, correct }])
      setSession({
        ...session,
        pos: session.pos + 1,
        fails: session.phase === 'review' && !correct ? [...session.fails, id] : session.fails,
      })
      setRevealed(false)
      navigator.vibrate?.(correct ? 12 : [12, 40, 12])
    },
    [id, session],
  )

  const undo = useCallback(() => {
    const h = history[history.length - 1]
    if (!h) return
    void restoreCard(h.wordId, h.prev)
    setHistory(history.slice(0, -1))
    setSession(h.session)
    setRevealed(true)
  }, [history])

  const startReview = useCallback((ids: number[]) => {
    setSession({ phase: 'review', queue: ids, pos: 0, fails: [] })
    setRevealed(false)
  }, [])

  const more = useCallback(() => {
    const s = getState()
    const add: number[] = []
    for (const wid of s.wordIds) {
      if (add.length >= MORE_STEP) break
      if (isUnseen(s.cards.get(wid))) add.push(wid)
    }
    setSession({ phase: 'main', queue: add, pos: 0, fails: [] })
    setRevealed(false)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (word && !revealed) setRevealed(true)
        else if (!word && pending.length) startReview(pending)
      } else if (e.key === 'ArrowLeft' && revealed) cardRef.current?.fling('left')
      else if (e.key === 'ArrowRight' && revealed) cardRef.current?.fling('right')
      else if (e.key === 'Backspace' || e.key === 'z') undo()
      else if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, word, pending, undo, onExit, startReview])

  const mainSteps = history.filter((h) => h.session.phase === 'main')
  const mainRight = mainSteps.filter((h) => h.correct).length
  const hasUnseen = app.wordIds.some((wid) => isUnseen(app.cards.get(wid)))
  // 一覧に出すのは、まとめの一周で間違え、いまも正解していない単語（戻るで直したものは除く）
  const fails = [...new Set(session.fails)].filter((wid) => {
    const c = app.cards.get(wid)
    return c && needsRelearn(c, today)
  })

  let counter = ''
  if (word) counter = phase === 'review' ? `まとめ ${pos + 1}/${queue.length}` : `残り ${queue.length - pos}`

  return (
    <div className="screen study">
      <header className="topbar">
        <button className="btn ghost small" onClick={onExit}>
          ✕ やめる
        </button>
        <div className="counter" aria-live="polite">
          {counter}
        </div>
        <button className="btn ghost small" onClick={undo} disabled={!history.length} aria-label="1つ前の問題に戻る">
          ↶ 1つ前に戻る
        </button>
      </header>

      {word ? (
        <>
          <div className="stage">
            <SwipeCard
              key={`${phase}-${pos}-${id}`}
              ref={cardRef}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              onJudge={judge}
            >
              <div className="card-head">
                <KindChip card={card} today={today} review={phase === 'review'} />
                <span className="serial">No.{String(word.id).padStart(4, '0')}</span>
              </div>
              <div className={revealed ? 'word small' : 'word'}>{word.word}</div>
              {revealed ? <Answer word={word} /> : <div className="tap-hint">タップで答えを見る</div>}
            </SwipeCard>
          </div>
          <footer className="judge">
            {revealed ? (
              <>
                <button className="btn judge-right" onClick={() => cardRef.current?.fling('left')}>
                  ← 正解
                </button>
                <button className="btn judge-wrong" onClick={() => cardRef.current?.fling('right')}>
                  不正解 →
                </button>
              </>
            ) : (
              <button className="btn primary big" onClick={() => setRevealed(true)}>
                答えを見る
              </button>
            )}
          </footer>
        </>
      ) : phase === 'main' && pending.length > 0 ? (
        <div className="finished">
          <h2>まとめの一周</h2>
          <p>
            {mainSteps.length > 0 && `今回：${mainSteps.length}問（正解 ${mainRight}・不正解 ${mainSteps.length - mainRight}）`}
          </p>
          <p>
            今日間違えた <strong>{pending.length}語</strong> を、まとめてもう一周します。
          </p>
          <div className="finished-actions">
            <button className="btn primary big" onClick={() => startReview(pending)}>
              はじめる（{pending.length}問）
            </button>
            <button className="btn big" onClick={onExit}>
              あとでやる（ホームへ）
            </button>
          </div>
        </div>
      ) : (
        <div className="finished">
          <h2>おつかれさまでした</h2>
          {mainSteps.length > 0 && (
            <p>
              今回：{mainSteps.length}問（正解 {mainRight}・不正解 {mainSteps.length - mainRight}）
            </p>
          )}
          {phase === 'review' && queue.length > 0 && (
            <p>
              まとめの一周：{queue.length}語のうち {queue.length - fails.length}語 正解
            </p>
          )}
          {fails.length > 0 ? (
            <section className="fail-list">
              <h3>それでも間違えた単語（{fails.length}語）</h3>
              <ul>
                {fails.map((wid) => {
                  const w = app.wordById.get(wid)
                  return w ? <FailItem key={wid} word={w} /> : null
                })}
              </ul>
              <p className="muted small-note">これらは明日の復習でまた出ます。</p>
            </section>
          ) : (
            <p className="muted">今日の分はここまでです。</p>
          )}
          <div className="finished-actions">
            <button className="btn primary big" onClick={onExit}>
              ホームへ
            </button>
            {fails.length > 0 && (
              <button className="btn big" onClick={() => startReview(fails)}>
                この{fails.length}語をもう一周
              </button>
            )}
            {hasUnseen && (
              <button className="btn big" onClick={more}>
                先取りで{MORE_STEP}語すすめる
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FailItem({ word }: { word: Word }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button className="fail-item" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="fail-word">{word.word}</span>
        <span className="fail-mean">{word.meanings.map(([pos, ja]) => `${pos} ${ja}`).join(' / ')}</span>
      </button>
      {open && word.phrases.length > 0 && (
        <ul className="fail-phrases">
          {word.phrases.map(([en, ja], i) => (
            <li key={i}>
              <span className="en">{en}</span> <span className="ja">{ja}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function KindChip({ card, today, review }: { card: Card | undefined; today: string; review: boolean }) {
  const kind = kindOf(card, today)
  if (review || kind === 'relearn') return <span className="chip chip-relearn">まとめの一周</span>
  if (kind === 'new') return <span className="chip chip-new">新出</span>
  return (
    <span className="chip chip-review">
      復習 {(card?.streak ?? 0) + 1}/{GRADUATE_STREAK}
    </span>
  )
}

// ---------- スワイプするカード ----------

interface SwipeHandle {
  fling: (dir: 'left' | 'right') => void
}

/** これ以上動かしたら判定（px） */
const THRESHOLD = 90
const FLING_MS = 170

const SwipeCard = forwardRef<SwipeHandle, { children: ReactNode; revealed: boolean; onReveal: () => void; onJudge: (correct: boolean) => void }>(
  function SwipeCard({ children, revealed, onReveal, onJudge }, ref) {
    const el = useRef<HTMLDivElement>(null)
    const drag = useRef<{ x: number; y: number; t: number; dx: number; dy: number; horizontal: boolean | null } | null>(null)
    const finished = useRef(false)

    const paint = (dx: number, animate: boolean) => {
      const node = el.current
      if (!node) return
      node.style.transition = animate ? `transform ${FLING_MS}ms ease-out` : 'none'
      node.style.transform = dx ? `translateX(${dx}px) rotate(${dx * 0.04}deg)` : ''
      node.style.setProperty('--ok', String(Math.min(1, Math.max(0, -dx / THRESHOLD))))
      node.style.setProperty('--ng', String(Math.min(1, Math.max(0, dx / THRESHOLD))))
    }

    const fling = (dir: 'left' | 'right') => {
      if (finished.current) return
      finished.current = true
      const w = window.innerWidth
      paint(dir === 'left' ? -w * 1.2 : w * 1.2, true)
      window.setTimeout(() => onJudge(dir === 'left'), FLING_MS)
    }
    useImperativeHandle(ref, () => ({ fling }))

    return (
      <div
        ref={el}
        className={revealed ? 'card revealed' : 'card'}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, dy: 0, horizontal: null }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || finished.current) return
          d.dx = e.clientX - d.x
          d.dy = e.clientY - d.y
          if (d.horizontal === null && Math.hypot(d.dx, d.dy) > 8) {
            d.horizontal = Math.abs(d.dx) > Math.abs(d.dy)
            if (d.horizontal) el.current?.setPointerCapture(e.pointerId)
          }
          if (d.horizontal && revealed) paint(d.dx, false)
        }}
        onPointerUp={() => {
          const d = drag.current
          drag.current = null
          if (!d || finished.current) return
          const moved = Math.hypot(d.dx, d.dy)
          if (!revealed) {
            // 答えを見る前は、タップでもスワイプでも答えを出すだけ（うっかり判定しない）
            if (moved < 10 || d.horizontal) onReveal()
            return
          }
          if (d.horizontal) {
            const v = Math.abs(d.dx) / Math.max(1, performance.now() - d.t)
            if (Math.abs(d.dx) > THRESHOLD || (Math.abs(d.dx) > 40 && v > 0.6)) {
              fling(d.dx < 0 ? 'left' : 'right')
              return
            }
          }
          paint(0, true)
        }}
        onPointerCancel={() => {
          drag.current = null
          if (!finished.current) paint(0, true)
        }}
      >
        <div className="stamp stamp-ok">正解</div>
        <div className="stamp stamp-ng">不正解</div>
        <div className="card-body">{children}</div>
      </div>
    )
  },
)
