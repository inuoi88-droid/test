// ?demo のときの見本の単語（動作確認用。本の単語ではない）
import type { Word } from './db'

const raw: [string, [string, string][], [string, string][]][] = [
  ['schedule', [['名', '予定、日程、スケジュール、時刻表'], ['動', '～を予定する、～の日時を決める']], [['ahead of schedule', '予定より早く'], ['be scheduled to do', '～する予定である']]],
  ['invoice', [['名', '請求書、送り状'], ['動', '～に請求書を送る']], [['issue an invoice', '請求書を発行する']]],
  ['postpone', [['動', '～を延期する、～を後回しにする']], [['postpone A until B', 'AをBまで延期する']]],
  ['receipt', [['名', '領収書、レシート、受け取ること']], [['upon receipt of ~', '～を受け取り次第']]],
  ['available', [['形', '利用できる、入手できる、手が空いている']], [['be available for ~', '～に対応できる、～に使える']]],
  ['deadline', [['名', '締め切り、期限']], [['meet a deadline', '締め切りに間に合わせる']]],
  ['colleague', [['名', '同僚、仲間']], []],
  ['reimburse', [['動', '（費用）を払い戻す、～に弁済する']], [['reimburse A for B', 'AにBの費用を払い戻す']]],
  ['agenda', [['名', '議題、協議事項、予定表']], [['on the agenda', '議題に上がって']]],
  ['refund', [['名', '払い戻し、返金'], ['動', '～を払い戻す']], [['get a full refund', '全額返金を受ける']]],
  ['inventory', [['名', '在庫、在庫品、目録']], [['take inventory', '棚卸しをする']]],
  ['commute', [['動', '通勤する、通学する'], ['名', '通勤、通学']], [['commute to work', '通勤する']]],
]

export const DEMO_WORDS: Word[] = raw.map(([word, meanings, phrases], i) => ({
  id: i + 1,
  word,
  meanings,
  phrases,
  grp: 1,
}))
