// 単語帳：本と同じ番号順・GROUP 区切りで、いつも同じ場所に同じ単語がある。最後に見ていた場所から再開する。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { bookGroups, bookLevels, levelOf, serial } from '../book'
import type { Word } from '../db'
import type { Card } from '../srs'
import { useApp } from '../store'
import { posClass } from './common'

interface Saved {
  /** 最後に見ていた GROUP（null は目次） */
  grp: number | null
  /** その GROUP でのスクロール位置 */
  top: number
  /** 意味をかくす */
  hide: boolean
}

const KEY = 'toeic4000-book'

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null
    return { grp: typeof v?.grp === 'number' ? v.grp : null, top: typeof v?.top === 'number' ? v.top : 0, hide: v?.hide === true }
  } catch {
    return { grp: null, top: 0, hide: false }
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 保存できなくても見るのには困らない
  }
}

/** ホームのボタンに出す「続きから」の GROUP */
export function lastBookGroup(): number | null {
  return load().grp
}

export function Book({ onBack, focusId }: { onBack: () => void; focusId?: number }) {
  const app = useApp()
  const groups = useMemo(() => bookGroups(app.words), [app.words])
  const levels = useMemo(() => bookLevels(groups), [groups])
  const saved = useRef(load())
  const focusGrp = focusId !== undefined ? app.wordById.get(focusId)?.grp : undefined
  const [grp, setGrp] = useState<number | null>(() => {
    const g = focusGrp ?? saved.current.grp
    return g !== null && g !== undefined && groups.some((x) => x.grp === g) ? g : null
  })
  const [hide, setHide] = useState(saved.current.hide)
  const [shown, setShown] = useState<Set<number>>(() => new Set())
  const [flash, setFlash] = useState<number | null>(null)
  const main = useRef<HTMLElement>(null)
  /** 表示のたびに合わせる位置：前に見ていたスクロール位置か、指定の単語 */
  const restore = useRef<{ top?: number; id?: number } | null>(
    focusGrp !== undefined ? { id: focusId } : { top: grp !== null && grp === saved.current.grp ? saved.current.top : 0 },
  )

  const group = grp === null ? undefined : groups.find((g) => g.grp === grp)
  const index = group ? groups.indexOf(group) : -1

  /**
   * 場所を覚える。最後に開いていた GROUP とその中のスクロール位置を残す
   * （目次に戻っても消さないので、次に単語帳を開くとその GROUP の同じ位置から）。
   */
  const remember = (g: number | null, hideNow = hide) => {
    const top = main.current?.scrollTop ?? 0
    if (g !== null) save({ grp: g, top, hide: hideNow })
    else save({ ...load(), hide: hideNow })
  }

  const open = (g: number | null, id?: number) => {
    remember(grp)
    restore.current = id !== undefined ? { id } : { top: 0 }
    setShown(new Set())
    setGrp(g)
  }

  useLayoutEffect(() => {
    const el = main.current
    const r = restore.current
    restore.current = null
    if (!el || !r) return
    if (r.id !== undefined) {
      const target = document.getElementById(`w-${r.id}`)
      if (target) {
        el.scrollTop = Math.max(0, target.offsetTop - el.clientHeight / 3)
        setFlash(r.id)
      }
    } else el.scrollTop = r.top ?? 0
  }, [grp])

  useEffect(() => {
    if (flash === null) return
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [flash])

  // GROUP を開いたとき・設定を変えたときに覚える。スクロールは少し間を置いて覚える
  useEffect(() => {
    remember(grp)
  }, [grp, hide])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onScroll = () => {
    if (grp === null || saveTimer.current) return
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      remember(grp)
    }, 250)
  }
  // 画面を離れる直前の位置も残す
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') remember(grp)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [grp, hide])

  const [jump, setJump] = useState('')
  const [jumpError, setJumpError] = useState<string | null>(null)
  const onJump = (e: FormEvent) => {
    e.preventDefault()
    const n = Number(jump.trim())
    const w = Number.isInteger(n) ? app.wordById.get(n) : undefined
    if (!w) {
      setJumpError(`No.${jump.trim() || '?'} はありません（1〜${app.words.length}）`)
      return
    }
    setJumpError(null)
    setJump('')
    open(w.grp, w.id)
  }

  if (!group) {
    return (
      <div className="screen book">
        <header className="topbar">
          <button className="btn ghost small" onClick={onBack}>
            ← もどる
          </button>
          <div className="title">単語帳</div>
          <span />
        </header>
        <main className="book-main" ref={main} onScroll={onScroll}>
          <form className="jump" onSubmit={onJump} noValidate>
            <label htmlFor="jump-no">番号で開く</label>
            <div className="jump-row">
              <input
                id="jump-no"
                type="number"
                inputMode="numeric"
                min={1}
                max={app.words.length}
                placeholder="例：1234"
                value={jump}
                onChange={(e) => setJump(e.target.value)}
              />
              <button className="btn primary">開く</button>
            </div>
            {jumpError && <p className="error left">{jumpError}</p>}
          </form>
          {levels.map((lv) => (
            <section key={lv.score} className="level">
              <h2>
                スコアレベル {lv.score}
                <small>{lv.groups.reduce((n, g) => n + g.ids.length, 0)}語</small>
              </h2>
              <ul className="groups">
                {lv.groups.map((g) => {
                  const done = g.ids.filter((id) => app.cards.get(id)?.status === 'mastered').length
                  return (
                    <li key={g.grp}>
                      <button className="group-row" onClick={() => open(g.grp)}>
                        <span className="group-name">GROUP {g.grp}</span>
                        <span className="group-range">
                          No.{serial(g.first)}〜{serial(g.last)}
                        </span>
                        <span className="group-done">
                          覚えた {done}/{g.ids.length}
                        </span>
                        <span className="mini-bar" aria-hidden="true">
                          <span style={{ width: `${(done / g.ids.length) * 100}%` }} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </main>
      </div>
    )
  }

  const prev = groups[index - 1]
  const next = groups[index + 1]
  return (
    <div className="screen book">
      <header className="topbar">
        <button className="btn ghost small" onClick={() => open(null)}>
          ← 目次
        </button>
        <div className="title">GROUP {group.grp}</div>
        <button className={hide ? 'btn small toggle on' : 'btn small toggle'} onClick={() => setHide(!hide)} aria-pressed={hide}>
          意味をかくす
        </button>
      </header>
      <main className="book-main" ref={main} onScroll={onScroll}>
        <p className="group-sub">
          スコアレベル {levelOf(group.grp)}・No.{serial(group.first)}〜{serial(group.last)}（{group.ids.length}語）
          {hide && <span className="group-hint">単語を押すと意味が出ます</span>}
        </p>
        <ol className="entries">
          {group.ids.map((id) => {
            const w = app.wordById.get(id)!
            const masked = hide && !shown.has(id)
            return (
              <Entry
                key={id}
                word={w}
                card={app.cards.get(id)}
                masked={masked}
                flash={flash === id}
                onToggle={
                  hide
                    ? () => {
                        const s = new Set(shown)
                        if (s.has(id)) s.delete(id)
                        else s.add(id)
                        setShown(s)
                      }
                    : undefined
                }
              />
            )
          })}
        </ol>
        <nav className="group-nav">
          {prev ? (
            <button className="btn" onClick={() => open(prev.grp)}>
              ‹ GROUP {prev.grp}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button className="btn" onClick={() => open(next.grp)}>
              GROUP {next.grp} ›
            </button>
          ) : (
            <span />
          )}
        </nav>
      </main>
    </div>
  )
}

function Entry({
  word,
  card,
  masked,
  flash,
  onToggle,
}: {
  word: Word
  card: Card | undefined
  masked: boolean
  flash: boolean
  onToggle?: () => void
}) {
  return (
    <li id={`w-${word.id}`} className={flash ? 'entry flash' : 'entry'} onClick={onToggle}>
      <div className="entry-head">
        <span className="entry-no">{serial(word.id)}</span>
        <span className="entry-word">{word.word}</span>
        {card?.status === 'mastered' && <span className="tag mastered">覚えた</span>}
        {card?.status === 'review' && <span className="tag learning">復習中</span>}
      </div>
      {masked ? (
        <div className="entry-mask" aria-label="意味（押すと表示）" />
      ) : (
        <div className="entry-body">
          {word.meanings.map(([pos, ja], i) => (
            <div key={i} className="entry-mean">
              <span className={`pos pos-${posClass(pos)}`}>{pos}</span>
              <span>{ja}</span>
            </div>
          ))}
          {word.phrases.length > 0 && (
            <ul className="entry-phrases">
              {word.phrases.map(([en, ja], i) => (
                <li key={i}>
                  <span className="en">{en}</span> <span className="ja">{ja}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}
