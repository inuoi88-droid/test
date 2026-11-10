-- TOEIC 4000 単語アプリ（Supabase プロジェクト ability-debate を共用。オブジェクトはすべて toeic_ で始まる）
-- 単語データ（書籍の見出し語）はこのリポジトリに入れず、DB にだけ置く。読めるのは toeic_members に登録したメールの本人だけ。

-- 使ってよい人（メールアドレス）。クライアントからは読めない（ポリシーなし）。
create table if not exists public.toeic_members (
  email text primary key
);
alter table public.toeic_members enable row level security;
revoke all on public.toeic_members from anon, authenticated;

-- ログイン中の人が、メール確認済みかつ toeic_members に載っているか
create or replace function public.toeic_is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.toeic_members m on lower(m.email) = lower(u.email)
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.toeic_is_member() from public, anon;
grant execute on function public.toeic_is_member() to authenticated;

-- 単語（id は本の通し番号 1〜4010、grp は本の GROUP 1〜82）
create table if not exists public.toeic_words (
  id integer primary key,
  word text not null,
  meanings jsonb not null,          -- [[品詞, 意味], ...]
  phrases jsonb not null default '[]'::jsonb, -- [[英語, 日本語], ...]
  grp integer not null,
  updated_at timestamptz not null default now()
);
alter table public.toeic_words enable row level security;
revoke all on public.toeic_words from anon, authenticated;
grant select on public.toeic_words to authenticated;
drop policy if exists toeic_words_read on public.toeic_words;
create policy toeic_words_read on public.toeic_words
  for select to authenticated
  using ((select public.toeic_is_member()));

-- 単語データの版（変わったら端末が取り直す）
create or replace function public.toeic_words_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(count(*)::text || '-' || extract(epoch from max(updated_at))::bigint::text, '0')
  from public.toeic_words;
$$;
revoke all on function public.toeic_words_version() from public, anon;
grant execute on function public.toeic_words_version() to authenticated;

-- 学習の記録（1人 × 1単語 = 1行）
create table if not exists public.toeic_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id integer not null check (word_id > 0), -- 単語を入れ直しても記録が消えないよう外部キーにしない
  status text not null check (status in ('new', 'review', 'mastered')),
  streak smallint not null default 0,  -- 復習で続けて正解した回数（0〜2。3で卒業）
  due date,                            -- 次に出す日（学習日。朝4時区切り）
  relearn boolean not null default false, -- 当日中にもう一度出す
  first_day date,                      -- 初めて出た日
  last_day date,                       -- 最後に答えた日
  right_count integer not null default 0,
  wrong_count integer not null default 0,
  updated_at timestamptz not null,     -- 端末で答えた時刻（新しい方が勝つ）
  synced_at timestamptz not null default now(), -- サーバーに届いた時刻（取り込みの目印）
  primary key (user_id, word_id)
);
create index if not exists toeic_progress_synced on public.toeic_progress (user_id, synced_at);
alter table public.toeic_progress enable row level security;
revoke all on public.toeic_progress from anon, authenticated;
grant select on public.toeic_progress to authenticated;
drop policy if exists toeic_progress_read on public.toeic_progress;
create policy toeic_progress_read on public.toeic_progress
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.toeic_is_member()));

-- 設定（目標日など）
create table if not exists public.toeic_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);
alter table public.toeic_settings enable row level security;
revoke all on public.toeic_settings from anon, authenticated;
grant select on public.toeic_settings to authenticated;
drop policy if exists toeic_settings_read on public.toeic_settings;
create policy toeic_settings_read on public.toeic_settings
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.toeic_is_member()));

-- 記録の送信。端末の updated_at が新しいものだけ上書きする。
create or replace function public.toeic_push(rows jsonb, settings jsonb default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t timestamptz := clock_timestamp();
begin
  if uid is null or not public.toeic_is_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 5000 then
    raise exception 'bad rows' using errcode = '22023';
  end if;

  insert into public.toeic_progress as p
    (user_id, word_id, status, streak, due, relearn, first_day, last_day,
     right_count, wrong_count, updated_at, synced_at)
  select uid, r.word_id, r.status, r.streak, r.due, r.relearn, r.first_day, r.last_day,
         r.right_count, r.wrong_count, r.updated_at, t
  from jsonb_to_recordset(rows) as r(
    word_id integer, status text, streak smallint, due date, relearn boolean,
    first_day date, last_day date, right_count integer, wrong_count integer,
    updated_at timestamptz)
  on conflict (user_id, word_id) do update set
    status = excluded.status,
    streak = excluded.streak,
    due = excluded.due,
    relearn = excluded.relearn,
    first_day = excluded.first_day,
    last_day = excluded.last_day,
    right_count = excluded.right_count,
    wrong_count = excluded.wrong_count,
    updated_at = excluded.updated_at,
    synced_at = t
  where excluded.updated_at > p.updated_at;

  if settings is not null then
    insert into public.toeic_settings as s (user_id, data, updated_at, synced_at)
    values (uid, settings -> 'data', (settings ->> 'updated_at')::timestamptz, t)
    on conflict (user_id) do update set
      data = excluded.data, updated_at = excluded.updated_at, synced_at = t
    where excluded.updated_at > s.updated_at;
  end if;

  return t;
end;
$$;
revoke all on function public.toeic_push(jsonb, jsonb) from public, anon;
grant execute on function public.toeic_push(jsonb, jsonb) to authenticated;
