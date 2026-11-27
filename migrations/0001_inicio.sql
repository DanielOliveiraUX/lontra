-- Quem entra na gestão. As senhas nunca ficam em texto: só o hash PBKDF2.
CREATE TABLE IF NOT EXISTS usuario (
  login         TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  papel         TEXT NOT NULL CHECK (papel IN ('cliente', 'desenvolvedor')),
  hash          TEXT NOT NULL,
  sal           TEXT NOT NULL,
  iteracoes     INTEGER NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- O conteúdo do site inteiro é um documento JSON. Cada publicação vira uma
-- linha nova: a mais recente é a que está no ar, as anteriores são o histórico.
CREATE TABLE IF NOT EXISTS versao (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  criado_em TEXT NOT NULL,
  autor     TEXT NOT NULL,
  resumo    TEXT NOT NULL DEFAULT '',
  json      TEXT NOT NULL
);

-- Tentativas de login erradas, para travar quem tenta adivinhar a senha.
CREATE TABLE IF NOT EXISTS tentativa (
  chave     TEXT NOT NULL,
  criado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tentativa_chave ON tentativa (chave, criado_em);

-- Configurações internas (ex.: o segredo que assina o cookie de sessão, gerado sozinho).
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
