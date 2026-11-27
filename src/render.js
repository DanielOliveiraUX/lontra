// Monta as páginas a partir do conteúdo. O HTML do desktop é o mesmo da versão estática.
import home from "./templates/home.html";
import portfolio from "./templates/portfolio.html";

export const VERSAO_ASSETS = "21";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const VIDEO = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const ehVideo = (u) => VIDEO.test(String(u || ""));
const SVG_DOT = '<svg viewBox="0 0 48 48"><circle class="o" cx="24" cy="24" r="22"/><circle class="m" cx="24" cy="24" r="10"/><circle class="i" cx="24" cy="24" r="10"/></svg>';

function media(u, { capa, auto, cls = "", alt = "" } = {}) {
  if (!u) return "";
  if (ehVideo(u)) {
    const a = auto ? "autoplay muted loop playsinline" : 'controls playsinline preload="none"';
    return `<video class="${cls}" ${a}${capa ? ` poster="${esc(capa)}"` : ""}><source src="${esc(u)}"></video>`;
  }
  return `<img class="${cls}" src="${esc(u)}" alt="${esc(alt)}" loading="lazy">`;
}

// caminho editável (para o lápis do site)
const ed = (path, rich) => (path ? ` data-edit="${path}"${rich ? " data-rich" : ""}` : "");
const br = (s) => esc(s).replace(/\n/g, "<br>");

function artigo(p, i, fixos) {
  const a = p.artigo || {};
  const base = `projetos.${i}.artigo`;
  const blocos = (a.blocos || []).map((b, j) => {
    const bp = `${base}.blocos.${j}`;
    const txt = `<div class="b-dupla__t"${ed(bp + ".texto", true)}>${b.texto || ""}</div>`;
    switch (b.tipo) {
      case "texto": return `      <div class="b b-texto"${ed(bp + ".texto", true)}>${b.texto || ""}</div>`;
      case "midia": return `      <div class="b b-midia">${media(b.midia, { capa: b.capa, auto: b.automatico, alt: a.titulo })}</div>`;
      case "texto-midia": return `      <div class="b b-dupla f-${esc(b.formato || "foto")} lado-${esc(b.lado || "esquerda")}">
        <div class="b-dupla__m">${media(b.midia, { capa: b.capa, auto: b.automatico, alt: a.titulo })}</div>
        ${txt}
      </div>`;
      case "duas-verticais": return `      <div class="b b-duas">
        <div>${media(b.midia1, { capa: b.capa1, auto: b.automatico })}</div>
        <div>${media(b.midia2, { capa: b.capa2, auto: b.automatico })}</div>
      </div>`;
      case "logos": return `      <div class="b b-logos">${(b.imagens || []).map((u) => media(u)).join("")}</div>`;
      case "premios": return `      <div class="b b-premios">${(b.premios || []).map((pr, k) =>
        `\n        <div class="award"><img src="${esc(fixos.louro_esq)}" alt="" loading="lazy"><img src="${esc(fixos.louro_dir)}" alt="" loading="lazy"><strong${ed(`${bp}.premios.${k}.premio`)}>${br(pr.premio)}</strong><span${ed(`${bp}.premios.${k}.festival`)}>${br(pr.festival)}</span></div>`).join("")}
      </div>`;
      default: return "";
    }
  }).join("\n");
  return `  <div class="pop" id="popup-${esc(p.id)}" role="dialog" aria-modal="true" aria-labelledby="t-${esc(p.id)}" hidden>
    <div class="pop__bg"></div>
    <button type="button" class="pop__close" aria-label="Voltar ao site"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M21 3L3 21"/></svg></button>
    <div class="pop__scroll"><article class="pop__body">
      ${p.categoria ? `<span class="pop__tag"${ed(`projetos.${i}.categoria`)}>${esc(p.categoria)}</span>` : ""}
      <h2 class="pop__title" id="t-${esc(p.id)}"${ed(base + ".titulo")}>${esc(a.titulo || p.titulo)}</h2>
      ${a.subtitulo ? `<p class="pop__sub"${ed(base + ".subtitulo")}>${esc(a.subtitulo)}</p>` : ""}
${blocos}
    </article></div>
  </div>`;
}

function preencher(tpl, c, extra) {
  return tpl
    .replace(/\{\{m:(\w+)\}\}/g, (_, k) => esc(c.fixos?.[k] ?? ""))
    .replace(/\{\{t:(\w+)\}\}/g, (_, k) => esc(c.textos?.[k] ?? ""))
    .replace(/\{\{r:(\w+)\}\}/g, (_, k) => c.textos?.[k] ?? "")
    .replace(/\{\{v\}\}/g, VERSAO_ASSETS)
    .replace(/<!--@(\w+)-->/g, (_, k) => extra[k] ?? "");
}

// posição original de cada item (para o lápis apontar o item certo mesmo com itens escondidos)
const visiveis = (lista) => (lista || []).map((x, i) => [x, i]).filter(([x]) => x.publicado !== false);

export function renderHome(c, { head = "", editor = "" } = {}) {
  const ps = visiveis(c.projetos);
  const PROJETOS = ps.map(([p, i], n) => `    <section class="sec project${p.id === "prenuncio" ? " project--short" : ""}" id="${esc(p.id)}">
      <div class="project__bg" data-hpar="${n % 2 ? "-1" : "1"}">${media(p.fundo, { alt: p.titulo })}</div>
      <div class="grid"><div class="project__col" data-fadeout>
        ${p.categoria ? `<span class="project__tag fx fx-clip"${ed(`projetos.${i}.categoria`)}>${esc(p.categoria)}</span>` : ""}
        <h2 class="project__title fx fx-blur25"${ed(`projetos.${i}.titulo`)}>${esc(p.titulo)}</h2>
        <p class="project__desc fx fx-fade" data-delay="200"${ed(`projetos.${i}.resumo`)}>${esc(p.resumo)}</p>
        ${(p.artigo?.blocos || []).length ? `<button type="button" class="link-arrow link-arrow--light project__more" data-popup="${esc(p.id)}" aria-haspopup="dialog"><span>leia mais</span><svg viewBox="0 0 200 200" aria-hidden="true"><use href="#icon-play"/></svg></button>` : ""}
      </div></div>
    </section>`).join("\n");
  const DOTS = ps.map(([p]) => `    <a href="#${esc(p.id)}" data-target="${esc(p.id)}" aria-label="${esc(p.titulo)}">${SVG_DOT}</a>\n`).join("");
  const ARTIGOS = ps.filter(([p]) => (p.artigo?.blocos || []).length).map(([p, i]) => artigo(p, i, c.fixos || {})).join("\n");
  return preencher(home, c, { PROJETOS, DOTS, ARTIGOS, HEAD: head, EDITOR: editor });
}

export function renderPortfolio(c, { head = "", editor = "" } = {}) {
  const ts = visiveis(c.trabalhos);
  const TRABALHOS = ts.map(([t, i]) => {
    const v = ehVideo(t.video)
      ? `<video data-lazyplay muted loop playsinline preload="none"${t.capa ? ` poster="${esc(t.capa)}"` : ""}><source src="${esc(t.video)}"></video>`
      : media(t.video, { alt: t.cliente });
    const tags = (t.hashtags || []).slice(0, 3).map((h, k) =>
      `<span class="work__tag fx fx-fade" data-delay="${300 + k * 150}"><span${ed(`trabalhos.${i}.hashtags.${k}`)}>${esc(h)}</span></span>`).join("");
    return `    <section class="sec work${t.fonte === "arredondada" ? " work--round" : ""}" id="${esc(t.id)}">
      <div class="grid">
        <div class="work__media fx fx-fade">${v}</div>
        <h2 class="work__title fx fx-clip"><span${ed(`trabalhos.${i}.cliente`)}>${esc(t.cliente)}</span></h2>
        ${t.projeto ? `<p class="work__sub fx fx-clip" data-delay="150"><span${ed(`trabalhos.${i}.projeto`)}>${esc(t.projeto)}</span></p>` : ""}
        <div class="work__tags">${tags}</div>
      </div>
    </section>`;
  }).join("\n");
  const MENU = ts.map(([t]) => `    <a href="#${esc(t.id)}" data-target="${esc(t.id)}"><span>${esc(t.menu || t.cliente)}</span><i></i></a>\n`).join("");
  return preencher(portfolio, c, { TRABALHOS, MENU, HEAD: head, EDITOR: editor });
}
