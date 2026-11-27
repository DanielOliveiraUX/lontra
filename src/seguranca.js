// Senhas (PBKDF2-SHA256) e sessão (cookie assinado com HMAC), só com a Web Crypto do Worker.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
export const ITERACOES = 100000; // teto do PBKDF2 nos Workers

export async function hashSenha(senha, salHex, iter = ITERACOES) {
  const sal = salHex ? deHex(salHex) : crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iter }, chave, 256);
  return { hash: hex(bits), sal: hex(sal), iteracoes: iter };
}

export function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function hmac(segredo, dados) {
  const k = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(dados)));
}

const DIAS = 7;
export const COOKIE = "lake_sessao";

export async function criarSessao(segredo, login, papel, carimbo) {
  const exp = Date.now() + DIAS * 864e5;
  const corpo = `${login}|${papel}|${exp}|${carimbo}`;
  const v = `${btoa(corpo)}.${await hmac(segredo, corpo)}`;
  return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DIAS * 86400}`;
}
export const apagarSessao = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function lerSessao(req, segredo) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m || !segredo) return null;
  const [b64, assin] = m[1].split(".");
  let corpo;
  try { corpo = atob(b64); } catch { return null; }
  if (!assin || !iguais(assin, await hmac(segredo, corpo))) return null;
  const [login, papel, exp, carimbo] = corpo.split("|");
  if (Date.now() > Number(exp)) return null;
  return { login, papel, carimbo };
}

// HTML vindo dos editores: só formatação simples passa.
const PERMITIDAS = new Set(["p", "br", "b", "strong", "i", "em", "a", "span"]);
export function limparHtml(html) {
  return String(html ?? "")
    .replace(/<(script|style|iframe|object|embed|template)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (tag, nome, attrs) => {
      nome = nome.toLowerCase();
      if (nome === "div") return tag.startsWith("</") ? "</p>" : "<p>";
      if (!PERMITIDAS.has(nome)) return "";
      if (tag.startsWith("</")) return `</${nome}>`;
      if (nome === "a") {
        const h = attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i);
        const href = h && /^(https?:|mailto:|tel:|\/|#)/i.test(h[1].trim()) ? h[1].trim().replace(/"/g, "&quot;") : null;
        return href ? `<a href="${href}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ""}>` : "<a>";
      }
      return `<${nome}>`;
    })
    .replace(/<p>\s*<\/p>/g, "")
    .trim();
}
export const limparTexto = (s) => String(s ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
