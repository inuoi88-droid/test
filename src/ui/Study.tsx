import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { answer, buildQueue, GRADUATE_STREAK, isUnseen, kindOf, needsRelearn, reinsert, studyDay, type Card } from '../srs'
import { getState, putCard, restoreCard, useApp } from '../store'
import { Answer } from './common'

/** 戻るのために覚えておく1手 */
interface Step {
  pos: number
  queue: number[]
  wordId: number
  prev: Card | undefined
  correct: boolean
}

const MORE_STEP = 20
const MAX_HISTORY = 100

export function Study({ extra, onExit }: { extra: number; onExit: () => void }) {
  const app = useApp()
  const [queue, setQueue] = useState<number[]>(() => {
    const s = getState()
    return buildQueue(s.wordIds, s.cards, studyDay(Date.now()), s.settings.targetDay, extra)
  })
  const [pos, setPos] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [history, setHistory] = useState<Step[]>([])
  const cardRef = useRef<SwipeHandle>(null)

  const id = queue[pos] as number | undefined
  const word = id !== undefined ? app.wordById.get(id) : undefined
  const card = id !== undefined ? app.cards.get(id) : undefined
  const today = studyDay(Date.now())
  const right = history.filter((h) => h.correct).length
  const wrong = history.length - right

  const judge = useCallback(
    (correct: boolean) => {
      if (id === undefined) return
      const now = Date.now()
      const t = studyDay(now)
      const prev = getState().cards.get(id)
      const next = answer(prev, id, correct, t, now)
      void putCard(next)
      setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { pos, queue, wordId: id, prev, correct }])
      setQueue(needsRelearn(next, t) ? reinsert(queue, pos, id) : queue)
      setPos(pos + 1)
      setRevealed(false)
      navigator.vibrate?.(correct ? 12 : [12, 40, 12])
    },
    [id, pos, queue],
  )

  const undo = useCallback(() => {
    const h = history[history.length - 1]
    if (!h) return
    void restoreCard(h.wordId, h.prev)
    setHistory(history.slice(0, -1))
    setQueue(h.queue)
    setPos(h.pos)
    setRevealed(true)
  }, [history])

  const more = useCallback(() => {
    const s = getState()
    const inQueue = new Set(queue.slice(pos))
    const add: number[] = []
    for (const wid of s.wordIds) {
      if (add.length >= MORE_STEP) break
      if (!inQueue.has(wid) && isUnseen(s.cards.get(wid))) add.push(wid)
    }
    setQueue([...queue, ...add])
  }, [queue, pos])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        if (!revealed && word) setRevealed(true)
      } else if (e.key === 'ArrowLeft' && revealed) cardRef.current?.fling('left')
      else if (e.key === 'ArrowRight' && revealed) cardRef.current?.fling('right')
      else if (e.key === 'Backspace' || e.key === 'z') undo()
      else if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, word, undo, onExit])

  const remaining = queue.length - pos

  return (
    <div className="screen study">
      <header className="topbar">
        <button className="btn ghost small" onClick={onExit}>
          ✕ やめる
        </button>
        <div className="counter" aria-live="polite">
          {word ? `残り ${remaining}` : ''}
        </div>
        <button className="btn ghost small" onClick={undo} disabled={!history.length} aria-label="1つ前の問題に戻る">
          ↶ 1つ前に戻る
        </button>
      </header>

      {word ? (
        <>
          <div className="stage">
            <SwipeCard
              key={`${pos}-${id}`}
              ref={cardRef}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              onJudge={judge}
            >
              <div className="card-head">
                <KindChip card={card} today={today} />
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
      ) : (
        <div className="finished">
          <h2>おつかれさまでした</h2>
          <p>
            今回：{history.length}問（正解 {right}・不正解 {wrong}）
          </p>
          <p className="muted">今日の分はここまでです。</p>
          <div className="finished-actions">
            <button className="btn primary big" onClick={onExit}>
              ホームへ
            </button>
            {app.wordIds.some((wid) => isUnseen(app.cards.get(wid))) && (
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

function KindChip({ card, today }: { card: Card | undefined; today: string }) {
  const kind = kindOf(card, today)
  if (kind === 'new') return <span className="chip chip-new">新出</span>
  if (kind === 'relearn') return <span className="chip chip-relearn">もう一度</span>
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
