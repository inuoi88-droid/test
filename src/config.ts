// Supabase（プロジェクト ability-debate を共用）。publishable key は公開してよい鍵。
export const SUPABASE_URL = 'https://hefydmrqrdumpifbqlfp.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_qK8Kaict2u9sttUfYd0Zqw_3cPmvpZt'

/** 一周を終える目標日の初期値 */
export const DEFAULT_TARGET_DAY = '2026-12-07'

/** ?demo を付けると、ログインなし・見本の単語・同期なしで動く（動作確認用） */
export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')
