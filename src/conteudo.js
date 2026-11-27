// Ler, validar e gravar o conteúdo do site (D1). Tudo o que chega da gestão passa por aqui.
import semente from "./semente.json";
import { limparHtml, limparTexto } from "./seguranca.js";

export const TEXTOS_RICOS = new Set(["sobre_texto1", "sobre_assinatura2", "contato_chamada"]);
export const TIPOS_BLOCO = ["texto", "midia", "texto-midia", "duas-verticais", "logos", "premios"];

export async function lerConteudo(env) {
  const linha = env.DB ? await env.DB.prepare("SELECT id, json FROM versao ORDER BY id DESC LIMIT 1").first() : null;
  return linha ? { ...JSON.parse(linha.json), _versao: linha.id } : { ...structuredClone(semente), _versao: 0 };
}

const txt = (s, max = 400) => limparTexto(s).slice(0, max);
const url = (s) => {
  s = String(s ?? "").trim();
  return /^(https:\/\/|\/media\/)/.test(s) && !/["<>\s]/.test(s) ? s : "";
};
export const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";

function idsUnicos(lista, campo) {
  const vistos = new Set();
  for (const x of lista) {
    let base = slug(x.id || x[campo]), id = base, n = 2;
    while (vistos.has(id)) id = `${base}-${n++}`;
    vistos.add(id); x.id = id;
  }
  return lista;
}

function bloco(b) {
  const tipo = TIPOS_BLOCO.includes(b?.tipo) ? b.tipo : null;
  if (!tipo) return null;
  const auto = !!b.automatico;
  switch (tipo) {
    case "texto": return { tipo, texto: limparHtml(b.texto) };
    case "midia": return { tipo, midia: url(b.midia), capa: url(b.capa), automatico: auto };
    case "texto-midia": return {
      tipo, texto: limparHtml(b.texto), midia: url(b.midia), capa: url(b.capa), automatico: auto,
      formato: ["foto", "video", "vertical"].includes(b.formato) ? b.formato : "foto",
      lado: b.lado === "direita" ? "direita" : "esquerda",
    };
    case "duas-verticais": return { tipo, midia1: url(b.midia1), capa1: url(b.capa1), midia2: url(b.midia2), capa2: url(b.capa2), automatico: auto };
    case "logos": return { tipo, imagens: (b.imagens || []).map(url).filter(Boolean).slice(0, 30) };
    case "premios": return { tipo, premios: (b.premios || []).slice(0, 20).map((p) => ({ premio: txt(p?.premio, 80), festival: txt(p?.festival, 120) })) };
  }
}

// Recebe o conteúdo inteiro vindo da gestão e devolve uma versão limpa.
export function validar(novo, atual) {
  const textos = {};
  for (const k of Object.keys(atual.textos)) {
    const v = novo?.textos?.[k] ?? atual.textos[k];
    textos[k] = TEXTOS_RICOS.has(k) ? limparHtml(v).replace(/^<p>([\s\S]*)<\/p>$/, "$1").replace(/<\/p><p>/g, "<br>") : txt(v, 1200);
  }
  const projetos = idsUnicos((Array.isArray(novo?.projetos) ? novo.projetos : atual.projetos).slice(0, 40).map((p) => ({
    id: p.id, publicado: p.publicado !== false,
    categoria: txt(p.categoria, 40), titulo: txt(p.titulo, 160) || "Sem título", resumo: txt(p.resumo, 400), fundo: url(p.fundo),
    artigo: { titulo: txt(p.artigo?.titulo, 200), subtitulo: txt(p.artigo?.subtitulo, 300), blocos: (p.artigo?.blocos || []).slice(0, 60).map(bloco).filter(Boolean) },
  })), "titulo");
  const trabalhos = idsUnicos((Array.isArray(novo?.trabalhos) ? novo.trabalhos : atual.trabalhos).slice(0, 60).map((t) => ({
    id: t.id, publicado: t.publicado !== false,
    cliente: txt(t.cliente, 80) || "Sem nome", projeto: txt(t.projeto, 120), menu: txt(t.menu, 60),
    video: url(t.video), capa: url(t.capa),
    hashtags: (t.hashtags || []).map((h) => txt(h, 40)).filter(Boolean).slice(0, 3),
    fonte: t.fonte === "arredondada" ? "arredondada" : "mono",
  })), "cliente");
  return { versao: 1, textos, fixos: atual.fixos, projetos, trabalhos };
}

// Edição pelo lápis: troca um campo de texto pelo caminho (ex.: "projetos.2.titulo").
export function aplicarCampo(c, caminho, valor) {
  const partes = String(caminho).split(".");
  if (!partes.length || partes.some((p) => p === "__proto__" || p === "constructor" || p === "prototype")) throw new Error("caminho inválido");
  if (partes[0] === "fixos") throw new Error("caminho inválido");
  let o = c;
  for (let i = 0; i < partes.length - 1; i++) {
    o = o?.[/^\d+$/.test(partes[i]) ? Number(partes[i]) : partes[i]];
    if (o == null || typeof o !== "object") throw new Error("caminho não existe");
  }
  const k = partes.at(-1);
  if (typeof o[k] !== "string") throw new Error("este campo não é texto");
  o[k] = valor;
}

export async function gravar(env, c, autor, resumo) {
  // a primeira publicação guarda antes o conteúdo original, para o histórico poder voltar a ele
  const tem = await env.DB.prepare("SELECT id FROM versao LIMIT 1").first();
  if (!tem) await env.DB.prepare("INSERT INTO versao (criado_em, autor, resumo, json) VALUES (?, ?, ?, ?)")
    .bind(new Date(Date.now() - 1000).toISOString(), "Lake", "Conteúdo original do site", JSON.stringify(semente)).run();
  const r = await env.DB.prepare("INSERT INTO versao (criado_em, autor, resumo, json) VALUES (?, ?, ?, ?)")
    .bind(new Date().toISOString(), autor, resumo.slice(0, 200), JSON.stringify(c)).run();
  // mantém as 40 publicações mais recentes
  await env.DB.prepare("DELETE FROM versao WHERE id NOT IN (SELECT id FROM versao ORDER BY id DESC LIMIT 40)").run();
  return r.meta.last_row_id;
}
