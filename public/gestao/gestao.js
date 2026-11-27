/* Gestão do site Lake — tudo em um arquivo, sem dependências. */
(function () {
  "use strict";

  // ---------- utilidades ----------
  const $app = document.getElementById("app");
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const f of filhos.flat(Infinity)) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
    return el;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ehVideo = (u) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u || "");
  const quando = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const tamanho = (b) => b > 1e6 ? (b / 1e6).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
  function novoId(prefixo) { return prefixo + "-" + Math.random().toString(36).slice(2, 7); }

  async function api(caminho, opcoes = {}) {
    const r = await fetch("/api/" + caminho, {
      method: opcoes.method || "GET",
      headers: Object.assign({ "X-Lake": "1" }, opcoes.body !== undefined && !(opcoes.body instanceof Blob) ? { "Content-Type": "application/json" } : {}, opcoes.headers || {}),
      body: opcoes.body === undefined ? undefined : opcoes.body instanceof Blob ? opcoes.body : JSON.stringify(opcoes.body),
      credentials: "same-origin",
    });
    let dados = null;
    try { dados = await r.json(); } catch (e) {}
    if (r.status === 401 && caminho !== "entrar" && caminho !== "senha") { estado.usuario = null; telaLogin("Sua sessão terminou. Entre de novo."); throw new Error("sessão"); }
    if (!r.ok) throw new Error((dados && dados.erro) || "Não foi possível completar. Verifique a internet e tente de novo.");
    return dados;
  }

  function avisar(msg, tipo, link) {
    const a = h("div", { class: "aviso" + (tipo ? " aviso--" + tipo : ""), role: "status" }, msg, link ? h("a", { href: link.href, target: "_blank" }, link.texto) : null);
    document.getElementById("avisos").append(a);
    setTimeout(() => a.remove(), tipo === "erro" ? 7000 : 4500);
  }

  function janela(titulo, corpo, botoes, larga) {
    return new Promise((resolve) => {
      const fechar = (v) => { fundo.remove(); document.removeEventListener("keydown", esc); resolve(v); };
      const esc = (e) => { if (e.key === "Escape") fechar(null); };
      const pe = (botoes || []).map((b) => h("button", { class: "btn " + (b.classe || ""), type: "button", onclick: async () => { if (b.acao) { const v = await b.acao(); if (v === false) return; fechar(v === undefined ? b.valor : v); } else fechar(b.valor); } }, b.texto));
      const fundo = h("div", { class: "janela-fundo", onclick: (e) => { if (e.target === fundo) fechar(null); } },
        h("div", { class: "janela" + (larga ? " janela--larga" : ""), role: "dialog", "aria-modal": "true", "aria-label": titulo },
          h("div", { class: "janela__cab" }, h("h2", {}, titulo), h("button", { class: "btn btn--icone", type: "button", "aria-label": "Fechar", onclick: () => fechar(null) }, "✕")),
          h("div", { class: "janela__corpo" }, corpo),
          pe.length ? h("div", { class: "janela__pe" }, pe) : null));
      document.body.append(fundo);
      document.addEventListener("keydown", esc);
      const foco = fundo.querySelector("input, textarea, .janela__pe .btn--pri");
      if (foco) setTimeout(() => foco.focus(), 30);
    });
  }
  const confirmar = (titulo, texto, sim, perigo) => janela(titulo, h("p", { style: { margin: 0 } }, texto), [
    { texto: "Cancelar", valor: false }, { texto: sim || "Confirmar", valor: true, classe: perigo ? "btn--perigo" : "btn--pri" }]);

  // ---------- estado ----------
  const estado = { usuario: null, publicado: null, rascunho: null, aba: "projetos", editando: null, midia: null };
  const alterado = () => estado.rascunho && JSON.stringify(estado.rascunho) !== JSON.stringify(estado.publicado);
  window.addEventListener("beforeunload", (e) => { if (alterado()) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- login ----------
  function telaLogin(msg) {
    const erroBox = h("div", { class: "erro-msg", hidden: !msg }, msg || "");
    const login = h("input", { type: "text", name: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true });
    const senha = h("input", { type: "password", name: "password", autocomplete: "current-password", required: true });
    const ver = h("button", { type: "button", onclick: () => { const t = senha.type === "password"; senha.type = t ? "text" : "password"; ver.textContent = t ? "esconder" : "mostrar"; } }, "mostrar");
    const botao = h("button", { class: "btn btn--pri", type: "submit" }, "Entrar");
    const form = h("form", { onsubmit: async (e) => {
      e.preventDefault(); botao.disabled = true; botao.textContent = "Entrando…"; erroBox.hidden = true;
      try { estado.usuario = await api("entrar", { method: "POST", body: { login: login.value, senha: senha.value } }); await iniciar(); }
      catch (err) { erroBox.textContent = err.message; erroBox.hidden = false; botao.disabled = false; botao.textContent = "Entrar"; senha.select(); }
    } },
      erroBox,
      h("label", { class: "campo" }, h("span", {}, "Login"), login),
      h("label", { class: "campo" }, h("span", {}, "Senha"), h("div", { class: "senha-wrap" }, senha, ver)),
      botao);
    $app.replaceChildren(h("main", { class: "login" }, h("div", { class: "login__card" },
      h("div", { class: "login__marca" }, "Lake"), h("p", { class: "login__sub" }, "Gestão do site"), form,
      h("p", { class: "login__ajuda" }, "Esqueceu a senha? Fale com o Daniel, que cria uma nova para você."))));
    setTimeout(() => login.focus(), 30);
  }

  // ---------- início ----------
  async function iniciar() {
    try {
      if (!estado.usuario) estado.usuario = await api("eu");
    } catch (e) { if (e.message !== "sessão") telaLogin(); return; }
    const c = await api("conteudo");
    estado.publicado = c; estado.rascunho = clone(c);
    const hash = location.hash.replace("#", "");
    if (["projetos", "portfolio", "textos", "midia", "historico", "acessos"].includes(hash)) estado.aba = hash;
    desenhar();
  }

  // ---------- publicar ----------
  const barra = h("div", { class: "publicar", role: "region", "aria-label": "Publicar alterações" },
    h("p", {}, "Você tem alterações ainda não publicadas."),
    h("button", { class: "btn", type: "button", onclick: async () => {
      if (await confirmar("Descartar alterações?", "Tudo o que você mudou desde a última publicação será desfeito.", "Descartar", true)) {
        estado.rascunho = clone(estado.publicado); estado.editando = null; desenhar(); avisar("Alterações descartadas.");
      } } }, "Descartar"),
    h("button", { class: "btn btn--pri", type: "button", onclick: () => publicar() }, "Publicar no site"));
  document.body.append(barra);
  function atualizarBarra() { barra.classList.toggle("visivel", !!alterado()); }
  // os campos chamam isto a cada tecla
  function mudou() { atualizarBarra(); }

  async function publicar() {
    const botao = barra.querySelector(".btn--pri");
    botao.disabled = true; botao.textContent = "Publicando…";
    try {
      const r = await api("conteudo", { method: "PUT", body: { conteudo: estado.rascunho, baseVersao: estado.publicado._versao, resumo: "Alterações pela gestão" } });
      estado.publicado = r.conteudo;
      // mantém a tela onde estava, trocando só os dados já limpos pelo servidor
      const ed = estado.editando;
      estado.rascunho = clone(r.conteudo);
      if (ed) { const lista = estado.rascunho[ed.tipo]; if (!lista[ed.indice]) estado.editando = null; }
      desenhar();
      avisar("Publicado! O site já está atualizado.", "ok", { href: "/", texto: "Ver o site ↗" });
    } catch (e) { avisar(e.message, "erro"); }
    botao.disabled = false; botao.textContent = "Publicar no site";
  }

  // ---------- casca ----------
  function desenhar() {
    const u = estado.usuario;
    const dev = u.papel === "desenvolvedor";
    const abas = [
      ["projetos", "▦", "Projetos da Home"],
      ["portfolio", "▶", "Portfolio"],
      ["textos", "✎", "Textos do site"],
      ["midia", "▣", "Fotos e vídeos"],
      ["historico", "↺", "Histórico"],
    ];
    if (dev) abas.push(["acessos", "⚿", "Acessos"]);
    const menu = h("div", { class: "menu-usuario" },
      h("button", { class: "btn btn--sm", type: "button", "aria-haspopup": "true", onclick: (e) => { e.stopPropagation(); menu.classList.toggle("aberto"); } }, "👤 ", u.nome, " ▾"),
      h("div", { class: "menu-usuario__lista" },
        h("button", { type: "button", onclick: trocarSenha }, "Trocar minha senha"),
        h("button", { type: "button", onclick: sair }, "Sair")));
    document.onclick = () => menu.classList.remove("aberto");
    const principal = h("main", { class: "principal", id: "principal" });
    $app.replaceChildren(
      h("header", { class: "topo" },
        h("div", { class: "topo__marca" }, "Lake", h("small", {}, "gestão do site")),
        h("div", { class: "topo__esp" }),
        h("a", { class: "btn btn--sm", href: "/", target: "_blank" }, "✎ ", h("span", { class: "so-largo" }, "Editar no "), "site ↗"),
        menu),
      h("div", { class: "casca" },
        h("nav", { class: "lado", "aria-label": "Seções da gestão" },
          abas.map(([id, ic, nome], i) => [
            i === 4 ? h("hr") : null,
            h("button", { type: "button", "aria-current": estado.aba === id ? "page" : null, onclick: () => { estado.aba = id; estado.editando = null; history.replaceState(null, "", "#" + id); desenhar(); scrollTo(0, 0); } },
              h("span", { class: "ic", "aria-hidden": "true" }, ic), nome)])),
        principal));
    const telas = { projetos: telaProjetos, portfolio: telaPortfolio, textos: telaTextos, midia: telaMidia, historico: telaHistorico, acessos: telaAcessos };
    telas[estado.aba](principal);
    atualizarBarra();
  }

  async function sair() {
    if (alterado() && !(await confirmar("Sair sem publicar?", "Você tem alterações que ainda não foram publicadas. Se sair agora, elas se perdem.", "Sair mesmo assim", true))) return;
    await api("sair", { method: "POST", body: {} }).catch(() => {});
    estado.usuario = null; estado.rascunho = estado.publicado = null; barra.classList.remove("visivel");
    telaLogin();
  }

  async function trocarSenha() {
    const atual = h("input", { type: "password", autocomplete: "current-password" });
    const nova = h("input", { type: "password", autocomplete: "new-password" });
    const nova2 = h("input", { type: "password", autocomplete: "new-password" });
    const err = h("div", { class: "erro-msg", hidden: true });
    await janela("Trocar minha senha", h("div", { class: "pilha" }, err,
      h("label", { class: "campo" }, h("span", {}, "Senha atual"), atual),
      h("label", { class: "campo" }, h("span", {}, "Nova senha"), nova, h("small", {}, "Pelo menos 8 caracteres.")),
      h("label", { class: "campo" }, h("span", {}, "Repita a nova senha"), nova2)), [
      { texto: "Cancelar" },
      { texto: "Trocar senha", classe: "btn--pri", acao: async () => {
        err.hidden = true;
        if (nova.value !== nova2.value) { err.textContent = "As duas senhas novas estão diferentes."; err.hidden = false; return false; }
        try { await api("senha", { method: "POST", body: { atual: atual.value, nova: nova.value } }); avisar("Senha trocada.", "ok"); }
        catch (e) { err.textContent = e.message; err.hidden = false; return false; }
      } }]);
  }

  // ---------- componentes de campo ----------
  function campoTexto(rotulo, obj, chave, opts = {}) {
    const el = h(opts.longo ? "textarea" : "input", { type: "text", maxlength: opts.max || null, placeholder: opts.exemplo || null, rows: opts.longo ? 3 : null });
    el.value = obj[chave] || "";
    el.addEventListener("input", () => { obj[chave] = el.value; mudou(); opts.aoMudar && opts.aoMudar(); });
    return h("label", { class: "campo" }, h("span", {}, rotulo), el, opts.dica ? h("small", {}, opts.dica) : null);
  }
  function chave(rotulo, obj, k, aoMudar) {
    const i = h("input", { type: "checkbox" }); i.checked = obj[k] !== false;
    i.addEventListener("change", () => { obj[k] = i.checked; mudou(); aoMudar && aoMudar(); });
    return h("label", { class: "chave" }, i, h("i"), rotulo);
  }
  function segmentado(rotulo, obj, k, opcoes, aoMudar) {
    const caixa = h("div", { class: "seg", role: "group", "aria-label": rotulo });
    const pintar = () => caixa.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === (obj[k] || opcoes[0][0]))));
    for (const [v, nome, desenho] of opcoes) caixa.append(h("button", { type: "button", "data-v": v, onclick: () => { obj[k] = v; pintar(); mudou(); aoMudar && aoMudar(); } }, desenho ? h("span", { html: desenho }) : null, nome));
    pintar();
    return h("div", {}, h("span", { class: "rotulo" }, rotulo), caixa);
  }
  function campoRico(rotulo, obj, k, dica) {
    const area = h("div", { class: "rico__area", contenteditable: "true", role: "textbox", "aria-multiline": "true", "data-vazio": "Escreva aqui…", html: obj[k] || "" });
    area.addEventListener("input", () => { obj[k] = area.innerHTML; mudou(); });
    area.addEventListener("paste", (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t); });
    const cmd = (c, v) => (e) => { e.preventDefault(); area.focus(); document.execCommand(c, false, v); obj[k] = area.innerHTML; mudou(); };
    const link = async (e) => {
      e.preventDefault();
      const sel = window.getSelection(); const faixa = sel.rangeCount ? sel.getRangeAt(0) : null;
      const inp = h("input", { type: "text", placeholder: "https://…" });
      const v = await janela("Adicionar link", h("label", { class: "campo" }, h("span", {}, "Endereço do link"), inp, h("small", {}, "Selecione o texto antes de clicar no botão de link.")),
        [{ texto: "Cancelar" }, { texto: "Adicionar", classe: "btn--pri", acao: () => inp.value.trim() }]);
      if (!v) return;
      area.focus(); if (faixa) { sel.removeAllRanges(); sel.addRange(faixa); }
      document.execCommand("createLink", false, /^(https?:|mailto:)/.test(v) ? v : "https://" + v);
      obj[k] = area.innerHTML; mudou();
    };
    return h("div", {}, h("span", { class: "rotulo" }, rotulo),
      h("div", { class: "rico" },
        h("div", { class: "rico__barra" },
          h("button", { type: "button", title: "Negrito", "aria-label": "Negrito", onmousedown: cmd("bold") }, h("b", {}, "N")),
          h("button", { type: "button", title: "Itálico", "aria-label": "Itálico", onmousedown: cmd("italic") }, h("i", {}, "I")),
          h("button", { type: "button", title: "Link", "aria-label": "Link", onmousedown: link }, "🔗"),
          h("button", { type: "button", title: "Tirar formatação", "aria-label": "Tirar formatação", onmousedown: cmd("removeFormat") }, "⌫")),
        area),
      dica ? h("small", { class: "dica" }, dica) : null);
  }
  function miniatura(u) {
    if (!u) return h("span", { "aria-hidden": "true" }, "＋");
    return ehVideo(u) ? h("video", { src: u + "#t=0.5", muted: true, preload: "metadata", playsinline: true }) : h("img", { src: u, alt: "", loading: "lazy" });
  }
  function campoMidia(rotulo, obj, k, opts = {}) {
    const caixa = h("div");
    const pintar = () => {
      const u = obj[k];
      caixa.replaceChildren(h("span", { class: "rotulo" }, rotulo),
        h("div", { class: "midia-campo" },
          h("div", { class: "midia-campo__mini" }, miniatura(u)),
          h("div", { class: "midia-campo__info" }, h("b", {}, u ? (ehVideo(u) ? "Vídeo escolhido" : "Imagem escolhida") : "Nada escolhido"), opts.dica || ""),
          h("div", { class: "midia-campo__acoes" },
            h("button", { class: "btn btn--sm btn--pri", type: "button", onclick: async () => {
              const url = await escolherMidia(opts.tipo);
              if (url) { obj[k] = url; mudou(); pintar(); opts.aoMudar && opts.aoMudar(); }
            } }, u ? "Trocar" : "Escolher"),
            u && opts.opcional ? h("button", { class: "btn btn--sm", type: "button", onclick: () => { obj[k] = ""; mudou(); pintar(); opts.aoMudar && opts.aoMudar(); } }, "Tirar") : null)));
    };
    pintar();
    return caixa;
  }

  // ---------- fotos e vídeos ----------
  async function carregarMidia(forcar) {
    if (!estado.midia || forcar) { const r = await api("midia"); estado.midia = r.itens; estado.espaco = { usado: r.usado, limite: r.limite }; }
    return estado.midia;
  }
  function enviarArquivos(arquivos, aoTerminar) {
    const barraP = h("i"); const texto = h("p", { style: { margin: "8px 0 0" } });
    const caixa = h("div", {}, h("div", { class: "progresso" }, barraP), texto);
    (async () => {
      const urls = [];
      for (let i = 0; i < arquivos.length; i++) {
        const f = arquivos[i];
        if (f.size > 95e6) { avisar(`"${f.name}" passa de 95 MB. Reduza o vídeo e envie de novo.`, "erro"); continue; }
        texto.textContent = `Enviando ${i + 1} de ${arquivos.length}: ${f.name}`;
        try {
          const url = await new Promise((ok, falha) => {
            const x = new XMLHttpRequest();
            x.open("PUT", "/api/midia?nome=" + encodeURIComponent(f.name));
            x.setRequestHeader("X-Lake", "1"); x.setRequestHeader("Content-Type", f.type || "application/octet-stream");
            x.upload.onprogress = (e) => { if (e.lengthComputable) barraP.style.width = Math.round(((i + e.loaded / e.total) / arquivos.length) * 100) + "%"; };
            x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (e) {} x.status < 300 ? ok(d.url) : falha(new Error(d.erro || "Falha no envio")); };
            x.onerror = () => falha(new Error("A conexão caiu durante o envio."));
            x.send(f);
          });
          urls.push(url);
        } catch (e) { avisar(`${f.name}: ${e.message}`, "erro"); }
      }
      barraP.style.width = "100%"; texto.textContent = urls.length ? "Pronto!" : "";
      estado.midia = null;
      aoTerminar(urls);
    })();
    return caixa;
  }
  function zonaEnvio(aceita, aoTerminar) {
    const input = h("input", { type: "file", multiple: true, accept: aceita, class: "sr" });
    const status = h("div");
    const zona = h("div", { class: "enviar" },
      h("p", { style: { margin: "0 0 10px", fontWeight: 700 } }, "Arraste fotos ou vídeos para cá"),
      h("button", { class: "btn btn--pri", type: "button", onclick: () => input.click() }, "Escolher do computador"),
      h("small", { class: "dica" }, "Fotos JPG/PNG até 2 MB e vídeos MP4 até 20 MB deixam o site rápido."),
      input, status);
    const ir = (lista) => { if (lista.length) status.replaceChildren(enviarArquivos([...lista], aoTerminar)); };
    input.addEventListener("change", () => ir(input.files));
    zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
    zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
    zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("sobre"); ir(e.dataTransfer.files); });
    return zona;
  }
  function gradeBiblioteca(itens, aoEscolher) {
    if (!itens.length) return h("p", { class: "vazio" }, "Nenhum arquivo enviado ainda.");
    return h("div", { class: "biblio" }, itens.map((m) => h("button", { type: "button", title: m.nome, onclick: () => aoEscolher && aoEscolher(m) },
      h("div", { class: "th" }, miniatura(m.url)),
      ehVideo(m.url) ? h("span", { class: "tp" }, "vídeo") : null,
      h("span", { class: "nm" }, m.nome, " · ", tamanho(m.tamanho)))));
  }
  async function escolherMidia(tipo) {
    const aceita = tipo === "video" ? "video/mp4,video/webm,video/quicktime" : tipo === "imagem" ? "image/*" : "image/*,video/mp4,video/webm,video/quicktime";
    const filtro = (m) => !tipo || (tipo === "video" ? ehVideo(m.url) : !ehVideo(m.url));
    const corpo = h("div");
    let fechar;
    const lista = h("div", {}, h("p", { class: "dica" }, "Carregando a biblioteca…"));
    const montar = async (forcar) => {
      try { const itens = (await carregarMidia(forcar)).filter(filtro); lista.replaceChildren(h("h3", { style: { fontSize: "15px", margin: "0 0 10px" } }, "Ou escolha um arquivo já enviado"), gradeBiblioteca(itens, (m) => fechar(m.url))); }
      catch (e) { lista.replaceChildren(h("p", { class: "erro-msg" }, e.message)); }
    };
    corpo.append(zonaEnvio(aceita, (urls) => { if (urls.length === 1) fechar(urls[0]); else montar(true); }), lista);
    montar();
    return new Promise((resolve) => {
      const p = janela(tipo === "video" ? "Escolher vídeo" : tipo === "imagem" ? "Escolher imagem" : "Escolher foto ou vídeo", corpo, null, true);
      fechar = (v) => { document.querySelector(".janela-fundo:last-of-type")?.remove(); resolve(v); };
      p.then((v) => resolve(v));
    });
  }

  // ---------- listas (projetos e portfolio) ----------
  function telaLista(alvo, cfg) {
    const lista = estado.rascunho[cfg.chave];
    const ul = h("ul", { class: "lista" });
    let arrastado = null;
    const mover = (de, para) => { if (para < 0 || para >= lista.length) return; lista.splice(para, 0, lista.splice(de, 1)[0]); mudou(); desenhar(); };
    lista.forEach((it, i) => {
      const li = h("li", { class: "item" + (it.publicado === false ? " escondido" : ""), draggable: "true" },
        h("span", { class: "item__pega", title: "Arraste para mudar a ordem", "aria-hidden": "true" }, "⋮⋮"),
        h("div", { class: "item__mini" }, miniatura(cfg.mini(it))),
        h("div", { class: "item__txt" },
          h("span", { class: "etiqueta " + (it.publicado === false ? "etiqueta--off" : "etiqueta--on") }, it.publicado === false ? "Escondido" : "No site"),
          h("strong", {}, cfg.titulo(it)), h("span", {}, cfg.sub(it))),
        h("div", { class: "item__acoes" },
          h("button", { class: "btn btn--icone", type: "button", title: "Subir", "aria-label": "Subir", disabled: i === 0, onclick: () => mover(i, i - 1) }, "↑"),
          h("button", { class: "btn btn--icone", type: "button", title: "Descer", "aria-label": "Descer", disabled: i === lista.length - 1, onclick: () => mover(i, i + 1) }, "↓"),
          h("button", { class: "btn btn--sm", type: "button", onclick: () => { it.publicado = it.publicado === false; mudou(); desenhar(); } }, it.publicado === false ? "Mostrar" : "Esconder"),
          h("button", { class: "btn btn--sm btn--pri", type: "button", onclick: () => { estado.editando = { tipo: cfg.chave, indice: i }; desenhar(); scrollTo(0, 0); } }, "Editar")));
      li.addEventListener("dragstart", () => { arrastado = i; li.classList.add("arrastando"); });
      li.addEventListener("dragend", () => li.classList.remove("arrastando"));
      li.addEventListener("dragover", (e) => { e.preventDefault(); li.classList.add("alvo"); });
      li.addEventListener("dragleave", () => li.classList.remove("alvo"));
      li.addEventListener("drop", (e) => { e.preventDefault(); li.classList.remove("alvo"); if (arrastado != null && arrastado !== i) mover(arrastado, i); });
      ul.append(li);
    });
    alvo.append(
      h("div", { class: "cab" }, h("div", {}, h("h1", {}, cfg.titulo_tela), h("p", {}, cfg.descricao)),
        h("button", { class: "btn btn--pri", type: "button", onclick: () => { lista.push(cfg.novo()); mudou(); estado.editando = { tipo: cfg.chave, indice: lista.length - 1 }; desenhar(); scrollTo(0, 0); } }, "＋ ", cfg.novo_texto)),
      h("div", { class: "dica-caixa" }, h("span", { "aria-hidden": "true" }, "💡"), h("span", {}, cfg.dica)),
      lista.length ? ul : h("p", { class: "vazio" }, "Nada aqui ainda. Clique em \"", cfg.novo_texto, "\" para começar."));
  }

  function cabecalhoEdicao(alvo, cfg, it, i) {
    const lista = estado.rascunho[cfg.chave];
    alvo.append(
      h("button", { class: "btn btn--sm voltar", type: "button", onclick: () => { estado.editando = null; desenhar(); } }, "← Voltar para a lista"),
      h("div", { class: "cab" }, h("div", {}, h("h1", {}, cfg.titulo(it) || "Sem título"), h("p", {}, "As mudanças só aparecem no site depois de clicar em \"Publicar no site\".")),
        h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          h("button", { class: "btn btn--sm", type: "button", onclick: () => { const c = clone(it); c.id = ""; c.publicado = false; c[cfg.campoTitulo] += " (cópia)"; lista.splice(i + 1, 0, c); mudou(); estado.editando = { tipo: cfg.chave, indice: i + 1 }; desenhar(); avisar("Cópia criada (escondida do site até você mostrar)."); } }, "Duplicar"),
          h("button", { class: "btn btn--sm btn--perigo", type: "button", onclick: async () => {
            if (await confirmar("Excluir?", `"${cfg.titulo(it)}" sai da lista. Se mudar de ideia antes de publicar, clique em "Descartar". Depois de publicado, dá para voltar pelo Histórico.`, "Excluir", true)) {
              lista.splice(i, 1); estado.editando = null; mudou(); desenhar();
            } } }, "Excluir"))));
  }

  // ---------- projetos ----------
  function telaProjetos(alvo) {
    const cfg = {
      chave: "projetos", titulo_tela: "Projetos da Home", campoTitulo: "titulo",
      descricao: "As telas de projeto da página inicial, na ordem em que aparecem.",
      dica: "Arraste ou use as setas para mudar a ordem. \"Esconder\" tira do site sem apagar. Em \"Editar\" você muda os textos, a foto e o artigo do \"leia mais\".",
      novo_texto: "Novo projeto",
      novo: () => ({ id: "", publicado: false, categoria: "#", titulo: "Novo projeto", resumo: "", fundo: "", artigo: { titulo: "", subtitulo: "", blocos: [] } }),
      mini: (p) => p.fundo, titulo: (p) => p.titulo, sub: (p) => [p.categoria, (p.artigo?.blocos || []).length ? `artigo com ${p.artigo.blocos.length} blocos` : "sem artigo"].filter(Boolean).join(" · "),
    };
    if (estado.editando?.tipo === "projetos") return editarProjeto(alvo, cfg, estado.editando.indice);
    telaLista(alvo, cfg);
  }

  function editarProjeto(alvo, cfg, i) {
    const p = estado.rascunho.projetos[i];
    p.artigo = p.artigo || { titulo: "", subtitulo: "", blocos: [] };
    cabecalhoEdicao(alvo, cfg, p, i);
    const previa = h("div", { class: "previa" });
    const pintarPrevia = () => previa.replaceChildren(
      p.fundo ? miniatura(p.fundo) : null,
      h("div", { class: "previa__txt" }, p.categoria ? h("span", { class: "previa__tag" }, p.categoria) : null, h("div", { class: "previa__tit" }, p.titulo), h("div", { class: "previa__res" }, p.resumo)),
      h("span", { class: "previa__selo" }, "Prévia na Home"));
    pintarPrevia();
    alvo.append(
      h("section", { class: "cartao" }, h("h2", {}, "Na página inicial"), h("p", { class: "dica" }, "O que aparece na tela do projeto, antes de clicar em \"leia mais\"."),
        previa,
        h("div", { class: "pilha" },
          chave("Mostrar este projeto no site", p, "publicado"),
          h("div", { class: "grade2" },
            campoTexto("Categoria", p, "categoria", { exemplo: "#film", dica: "A etiqueta branca acima do título.", max: 40, aoMudar: pintarPrevia }),
            campoTexto("Título", p, "titulo", { max: 160, aoMudar: pintarPrevia })),
          campoTexto("Frase de chamada", p, "resumo", { longo: true, max: 400, dica: "Uma ou duas linhas abaixo do título.", aoMudar: pintarPrevia }),
          campoMidia("Imagem de fundo", p, "fundo", { tipo: "imagem", dica: "Foto horizontal grande, de preferência 2400 × 940 px.", aoMudar: pintarPrevia }))),
      h("section", { class: "cartao" }, h("h2", {}, "Artigo do \"leia mais\""),
        h("p", { class: "dica" }, "Monte o artigo empilhando blocos de texto, fotos e vídeos. Se não tiver nenhum bloco, o botão \"leia mais\" não aparece."),
        h("div", { class: "pilha" },
          h("div", { class: "grade2" }, campoTexto("Título do artigo", p.artigo, "titulo", { max: 200 }), campoTexto("Subtítulo do artigo", p.artigo, "subtitulo", { max: 300 })),
          editorBlocos(p.artigo))));
  }

  // desenhos simples para cada tipo de bloco
  const D = {
    texto: '<svg viewBox="0 0 120 54"><g fill="#9bb9b5"><rect x="6" y="8" width="108" height="5" rx="2"/><rect x="6" y="19" width="100" height="5" rx="2"/><rect x="6" y="30" width="108" height="5" rx="2"/><rect x="6" y="41" width="70" height="5" rx="2"/></g></svg>',
    midia: '<svg viewBox="0 0 120 54"><rect x="6" y="4" width="108" height="46" rx="4" fill="#9bb9b5"/><path d="M54 18l16 9-16 9z" fill="#fff"/></svg>',
    "texto-midia": '<svg viewBox="0 0 120 54"><rect x="6" y="4" width="52" height="46" rx="4" fill="#9bb9b5"/><g fill="#c9dbd8"><rect x="66" y="8" width="48" height="5" rx="2"/><rect x="66" y="19" width="44" height="5" rx="2"/><rect x="66" y="30" width="48" height="5" rx="2"/><rect x="66" y="41" width="30" height="5" rx="2"/></g></svg>',
    "duas-verticais": '<svg viewBox="0 0 120 54"><rect x="34" y="2" width="24" height="50" rx="3" fill="#9bb9b5"/><rect x="62" y="2" width="24" height="50" rx="3" fill="#9bb9b5"/></svg>',
    logos: '<svg viewBox="0 0 120 54"><g fill="#9bb9b5"><circle cx="20" cy="27" r="11"/><rect x="40" y="18" width="20" height="18" rx="3"/><circle cx="80" cy="27" r="11"/><rect x="96" y="20" width="18" height="14" rx="3"/></g></svg>',
    premios: '<svg viewBox="0 0 120 54"><g fill="none" stroke="#9bb9b5" stroke-width="3"><path d="M20 10c-8 8-8 26 0 34M40 10c8 8 8 26 0 34M72 10c-8 8-8 26 0 34M92 10c8 8 8 26 0 34"/></g><g fill="#c9dbd8"><rect x="24" y="22" width="12" height="4"/><rect x="76" y="22" width="12" height="4"/></g></svg>',
  };
  const NOMES = {
    texto: ["Texto", "Parágrafos na largura toda."],
    midia: ["Foto ou vídeo grande", "Ocupa a largura toda."],
    "texto-midia": ["Texto + foto ou vídeo", "Lado a lado. Você escolhe o lado."],
    "duas-verticais": ["Dois vídeos verticais", "Vídeos de celular, lado a lado."],
    logos: ["Logos ou selos", "Uma fileira de imagens pequenas."],
    premios: ["Prêmios", "Com os louros desenhados."],
  };
  const NOVO_BLOCO = {
    texto: () => ({ tipo: "texto", texto: "" }),
    midia: () => ({ tipo: "midia", midia: "", capa: "", automatico: false }),
    "texto-midia": () => ({ tipo: "texto-midia", texto: "", midia: "", capa: "", formato: "foto", lado: "esquerda", automatico: false }),
    "duas-verticais": () => ({ tipo: "duas-verticais", midia1: "", capa1: "", midia2: "", capa2: "", automatico: false }),
    logos: () => ({ tipo: "logos", imagens: [] }),
    premios: () => ({ tipo: "premios", premios: [{ premio: "", festival: "" }] }),
  };

  function editorBlocos(artigo) {
    const caixa = h("div");
    const pintar = () => {
      caixa.replaceChildren();
      artigo.blocos.forEach((b, j) => {
        const mover = (d) => { const k = j + d; if (k < 0 || k >= artigo.blocos.length) return; artigo.blocos.splice(k, 0, artigo.blocos.splice(j, 1)[0]); mudou(); pintar(); };
        caixa.append(h("div", { class: "bloco" },
          h("div", { class: "bloco__cab" }, h("span", { class: "bloco__num" }, j + 1), h("strong", {}, (NOMES[b.tipo] || [b.tipo])[0]),
            h("button", { class: "btn btn--icone", type: "button", title: "Subir bloco", "aria-label": "Subir bloco", disabled: j === 0, onclick: () => mover(-1) }, "↑"),
            h("button", { class: "btn btn--icone", type: "button", title: "Descer bloco", "aria-label": "Descer bloco", disabled: j === artigo.blocos.length - 1, onclick: () => mover(1) }, "↓"),
            h("button", { class: "btn btn--icone btn--perigo", type: "button", title: "Apagar bloco", "aria-label": "Apagar bloco", onclick: async () => {
              if (await confirmar("Apagar este bloco?", "O bloco sai do artigo. Antes de publicar, dá para desfazer com \"Descartar\".", "Apagar", true)) { artigo.blocos.splice(j, 1); mudou(); pintar(); } } }, "🗑")),
          h("div", { class: "bloco__corpo" }, corpoBloco(b, pintar))));
      });
      caixa.append(h("button", { class: "btn", type: "button", style: { width: "100%", minHeight: "52px", borderStyle: "dashed" }, onclick: adicionar }, "＋ Adicionar bloco ao artigo"));
    };
    const adicionar = async () => {
      const tipo = await new Promise((resolve) => {
        const grade = h("div", { class: "escolher-bloco" }, Object.keys(NOMES).map((t) => h("button", { type: "button", onclick: () => { document.querySelector(".janela-fundo")?.remove(); resolve(t); } },
          h("span", { html: D[t] }), h("strong", {}, NOMES[t][0]), h("span", {}, NOMES[t][1]))));
        janela("Que tipo de bloco?", grade, null, true).then(() => resolve(null));
      });
      if (!tipo) return;
      artigo.blocos.push(NOVO_BLOCO[tipo]()); mudou(); pintar();
      setTimeout(() => caixa.querySelector(".bloco:last-of-type")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    };
    pintar();
    return caixa;
  }

  const LADO = (lado) => lado === "esquerda"
    ? '<svg viewBox="0 0 56 36"><rect x="2" y="4" width="24" height="28" rx="2" fill="#9bb9b5"/><g fill="#c9dbd8"><rect x="30" y="8" width="24" height="4"/><rect x="30" y="16" width="20" height="4"/><rect x="30" y="24" width="24" height="4"/></g></svg>'
    : '<svg viewBox="0 0 56 36"><rect x="30" y="4" width="24" height="28" rx="2" fill="#9bb9b5"/><g fill="#c9dbd8"><rect x="2" y="8" width="24" height="4"/><rect x="2" y="16" width="20" height="4"/><rect x="2" y="24" width="24" height="4"/></g></svg>';
  const FORMATO = {
    foto: '<svg viewBox="0 0 56 36"><rect x="12" y="4" width="32" height="26" rx="2" fill="#9bb9b5"/></svg>',
    video: '<svg viewBox="0 0 56 36"><rect x="6" y="7" width="44" height="24" rx="2" fill="#9bb9b5"/></svg>',
    vertical: '<svg viewBox="0 0 56 36"><rect x="19" y="1" width="18" height="34" rx="2" fill="#9bb9b5"/></svg>',
  };

  function corpoBloco(b, repintar) {
    const auto = (rot) => chave(rot || "Vídeo toca sozinho, sem som e em repetição (como um GIF)", b, "automatico");
    const temVideo = (...us) => us.some(ehVideo);
    switch (b.tipo) {
      case "texto": return campoRico("Texto", b, "texto", "Use Enter para começar um novo parágrafo.");
      case "midia": return h("div", { class: "pilha" },
        campoMidia("Foto ou vídeo", b, "midia", { dica: "Horizontal. Vídeo em MP4.", aoMudar: repintar }),
        temVideo(b.midia) ? campoMidia("Capa do vídeo (opcional)", b, "capa", { tipo: "imagem", opcional: true, dica: "Aparece antes de dar play." }) : null,
        temVideo(b.midia) ? auto() : null);
      case "texto-midia": return h("div", { class: "pilha" },
        campoRico("Texto", b, "texto"),
        campoMidia("Foto ou vídeo", b, "midia", { aoMudar: repintar }),
        h("div", { class: "grade2" },
          segmentado("Formato", b, "formato", [["foto", "Foto", FORMATO.foto], ["video", "Vídeo horizontal", FORMATO.video], ["vertical", "Vertical (celular)", FORMATO.vertical]]),
          segmentado("Lado da foto ou vídeo", b, "lado", [["esquerda", "Esquerda", LADO("esquerda")], ["direita", "Direita", LADO("direita")]])),
        temVideo(b.midia) ? campoMidia("Capa do vídeo (opcional)", b, "capa", { tipo: "imagem", opcional: true }) : null,
        temVideo(b.midia) ? auto() : null);
      case "duas-verticais": return h("div", { class: "pilha" },
        h("div", { class: "grade2" }, campoMidia("Vídeo da esquerda", b, "midia1", { tipo: "video" }), campoMidia("Vídeo da direita", b, "midia2", { tipo: "video" })),
        h("div", { class: "grade2" }, campoMidia("Capa da esquerda (opcional)", b, "capa1", { tipo: "imagem", opcional: true }), campoMidia("Capa da direita (opcional)", b, "capa2", { tipo: "imagem", opcional: true })),
        auto("Vídeos tocam sozinhos, sem som e em repetição"));
      case "logos": {
        const grade = h("div", { class: "biblio" });
        const pintarLogos = () => {
          grade.replaceChildren(...b.imagens.map((u, k) => h("button", { type: "button", title: "Clique para tirar", onclick: () => { b.imagens.splice(k, 1); mudou(); pintarLogos(); } },
            h("div", { class: "th", style: { background: "#555" } }, h("img", { src: u, alt: "", style: { objectFit: "contain" } })), h("span", { class: "nm" }, "✕ tirar"))));
        };
        pintarLogos();
        return h("div", { class: "pilha" }, grade,
          h("button", { class: "btn btn--sm btn--pri", type: "button", onclick: async () => { const u = await escolherMidia("imagem"); if (u) { b.imagens.push(u); mudou(); pintarLogos(); } } }, "＋ Adicionar logo"),
          h("small", { class: "dica" }, "PNG com fundo transparente fica melhor. O fundo do artigo é escuro."));
      }
      case "premios": {
        const lista = h("div", { class: "pilha" });
        const pintarP = () => {
          lista.replaceChildren(...b.premios.map((pr, k) => h("div", { class: "grade3", style: { alignItems: "end" } },
            campoTexto("Prêmio", pr, "premio", { exemplo: "Best Director", max: 80 }),
            campoTexto("Festival", pr, "festival", { exemplo: "Paris Film Festival", max: 120 }),
            h("button", { class: "btn btn--sm btn--perigo", type: "button", onclick: () => { b.premios.splice(k, 1); mudou(); pintarP(); } }, "Tirar"))),
          h("button", { class: "btn btn--sm btn--pri", type: "button", onclick: () => { b.premios.push({ premio: "", festival: "" }); mudou(); pintarP(); } }, "＋ Adicionar prêmio"));
        };
        pintarP();
        return lista;
      }
    }
    return h("p", {}, "Bloco desconhecido.");
  }

  // ---------- portfolio ----------
  function telaPortfolio(alvo) {
    const cfg = {
      chave: "trabalhos", titulo_tela: "Portfolio", campoTitulo: "cliente",
      descricao: "Os trabalhos da página Portfolio. O menu de nomes à direita se monta sozinho.",
      dica: "Cada trabalho tem um vídeo que toca sozinho, sem som, quando aparece na tela. Arraste ou use as setas para mudar a ordem.",
      novo_texto: "Novo trabalho",
      novo: () => ({ id: "", publicado: false, cliente: "Novo cliente", projeto: "", menu: "", video: "", capa: "", hashtags: [], fonte: "mono" }),
      mini: (t) => t.capa || t.video, titulo: (t) => t.cliente, sub: (t) => [t.projeto, (t.hashtags || []).join(" ")].filter(Boolean).join(" · "),
    };
    if (estado.editando?.tipo === "trabalhos") return editarTrabalho(alvo, cfg, estado.editando.indice);
    telaLista(alvo, cfg);
  }
  function editarTrabalho(alvo, cfg, i) {
    const t = estado.rascunho.trabalhos[i];
    t.hashtags = t.hashtags || [];
    while (t.hashtags.length < 3) t.hashtags.push("");
    cabecalhoEdicao(alvo, cfg, t, i);
    const tags = { 0: t.hashtags[0], 1: t.hashtags[1], 2: t.hashtags[2] };
    const sincronizar = () => { t.hashtags = [tags[0], tags[1], tags[2]].map((x) => (x || "").trim()).filter(Boolean); };
    alvo.append(h("section", { class: "cartao" }, h("div", { class: "pilha" },
      chave("Mostrar este trabalho no site", t, "publicado"),
      h("div", { class: "grade2" },
        campoTexto("Cliente", t, "cliente", { exemplo: "LG", max: 80 }),
        campoTexto("Projeto", t, "projeto", { exemplo: "Refrigeradores", max: 120 })),
      campoTexto("Nome no menu lateral (opcional)", t, "menu", { dica: "Deixe vazio para usar o nome do cliente.", max: 60 }),
      campoMidia("Vídeo", t, "video", { tipo: "video", dica: "MP4 horizontal (16:9), de preferência até 20 MB." }),
      campoMidia("Capa do vídeo (opcional)", t, "capa", { tipo: "imagem", opcional: true, dica: "Aparece enquanto o vídeo carrega." }),
      h("div", {}, h("span", { class: "rotulo" }, "Hashtags (até 3)"),
        h("div", { class: "grade3" }, [0, 1, 2].map((k) => { const inp = h("input", { type: "text", placeholder: ["#jingle", "#groovy", "#summer"][k], maxlength: 40 }); inp.value = tags[k] || ""; inp.addEventListener("input", () => { tags[k] = inp.value; sincronizar(); mudou(); }); return inp; }))),
      segmentado("Fonte do título", t, "fonte", [["mono", "Mono (padrão)"], ["arredondada", "Arredondada"]]))));
    sincronizar();
  }

  // ---------- textos ----------
  function telaTextos(alvo) {
    const tx = estado.rascunho.textos;
    const grupo = (titulo, dica, campos) => h("section", { class: "cartao" }, h("h2", {}, titulo), h("p", { class: "dica" }, dica), h("div", { class: "pilha" }, campos));
    alvo.append(
      h("div", { class: "cab" }, h("div", {}, h("h1", {}, "Textos do site"), h("p", {}, "Os textos fixos da página inicial e do portfolio."))),
      h("div", { class: "dica-caixa" }, h("span", { "aria-hidden": "true" }, "💡"), h("span", {}, "Também dá para mudar qualquer texto direto no site: abra o site com você logado e clique no lápis ao lado do texto.")),
      grupo("Topo", "A frase grande sobre o vídeo da água.", [campoTexto("Frase do topo", tx, "hero_tagline", { max: 120 })]),
      grupo("Sobre", "A seção logo abaixo do topo.", [
        campoTexto("Título", tx, "sobre_titulo", { longo: true }),
        campoRico("Texto 1 (em negrito)", tx, "sobre_texto1", "O trecho em texto normal no fim (\"vamos fazer!\") fica sem negrito."),
        campoTexto("Texto 2", tx, "sobre_texto2", { longo: true }),
        campoTexto("Texto 3 (coluna da direita, pequeno)", tx, "sobre_texto3", { longo: true }),
        campoTexto("Texto 4 (coluna da direita, grande)", tx, "sobre_texto4", { longo: true }),
        h("div", { class: "grade2" }, campoTexto("Assinatura, linha 1", tx, "sobre_assinatura1"), campoRico("Assinatura, linha 2", tx, "sobre_assinatura2")),
        campoTexto("Texto do link para o portfolio", tx, "sobre_link")]),
      grupo("Contato", "O fim da página inicial.", [
        campoRico("Chamada", tx, "contato_chamada", "As palavras em negrito ficam destacadas."),
        h("div", { class: "grade3" }, campoTexto("Telefone", tx, "contato_telefone"), campoTexto("E-mail", tx, "contato_email"), campoTexto("Cidade", tx, "contato_cidade"))]),
      grupo("Botões", "Textos dos botões e links fixos.", [
        h("div", { class: "grade2" }, campoTexto("Botão fixo \"veja o portfolio\"", tx, "botao_portfolio"), campoTexto("Botão no fim do portfolio", tx, "voltar_home"))]));
  }

  // ---------- fotos e vídeos (aba) ----------
  function telaMidia(alvo) {
    const lista = h("div", {}, h("p", { class: "dica" }, "Carregando…"));
    const montar = async (forcar) => {
      try {
        const itens = await carregarMidia(forcar);
        const e = estado.espaco, pct = Math.min(100, Math.round((e.usado / e.limite) * 100));
        lista.replaceChildren(
          h("div", { class: "cartao", style: { marginBottom: "18px" } },
            h("b", {}, "Espaço usado: ", tamanho(e.usado), " de ", tamanho(e.limite), " (", pct, "%)"),
            h("div", { class: "progresso" }, h("i", { style: { width: pct + "%", background: pct > 85 ? "var(--danger)" : "" } })),
            h("small", { class: "dica" }, "Vídeos ocupam mais espaço. Reduzir para 720p antes de enviar economiza bastante.")),
          gradeBiblioteca(itens, null));
      }
      catch (e) { lista.replaceChildren(h("p", { class: "erro-msg" }, e.message)); }
    };
    alvo.append(
      h("div", { class: "cab" }, h("div", {}, h("h1", {}, "Fotos e vídeos"), h("p", {}, "Tudo o que já foi enviado. Envie aqui ou direto do campo de foto/vídeo de cada projeto."))),
      zonaEnvio("image/*,video/mp4,video/webm,video/quicktime", (urls) => { if (urls.length) avisar(`${urls.length} ${urls.length === 1 ? "arquivo enviado" : "arquivos enviados"}.`, "ok"); montar(true); }),
      lista);
    if (estado.usuario.papel === "desenvolvedor") alvo.append(painelMigracao());
    montar();
  }
  function painelMigracao() {
    const status = h("p", { class: "dica" });
    const botao = h("button", { class: "btn btn--pri", type: "button", onclick: async () => {
      if (alterado()) { avisar("Publique ou descarte as alterações antes de migrar.", "erro"); return; }
      botao.disabled = true;
      let total = 0; const pular = [];
      try {
        for (let rodada = 0; rodada < 200; rodada++) {
          const r = await api("migrar-wix", { method: "POST", body: { pular } });
          total += r.copiados;
          r.falhas.forEach((f) => pular.push(f.url));
          status.textContent = `${total} arquivos copiados, faltam ${r.faltam - r.falhas.length}.` + (pular.length ? ` Não deu para copiar: ${pular.length} (veja o console).` : "");
          if (r.faltam - r.falhas.length <= 0) break;
        }
        if (pular.length) console.warn("Não copiados:", pular);
        const c = await api("conteudo"); estado.publicado = c; estado.rascunho = clone(c); estado.midia = null;
        avisar("Migração concluída.", "ok");
      } catch (e) { avisar(e.message, "erro"); }
      botao.disabled = false;
    } }, "Copiar mídia do Wix para a Cloudflare");
    return h("section", { class: "cartao", style: { marginTop: "24px" } }, h("h2", {}, "Só para o desenvolvedor: mídia do Wix"),
      h("p", { class: "dica" }, "Copia as fotos e vídeos que ainda vêm do Wix para o armazenamento do site e troca os endereços. Pode rodar mais de uma vez."), botao, status);
  }

  // ---------- histórico ----------
  async function telaHistorico(alvo) {
    const ul = h("ul", { class: "hist" }, h("li", {}, "Carregando…"));
    alvo.append(
      h("div", { class: "cab" }, h("div", {}, h("h1", {}, "Histórico"), h("p", {}, "Cada publicação fica guardada. Se algo der errado, volte para uma versão anterior."))),
      h("section", { class: "cartao" }, ul));
    try {
      const vs = await api("historico");
      if (!vs.length) { ul.replaceChildren(h("li", {}, "Nenhuma publicação ainda.")); return; }
      ul.replaceChildren(...vs.map((v, k) => h("li", {},
        h("div", { class: "q" }, h("b", {}, v.resumo || "Publicação"), h("span", {}, quando(v.criado_em), " · por ", v.autor)),
        k === 0 ? h("span", { class: "atual" }, "No ar agora") : h("button", { class: "btn btn--sm", type: "button", onclick: async () => {
          if (!(await confirmar("Voltar para esta versão?", `O site volta a ficar como estava em ${quando(v.criado_em)}. A versão de agora continua guardada aqui no histórico.`, "Voltar para esta versão"))) return;
          try {
            await api(`historico/${v.id}/restaurar`, { method: "POST", body: {} });
            const c = await api("conteudo"); estado.publicado = c; estado.rascunho = clone(c);
            avisar("Pronto! O site voltou para aquela versão.", "ok"); desenhar();
          } catch (e) { avisar(e.message, "erro"); }
        } }, "Voltar para esta versão"))));
    } catch (e) { ul.replaceChildren(h("li", { class: "erro-msg" }, e.message)); }
  }

  // ---------- acessos (desenvolvedor) ----------
  async function telaAcessos(alvo) {
    const ul = h("ul", { class: "hist" }, h("li", {}, "Carregando…"));
    alvo.append(h("div", { class: "cab" }, h("div", {}, h("h1", {}, "Acessos"), h("p", {}, "Quem entra na gestão. Aqui você cria uma senha nova para o cliente quando ele esquecer."))),
      h("section", { class: "cartao" }, ul));
    try {
      const us = await api("usuarios");
      ul.replaceChildren(...us.map((x) => h("li", {},
        h("div", { class: "q" }, h("b", {}, x.nome, " (", x.login, ")"), h("span", {}, x.papel === "cliente" ? "Cliente" : "Desenvolvedor", " · ", x.atualizado_em ? "senha trocada em " + quando(x.atualizado_em) : "ainda sem senha: crie uma para liberar o acesso")),
        h("button", { class: "btn btn--sm", type: "button", onclick: async () => {
          const nova = h("input", { type: "text", autocomplete: "off" });
          nova.value = Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6);
          await janela(`Nova senha para ${x.nome}`, h("label", { class: "campo" }, h("span", {}, "Nova senha"), nova, h("small", {}, "Anote e envie para a pessoa. Ela pode trocar depois em \"Trocar minha senha\".")), [
            { texto: "Cancelar" },
            { texto: "Salvar senha", classe: "btn--pri", acao: async () => { try { await api("senha/redefinir", { method: "POST", body: { login: x.login, nova: nova.value } }); avisar("Senha definida.", "ok"); } catch (e) { avisar(e.message, "erro"); return false; } } }]);
        } }, x.atualizado_em ? "Definir nova senha" : "Criar senha"))));
    } catch (e) { ul.replaceChildren(h("li", { class: "erro-msg" }, e.message)); }
  }

  iniciar();
})();
