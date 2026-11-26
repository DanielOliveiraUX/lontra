/* The Mood Swinger — interações e animações (sem dependências) */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    var r = (el.getAttribute("data-blur-range") || "0.2265,0.83").split(",").map(Number);
    return { el: el, by: document.getElementById(el.getAttribute("data-blur-by")), a: r[0], b: r[1], last: -1 };
  });

  // Colagem: movimento, escala e desfoque por rolagem
  // (quadros-chave medidos no site original em 1920×945)
  var collage = [].map.call(document.querySelectorAll("[data-kf]"), function (el) {
    var frames = el.getAttribute("data-kf").split(";").map(function (f) {
      var p = f.split(":"), v = p[1].split(",").map(Number);
      return { y: Number(p[0]), dx: v[0], dy: v[1], s: v[2], b: v[3] };
    });
    return { el: el, f: frames };
  });
  function sample(frames, y) {
    if (y <= frames[0].y) return frames[0];
    var last = frames[frames.length - 1];
    if (y >= last.y) return last;
    for (var i = 1; i < frames.length; i++) {
      if (y <= frames[i].y) {
        var a = frames[i - 1], b = frames[i], t = (y - a.y) / (b.y - a.y);
        return { dx: a.dx + (b.dx - a.dx) * t, dy: a.dy + (b.dy - a.dy) * t,
                 s: a.s + (b.s - a.s) * t, b: a.b + (b.b - a.b) * t };
      }
    }
    return last;
  }

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

  }

  function onScroll() {
    var sy = window.scrollY;

    blurTargets.forEach(function (b) {
      var nextTop = sectionTops[b.by.id];
      var x = sy - (nextTop - vh);
      var amount = reduceMotion ? 0 : 50 * clamp((x - b.a * vh) / ((b.b - b.a) * vh), 0, 1);
      amount = Math.round(amount * 10) / 10;
      if (amount !== b.last) {
        // o original aplica o desfoque duas vezes
        b.el.style.filter = amount > 0 ? "blur(" + amount + "px) blur(" + amount + "px)" : "";
        b.last = amount;
      }
    });

    if (!reduceMotion) {
      var k = vw / 1920, yN = sy * 945 / vh;
      collage.forEach(function (c) {
        var v = sample(c.f, yN);
        c.el.style.transform = "translate3d(" + (v.dx * k).toFixed(1) + "px," + (v.dy * k).toFixed(1) + "px,0) scale(" + v.s.toFixed(4) + ")";
        c.el.style.filter = v.b > 0.05 ? "blur(" + v.b.toFixed(2) + "px) blur(" + v.b.toFixed(2) + "px)" : "";
      });

      slides.forEach(function (s) {
        var row = s.el.parentNode.getBoundingClientRect();
        var start = Math.abs(s.from) / 100 * vw;
        var travelled = 2.2 * Math.max(0, (vh - row.top) - 0.04 * vh) * k;
        var remaining = clamp(start - travelled, 0, start);
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

})();
