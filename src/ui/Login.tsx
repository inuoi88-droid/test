import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: location.origin },
        })
        if (error) throw error
        if (!data.session) {
          setMessage({
            text: '確認メールを送りました。メールのリンクを開いたあと（開いた先のページが表示されなくても確認は済みます）、この画面に戻ってログインしてください。',
          })
          setMode('login')
        }
      }
    } catch (err) {
      setMessage({ text: authMessage(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="logo">TOEIC 4000</div>
      <p className="muted center">わかる・使える4000単語 フラッシュカード</p>
      <form onSubmit={submit} className="login-form">
        <label>
          メールアドレス
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          パスワード{mode === 'signup' && '（6文字以上）'}
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn primary big" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'ログイン' : 'アカウントを作る'}
        </button>
      </form>
      {message && <p className={message.error ? 'error' : 'notice'}>{message.text}</p>}
      <button className="btn ghost" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'はじめての方：アカウントを作る' : 'アカウントをお持ちの方：ログイン'}
      </button>
    </div>
  )
}

function authMessage(err: unknown): string {
  const m = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err)
  if (/Invalid login credentials/i.test(m)) return 'メールアドレスかパスワードが違います。'
  if (/Email not confirmed/i.test(m)) return 'メールの確認がまだです。届いたメールのリンクを開いてください。'
  if (/already registered/i.test(m)) return 'このメールアドレスはすでに登録されています。ログインしてください。'
  if (/rate limit/i.test(m)) return '送信の回数の上限に達しました。しばらくしてからもう一度お試しください。'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '通信できませんでした。電波のよいところでもう一度お試しください。'
  return m
}
