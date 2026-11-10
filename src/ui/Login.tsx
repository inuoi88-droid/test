import { useState, type FormEvent } from 'react'
import { supabase } from '../supabase'

/** 確認メールのリンクからエラー付きで戻ってきたとき（#error=...）の案内。読んだらアドレスから消す */
function linkMessage(): { text: string; error?: boolean } | null {
  if (typeof location === 'undefined' || !location.hash.includes('error')) return null
  const p = new URLSearchParams(location.hash.slice(1))
  const code = p.get('error_code') ?? p.get('error')
  if (!code) return null
  history.replaceState(null, '', location.pathname + location.search)
  if (code === 'otp_expired') {
    return { text: '確認メールのリンクは、すでに使われたか期限が切れています。確認が済んでいれば、そのままログインできます。ログインできないときは、もう一度アカウントを作ってください。' }
  }
  return { text: `確認メールのリンクを開けませんでした（${p.get('error_description') ?? code}）。まずはログインをお試しください。`, error: true }
}

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(linkMessage)

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
            text: '確認メールを送りました。メールのリンクを1回だけ開いてから、この画面に戻ってログインしてください。リンクを開いた先が「接続が拒否されました」などの表示になっても、確認は済んでいます。',
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
