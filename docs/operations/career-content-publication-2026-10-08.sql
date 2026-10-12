-- Applied on 2026-10-08 to the existing portfolio-v2 Supabase project.
-- One-time publication record: do not rerun against that project; slug guards
-- intentionally reject duplicate inserts. It changes public profile/content
-- rows only and does not alter schema, RLS, auth, media, contact, social_links,
-- or avatar.
-- Month-boundary dates preserve month-only display; the UI never shows these days.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $guard$
begin
  if (select count(*) from public.site_profile where id = true) <> 1 then
    raise exception 'career_publication_profile_guard_failed';
  end if;

  if exists (
    select 1
      from public.portfolio_items
     where slug in ('yonsei-medical-data-platform', 'samsung-sdi-multi-agent-mlops-poc')
  ) then
    raise exception 'career_publication_slug_already_exists';
  end if;

  if exists (
    select 1
      from (values
        ('ai-agent-rag-workflows', 0),
        ('groundwater-level-prediction', 1),
        ('bee-guardian', 2),
        ('text-to-3d-platform', 3)
      ) as expected(slug, sort_order)
     where not exists (
       select 1
         from public.portfolio_items as item
        where item.slug = expected.slug
          and item.status = 'published'
          and item.sort_order = expected.sort_order
     )
  ) then
    raise exception 'career_publication_existing_portfolio_guard_failed';
  end if;

  if (select count(*) from public.portfolio_items where status = 'published') <> 4 then
    raise exception 'career_publication_unexpected_published_count';
  end if;

  perform 1 from public.site_profile where id = true for update;
  perform 1 from public.portfolio_items where status = 'published' for update;
end
$guard$;

-- Transaction-local invariants protect the existing profile and four public
-- portfolio rows. Keep a separate read-only snapshot in tmp before execution;
-- this table is not a substitute for a recoverable pre-change snapshot.
create temporary table career_publication_snapshot on commit drop as
select
  'site_profile'::text as source,
  jsonb_build_object(
    'display_name', profile.display_name,
    'role_title', profile.role_title,
    'headline', profile.headline,
    'bio', profile.bio,
    'skills', profile.skills,
    'contact', profile.contact,
    'social_links', profile.social_links,
    'avatar_media_id', profile.avatar_media_id
  ) as payload
from public.site_profile as profile
where profile.id = true
union all
select
  'published_portfolio'::text,
  jsonb_build_object(
    'id', item.id,
    'slug', item.slug,
    'title', item.title,
    'type', item.type,
    'summary', item.summary,
    'content_json', item.content_json,
    'content_text', item.content_text,
    'status', item.status,
    'sort_order', item.sort_order,
    'start_date', item.start_date,
    'end_date', item.end_date,
    'is_featured', item.is_featured
  )
from public.portfolio_items as item
where item.status = 'published';

-- Preserve the existing account name and contact/social/avatar fields.
do $profile_update$
declare
  v_updated integer;
begin
  update public.site_profile
     set role_title = 'AI Agent · 데이터 플랫폼 엔지니어',
         headline = '데이터를 옮기고, 지식을 연결하고, 현장에서 쓰이는 AI를 만듭니다.',
         bio = '미소정보기술 기술융합본부 기술사업1팀에서 전임·팀원으로 일하며 데이터 이관, AI Agent·RAG 워크플로우, MLOps 연계와 현장 교육을 직접 맡고 있습니다. 고객의 데이터 환경과 검증 범위를 먼저 확인하고, 구축부터 기술 이전·운영 준비까지 이어지는 흐름을 만듭니다.',
         skills = '["Python", "SQL", "ClickHouse", "데이터 이관·ETL", "AI Agent", "RAG", "Multi-Agent", "MLOps", "Dify", "온톨로지", "SHAP·XAI", "GPU·MIG·VDI"]'::jsonb
   where id = true
     and display_name = '송경근'
     and role_title = 'AI Agent 엔지니어'
     and headline = '안녕하세요.'
     and bio = '송경근입니다.'
     and skills = '["Python", "AI Agent", "RAG", "Dify", "LLM", "NL2SQL", "SQL", "ETL", "ClickHouse", "OCR"]'::jsonb;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'career_publication_profile_changed_after_guard';
  end if;
end
$profile_update$;

do $profile_preservation_verify$
begin
  if exists (
    select 1
      from public.site_profile as profile
      join career_publication_snapshot as snapshot on snapshot.source = 'site_profile'
     where profile.id = true
       and (
         profile.display_name is distinct from snapshot.payload ->> 'display_name'
         or profile.contact is distinct from snapshot.payload -> 'contact'
         or profile.social_links is distinct from snapshot.payload -> 'social_links'
         or profile.avatar_media_id::text is distinct from snapshot.payload ->> 'avatar_media_id'
       )
  ) then
    raise exception 'career_publication_profile_preservation_failed';
  end if;
end
$profile_preservation_verify$;

insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
values (
  null,
  'update',
  'site_profile',
  null,
  jsonb_build_object(
    'source', 'data/content/profile.json',
    'reason', 'user_supplied_career_profile_publication',
    'actor', 'privileged_sql_reviewed_by_parent'
  )
);

-- Shift only the four reviewed published slugs; all other portfolio rows,
-- including drafts and trashed items, retain their state and order.
do $reorder$
declare
  v_updated integer;
begin
  update public.portfolio_items
     set sort_order = sort_order + 2
   where status = 'published'
     and slug in ('ai-agent-rag-workflows', 'groundwater-level-prediction', 'bee-guardian', 'text-to-3d-platform');

  get diagnostics v_updated = row_count;
  if v_updated <> 4 then
    raise exception 'career_publication_existing_portfolio_reorder_failed';
  end if;
end
$reorder$;

insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
values (
  null,
  'reorder',
  'portfolio_item',
  null,
  jsonb_build_object(
    'source', 'data/portfolio/manifest.json',
    'reason', 'reserve_sort_order_for_two_new_featured_items',
    'shift', 2,
    'preservedSlugs', jsonb_build_array(
      'ai-agent-rag-workflows',
      'groundwater-level-prediction',
      'bee-guardian',
      'text-to-3d-platform'
    )
  )
);

do $existing_verify$
declare
  v_changed integer;
begin
  select count(*)
    into v_changed
    from public.portfolio_items as item
    join career_publication_snapshot as snapshot
      on snapshot.source = 'published_portfolio'
     and snapshot.payload ->> 'id' = item.id::text
   where item.slug in ('ai-agent-rag-workflows', 'groundwater-level-prediction', 'bee-guardian', 'text-to-3d-platform')
     and (
       item.title is distinct from snapshot.payload ->> 'title'
       or item.type is distinct from snapshot.payload ->> 'type'
       or item.summary is distinct from snapshot.payload ->> 'summary'
       or item.content_json is distinct from snapshot.payload -> 'content_json'
       or item.content_text is distinct from snapshot.payload ->> 'content_text'
       or item.start_date::text is distinct from snapshot.payload ->> 'start_date'
       or item.end_date::text is distinct from snapshot.payload ->> 'end_date'
       or item.status::text is distinct from snapshot.payload ->> 'status'
       or item.is_featured is distinct from (snapshot.payload ->> 'is_featured')::boolean
       or item.sort_order is distinct from (snapshot.payload ->> 'sort_order')::integer + 2
     );

  if v_changed <> 0 then
    raise exception 'career_publication_existing_content_changed';
  end if;
end
$existing_verify$;

create temporary table career_inserted_items (
  id uuid primary key,
  slug text unique not null
) on commit drop;

with inserted as (
  insert into public.portfolio_items (
    slug, title, type, summary, content_json, content_text,
    start_date, end_date, status, sort_order, is_featured, created_by
  ) values (
    'yonsei-medical-data-platform',
    '연세대학교 AI혁신연구원 의료데이터 플랫폼 구축',
    '데이터 플랫폼 구축',
    '약 30억 건·1.3TB의 의료데이터를 2일 만에 ClickHouse 기반 자사 DB로 이관하고, 26개 테이블 정합성 검증과 분석 솔루션·MIG 기반 GPU 분할 할당 VDI 구축 지원, 사용자·관리자 교육을 담당했습니다.',
    jsonb_build_object('type', 'markdown', 'markdown', $yonsei_markdown$약 30억 건·1.3TB의 의료데이터를 2일 만에 ClickHouse 기반 자사 DB로 이관했습니다. 초기 적재 경로를 JDBC 분할 조회·즉시 적재 방식으로 바꾸고 26개 테이블의 정합성을 확인해, 계획된 3주보다 앞서 데이터 이관을 마쳤습니다. 플랫폼 설치 지원과 사용자·관리자 교육까지 이어지는 데이터 구축·기술 이전을 맡았습니다.

## 한눈에 보기

| 항목 | 내용 |
| --- | --- |
| 고객 | 연세대학교 AI혁신연구원 |
| 소속 | 미소정보기술 · 기술융합본부 기술사업1팀 |
| 기간 | 2025.09 — 2026.02 (약 6개월) |
| 팀·담당 | 3명 중 팀원 · 데이터 수집·구축, 기술 이전·교육 |
| 핵심 범위 | MSSQL 의료데이터 26개 테이블·약 30억 건·1.3TB → ClickHouse 기반 자사 DB |
| 주요 결과 | 이관 2일 완료 · 테이블별 정합성 검증 통과 · 일정 내 플랫폼 구축 완료 |

## 프로젝트와 역할

연구자의 데이터 분석과 AI 모델 개발 환경을 마련하기 위해 워크플로우 UI 기반 분석 솔루션과 MIG 기반 GPU 분할 할당 VDI 플랫폼을 구축·납품했습니다. 저는 3명으로 구성된 팀에서 데이터 수집·구축과 기술 이전·교육을 맡았습니다.

## 대용량 의료데이터 이관

원천 데이터는 MSSQL의 26개 테이블, 약 30억 건, 1.3TB 규모였습니다. 초기에는 Python으로 데이터를 Parquet 파일로 변환한 뒤 적재하는 방식을 사용했지만, 대용량 조회에서 처리 지연과 서버 리소스 부담이 확인됐습니다. 이를 해결하기 위해 JDBC 기반 쉘 스크립트로 조회 구간을 나누고, 각 구간을 바로 적재하는 방식으로 전환했습니다.

이관 중 MSSQL과 ClickHouse의 날짜 타입 지원 범위가 달라 5555-01-01 같은 값에서 적재 오류가 발생했습니다. 고객과 예외 처리 기준을 협의해 해당 값은 NULL로 변환했고, 같은 기준을 적용해 이관을 진행했습니다.

## 플랫폼 설치와 기술 이전

NVIDIA H200 GPU 8장이 탑재된 서버 2대로 구성한 2노드 1클러스터 환경에서 분석 솔루션, VDI 클라이언트와 ClickHouse 설치를 지원했습니다. Ubuntu 기반 폐쇄망에서 지정 USB를 이용한 솔루션·스크립트 반입 및 데이터 반출 절차를 준수하며 구축 작업을 수행했습니다.

연구원·교수 약 10명과 관리자 3명을 구분해 교육을 설계했습니다. 이용자에게는 분석 솔루션의 사용·응용 방법과 VDI 신청·클라이언트 사용법을 주제로 PPT 교육을 두 차례 직접 진행했습니다. 관리자에게는 사용자 등록, 권한 관리, VDI 제공과 GPU 자원 변경 방법을 안내했습니다. 이용자용·관리자용 매뉴얼도 각각 작성해 전달했습니다.

## 로그와 데이터로 장애 원인 해결

사용하지 않는 MIG GPU가 VDI 할당 승인 목록에 표시되지 않는 장애가 접수됐습니다. 로그를 확인해 API 호출과 데이터 수집 단계가 정상 동작하는 것을 확인하고, DB 데이터 오류로 원인 범위를 좁혔습니다. 개발팀과 대응 방안을 협의한 뒤 고객사 현장을 방문해 VDI-MIG 매핑 테이블의 중복 데이터를 찾아 정리했고, 장애를 해결했습니다.

고객사 서버 담당자의 오류 접수를 유형별로 분류하고, 매뉴얼 보완이나 개발팀 전달로 이어지도록 이슈 처리 창구 역할도 수행했습니다.

## 결과

- 약 30억 건·1.3TB 이관을 2일 만에 마쳐 계획한 3주보다 앞서 완료했습니다.
- 날짜 타입 예외 처리를 제외하고 재작업 없이 1회 이관을 완료했으며, 테이블별 전체 건수와 빈값·NULL 건수를 비교해 정합성을 확인했습니다.
- 플랫폼 구축을 일정 내 마무리했고, 현재 연구원 대상 VDI를 지속적으로 생성·제공하며 안정적으로 운영하고 있습니다.
- 고객의 재교육 요청과 후속 고도화 사업 연계에 기여했습니다.

## 검증 범위

데이터 정합성은 테이블별 전체 건수와 빈값·NULL 건수 비교로 확인했으며, 날짜 타입 예외 값은 고객과 합의한 기준에 따라 NULL로 처리했습니다.$yonsei_markdown$),
    $yonsei_text$약 30억 건·1.3TB의 의료데이터를 2일 만에 ClickHouse 기반 자사 DB로 이관했습니다. 초기 적재 경로를 JDBC 분할 조회·즉시 적재 방식으로 바꾸고 26개 테이블의 정합성을 확인해, 계획된 3주보다 앞서 데이터 이관을 마쳤습니다. 플랫폼 설치 지원과 사용자·관리자 교육까지 이어지는 데이터 구축·기술 이전을 맡았습니다. 한눈에 보기 항목 내용 --- --- 고객 연세대학교 AI혁신연구원 소속 미소정보기술 · 기술융합본부 기술사업1팀 기간 2025.09 — 2026.02 (약 6개월) 팀·담당 3명 중 팀원 · 데이터 수집·구축, 기술 이전·교육 핵심 범위 MSSQL 의료데이터 26개 테이블·약 30억 건·1.3TB → ClickHouse 기반 자사 DB 주요 결과 이관 2일 완료 · 테이블별 정합성 검증 통과 · 일정 내 플랫폼 구축 완료 프로젝트와 역할 연구자의 데이터 분석과 AI 모델 개발 환경을 마련하기 위해 워크플로우 UI 기반 분석 솔루션과 MIG 기반 GPU 분할 할당 VDI 플랫폼을 구축·납품했습니다. 저는 3명으로 구성된 팀에서 데이터 수집·구축과 기술 이전·교육을 맡았습니다. 대용량 의료데이터 이관 원천 데이터는 MSSQL의 26개 테이블, 약 30억 건, 1.3TB 규모였습니다. 초기에는 Python으로 데이터를 Parquet 파일로 변환한 뒤 적재하는 방식을 사용했지만, 대용량 조회에서 처리 지연과 서버 리소스 부담이 확인됐습니다. 이를 해결하기 위해 JDBC 기반 쉘 스크립트로 조회 구간을 나누고, 각 구간을 바로 적재하는 방식으로 전환했습니다. 이관 중 MSSQL과 ClickHouse의 날짜 타입 지원 범위가 달라 5555-01-01 같은 값에서 적재 오류가 발생했습니다. 고객과 예외 처리 기준을 협의해 해당 값은 NULL로 변환했고, 같은 기준을 적용해 이관을 진행했습니다. 플랫폼 설치와 기술 이전 NVIDIA H200 GPU 8장이 탑재된 서버 2대로 구성한 2노드 1클러스터 환경에서 분석 솔루션, VDI 클라이언트와 ClickHouse 설치를 지원했습니다. Ubuntu 기반 폐쇄망에서 지정 USB를 이용한 솔루션·스크립트 반입 및 데이터 반출 절차를 준수하며 구축 작업을 수행했습니다. 연구원·교수 약 10명과 관리자 3명을 구분해 교육을 설계했습니다. 이용자에게는 분석 솔루션의 사용·응용 방법과 VDI 신청·클라이언트 사용법을 주제로 PPT 교육을 두 차례 직접 진행했습니다. 관리자에게는 사용자 등록, 권한 관리, VDI 제공과 GPU 자원 변경 방법을 안내했습니다. 이용자용·관리자용 매뉴얼도 각각 작성해 전달했습니다. 로그와 데이터로 장애 원인 해결 사용하지 않는 MIG GPU가 VDI 할당 승인 목록에 표시되지 않는 장애가 접수됐습니다. 로그를 확인해 API 호출과 데이터 수집 단계가 정상 동작하는 것을 확인하고, DB 데이터 오류로 원인 범위를 좁혔습니다. 개발팀과 대응 방안을 협의한 뒤 고객사 현장을 방문해 VDI-MIG 매핑 테이블의 중복 데이터를 찾아 정리했고, 장애를 해결했습니다. 고객사 서버 담당자의 오류 접수를 유형별로 분류하고, 매뉴얼 보완이나 개발팀 전달로 이어지도록 이슈 처리 창구 역할도 수행했습니다. 결과 약 30억 건·1.3TB 이관을 2일 만에 마쳐 계획한 3주보다 앞서 완료했습니다. 날짜 타입 예외 처리를 제외하고 재작업 없이 1회 이관을 완료했으며, 테이블별 전체 건수와 빈값·NULL 건수를 비교해 정합성을 확인했습니다. 플랫폼 구축을 일정 내 마무리했고, 현재 연구원 대상 VDI를 지속적으로 생성·제공하며 안정적으로 운영하고 있습니다. 고객의 재교육 요청과 후속 고도화 사업 연계에 기여했습니다. 검증 범위 데이터 정합성은 테이블별 전체 건수와 빈값·NULL 건수 비교로 확인했으며, 날짜 타입 예외 값은 고객과 합의한 기준에 따라 NULL로 처리했습니다.$yonsei_text$,
    DATE '2025-09-01',
    DATE '2026-02-28',
    'published'::public.portfolio_status,
    1,
    true,
    null
  )
  returning id, slug
)
insert into career_inserted_items (id, slug)
select id, slug from inserted;

with inserted as (
  insert into public.portfolio_items (
    slug, title, type, summary, content_json, content_text,
    start_date, end_date, status, sort_order, is_featured, created_by
  ) values (
    'samsung-sdi-multi-agent-mlops-poc',
    '삼성SDI 멀티 에이전트 기반 MLOps 플랫폼 PoC',
    'AI Agent·MLOps PoC',
    '실제 2주 안에 SHAP 기반 XAI 모델 MLOps 연계부터 공정 온톨로지·RAG·Multi-Agent 분석 파이프라인과 고객사 교육까지 Agent 영역을 완료했습니다.',
    jsonb_build_object('type', 'markdown', 'markdown', $samsung_markdown$실제 PoC 2주 안에 SHAP 기반 XAI 모델의 MLOps 연계부터 공정 온톨로지·RAG·Multi-Agent 분석 파이프라인과 고객사 교육까지 Agent 영역을 완료했습니다. 모델 설명 결과와 공정 흐름, 유사 조치 사례를 연결해 불량 원인 분석과 대책 제시를 지원하는 흐름을 구성했습니다.

## 한눈에 보기

| 항목 | 내용 |
| --- | --- |
| 고객 | 삼성SDI |
| 소속 | 미소정보기술 · 기술융합본부 기술사업1팀 |
| 기간 | 2026.07 — 2026.08 · 실제 PoC 2주 |
| 팀·담당 | 3명 중 팀원 · Agent 영역 단독 담당 |
| 핵심 범위 | XAI 모델 MLOps 배포·연계, 공정 온톨로지·RAG, Multi-Agent 워크플로우, 고객사 교육 |
| 주요 결과 | 2주 내 분석 파이프라인·산출물·교육 완료 · 지식 연계 GAP 분석 수행 |

## PoC 목표와 담당 범위

이차전지 제조 공정의 OCV7 시점 dV 불량을 사전에 예측하고 SHAP으로 모델 판단 요인을 설명하는 기존 모델에, 공정 데이터와 조치 문서를 연결하는 PoC였습니다. 저는 3명으로 구성된 팀에서 XAI 모델 배포 연계부터 온톨로지·RAG 구축, Multi-Agent 워크플로우 개발과 고객사 교육까지 Agent 영역을 단독으로 담당했습니다.

## XAI 모델을 MLOps와 Agent에 연결

기존 SHAP 기반 XAI 불량 예측 모델을 Airflow 기반 자사 MLOps 환경에 배포하고 FastAPI로 서빙했습니다. API가 전달하는 피처별 SHAP 기여도를 Dify HTTP 노드에서 받아 Agent 분석 입력으로 활용하도록 연계했습니다.

## LOT 공정 흐름 중심 온톨로지

제조 공정 데이터 32개 테이블을 정형 DB에 적재하고, PoC 검증 대상 11개 테이블은 AI 기반 관계 생성 기능을 활용해 LOT 단위 공정 흐름 중심으로 연결했습니다. 고객사가 제공한 공정·LOT 설명 자료와 생성형 AI를 활용해 짧은 기간 안에 제조 도메인의 데이터 흐름을 파악하고 온톨로지 구조에 반영했습니다.

분석 과정에서 데이터 품질 이슈도 먼저 확인했습니다. 공정 리니지상 믹싱 단계 데이터가 누락된 것을 확인해 고객사와 협의한 뒤 해당 단계를 검증 범위에서 제외했습니다. Wind QCP 데이터에서는 학습·테스트 데이터 혼재로 LOT 매칭이 맞지 않는 문제를 확인하고 고객사와 정정했습니다. 전체 1,005개 LOT 중 99개 LOT만 제공된 환경이었으며, 분석 착수 2일 만에 데이터 오류와 범위를 고객사에 공유했습니다.

## 조치 문서를 문서 단위로 검색

고객사 불량 조치 문서 4건(PDF·Excel)은 문서당 한두 페이지 분량이었습니다. 원인과 조치 내용이 짧은 문서 안에서 함께 이어지는 점을 고려해 청크로 나누지 않고 문서 단위로 지식베이스에 적재했습니다. 유사 사례를 검색할 때 원인과 조치의 맥락이 함께 전달되도록 한 선택입니다.

## 원인 설명에서 대책 제시까지 Multi-Agent 흐름

Dify에서 SHAP 결과 수신, 원인 설명, 사용자 선택, 온톨로지·RAG 검색, 해결방안 생성으로 이어지는 분석 워크플로우를 설계·구현했습니다.

1. FastAPI의 피처별 SHAP 기여도를 Python 노드에서 전처리해 LLM 입력으로 전달합니다.
2. LLM이 모델 기여 요인을 자연어로 설명하고, 사용자는 대책 제시 또는 분석 종료를 선택합니다.
3. 대책 제시를 선택하면 상위 SHAP 피처의 컬럼명과 값을 바탕으로 온톨로지 조회 질의와 RAG 검색 질의를 한 번에 생성합니다.
4. 형식을 고정한 단일 LLM 프롬프트로 질의 출력의 일관성을 맞추고, 온톨로지 연계 데이터와 유사 조치 사례를 종합해 해결방안을 제시합니다.

대책 제시 전후를 비교하기 위해 GAP 분석 Agent도 추가했습니다. 원인 분석 결과와 온톨로지·RAG 기반 대책 결과를 나란히 평가해 지식 연계로 분석 설명과 대책 제시가 어떻게 달라지는지 정성적으로 확인했습니다.

## 고객사 교육과 결과

현업 엔지니어 4명에게 비대면 PPT 교육을 진행했습니다. 자사 솔루션 활용 가이드와 함께 온톨로지 구성, RAG 문서 적재, Agent 분석 흐름을 설명하고, 고객사가 직접 결과를 체험·검증할 수 있도록 계정을 발급했습니다.

- 2주 안에 XAI 모델 연계, 온톨로지·RAG 구축, Multi-Agent 파이프라인, 산출물 작성과 고객사 교육을 완료했습니다.
- 분석 착수 2일 만에 공정 단계 누락과 학습·테스트 데이터 혼재를 발견해 고객사와 검증 범위를 조정했습니다. 고객사로부터 빠르고 깊이 있는 데이터 분석이라는 평가를 받았습니다.
- 정성 GAP 비교에서 지식 연계 후 원인 설명이 더 명확해지고, 적절한 조치 사례를 검색해 대책으로 제시하는 흐름을 확인했습니다.
- 이를 바탕으로 선제 대응 가능성과 분석자 숙련도에 관계없이 일관된 원인 분석을 지원할 기반을 검증했습니다.

## 검증 범위

검증은 전체 1,005개 LOT 중 제공된 99개를 대상으로 했으며, 믹싱 단계는 데이터 누락으로 제외했습니다. 지식 연계 효과는 정성 GAP 비교로 확인했습니다. SHAP 기여도는 모델 설명 결과를 바탕으로 한 분석 단서이며, 실제 불량 원인을 확정하는 자료는 아닙니다. 정량 정확도나 불량률 개선을 측정한 결과는 아닙니다.$samsung_markdown$),
    $samsung_text$실제 PoC 2주 안에 SHAP 기반 XAI 모델의 MLOps 연계부터 공정 온톨로지·RAG·Multi-Agent 분석 파이프라인과 고객사 교육까지 Agent 영역을 완료했습니다. 모델 설명 결과와 공정 흐름, 유사 조치 사례를 연결해 불량 원인 분석과 대책 제시를 지원하는 흐름을 구성했습니다. 한눈에 보기 항목 내용 --- --- 고객 삼성SDI 소속 미소정보기술 · 기술융합본부 기술사업1팀 기간 2026.07 — 2026.08 · 실제 PoC 2주 팀·담당 3명 중 팀원 · Agent 영역 단독 담당 핵심 범위 XAI 모델 MLOps 배포·연계, 공정 온톨로지·RAG, Multi-Agent 워크플로우, 고객사 교육 주요 결과 2주 내 분석 파이프라인·산출물·교육 완료 · 지식 연계 GAP 분석 수행 PoC 목표와 담당 범위 이차전지 제조 공정의 OCV7 시점 dV 불량을 사전에 예측하고 SHAP으로 모델 판단 요인을 설명하는 기존 모델에, 공정 데이터와 조치 문서를 연결하는 PoC였습니다. 저는 3명으로 구성된 팀에서 XAI 모델 배포 연계부터 온톨로지·RAG 구축, Multi-Agent 워크플로우 개발과 고객사 교육까지 Agent 영역을 단독으로 담당했습니다. XAI 모델을 MLOps와 Agent에 연결 기존 SHAP 기반 XAI 불량 예측 모델을 Airflow 기반 자사 MLOps 환경에 배포하고 FastAPI로 서빙했습니다. API가 전달하는 피처별 SHAP 기여도를 Dify HTTP 노드에서 받아 Agent 분석 입력으로 활용하도록 연계했습니다. LOT 공정 흐름 중심 온톨로지 제조 공정 데이터 32개 테이블을 정형 DB에 적재하고, PoC 검증 대상 11개 테이블은 AI 기반 관계 생성 기능을 활용해 LOT 단위 공정 흐름 중심으로 연결했습니다. 고객사가 제공한 공정·LOT 설명 자료와 생성형 AI를 활용해 짧은 기간 안에 제조 도메인의 데이터 흐름을 파악하고 온톨로지 구조에 반영했습니다. 분석 과정에서 데이터 품질 이슈도 먼저 확인했습니다. 공정 리니지상 믹싱 단계 데이터가 누락된 것을 확인해 고객사와 협의한 뒤 해당 단계를 검증 범위에서 제외했습니다. Wind QCP 데이터에서는 학습·테스트 데이터 혼재로 LOT 매칭이 맞지 않는 문제를 확인하고 고객사와 정정했습니다. 전체 1,005개 LOT 중 99개 LOT만 제공된 환경이었으며, 분석 착수 2일 만에 데이터 오류와 범위를 고객사에 공유했습니다. 조치 문서를 문서 단위로 검색 고객사 불량 조치 문서 4건(PDF·Excel)은 문서당 한두 페이지 분량이었습니다. 원인과 조치 내용이 짧은 문서 안에서 함께 이어지는 점을 고려해 청크로 나누지 않고 문서 단위로 지식베이스에 적재했습니다. 유사 사례를 검색할 때 원인과 조치의 맥락이 함께 전달되도록 한 선택입니다. 원인 설명에서 대책 제시까지 Multi-Agent 흐름 Dify에서 SHAP 결과 수신, 원인 설명, 사용자 선택, 온톨로지·RAG 검색, 해결방안 생성으로 이어지는 분석 워크플로우를 설계·구현했습니다. FastAPI의 피처별 SHAP 기여도를 Python 노드에서 전처리해 LLM 입력으로 전달합니다. LLM이 모델 기여 요인을 자연어로 설명하고, 사용자는 대책 제시 또는 분석 종료를 선택합니다. 대책 제시를 선택하면 상위 SHAP 피처의 컬럼명과 값을 바탕으로 온톨로지 조회 질의와 RAG 검색 질의를 한 번에 생성합니다. 형식을 고정한 단일 LLM 프롬프트로 질의 출력의 일관성을 맞추고, 온톨로지 연계 데이터와 유사 조치 사례를 종합해 해결방안을 제시합니다. 대책 제시 전후를 비교하기 위해 GAP 분석 Agent도 추가했습니다. 원인 분석 결과와 온톨로지·RAG 기반 대책 결과를 나란히 평가해 지식 연계로 분석 설명과 대책 제시가 어떻게 달라지는지 정성적으로 확인했습니다. 고객사 교육과 결과 현업 엔지니어 4명에게 비대면 PPT 교육을 진행했습니다. 자사 솔루션 활용 가이드와 함께 온톨로지 구성, RAG 문서 적재, Agent 분석 흐름을 설명하고, 고객사가 직접 결과를 체험·검증할 수 있도록 계정을 발급했습니다. 2주 안에 XAI 모델 연계, 온톨로지·RAG 구축, Multi-Agent 파이프라인, 산출물 작성과 고객사 교육을 완료했습니다. 분석 착수 2일 만에 공정 단계 누락과 학습·테스트 데이터 혼재를 발견해 고객사와 검증 범위를 조정했습니다. 고객사로부터 빠르고 깊이 있는 데이터 분석이라는 평가를 받았습니다. 정성 GAP 비교에서 지식 연계 후 원인 설명이 더 명확해지고, 적절한 조치 사례를 검색해 대책으로 제시하는 흐름을 확인했습니다. 이를 바탕으로 선제 대응 가능성과 분석자 숙련도에 관계없이 일관된 원인 분석을 지원할 기반을 검증했습니다. 검증 범위 검증은 전체 1,005개 LOT 중 제공된 99개를 대상으로 했으며, 믹싱 단계는 데이터 누락으로 제외했습니다. 지식 연계 효과는 정성 GAP 비교로 확인했습니다. SHAP 기여도는 모델 설명 결과를 바탕으로 한 분석 단서이며, 실제 불량 원인을 확정하는 자료는 아닙니다. 정량 정확도나 불량률 개선을 측정한 결과는 아닙니다.$samsung_text$,
    DATE '2026-07-01',
    DATE '2026-08-31',
    'published'::public.portfolio_status,
    0,
    true,
    null
  )
  returning id, slug
)
insert into career_inserted_items (id, slug)
select id, slug from inserted;

with requested_tags(name, slug) as (
  select name, public.content_tag_slug(name)
    from (values
      ('데이터 이관'), ('ClickHouse'), ('의료데이터'), ('MIG'), ('VDI'), ('기술 이전'),
      ('Multi-Agent'), ('MLOps'), ('SHAP'), ('RAG'), ('온톨로지'), ('Dify')
    ) as values_list(name)
)
insert into public.tags (name, slug)
select name, slug from requested_tags
on conflict do nothing;

insert into public.portfolio_tags (portfolio_item_id, tag_id)
select inserted_item.id, tag.id
  from career_inserted_items as inserted_item
  join lateral (
    select name
      from (values
        ('yonsei-medical-data-platform', '데이터 이관'),
        ('yonsei-medical-data-platform', 'ClickHouse'),
        ('yonsei-medical-data-platform', '의료데이터'),
        ('yonsei-medical-data-platform', 'MIG'),
        ('yonsei-medical-data-platform', 'VDI'),
        ('yonsei-medical-data-platform', '기술 이전'),
        ('samsung-sdi-multi-agent-mlops-poc', 'Multi-Agent'),
        ('samsung-sdi-multi-agent-mlops-poc', 'MLOps'),
        ('samsung-sdi-multi-agent-mlops-poc', 'SHAP'),
        ('samsung-sdi-multi-agent-mlops-poc', 'RAG'),
        ('samsung-sdi-multi-agent-mlops-poc', '온톨로지'),
        ('samsung-sdi-multi-agent-mlops-poc', 'Dify')
      ) as mapping(slug, name)
     where mapping.slug = inserted_item.slug
  ) as requested_tag on true
  join public.tags as tag on lower(trim(tag.name)) = lower(trim(requested_tag.name))
on conflict do nothing;

insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
select
  null,
  'create',
  'portfolio_item',
  item.id,
  jsonb_build_object(
    'source', manifest.content_file,
    'slug', item.slug,
    'status', item.status,
    'isFeatured', item.is_featured,
    'actor', 'privileged_sql_reviewed_by_parent'
  )
from public.portfolio_items as item
join (values
  ('yonsei-medical-data-platform', 'data/portfolio/yonsei-medical-data-platform.md'),
  ('samsung-sdi-multi-agent-mlops-poc', 'data/portfolio/samsung-sdi-multi-agent-mlops-poc.md')
) as manifest(slug, content_file) on manifest.slug = item.slug
where item.status = 'published';

do $verify$
begin
  if not exists (
    select 1
      from public.site_profile
     where id = true
       and role_title = 'AI Agent · 데이터 플랫폼 엔지니어'
       and headline = '데이터를 옮기고, 지식을 연결하고, 현장에서 쓰이는 AI를 만듭니다.'
  ) then
    raise exception 'career_publication_profile_verify_failed';
  end if;

  if (select count(*) from public.portfolio_items where slug in ('yonsei-medical-data-platform', 'samsung-sdi-multi-agent-mlops-poc') and status = 'published') <> 2 then
    raise exception 'career_publication_item_verify_failed';
  end if;

  if exists (
    select 1
      from (values
        ('yonsei-medical-data-platform', 1),
        ('samsung-sdi-multi-agent-mlops-poc', 0),
        ('ai-agent-rag-workflows', 2),
        ('groundwater-level-prediction', 3),
        ('bee-guardian', 4),
        ('text-to-3d-platform', 5)
      ) as expected(slug, sort_order)
     where not exists (
       select 1
         from public.portfolio_items as item
        where item.slug = expected.slug
          and item.status = 'published'
          and item.sort_order = expected.sort_order
     )
  ) then
    raise exception 'career_publication_sort_verify_failed';
  end if;

  if exists (
    select 1
      from (values
        ('yonsei-medical-data-platform', '데이터 이관'),
        ('yonsei-medical-data-platform', 'ClickHouse'),
        ('yonsei-medical-data-platform', '의료데이터'),
        ('yonsei-medical-data-platform', 'MIG'),
        ('yonsei-medical-data-platform', 'VDI'),
        ('yonsei-medical-data-platform', '기술 이전'),
        ('samsung-sdi-multi-agent-mlops-poc', 'Multi-Agent'),
        ('samsung-sdi-multi-agent-mlops-poc', 'MLOps'),
        ('samsung-sdi-multi-agent-mlops-poc', 'SHAP'),
        ('samsung-sdi-multi-agent-mlops-poc', 'RAG'),
        ('samsung-sdi-multi-agent-mlops-poc', '온톨로지'),
        ('samsung-sdi-multi-agent-mlops-poc', 'Dify')
      ) as expected(slug, name)
     where not exists (
       select 1
         from public.portfolio_items as item
         join public.portfolio_tags as relation on relation.portfolio_item_id = item.id
         join public.tags as tag on tag.id = relation.tag_id
        where item.slug = expected.slug
          and lower(trim(tag.name)) = lower(trim(expected.name))
     )
  ) then
    raise exception 'career_publication_tag_verify_failed';
  end if;

  if exists (
    select 1
      from public.portfolio_items
     where slug in ('yonsei-medical-data-platform', 'samsung-sdi-multi-agent-mlops-poc')
       and is_featured is not true
  ) then
    raise exception 'career_publication_featured_verify_failed';
  end if;
end
$verify$;

select jsonb_build_object(
  'profile', jsonb_build_object(
    'role_title', (select role_title from public.site_profile where id = true),
    'headline', (select headline from public.site_profile where id = true)
  ),
  'new_items', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'status', status, 'sort_order', sort_order) order by sort_order)
      from public.portfolio_items
     where slug in ('yonsei-medical-data-platform', 'samsung-sdi-multi-agent-mlops-poc')
  ), '[]'::jsonb),
  'existing_items', coalesce((
    select jsonb_agg(jsonb_build_object('slug', slug, 'sort_order', sort_order) order by sort_order)
      from public.portfolio_items
     where slug in ('ai-agent-rag-workflows', 'groundwater-level-prediction', 'bee-guardian', 'text-to-3d-platform')
  ), '[]'::jsonb)
) as career_publication_review_result;

commit;
