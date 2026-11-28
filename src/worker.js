// Lake — site + gestão num Worker da Cloudflare.
// Páginas montadas na hora a partir do conteúdo (D1); fotos e vídeos no R2; login e senha próprios.
import { renderHome, renderPortfolio, VERSAO_ASSETS } from "./render.js";
import { lerConteudo, validar, aplicarCampo, gravar, slug } from "./conteudo.js";
import { hashSenha, iguais, criarSessao, apagarSessao, lerSessao, limparHtml, limparTexto } from "./seguranca.js";

const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
const erro = (msg, status = 400) => json({ erro: msg }, status);

// ---------------- banco ----------------
// Cria as tabelas na primeira vez que o Worker roda (dispensa rodar migração à mão).
import esquema from "../migrations/0001_inicio.sql";
let bancoPronto = null;
function garantirBanco(env) {
  if (!env.DB) return Promise.resolve();
  if (!bancoPronto) {
    const comandos = esquema.replace(/--.*$/gm, "").split(";").map((c) => c.trim()).filter(Boolean);
    bancoPronto = env.DB.batch(comandos.map((c) => env.DB.prepare(c))).catch((e) => { bancoPronto = null; throw e; });
  }
  return bancoPronto;
}

let segredoCache = null;
async function segredo(env) {
  if (env.SEGREDO_SESSAO) return env.SEGREDO_SESSAO;
  if (segredoCache) return segredoCache;
  let r = await env.DB.prepare("SELECT valor FROM config WHERE chave = 'segredo_sessao'").first();
  if (!r) {
    const novo = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT OR IGNORE INTO config (chave, valor) VALUES ('segredo_sessao', ?)").bind(novo).run();
    r = await env.DB.prepare("SELECT valor FROM config WHERE chave = 'segredo_sessao'").first();
  }
  return (segredoCache = r.valor);
}

// ---------------- usuários ----------------
function contasIniciais(env) {
  const c = [];
  if (env.SENHA_CLIENTE) c.push({ login: (env.LOGIN_CLIENTE || "lake").toLowerCase(), nome: env.NOME_CLIENTE || "Lake", papel: "cliente", senha: env.SENHA_CLIENTE });
  if (env.SENHA_DESENVOLVEDOR) c.push({ login: (env.LOGIN_DESENVOLVEDOR || "daniel").toLowerCase(), nome: env.NOME_DESENVOLVEDOR || "Daniel", papel: "desenvolvedor", senha: env.SENHA_DESENVOLVEDOR });
  return c;
}
async function buscarUsuario(env, login) {
  let u = await env.DB.prepare("SELECT * FROM usuario WHERE login = ?").bind(login).first();
  if (!u) {
    // a conta nasce do segredo da Cloudflare na primeira vez que alguém tenta entrar com ela
    const ini = contasIniciais(env).find((c) => c.login === login);
    if (!ini) return null;
    const h = await hashSenha(ini.senha);
    await env.DB.prepare("INSERT OR IGNORE INTO usuario (login, nome, papel, hash, sal, iteracoes, atualizado_em) VALUES (?,?,?,?,?,?,?)")
      .bind(ini.login, ini.nome, ini.papel, h.hash, h.sal, h.iteracoes, new Date().toISOString()).run();
    u = await env.DB.prepare("SELECT * FROM usuario WHERE login = ?").bind(login).first();
  }
  return u;
}
async function quemEsta(req, env) {
  if (!env.DB) return null;
  const s = await lerSessao(req, await segredo(env));
  if (!s) return null;
  const u = await env.DB.prepare("SELECT login, nome, papel, atualizado_em FROM usuario WHERE login = ?").bind(s.login).first();
  // trocar a senha derruba as sessões antigas
  if (!u || u.atualizado_em !== s.carimbo) return null;
  return u;
}
async function definirSenha(env, login, nova) {
  const h = await hashSenha(nova);
  const quando = new Date().toISOString();
  await env.DB.prepare("UPDATE usuario SET hash = ?, sal = ?, iteracoes = ?, atualizado_em = ? WHERE login = ?")
    .bind(h.hash, h.sal, h.iteracoes, quando, login).run();
  return quando;
}
const senhaFraca = (s) => typeof s !== "string" || s.length < 8 ? "A senha precisa ter pelo menos 8 caracteres." : null;

// ---------------- tentativas ----------------
const JANELA = 15 * 60 * 1000, LIMITE = 8;
async function bloqueado(env, chave) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM tentativa WHERE chave = ? AND criado_em > ?").bind(chave, Date.now() - JANELA).first();
  return r.n >= LIMITE;
}
const registrarErro = (env, chave) => env.DB.batch([
  env.DB.prepare("INSERT INTO tentativa (chave, criado_em) VALUES (?, ?)").bind(chave, Date.now()),
  env.DB.prepare("DELETE FROM tentativa WHERE criado_em < ?").bind(Date.now() - JANELA),
]);

// ---------------- mídia ----------------
const TIPOS_OK = /^(image\/(jpeg|png|webp|gif|avif|svg\+xml)|video\/(mp4|webm|quicktime))$/;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

// Fotos e vídeos no KV, em partes de 8 MB (o KV aceita até 25 MB por valor).
const PARTE = 8 * 1024 * 1024;
const LIMITE_TOTAL = 950 * 1024 * 1024; // o plano grátis do KV guarda 1 GB

async function espacoUsado(env) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(tamanho), 0) t FROM midia").first();
  return r.t;
}

// Lê o corpo (stream) e grava em partes. Devolve o tamanho total.
async function guardarMidia(env, chave, corpo, info) {
  if (!env.MIDIA_KV) throw new Error("O armazenamento de mídia ainda não foi ligado.");
  const leitor = corpo.getReader();
  let buf = new Uint8Array(PARTE), usado = 0, parte = 0, total = 0;
  const livre = LIMITE_TOTAL - (await espacoUsado(env));
  const gravar = async () => {
    if (!usado) return;
    await env.MIDIA_KV.put(`p:${chave}:${parte++}`, buf.slice(0, usado));
    usado = 0;
  };
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > livre) {
      for (let i = 0; i < parte; i++) await env.MIDIA_KV.delete(`p:${chave}:${i}`);
      throw new Error("O espaço de fotos e vídeos do site acabou (1 GB). Apague arquivos sem uso ou envie versões menores.");
    }
    let off = 0;
    while (off < value.byteLength) {
      const n = Math.min(PARTE - usado, value.byteLength - off);
      buf.set(value.subarray(off, off + n), usado);
      usado += n; off += n;
      if (usado === PARTE) await gravar();
    }
  }
  await gravar();
  if (!total) throw new Error("Arquivo vazio.");
  await env.DB.prepare("INSERT OR REPLACE INTO midia (chave, nome, tipo, tamanho, partes, autor, origem, enviado) VALUES (?,?,?,?,?,?,?,?)")
    .bind(chave, info.nome, info.tipo, total, parte, info.autor, info.origem || "", new Date().toISOString()).run();
  return total;
}

async function servirMidia(req, env, chave) {
  const m = env.DB && (await env.DB.prepare("SELECT * FROM midia WHERE chave = ?").bind(chave).first());
  if (!m || !env.MIDIA_KV) return new Response("Arquivo não encontrado", { status: 404 });
  const h = new Headers({ "Content-Type": m.tipo, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable", ETag: `"${chave}"` });
  if (req.headers.get("If-None-Match") === `"${chave}"`) return new Response(null, { status: 304, headers: h });
  const ler = (i) => env.MIDIA_KV.get(`p:${chave}:${i}`, { type: "arrayBuffer", cacheTtl: 86400 });
  const faixa = (req.headers.get("Range") || "").match(/^bytes=(\d*)-(\d*)$/);
  if (faixa && (faixa[1] || faixa[2])) {
    let ini, fim;
    if (faixa[1] === "") { ini = Math.max(0, m.tamanho - Number(faixa[2])); fim = m.tamanho - 1; }
    else { ini = Number(faixa[1]); fim = faixa[2] ? Math.min(Number(faixa[2]), m.tamanho - 1) : m.tamanho - 1; }
    if (ini >= m.tamanho || ini > fim) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${m.tamanho}` } });
    // faixa aberta ("bytes=N-"): devolve até o fim da parte; o navegador pede o resto depois.
    // faixa fechada: devolve exatamente o pedido (até 2 partes), como o Safari espera.
    const i = Math.floor(ini / PARTE);
    fim = Math.min(fim, faixa[2] ? (i + 2) * PARTE - 1 : (i + 1) * PARTE - 1);
    const j = Math.floor(fim / PARTE);
    const bufs = [];
    for (let k = i; k <= j; k++) { const d = await ler(k); if (!d) return new Response("Parte do arquivo não encontrada", { status: 500 }); bufs.push(new Uint8Array(d)); }
    const junto = bufs.length === 1 ? bufs[0] : (() => { const t = new Uint8Array(bufs.reduce((a, b) => a + b.byteLength, 0)); let o = 0; for (const b of bufs) { t.set(b, o); o += b.byteLength; } return t; })();
    const pedaco = junto.slice(ini - i * PARTE, fim - i * PARTE + 1);
    h.set("Content-Range", `bytes ${ini}-${fim}/${m.tamanho}`);
    h.set("Content-Length", String(pedaco.byteLength));
    return new Response(pedaco, { status: 206, headers: h });
  }
  h.set("Content-Length", String(m.tamanho));
  let i = 0;
  const corpo = new ReadableStream({
    async pull(ctrl) {
      if (i >= m.partes) return ctrl.close();
      const d = await ler(i++);
      if (!d) return ctrl.error(new Error("parte faltando"));
      ctrl.enqueue(new Uint8Array(d));
    },
  });
  return new Response(corpo, { headers: h });
}

// ---------------- migração do Wix ----------------
const WIX = /^https:\/\/(static|video)\.wixstatic\.com\//;
function urlsDoWix(c) {
  const s = new Set();
  JSON.stringify(c, (k, v) => { if (typeof v === "string" && WIX.test(v)) s.add(v); return v; });
  return [...s];
}
async function chaveDe(url, tipo) {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(url));
  const h = [...new Uint8Array(d)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `wix/${h}.${EXT[tipo] || (url.includes("video.wixstatic") ? "mp4" : "jpg")}`;
}
function trocarUrls(c, mapa) {
  return JSON.parse(JSON.stringify(c), (k, v) => (typeof v === "string" && mapa[v] ? mapa[v] : v));
}

// ---------------- páginas ----------------
async function pagina(req, env, qual) {
  const c = await lerConteudo(env);
  const u = await quemEsta(req, env);
  const extra = u ? {
    head: `  <link rel="stylesheet" href="/assets/css/editar.css?v=${VERSAO_ASSETS}">`,
    editor: `<script>window.LAKE=${JSON.stringify({ nome: u.nome, papel: u.papel, versao: c._versao })}</script>\n<script src="/assets/js/editar.js?v=${VERSAO_ASSETS}" defer></script>`,
  } : {};
  const html = qual === "home" ? renderHome(c, extra) : renderPortfolio(c, extra);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
}

// ---------------- API ----------------
async function api(req, env, url) {
  const rota = url.pathname.replace(/^\/api\//, "");
  const m = req.method;
  // Diagnóstico público (não revela nenhum segredo): mostra o que está ligado.
  if (rota === "status") {
    const st = { banco: !!env.DB, midia: !!env.MIDIA_KV, senha_desenvolvedor: !!env.SENHA_DESENVOLVEDOR, login_desenvolvedor: (env.LOGIN_DESENVOLVEDOR || "daniel") };
    if (env.DB) {
      try { await garantirBanco(env); const r = await env.DB.prepare("SELECT COUNT(*) n FROM usuario").first(); st.tabelas = "ok"; st.usuarios = r.n; }
      catch (e) { st.tabelas = "erro: " + e.message; }
    }
    return json(st);
  }
  if (!env.DB) return erro("Banco de dados não configurado.", 500);
  // Toda alteração precisa vir da própria gestão (proteção contra formulários de outros sites).
  if (m !== "GET" && req.headers.get("X-Lake") !== "1") return erro("Pedido recusado.", 403);

  if (rota === "entrar" && m === "POST") {
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    if (await bloqueado(env, ip)) return erro("Muitas tentativas erradas. Espere 15 minutos e tente de novo.", 429);
    const { login, senha } = await req.json().catch(() => ({}));
    const l = String(login || "").trim().toLowerCase();
    const u = l && (await buscarUsuario(env, l));
    const ok = u && iguais((await hashSenha(String(senha || ""), u.sal, u.iteracoes)).hash, u.hash);
    if (!ok) { await registrarErro(env, ip); return erro("Login ou senha incorretos.", 401); }
    return json({ login: u.login, nome: u.nome, papel: u.papel }, 200, { "Set-Cookie": await criarSessao(await segredo(env), u.login, u.papel, u.atualizado_em) });
  }
  if (rota === "sair" && m === "POST") return json({ ok: true }, 200, { "Set-Cookie": apagarSessao() });

  const u = await quemEsta(req, env);
  if (!u) return erro("Sua sessão terminou. Entre de novo.", 401);
  const dev = u.papel === "desenvolvedor";

  if (rota === "eu") return json({ login: u.login, nome: u.nome, papel: u.papel });

  if (rota === "conteudo" && m === "GET") return json(await lerConteudo(env));

  if (rota === "conteudo" && m === "PUT") {
    const { conteudo, baseVersao, resumo } = await req.json().catch(() => ({}));
    const atual = await lerConteudo(env);
    if (baseVersao != null && baseVersao !== atual._versao)
      return erro("O site foi alterado em outra janela depois que você abriu esta tela. Recarregue a página para pegar a versão mais nova.", 409);
    const limpo = validar(conteudo, atual);
    const id = await gravar(env, limpo, u.nome, limparTexto(resumo || "Alterações pela gestão"));
    return json({ ok: true, versao: id, conteudo: { ...limpo, _versao: id } });
  }

  if (rota === "campos" && m === "POST") {
    const { campos } = await req.json().catch(() => ({}));
    if (!Array.isArray(campos) || !campos.length) return erro("Nada para salvar.");
    const atual = await lerConteudo(env);
    const c = structuredClone(atual);
    try {
      for (const { caminho, valor, rico } of campos.slice(0, 200)) aplicarCampo(c, caminho, rico ? limparHtml(valor) : limparTexto(valor));
    } catch (e) { return erro(`Não deu para salvar: ${e.message}.`); }
    const limpo = validar(c, atual);
    const id = await gravar(env, limpo, u.nome, `Edição pelo site (${campos.length} ${campos.length === 1 ? "texto" : "textos"})`);
    return json({ ok: true, versao: id });
  }

  if (rota === "historico" && m === "GET") {
    const r = await env.DB.prepare("SELECT id, criado_em, autor, resumo FROM versao ORDER BY id DESC LIMIT 40").all();
    return json(r.results);
  }
  const mr = rota.match(/^historico\/(\d+)\/restaurar$/);
  if (mr && m === "POST") {
    const v = await env.DB.prepare("SELECT json, criado_em FROM versao WHERE id = ?").bind(Number(mr[1])).first();
    if (!v) return erro("Versão não encontrada.", 404);
    const quando = new Date(v.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const id = await gravar(env, JSON.parse(v.json), u.nome, `Restaurada a versão de ${quando}`);
    return json({ ok: true, versao: id });
  }

  if (rota === "midia" && m === "GET") {
    const r = await env.DB.prepare("SELECT chave, nome, tipo, tamanho, enviado FROM midia ORDER BY enviado DESC").all();
    return json({ usado: await espacoUsado(env), limite: LIMITE_TOTAL,
      itens: r.results.map((o) => ({ url: `/media/${o.chave}`, chave: o.chave, nome: o.nome, tipo: o.tipo, tamanho: o.tamanho, enviado: o.enviado })) });
  }
  if (rota === "midia" && m === "PUT") {
    const tipo = (req.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!TIPOS_OK.test(tipo)) return erro("Formato não aceito. Envie JPG, PNG, WEBP, GIF ou vídeo MP4.");
    if (!req.body) return erro("Arquivo vazio.");
    const nome = limparTexto(url.searchParams.get("nome") || "arquivo").slice(0, 120);
    const chave = `up/${Date.now().toString(36)}-${slug(nome.replace(/\.[^.]+$/, ""))}.${EXT[tipo]}`;
    try { await guardarMidia(env, chave, req.body, { nome, tipo, autor: u.login }); }
    catch (e) { return erro(e.message, 413); }
    return json({ ok: true, url: `/media/${chave}` });
  }

  if (rota === "senha" && m === "POST") {
    const { atual, nova } = await req.json().catch(() => ({}));
    const reg = await env.DB.prepare("SELECT * FROM usuario WHERE login = ?").bind(u.login).first();
    if (!iguais((await hashSenha(String(atual || ""), reg.sal, reg.iteracoes)).hash, reg.hash)) return erro("A senha atual não confere.", 401);
    const fraca = senhaFraca(nova); if (fraca) return erro(fraca);
    const carimbo = await definirSenha(env, u.login, nova);
    return json({ ok: true }, 200, { "Set-Cookie": await criarSessao(await segredo(env), u.login, u.papel, carimbo) });
  }

  // ---- só o desenvolvedor ----
  if (rota === "usuarios" && m === "GET" && dev) {
    for (const c of contasIniciais(env)) await buscarUsuario(env, c.login);
    const r = await env.DB.prepare("SELECT login, nome, papel, atualizado_em FROM usuario ORDER BY papel, login").all();
    const lista = r.results;
    const lc = (env.LOGIN_CLIENTE || "lake").toLowerCase();
    if (!lista.some((x) => x.login === lc)) lista.unshift({ login: lc, nome: env.NOME_CLIENTE || "Lake", papel: "cliente", atualizado_em: null });
    return json(lista);
  }
  if (rota === "senha/redefinir" && m === "POST" && dev) {
    const { login, nova } = await req.json().catch(() => ({}));
    const fraca = senhaFraca(nova); if (fraca) return erro(fraca);
    const lc = String(login || "").toLowerCase();
    let alvo = await buscarUsuario(env, lc);
    if (!alvo && lc === (env.LOGIN_CLIENTE || "lake").toLowerCase()) {
      // a conta do cliente pode nascer aqui, sem precisar de segredo na Cloudflare
      const hs = await hashSenha(nova);
      await env.DB.prepare("INSERT INTO usuario (login, nome, papel, hash, sal, iteracoes, atualizado_em) VALUES (?,?,?,?,?,?,?)")
        .bind(lc, env.NOME_CLIENTE || "Lake", "cliente", hs.hash, hs.sal, hs.iteracoes, new Date().toISOString()).run();
      return json({ ok: true });
    }
    if (!alvo) return erro("Usuário não encontrado.", 404);
    await definirSenha(env, alvo.login, nova);
    return json({ ok: true });
  }
  if (rota === "migrar-wix" && m === "POST" && dev) {
    if (!env.MIDIA_KV) return erro("O armazenamento de mídia ainda não foi ligado.", 500);
    const c = await lerConteudo(env);
    const { pular = [] } = await req.json().catch(() => ({}));
    const todas = urlsDoWix(c).filter((x) => !pular.includes(x));
    const lote = todas.slice(0, 2), mapa = {}, falhas = [];
    for (const origem of lote) {
      try {
        const r = await fetch(origem, { headers: { Accept: "image/jpeg,image/png,image/gif,video/mp4,*/*;q=0.5" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const tipo = (r.headers.get("Content-Type") || "").split(";")[0] || "application/octet-stream";
        const chave = await chaveDe(origem, tipo);
        await guardarMidia(env, chave, r.body, { nome: decodeURIComponent(origem.split("/").pop()).slice(0, 120), tipo, autor: u.login, origem: origem.slice(0, 900) });
        mapa[origem] = `/media/${chave}`;
      } catch (e) { falhas.push({ url: origem, erro: e.message }); }
    }
    if (Object.keys(mapa).length) {
      const novo = trocarUrls({ ...c, _versao: undefined }, mapa);
      delete novo._versao;
      await gravar(env, novo, u.nome, `Mídia copiada do Wix (${Object.keys(mapa).length} arquivos)`);
    }
    return json({ copiados: Object.keys(mapa).length, faltam: todas.length - Object.keys(mapa).length, falhas });
  }

  return erro("Rota não encontrada.", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if ((p.startsWith("/api/") && p !== "/api/status") || p === "/" || p.startsWith("/portfolio")) await garantirBanco(env);
      if (p.startsWith("/api/")) return await api(req, env, url);
      if (p.startsWith("/media/")) return await servirMidia(req, env, decodeURIComponent(p.slice(7)));
      if (p === "/" || p === "/index.html") return await pagina(req, env, "home");
      if (p === "/portfolio/" || p === "/portfolio/index.html") return await pagina(req, env, "portfolio");
      if (p === "/portfolio") return Response.redirect(`${url.origin}/portfolio/`, 301);
      if (p === "/gestao" || p === "/admin" || p === "/admin/" || p === "/adm") return Response.redirect(`${url.origin}/gestao/`, 302);
      return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Não encontrado", { status: 404 });
    } catch (e) {
      console.error(e);
      return p.startsWith("/api/") ? erro("Algo deu errado no servidor. Tente de novo em instantes.", 500) : new Response("Erro ao montar a página.", { status: 500 });
    }
  },
};
