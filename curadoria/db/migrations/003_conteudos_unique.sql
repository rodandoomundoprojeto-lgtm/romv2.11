-- Migração 003 — Índice único em conteudos(titulo) para importação idempotente do acervo
BEGIN;

DELETE FROM conteudos a USING conteudos b
WHERE a.id > b.id AND a.titulo = b.titulo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conteudos_titulo_unique ON conteudos (titulo);

COMMIT;
