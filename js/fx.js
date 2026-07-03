/* ================================================================
   NEBULA Casino — FX layer
   Ambient parallax background, pointer parallax, 3D card tilt,
   coin/confetti bursts, big-win flash, count-up numbers.
   All effects honor prefers-reduced-motion.
   ================================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mouse = { x: 0, y: 0 };      // -1 .. 1 from viewport centre
  var smooth = { x: 0, y: 0 };     // lerped

  window.addEventListener('pointermove', function (e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------------- ambient background: drifting nebula dust ---------------- */
  var bg = document.getElementById('bg-canvas');
  var bctx = bg.getContext('2d');
  var stars = [], orbs = [];

  function sizeBg() {
    bg.width = window.innerWidth;
    bg.height = window.innerHeight;
  }
  window.addEventListener('resize', sizeBg);
  sizeBg();

  (function seed() {
    var i;
    for (i = 0; i < 110; i++) {
      stars.push({
        x: Math.random(), y: Math.random(),
        r: Math.random() * 1.6 + 0.4,
        depth: Math.random() * 0.8 + 0.2,          // parallax factor
        tw: Math.random() * Math.PI * 2,           // twinkle phase
        hue: Math.random() < 0.12 ? 42 : 222       // mostly blue dust, some gold
      });
    }
    for (i = 0; i < 4; i++) {
      orbs.push({
        x: Math.random(), y: Math.random(),
        r: 180 + Math.random() * 160,
        depth: 0.15 + Math.random() * 0.2,
        dx: (Math.random() - 0.5) * 0.00008,
        dy: (Math.random() - 0.5) * 0.00008,
        hue: [222, 265, 42, 200][i]
      });
    }
  })();

  function drawBg(t) {
    var w = bg.width, h = bg.height;
    bctx.clearRect(0, 0, w, h);

    orbs.forEach(function (o) {
      o.x = (o.x + o.dx + 1) % 1;
      o.y = (o.y + o.dy + 1) % 1;
      var px = o.x * w - smooth.x * 40 * o.depth * 4;
      var py = o.y * h - smooth.y * 40 * o.depth * 4;
      var g = bctx.createRadialGradient(px, py, 0, px, py, o.r);
      g.addColorStop(0, 'hsla(' + o.hue + ', 80%, 55%, .05)');
      g.addColorStop(1, 'hsla(' + o.hue + ', 80%, 55%, 0)');
      bctx.fillStyle = g;
      bctx.fillRect(px - o.r, py - o.r, o.r * 2, o.r * 2);
    });

    stars.forEach(function (s) {
      var a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t / 900 + s.tw));
      var px = s.x * w - smooth.x * 26 * s.depth;
      var py = ((s.y + t * 0.0000045 * s.depth) % 1) * h - smooth.y * 26 * s.depth;
      bctx.beginPath();
      bctx.arc(px, py, s.r, 0, Math.PI * 2);
      bctx.fillStyle = 'hsla(' + s.hue + ', 90%, ' + (s.hue === 42 ? 62 : 78) + '%, ' + (a * s.depth) + ')';
      bctx.fill();
    });
  }

  /* ---------------- particle bursts (coins + confetti) ---------------- */
  var fx = document.getElementById('fx-canvas');
  var fctx = fx.getContext('2d');
  var parts = [];

  function sizeFx() {
    fx.width = window.innerWidth;
    fx.height = window.innerHeight;
  }
  window.addEventListener('resize', sizeFx);
  sizeFx();

  var CONF = ['#ffb636', '#ffce6b', '#2bd97c', '#4f8cff', '#ff4d5e', '#b981ff'];

  function burst(x, y, n, big) {
    if (reduced) return;
    for (var i = 0; i < n; i++) {
      var coin = Math.random() < 0.45;
      var a = Math.random() * Math.PI * 2;
      var sp = (big ? 7 : 4.5) * (0.4 + Math.random());
      parts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (big ? 5 : 3),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        size: coin ? 5 + Math.random() * 4 : 3 + Math.random() * 5,
        life: 1,
        decay: 0.008 + Math.random() * 0.008,
        coin: coin,
        color: CONF[Math.floor(Math.random() * CONF.length)]
      });
    }
    if (parts.length > 900) parts.splice(0, parts.length - 900);
  }

  function drawParts() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += 0.16;                       // gravity
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > fx.height + 30) { parts.splice(i, 1); continue; }

      fctx.save();
      fctx.translate(p.x, p.y);
      fctx.rotate(p.rot);
      fctx.globalAlpha = Math.max(p.life, 0);
      if (p.coin) {
        var squish = Math.abs(Math.sin(p.rot * 2));   // fake 3D spin
        fctx.scale(1, 0.35 + 0.65 * squish);
        fctx.beginPath();
        fctx.arc(0, 0, p.size, 0, Math.PI * 2);
        fctx.fillStyle = '#ffb636';
        fctx.fill();
        fctx.beginPath();
        fctx.arc(0, 0, p.size * 0.62, 0, Math.PI * 2);
        fctx.strokeStyle = '#a86e0e';
        fctx.lineWidth = 1.4;
        fctx.stroke();
      } else {
        fctx.fillStyle = p.color;
        fctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      }
      fctx.restore();
    }
  }

  /* ---------------- big-win flash ---------------- */
  function bigWin() {
    if (reduced) return;
    burst(window.innerWidth / 2, window.innerHeight * 0.42, 130, true);
    var flash = document.getElementById('screen-flash');
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');
  }

  /* ---------------- pointer parallax for .plx elements ---------------- */
  var plxEls = [];
  function collectPlx() {
    plxEls = Array.prototype.slice.call(document.querySelectorAll('.plx'));
  }

  function applyPlx() {
    for (var i = 0; i < plxEls.length; i++) {
      var d = parseFloat(plxEls[i].getAttribute('data-depth') || 10);
      plxEls[i].style.transform =
        'translate3d(' + (-smooth.x * d) + 'px,' + (-smooth.y * d) + 'px,0)';
    }
  }

  /* ---------------- 3D tilt for cards ---------------- */
  function tilt(selector) {
    if (reduced) return;
    document.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          'perspective(700px) rotateY(' + (px * 10) + 'deg) rotateX(' + (-py * 10) + 'deg) translateY(-6px) scale(1.03)';
      });
      el.addEventListener('pointerleave', function () {
        el.style.transform = '';
      });
    });
  }

  /* ---------------- count-up numbers ---------------- */
  function countUp(el, from, to, ms, fmt) {
    if (reduced || Math.abs(to - from) < 0.005) {
      el.textContent = fmt(to);
      return;
    }
    var t0 = performance.now();
    (function tick(now) {
      var k = Math.min((now - t0) / ms, 1);
      k = 1 - Math.pow(1 - k, 3); // ease-out cubic
      el.textContent = fmt(from + (to - from) * k);
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ---------------- master loop ---------------- */
  if (!reduced) {
    (function loop(t) {
      smooth.x += (mouse.x - smooth.x) * 0.045;
      smooth.y += (mouse.y - smooth.y) * 0.045;
      drawBg(t || 0);
      drawParts();
      applyPlx();
      requestAnimationFrame(loop);
    })(0);
  } else {
    drawBg(0); // static frame so the page isn't flat black
  }

  window.FX = {
    burst: burst,
    bigWin: bigWin,
    tilt: tilt,
    countUp: countUp,
    collectPlx: collectPlx,
    reduced: reduced
  };
  collectPlx();
})();
