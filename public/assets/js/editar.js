/* Lápis de edição no próprio site. Carregado só quando há alguém logado. */
(function () {
  "use strict";
  var LIGADO = "lake-edicao";
  var pendentes = {}; // caminho -> {valor, rico}
  var ligado = localStorage.getItem(LIGADO) !== "0";
  var ativo = null;

  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function aviso(msg, tipo) {
    var a = el("div", { class: "ed-aviso" + (tipo ? " ed-aviso--" + tipo : ""), role: "status" }); a.textContent = msg;
    document.body.appendChild(a); setTimeout(function () { a.remove(); }, 4000);
  }
  var qtd = function () { return Object.keys(pendentes).length; };

  // barra
  var barra = el("div", { class: "ed-barra", role: "toolbar", "aria-label": "Edição do site" });
  barra.innerHTML =
    '<label class="ed-chave"><input type="checkbox" class="sr-only" style="position:absolute;opacity:0;width:1px"><i></i><span>Editar textos</span></label>' +
    '<span class="ed-st"></span>' +
    '<button type="button" class="ed-desf" hidden>Desfazer</button>' +
    '<button type="button" class="ed-pub" hidden>Publicar</button>' +
    '<a href="/gestao/">Gestão</a>';
  document.body.appendChild(barra);
  var chk = barra.querySelector("input"), st = barra.querySelector(".ed-st"), pub = barra.querySelector(".ed-pub"), desf = barra.querySelector(".ed-desf");

  var lapis = el("button", { type: "button", class: "ed-lapis", "aria-label": "Editar este texto", title: "Editar este texto" }, "✎");
  lapis.hidden = true;
  document.body.appendChild(lapis);

  function atualizar() {
    document.documentElement.classList.toggle("ed-on", ligado);
    document.body.classList.toggle("ed-on", ligado);
    barra.classList.toggle("ed-on", ligado);
    chk.checked = ligado;
    var n = qtd();
    st.textContent = n ? n + (n === 1 ? " alteração" : " alterações") : (ligado ? "Clique num texto para mudar" : "Olá, " + (window.LAKE && window.LAKE.nome || ""));
    pub.hidden = !n; desf.hidden = !n;
    if (!ligado) { lapis.hidden = true; if (ativo) terminar(); }
  }
  chk.addEventListener("change", function () { ligado = chk.checked; localStorage.setItem(LIGADO, ligado ? "1" : "0"); atualizar(); });

  // lápis acompanha o texto sob o mouse
  var sobre = null;
  document.addEventListener("mouseover", function (e) {
    if (!ligado) return;
    var t = e.target.closest && e.target.closest("[data-edit]");
    if (!t || t === ativo) return;
    sobre = t;
    var r = t.getBoundingClientRect();
    lapis.style.left = Math.min(window.innerWidth - 40, r.right + window.scrollX + 6) + "px";
    lapis.style.top = Math.max(4, r.top + window.scrollY - 14) + "px";
    var dentroPop = t.closest(".pop");
    lapis.style.position = dentroPop ? "fixed" : "absolute";
    if (dentroPop) { lapis.style.left = Math.min(window.innerWidth - 40, r.right + 6) + "px"; lapis.style.top = Math.max(4, r.top - 14) + "px"; }
    lapis.hidden = false;
  });
  lapis.addEventListener("click", function (e) { e.preventDefault(); if (sobre) comecar(sobre); });

  var originais = new WeakMap();
  function comecar(t) {
    if (ativo === t) return;
    if (ativo) terminar();
    ativo = t;
    if (!originais.has(t)) originais.set(t, t.innerHTML);
    t.classList.add("ed-ativo");
    var rico = t.hasAttribute("data-rich");
    try { t.contentEditable = rico ? "true" : "plaintext-only"; } catch (e) { t.contentEditable = "true"; }
    if (t.contentEditable !== "plaintext-only" && !rico) t.contentEditable = "true";
    t.focus();
    lapis.hidden = true;
  }
  function terminar() {
    var t = ativo; if (!t) return;
    ativo = null;
    t.contentEditable = "false"; t.removeAttribute("contenteditable");
    t.classList.remove("ed-ativo");
    var caminho = t.getAttribute("data-edit"), rico = t.hasAttribute("data-rich");
    var valor = rico ? t.innerHTML : t.textContent.replace(/\s+/g, " ").trim();
    var orig = originais.get(t);
    var mudou = rico ? valor !== orig : valor !== (function () { var d = document.createElement("div"); d.innerHTML = orig; return d.textContent.replace(/\s+/g, " ").trim(); })();
    if (mudou) { pendentes[caminho] = { valor: valor, rico: rico }; t.classList.add("ed-mudou"); }
    else { delete pendentes[caminho]; t.classList.remove("ed-mudou"); }
    // mesmo campo em outro lugar da página (ex.: e-mail no texto e no link)
    document.querySelectorAll('[data-edit="' + caminho + '"]').forEach(function (o) { if (o !== t) o.innerHTML = t.innerHTML; });
    if (caminho === "textos.contato_email") { var a = t.closest("a"); if (a) a.href = "mailto:" + t.textContent.trim(); }
    atualizar();
  }

  // clique em texto editável: edita em vez de seguir o link / abrir o artigo
  document.addEventListener("click", function (e) {
    if (!ligado) return;
    var t = e.target.closest && e.target.closest("[data-edit]");
    if (t) { e.preventDefault(); e.stopPropagation(); comecar(t); return; }
    if (ativo && !e.target.closest(".ed-barra")) terminar();
  }, true);
  document.addEventListener("keydown", function (e) {
    if (!ativo) return;
    if (e.key === "Escape") { ativo.innerHTML = originais.get(ativo); terminar(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "Enter" && !ativo.hasAttribute("data-rich")) { e.preventDefault(); terminar(); }
  }, true);
  document.addEventListener("paste", function (e) {
    if (!ativo) return;
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  });

  desf.addEventListener("click", function () {
    if (ativo) terminar();
    document.querySelectorAll(".ed-mudou").forEach(function (t) { if (originais.has(t)) t.innerHTML = originais.get(t); t.classList.remove("ed-mudou"); });
    pendentes = {}; atualizar(); aviso("Alterações desfeitas.");
  });
  pub.addEventListener("click", function () {
    if (ativo) terminar();
    var campos = Object.keys(pendentes).map(function (k) { return { caminho: k, valor: pendentes[k].valor, rico: pendentes[k].rico }; });
    if (!campos.length) return;
    pub.disabled = true; pub.textContent = "Publicando…";
    fetch("/api/campos", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Lake": "1" }, body: JSON.stringify({ campos: campos }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.erro || "Não foi possível publicar."); return d; }); })
      .then(function () {
        pendentes = {};
        document.querySelectorAll(".ed-mudou").forEach(function (t) { originais.set(t, t.innerHTML); t.classList.remove("ed-mudou"); });
        aviso("Publicado! O site já está atualizado.", "ok");
      })
      .catch(function (err) { aviso(err.message, "erro"); })
      .then(function () { pub.disabled = false; pub.textContent = "Publicar"; atualizar(); });
  });
  window.addEventListener("beforeunload", function (e) { if (qtd()) { e.preventDefault(); e.returnValue = ""; } });
  atualizar();
})();
