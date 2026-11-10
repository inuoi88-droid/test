import type { Word } from '../db'
import type { AppState } from '../store'

export function formatDay(day: string): string {
  const [, m, d] = day.split('-').map(Number)
  return `${m}/${d}`
}

function timeText(t: number): string {
  const d = new Date(t)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function SyncLine({ sync, onSync }: { sync: AppState['sync']; onSync: () => void }) {
  let text: string
  let cls = 'sync'
  if (sync.status === 'syncing') text = '同期中…'
  else if (sync.status === 'offline') {
    text = sync.pending ? `オフライン：未送信 ${sync.pending}件（電波が戻ったら送ります）` : 'オフライン（端末に保存しています）'
    cls += ' warn'
  } else if (sync.status === 'error') {
    text = `同期できませんでした${sync.pending ? `（未送信 ${sync.pending}件）` : ''}${sync.message ? `：${sync.message}` : ''}`
    cls += ' warn'
  } else if (sync.pending) text = `未送信 ${sync.pending}件`
  else text = sync.lastSynced ? `同期済み ${timeText(sync.lastSynced)}` : '同期待ち'
  return (
    <div className={cls}>
      <span>{text}</span>
      <button className="link" onClick={onSync} disabled={sync.status === 'syncing'}>
        今すぐ同期
      </button>
    </div>
  )
}

/** 答えの面（意味と、よく使う言い回し） */
export function Answer({ word }: { word: Word }) {
  return (
    <div className="answer">
      <ul className="meanings">
        {word.meanings.map(([pos, ja], i) => (
          <li key={i}>
            <span className={`pos pos-${posClass(pos)}`}>{pos}</span>
            <span>{ja}</span>
          </li>
        ))}
      </ul>
      {word.phrases.length > 0 && (
        <>
          <h3 className="phrases-title">よく使う言い回し</h3>
          <ul className="phrases">
            {word.phrases.map(([en, ja], i) => (
              <li key={i}>
                <span className="en">{en}</span>
                <span className="ja">{ja}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function posClass(pos: string): string {
  return { 名: 'n', 動: 'v', 形: 'a', 副: 'ad', 熟: 'ph' }[pos] ?? 'o'
}
