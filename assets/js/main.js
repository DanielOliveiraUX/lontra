/* Lake — animações (sem dependências) */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var vh = window.innerHeight;

  /* Entradas por tempo, disparadas quando o elemento aparece na tela */
  var fx = document.querySelectorAll(".fx");
  if (reduce || !("IntersectionObserver" in window)) {
    fx.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target, d = Number(el.getAttribute("data-delay") || 0);
        setTimeout(function () { el.classList.add("is-in"); }, d);
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -12% 0px" });
    fx.forEach(function (el) { io.observe(el); });
  }

  /* Efeitos ligados à rolagem */
  var par = [].map.call(document.querySelectorAll("[data-par]"), function (el) {
    return { el: el, a: Number(el.getAttribute("data-par")) };
  });
  var hpar = [].map.call(document.querySelectorAll("[data-hpar]"), function (el) {
    return { el: el, dir: Number(el.getAttribute("data-hpar")), sec: el.closest("section") };
  });
  var fades = [].map.call(document.querySelectorAll("[data-fadeout]"), function (el) {
    return { el: el, sec: el.closest("section") };
  });
  var btn = document.querySelector(".btn-portfolio");
  var dots = [].map.call(document.querySelectorAll(".dots a"), function (a) {
    return { a: a, sec: document.getElementById(a.getAttribute("data-target")) };
  });

  // progresso do elemento na tela: 0 quando entra por baixo, 1 quando sai por cima
  function progress(top, h) { return clamp((vh - top) / (vh + h), 0, 1); }

  function onScroll() {
    var sy = window.scrollY;
    if (!reduce) {
      par.forEach(function (p) {
        // posição sem a transformação: usa o pai (grade) + offsetTop
        var top = p.el.offsetParent.getBoundingClientRect().top + p.el.offsetTop;
        var t = p.a * (1 - 2 * progress(top, p.el.offsetHeight));
        p.el.style.transform = "translate3d(0," + t.toFixed(1) + "px,0)";
      });
      hpar.forEach(function (p) {
        var r = p.sec.getBoundingClientRect();
        var shift = p.sec.offsetWidth * 0.044;
        var t = p.dir * (-shift + 2 * shift * progress(r.top, r.height));
        p.el.style.transform = "translate3d(" + t.toFixed(1) + "px,0,0)";
      });
      fades.forEach(function (f) {
        var r = f.sec.getBoundingClientRect();
        var pr = progress(r.top, r.height);
        f.el.style.opacity = clamp(1 - 2 * (pr - 0.5), 0, 1).toFixed(3);
      });
    }
    if (btn) {
      var o = clamp((sy - 860) / 640, 0, 1);
      btn.style.opacity = o.toFixed(3);
      btn.classList.toggle("is-visible", o > 0.1);
    }
    var mid = vh / 2, active = null;
    dots.forEach(function (d) {
      var r = d.sec.getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) active = d;
    });
    dots.forEach(function (d) { d.a.classList.toggle("is-active", d === active); });
  }

  var ticking = false;
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); }
  }, { passive: true });
  window.addEventListener("resize", function () { vh = window.innerHeight; onScroll(); });
  onScroll();

  /* Rolagem suave para as âncoras */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var t = document.querySelector(a.getAttribute("href"));
      if (!t) return;
      e.preventDefault();
      window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY, behavior: reduce ? "auto" : "smooth" });
    });
  });
})();
