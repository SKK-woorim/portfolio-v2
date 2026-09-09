-- Development-only content. Do not add production accounts, passwords, or private media here.
insert into public.site_profile (id, display_name, role_title, headline, bio, skills, contact, social_links)
values (
  true,
  '송경근',
  'AI Agent & RAG Engineer',
  'AI Agent와 RAG, 데이터를 연결해 실제로 작동하는 워크플로우를 만듭니다.',
  '비정형 문서의 OCR·전처리·청킹부터 지식베이스 구축, NL2SQL, Python·SQL 기반 ETL까지 설계하고 구현하는 AI 엔지니어 송경근입니다.',
  '["Python","AI Agent","RAG","Dify","LLM","NL2SQL","SQL","ETL","ClickHouse","OCR"]'::jsonb,
  '{"email":"swoorim31@gmail.com"}'::jsonb,
  '[{"label":"GitHub","href":"https://github.com/SKK-woorim"}]'::jsonb
)
on conflict (id) do update set
  display_name = excluded.display_name,
  role_title = excluded.role_title,
  headline = excluded.headline,
  bio = excluded.bio,
  skills = excluded.skills,
  contact = excluded.contact,
  social_links = excluded.social_links;
