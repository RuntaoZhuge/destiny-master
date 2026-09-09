-- 问答记录改为按「人」聚合：同一生辰（或同一浏览器会话）只占一行，
-- 问答以 JSON 数组追加在 messages 字段，取代每问一行的 readings 表
create table if not exists conversations (
  id text primary key,                -- birth:<生辰哈希> 或 sess:<浏览器会话id>
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  birth_date text,
  birth_time text,
  gender text,
  city text,
  model text,
  ask_count integer not null default 0,
  last_duration_ms integer,
  messages jsonb not null default '[]'::jsonb  -- [{q, a, reasoning?, at}]，只留最近 50 条
);

-- 开启 RLS 且不放行任何 policy：anon key 不可读写，仅服务端 service_role 可写
alter table conversations enable row level security;

create index if not exists conversations_updated_at_idx on conversations (updated_at desc);

-- readings 表确认无有用数据后可手动删除：
-- drop table if exists readings;
