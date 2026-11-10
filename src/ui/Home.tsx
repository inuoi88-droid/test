import { useEffect, useState } from 'react'
import { DEMO } from '../config'
import { daysBetween, studyDay, todayCounts } from '../srs'
import { syncNow, useApp } from '../store'
import { lastBookGroup } from './Book'
import { formatDay, SyncLine } from './common'

const EXTRA_STEP = 20

export function Home({
  onStudy,
  onSettings,
  onSearch,
  onBook,
}: {
  onStudy: (extra: number) => void
  onSettings: () => void
  onSearch: () => void
  onBook: () => void
}) {
  const app = useApp()
  const today = useToday()
  const { due, relearn, plan } = todayCounts(app.wordIds, app.cards, today, app.settings.targetDay)
  const todo = due + relearn + plan.newLeft

  let mastered = 0
  let learning = 0
  for (const c of app.cards.values()) {
    if (c.status === 'mastered') mastered += 1
    else if (c.status === 'review') learning += 1
  }
  const total = app.wordIds.length
  const unseen = plan.unseen
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`
  const targetLeft = daysBetween(today, app.settings.targetDay)
  const bookGroup = lastBookGroup()

  return (
    <div className="screen home">
      <header className="topbar">
        <div className="title">TOEIC 4000{DEMO && <span className="chip">デモ</span>}</div>
        <div className="topbar-actions">
          <button className="icon-btn" aria-label="単語を探す" onClick={onSearch}>
            <SearchIcon />
          </button>
          <button className="icon-btn" aria-label="設定" onClick={onSettings}>
            <GearIcon />
          </button>
        </div>
      </header>

      <main className="home-main">
        <section className="panel today">
          <h2>今日の学習</h2>
          <div className="today-nums">
            <Num label="復習" value={due} />
            <Num label="もう一度" value={relearn} />
            <Num label="新出" value={plan.newLeft} sub={`/ ${plan.quota}`} />
          </div>
          {todo > 0 ? (
            <button className="btn primary big" onClick={() => onStudy(0)}>
              学習をはじめる（{todo}問）
            </button>
          ) : (
            <>
              <p className="done-text">今日の分は完了しました</p>
              {unseen > 0 && (
                <button className="btn big" onClick={() => onStudy(EXTRA_STEP)}>
                  先取りで{Math.min(EXTRA_STEP, unseen)}語すすめる
                </button>
              )}
            </>
          )}
        </section>

        <button className="btn big book-open" onClick={onBook}>
          <BookIcon />
          <span>
            単語帳を見る
            {bookGroup !== null && <small>GROUP {bookGroup} の続きから</small>}
          </span>
        </button>

        <section className="panel">
          <h2>全体の進み具合</h2>
          <div className="bar" role="img" aria-label={`覚えた ${mastered}、復習中 ${learning}、未学習 ${unseen}`}>
            <span className="bar-mastered" style={{ width: pct(mastered) }} />
            <span className="bar-learning" style={{ width: pct(learning) }} />
          </div>
          <dl className="legend">
            <div>
              <dt><i className="dot mastered" />覚えた</dt>
              <dd>{mastered}</dd>
            </div>
            <div>
              <dt><i className="dot learning" />復習中</dt>
              <dd>{learning}</dd>
            </div>
            <div>
              <dt><i className="dot unseen" />未学習</dt>
              <dd>{unseen}</dd>
            </div>
          </dl>
          <p className="pace">
            {unseen === 0
              ? `全${total}語を一周しました`
              : targetLeft >= 0
                ? `${formatDay(app.settings.targetDay)}まで あと${plan.daysLeft}日（1日 ${plan.quota}語のペース）`
                : `目標日（${formatDay(app.settings.targetDay)}）を過ぎています。残り${unseen}語`}
          </p>
        </section>

        {!DEMO && <SyncLine sync={app.sync} onSync={() => void syncNow()} />}
      </main>
    </div>
  )
}

function Num({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="num">
      <div className="num-value">
        {value}
        {sub && <small>{sub}</small>}
      </div>
      <div className="num-label">{label}</div>
    </div>
  )
}

/** 学習日（朝4時区切り）。日をまたいだら描き直す */
export function useToday(): string {
  const [today, setToday] = useState(() => studyDay(Date.now()))
  useEffect(() => {
    const t = setInterval(() => setToday(studyDay(Date.now())), 30_000)
    const onVis = () => setToday(studyDay(Date.now()))
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
  return today
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
