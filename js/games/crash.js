/* ================= CRASH =================
   Crash point = max(1.00, 0.99 / (1 - r)) capped at 5000×.
   Multiplier grows exponentially; cash out before the crash. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('crash-canvas');
  var ctx = canvas.getContext('2d');
  var GROWTH = 0.14; // per-second exponent: 2× ≈ 5s, 10× ≈ 16.5s

  var st = {
    phase: 'idle', // idle | flying | crashed
    bet: 0,
    cashedAt: 0,
    crashPoint: 0,
    t0: 0,
    mult: 1,
    samples: []
  };

  function crashPointFromFloat(r) {
    var cp = 0.99 / (1 - r);
    cp = Math.floor(cp * 100) / 100;
    return Math.min(Math.max(cp, 1), 5000);
  }

  function sizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', sizeCanvas);
  Casino.onPageShow('crash', sizeCanvas);

  function draw() {
    var rect = canvas.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);

    var pad = { l: 46, r: 18, t: 18, b: 30 };
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;

    var tNow = st.samples.length ? st.samples[st.samples.length - 1].t : 0;
    var tMax = Math.max(8, tNow * 1.12);
    var mMax = Math.max(2, st.mult * 1.25);

    // grid + y labels
    ctx.strokeStyle = 'rgba(48,58,84,.4)';
    ctx.fillStyle = '#5d6579';
    ctx.font = '11px "JetBrains Mono", Consolas, monospace';
    ctx.lineWidth = 1;
    var ySteps = 4;
    for (var i = 0; i <= ySteps; i++) {
      var m = 1 + (mMax - 1) * (i / ySteps);
      var y = pad.t + ih - ih * (i / ySteps);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
      ctx.fillText(m.toFixed(1) + '×', 8, y + 4);
    }
    var xSteps = 4;
    for (i = 0; i <= xSteps; i++) {
      var t = tMax * (i / xSteps);
      var x = pad.l + iw * (i / xSteps);
      ctx.fillText(t.toFixed(0) + 's', x - 8, h - 10);
    }

    if (st.samples.length > 1) {
      var toX = function (t) { return pad.l + (t / tMax) * iw; };
      var toY = function (m) { return pad.t + ih - ((m - 1) / (mMax - 1)) * ih; };

      var crashed = st.phase === 'crashed';
      var lineColor = crashed ? '#ff4d5e' : '#2bd97c';

      // area fill under the curve
      ctx.beginPath();
      ctx.moveTo(toX(st.samples[0].t), toY(1));
      st.samples.forEach(function (s) { ctx.lineTo(toX(s.t), toY(s.m)); });
      var last = st.samples[st.samples.length - 1];
      ctx.lineTo(toX(last.t), toY(1));
      ctx.closePath();
      var grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
      grad.addColorStop(0, crashed ? 'rgba(255,77,94,.28)' : 'rgba(43,217,124,.28)');
      grad.addColorStop(1, 'rgba(43,217,124,0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // the curve itself
      ctx.beginPath();
      st.samples.forEach(function (s, idx) {
        idx ? ctx.lineTo(toX(s.t), toY(s.m)) : ctx.moveTo(toX(s.t), toY(s.m));
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // rocket head
      ctx.beginPath();
      ctx.arc(toX(last.t), toY(last.m), 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  function setStatus(txt) { $('crash-status').textContent = txt; }
  function setMult(m, cls) {
    var el = $('crash-mult');
    el.textContent = m.toFixed(2) + '×';
    el.className = 'crash-mult' + (cls ? ' ' + cls : '');
  }

  var raf = null;
  function frame() {
    if (st.phase !== 'flying') return;
    var t = (performance.now() - st.t0) / 1000;
    st.mult = Math.min(Math.exp(GROWTH * t), st.crashPoint);
    st.samples.push({ t: t, m: st.mult });
    if (st.samples.length > 900) st.samples.splice(0, st.samples.length - 900);

    if (st.mult >= st.crashPoint) {
      crash();
      return;
    }

    if (!st.cashedAt) {
      setMult(st.mult, 'flying');
      $('crash-cashout').textContent = 'Cashout ' + Casino.fmt(st.bet * st.mult);
      var auto = parseFloat($('crash-auto').value) || 0;
      if (auto >= 1.01 && st.mult >= auto) cashout();
    } else {
      setMult(st.mult, 'cashed');
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function cashout() {
    if (st.phase !== 'flying' || st.cashedAt) return;
    st.cashedAt = st.mult;
    var m = Math.floor(st.mult * 100) / 100;
    var profit = Casino.settle('Crash', st.bet, m);
    Sound.cashout();
    Casino.toast('Cashed out at ' + m.toFixed(2) + '× — +' + Casino.fmt(profit) + ' 🚀', 'win');
    setStatus('Cashed out at ' + m.toFixed(2) + '× — riding it out…');
    $('crash-cashout').disabled = true;
  }

  function crash() {
    st.phase = 'crashed';
    st.mult = st.crashPoint;
    setMult(st.crashPoint, 'crashed');
    draw();
    Sound.boom();

    if (!st.cashedAt) {
      Casino.settle('Crash', st.bet, 0);
      setStatus('💥 Crashed at ' + st.crashPoint.toFixed(2) + '× — bet lost');
    } else {
      setStatus('💥 Crashed at ' + st.crashPoint.toFixed(2) + '× — you got out at ' + st.cashedAt.toFixed(2) + '×');
    }
    Casino.pushRecent('crash-recent', st.crashPoint.toFixed(2) + '×', st.crashPoint >= 2 ? 'win' : 'lose');

    $('crash-cashout').disabled = true;
    $('crash-cashout').textContent = 'Cashout';
    setTimeout(function () {
      if (st.phase === 'crashed') {
        st.phase = 'idle';
        $('crash-bet').disabled = false;
        setStatus('Place a bet to launch 🚀');
      }
    }, 1800);
  }

  $('crash-bet').addEventListener('click', function () {
    if (st.phase === 'flying') return;
    var bet = Casino.getBet('crash-amount');
    if (bet === null) return;

    Casino.debit(bet);
    Sound.bet();
    sizeCanvas();

    st = {
      phase: 'flying', bet: bet, cashedAt: 0,
      crashPoint: crashPointFromFloat(PF.float()),
      t0: performance.now(), mult: 1, samples: [{ t: 0, m: 1 }]
    };
    $('crash-bet').disabled = true;
    $('crash-cashout').disabled = false;
    setStatus('Flying — cash out before it crashes!');
    setMult(1, 'flying');
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  });

  $('crash-cashout').addEventListener('click', cashout);

  sizeCanvas();
  draw();
})();
