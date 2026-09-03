-- 问答记录表：每次问事的问题、断语、思考链、生辰、模型与耗时，供复盘优化提示词
create table if not exists readings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  question text not null,
  reply text not null,
  reasoning text,
  birth_date text,
  birth_time text,
  gender text,
  city text,
  model text,
  duration_ms integer
);

-- 开启 RLS 且不放行任何 policy：anon key 不可读写，
-- 仅服务端 service_role key 可写入（见 src/lib/log.ts）
alter table readings enable row level security;

create index if not exists readings_created_at_idx on readings (created_at desc);
