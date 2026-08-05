-- Development-only content. Do not add production accounts, passwords, or private media here.
insert into public.site_profile (id, display_name, role_title, headline, bio, contact, social_links)
values (
  true,
  'Woorim Kim',
  'Product-minded Developer',
  '복잡한 문제를 이해하기 쉬운 디지털 경험으로 바꿉니다.',
  '사용자 맥락과 구현의 균형을 바탕으로, 오래 사용할 수 있는 웹 제품을 설계하고 만듭니다.',
  '{"email":"hello@example.com"}'::jsonb,
  '[{"label":"GitHub","href":"https://github.com"}]'::jsonb
)
on conflict (id) do update set
  display_name = excluded.display_name,
  role_title = excluded.role_title,
  headline = excluded.headline,
  bio = excluded.bio,
  contact = excluded.contact,
  social_links = excluded.social_links;
