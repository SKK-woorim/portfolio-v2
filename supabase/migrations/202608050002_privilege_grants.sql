-- RLS policies control which rows callers may use; these grants allow the
-- PostgREST anon/authenticated roles to reach the application tables first.
grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
