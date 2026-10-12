-- 공개 챗봇 진행 표시("공개 페이지 N")에 쓰는 인덱스 통계.
-- 문서 행은 노출하지 않고, ready 상태이면서 활성 리비전이 있는 문서 수만 돌려준다.

create or replace function public.get_chatbot_index_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'documents', count(*),
    'profile', count(*) filter (where source_type = 'profile'),
    'portfolio', count(*) filter (where source_type = 'portfolio'),
    'post', count(*) filter (where source_type = 'post')
  )
  from public.knowledge_documents
  where index_status = 'ready'
    and active_revision is not null;
$$;

revoke all on function public.get_chatbot_index_stats() from public, anon, authenticated;
grant execute on function public.get_chatbot_index_stats() to anon, authenticated;

comment on function public.get_chatbot_index_stats() is 'Returns counts of indexed public documents for the chatbot progress display without exposing document rows.';
