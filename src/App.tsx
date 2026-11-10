import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DEMO } from './config'
import { start, stop, useApp } from './store'
import { supabase } from './supabase'
import { Home } from './ui/Home'
import { Login } from './ui/Login'
import { Search } from './ui/Search'
import { Settings } from './ui/Settings'
import { Study } from './ui/Study'

type Screen = { name: 'home' } | { name: 'study'; extra: number } | { name: 'settings' } | { name: 'search' }

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(DEMO ? null : undefined)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const app = useApp()

  useEffect(() => {
    if (DEMO) {
      void start('demo')
      return
    }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (DEMO) return
    if (userId) void start(userId)
    else stop()
  }, [userId])

  if (!DEMO && session === undefined) return <Splash text="読み込み中…" />
  if (!DEMO && !session) return <Login />
  if (app.loadError) return <Splash text={app.loadError} error />
  if (!app.ready) return <Splash text={app.loadingText ?? '読み込み中…'} />

  const home = () => setScreen({ name: 'home' })
  switch (screen.name) {
    case 'study':
      return <Study extra={screen.extra} onExit={home} />
    case 'settings':
      return <Settings email={session?.user.email ?? (DEMO ? 'デモ' : '')} onBack={home} />
    case 'search':
      return <Search onBack={home} />
    default:
      return (
        <Home
          onStudy={(extra) => setScreen({ name: 'study', extra })}
          onSettings={() => setScreen({ name: 'settings' })}
          onSearch={() => setScreen({ name: 'search' })}
        />
      )
  }
}

function Splash({ text, error }: { text: string; error?: boolean }) {
  return (
    <div className="splash">
      <div className="logo">TOEIC 4000</div>
      <p className={error ? 'error' : 'muted'}>{text}</p>
      {error && (
        <div className="splash-actions">
          <button className="btn" onClick={() => location.reload()}>
            もう一度読み込む
          </button>
          {!DEMO && (
            <button className="btn ghost" onClick={() => void supabase.auth.signOut()}>
              ログアウト
            </button>
          )}
        </div>
      )}
    </div>
  )
}
