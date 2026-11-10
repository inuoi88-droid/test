import { useState } from 'react'
import { DEMO } from '../config'
import { DAY_START_HOUR, INTERVALS, studyDay } from '../srs'
import { reloadWords, setTargetDay, signOut, syncNow, useApp } from '../store'
import { SyncLine } from './common'

export function Settings({ email, onBack }: { email: string; onBack: () => void }) {
  const app = useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const today = studyDay(Date.now())

  async function run(label: string, f: () => Promise<void>) {
    setBusy(label)
    setNote(null)
    try {
      await f()
      setNote(`${label}：完了しました`)
    } catch (e) {
      setNote(`${label}：できませんでした（${e instanceof Error ? e.message : String(e)}）`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="screen settings">
      <header className="topbar">
        <button className="btn ghost small" onClick={onBack}>
          ← もどる
        </button>
        <div className="title">設定</div>
        <span />
      </header>
      <main className="settings-main">
        <section className="panel">
          <h2>目標日</h2>
          <p className="muted">この日までに全{app.wordIds.length}語を一周できるよう、1日の新出の数を毎日決め直します。</p>
          <input
            type="date"
            className="date"
            value={app.settings.targetDay}
            min={today}
            onChange={(e) => e.target.value && void setTargetDay(e.target.value)}
          />
        </section>

        <section className="panel">
          <h2>学習の決まり</h2>
          <ul className="rules">
            <li>はじめて出た単語に一発で正解すると、もう出ません。</li>
            <li>
              間違えた単語は、その日のうちにもう一度出たあと、{INTERVALS[0]}日後 → {INTERVALS[1]}日後 → {INTERVALS[2]}日後に復習で出ます（間隔は前の復習から数えます）。
            </li>
            <li>復習で{INTERVALS.length}回続けて正解すると、もう出ません。途中で間違えたら{INTERVALS[0]}日後からやり直しです。</li>
            <li>1日の区切りは朝{DAY_START_HOUR}時です。</li>
            <li>答えを見たあと、左へスワイプで正解、右へスワイプで不正解。判定を間違えたら「1つ前に戻る」。</li>
          </ul>
        </section>

        {!DEMO && (
          <section className="panel">
            <h2>アカウントと同期</h2>
            <p className="muted">{email}</p>
            <SyncLine sync={app.sync} onSync={() => void syncNow()} />
            <div className="stack">
              <button className="btn" disabled={!!busy} onClick={() => void run('単語データの読み込み直し', reloadWords)}>
                単語データを読み込み直す
              </button>
              <button
                className="btn danger"
                disabled={!!busy}
                onClick={() => {
                  const warn = app.sync.pending
                    ? `まだ送っていない記録が${app.sync.pending}件あります。ログアウトするとこの端末からは消えます。ログアウトしますか？`
                    : 'ログアウトしますか？（記録はサーバーに残ります）'
                  if (confirm(warn)) void run('ログアウト', signOut)
                }}
              >
                ログアウト
              </button>
            </div>
            {busy && <p className="muted">{busy}中…</p>}
            {note && <p className="notice">{note}</p>}
          </section>
        )}
      </main>
    </div>
  )
}
