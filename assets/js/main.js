/* The Mood Swinger — interações e animações (sem dependências) */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  /* ---------- Entrada (foto do hero) ---------- */
  function markLoaded() { document.documentElement.classList.add("is-loaded"); }
  if (document.readyState === "complete") markLoaded();
  else window.addEventListener("load", markLoaded);

  /* ---------- Menu mobile ---------- */
  var toggle = document.querySelector(".menu-toggle");
  var menu = document.getElementById("mobile-menu");
  if (toggle && menu) {
    var close = menu.querySelector(".mobile-menu__close");
    var open = function () {
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      close.focus();
    };
    var shut = function () {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };
    toggle.addEventListener("click", open);
    close.addEventListener("click", function () { shut(); toggle.focus(); });
    menu.querySelectorAll("nav a").forEach(function (a) { a.addEventListener("click", shut); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") shut(); });
  }

  /* ---------- Galeria (página WORK) ---------- */
  var scroller = document.querySelector(".gallery__scroller");
  if (scroller) {
    var items = scroller.querySelectorAll(".gallery__item");
    var prev = document.querySelector(".gallery__btn--prev");
    var next = document.querySelector(".gallery__btn--next");

    if ("IntersectionObserver" in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) en.target.classList.add("is-visible");
        });
      }, { root: scroller, threshold: 0.15 });
      items.forEach(function (it) { io.observe(it); });
    } else {
      items.forEach(function (it) { it.classList.add("is-visible"); });
    }

    var step = function () { return Math.max(200, scroller.clientWidth * 0.5); };
    var updateBtns = function () {
      var max = scroller.scrollWidth - scroller.clientWidth - 2;
      prev.hidden = scroller.scrollLeft <= 2;
      next.hidden = scroller.scrollLeft >= max;
    };
    prev.addEventListener("click", function () { scroller.scrollBy({ left: -step() }); });
    next.addEventListener("click", function () { scroller.scrollBy({ left: step() }); });
    scroller.addEventListener("scroll", updateBtns, { passive: true });
    window.addEventListener("resize", updateBtns);
    updateBtns();
  }

  /* ---------- Página inicial ---------- */
  if (!document.body.classList.contains("page-home")) return;

  var vh = window.innerHeight, vw = window.innerWidth;
  var docTop = function (el) {
    var y = 0;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  };

  // Desfoque das seções que ficam por baixo (hero → projects → about)
  var blurTargets = [].map.call(document.querySelectorAll("[data-blur-by]"), function (el) {
    return { el: el, by: document.getElementById(el.getAttribute("data-blur-by")), last: -1 };
  });

  // Parallax interno das fotos da colagem
  var parallax = [].map.call(document.querySelectorAll("[data-parallax]"), function (el) {
    var p = el.getAttribute("data-parallax").split(",").map(Number);
    return { el: el, k: p[0], zero: p[1], min: p[2], top: 0 };
  });

  // Serviços entrando pelas laterais
  var slides = [].map.call(document.querySelectorAll("[data-slide]"), function (el) {
    return { el: el, from: Number(el.getAttribute("data-slide")) };
  });

  // Seção ativa no menu
  var navLinks = {};
  document.querySelectorAll(".site-nav [data-nav]").forEach(function (a) { navLinks[a.getAttribute("data-nav")] = a; });
  var navSections = [].map.call(document.querySelectorAll("[data-nav-section]"), function (s) {
    return { key: s.getAttribute("data-nav-section"), el: s };
  });

  // Posições "naturais" (sem sticky) — os marcadores .anchor ficam no fluxo normal
  var sectionTops = {};
  function measure() {
    vh = window.innerHeight; vw = window.innerWidth;
    var y = 0;
    document.querySelectorAll("main > section, main > .anchor").forEach(function (s) {
      if (s.classList.contains("anchor")) return;
      sectionTops[s.id] = y;
      y += s.offsetHeight;
    });
    parallax.forEach(function (p) {
      var sec = p.el.closest("section");
      p.top = sectionTops[sec.id] + p.el.parentNode.offsetTop;
    });
  }

  function onScroll() {
    var sy = window.scrollY;

    blurTargets.forEach(function (b) {
      var nextTop = sectionTops[b.by.id];
      var x = sy - (nextTop - vh);
      var amount = reduceMotion ? 0 : 50 * clamp((x - 0.213 * vh) / (0.548 * vh), 0, 1);
      amount = Math.round(amount * 10) / 10;
      if (amount !== b.last) {
        b.el.style.filter = amount > 0 ? "blur(" + amount + "px)" : "";
        b.last = amount;
      }
    });

    if (!reduceMotion) {
      parallax.forEach(function (p) {
        var t = Math.max(p.min * vh, p.k * (sy - (p.top + p.zero * vh)));
        p.el.style.transform = "translate3d(0," + t.toFixed(1) + "px,0)";
      });

      var speed = 2.1 * vw / 1920;
      slides.forEach(function (s) {
        var row = s.el.parentNode.getBoundingClientRect();
        var start = Math.abs(s.from) / 100 * vw;
        var remaining = Math.max(0, start - speed * (vh - row.top) * (1920 / vw));
        var off = (s.from < 0 ? -1 : 1) * remaining;
        s.el.style.transform = off ? "translate3d(" + off.toFixed(1) + "px,0,0)" : "";
      });
    }

    var active = "";
    navSections.forEach(function (n) {
      var top = sectionTops[n.el.id];
      if (sy >= top - vh * 0.5) active = n.key;
    });
    if (sy >= sectionTops["instagram"] - vh * 0.5) active = "";
    Object.keys(navLinks).forEach(function (k) { navLinks[k].classList.toggle("is-active", k === active); });
  }

  var ticking = false;
  function requestTick() {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); }
  }

  measure();
  onScroll();
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", function () { measure(); requestTick(); });
  window.addEventListener("load", function () { measure(); requestTick(); });

  // Âncoras (#about / #services) com seções sticky
  document.querySelectorAll('a[href$="#about"], a[href$="#services"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href").split("#")[1];
      var key = id === "about" ? "about-section" : id;
      if (sectionTops[key] === undefined) return;
      e.preventDefault();
      window.scrollTo({ top: sectionTops[key], behavior: reduceMotion ? "auto" : "smooth" });
      history.replaceState(null, "", "#" + id);
    });
  });
  if (location.hash === "#about" || location.hash === "#services") {
    window.addEventListener("load", function () {
      var key = location.hash === "#about" ? "about-section" : "services";
      window.scrollTo(0, sectionTops[key]);
    });
  }

  /* ---------- Efeitos de mouse na colagem ---------- */
  if (reduceMotion) return;
  var collage = [].map.call(document.querySelectorAll(".collage[data-effect]"), function (el) {
    var o = { el: el, type: el.getAttribute("data-effect"), cur: { x: 0, y: 0, s: 0, b: 0, rx: 0, ry: 0 } };
    if (o.type === "track") o.amp = Number(el.getAttribute("data-amp"));
    else {
      var d = el.getAttribute("data-depth").split(",").map(Number);
      o.smin = d[0]; o.smax = d[1]; o.bmin = d[2]; o.bmax = d[3]; o.tx = d[4];
    }
    return o;
  });
  if (!collage.length) return;

  var mouse = { x: vw / 2, y: vh / 2 };
  if (finePointer) {
    window.addEventListener("mousemove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  }

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  (function frame() {
    var scale = vw / 1920;
    collage.forEach(function (o) {
      var r = o.el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      // centro sem a transformação atual
      var cx = r.left + r.width / 2 - o.cur.x;
      var cy = r.top + r.height / 2 - o.cur.y;
      var dx = mouse.x - cx, dy = mouse.y - cy;
      var c = o.cur;
      if (o.type === "track") {
        var tx = clamp(dx / (vw / 2), -1, 1) * o.amp * scale;
        var ty = clamp(dy / (vh / 2), -1, 1) * o.amp * scale;
        c.x = lerp(c.x, tx, 0.06); c.y = lerp(c.y, ty, 0.06);
        o.el.style.transform = "translate3d(" + c.x.toFixed(2) + "px," + c.y.toFixed(2) + "px,0)";
      } else {
        var dist = Math.sqrt(dx * dx + dy * dy);
        var f = clamp(dist / (vw * 0.5), 0, 1);
        var s = o.smax - (o.smax - o.smin) * f;
        var b = o.bmin + (o.bmax - o.bmin) * f;
        var rx = clamp(-dy / vh, -1, 1) * 4;
        var ry = clamp(dx / vw, -1, 1) * 4;
        if (!c.s) { c.s = s; c.b = b; }
        c.s = lerp(c.s, s, 0.06); c.b = lerp(c.b, b, 0.06);
        c.rx = lerp(c.rx, rx, 0.06); c.ry = lerp(c.ry, ry, 0.06);
        o.el.style.transform = "perspective(600px) translate3d(" + (o.tx * scale).toFixed(2) + "px,0,0) rotateX(" +
          c.rx.toFixed(2) + "deg) rotateY(" + c.ry.toFixed(2) + "deg) scale(" + c.s.toFixed(4) + ")";
        o.el.style.filter = "blur(" + c.b.toFixed(2) + "px)";
      }
    });
    requestAnimationFrame(frame);
  })();
})();
