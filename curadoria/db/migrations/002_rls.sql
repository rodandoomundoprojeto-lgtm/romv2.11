-- Migração 002 — Segurança Supabase: bloqueia acesso via PostgREST (chaves anon/authenticated).
-- O backend FastAPI conecta como `postgres` (bypass de RLS), então continua funcionando.
ALTER TABLE ai_curadoria_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_curadoria_insights, conteudos FROM anon, authenticated;

