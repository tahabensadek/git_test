/* ================= PLINKO =================
   16 rows. Each row deflects the ball left/right by half a peg gap;
   the bucket index is the number of right-deflections (binomial). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var ROWS = 16;
  var W = 760, H = 660;
  var PEG_GAP = 40;
  var TOP = 60;
  var DY = (H - TOP - 90) / (ROWS - 1);
  var CX = W / 2;
  var BUCKET_Y = TOP + (ROWS - 1) * DY + 46;

  var TABLES = {
    low:    [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    high:   [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
  };
  var risk = 'medium';

  var canvas = $('plinko-canvas');
  var ctx = canvas.getContext('2d');
  var SCALE = 2; // crisp rendering
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  var balls = [];          // in-flight balls
  var bucketFlash = {};    // bucketIndex -> flash ttl

  function pegPos(row, k) {
    // row r has r+3 pegs centred on the board
    return { x: CX + (k - (row + 2) / 2) * PEG_GAP, y: TOP + row * DY };
  }

  function bucketColor(i) {
    var d = Math.abs(i - 8) / 8;         // 0 centre → 1 edge
    return 'hsl(' + Math.round(48 - d * 48) + ', 92%, 56%)';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // pegs
    for (var r = 0; r < ROWS; r++) {
      for (var k = 0; k < r + 3; k++) {
        var p = pegPos(r, k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b4763';
        ctx.fill();
      }
    }

    // buckets
    var table = TABLES[risk];
    ctx.font = 'bold 12px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < 17; i++) {
      var bx = CX + (i - 8) * PEG_GAP;
      var flash = bucketFlash[i] || 0;
      ctx.fillStyle = bucketColor(i);
      ctx.globalAlpha = flash > 0 ? 1 : 0.88;
      var lift = flash > 0 ? 4 : 0;
      roundRect(bx - PEG_GAP / 2 + 3, BUCKET_Y - 14 + lift, PEG_GAP - 6, 30, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#161307';
      var label = table[i] >= 100 ? table[i].toFixed(0) : table[i] >= 10 ? table[i].toFixed(0) : table[i].toFixed(1);
      ctx.fillText(label + '×', bx, BUCKET_Y + 6 + lift);
      if (flash > 0) bucketFlash[i]--;
    }

    // balls
    balls.forEach(function (b) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
      var g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, 8);
      g.addColorStop(0, '#ffe3a3');
      g.addColorStop(1, '#ff9a1f');
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(255,182,54,.7)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var SEG_MS = 130;
  function animate() {
    var now = performance.now();
    for (var i = balls.length - 1; i >= 0; i--) {
      var b = balls[i];
      var seg = Math.floor((now - b.t0) / SEG_MS);
      var frac = ((now - b.t0) % SEG_MS) / SEG_MS;

      if (seg >= b.path.length - 1) {
        // landed
        var last = b.path[b.path.length - 1];
        b.x = last.x; b.y = last.y;
        land(b);
        balls.splice(i, 1);
        continue;
      }
      var a = b.path[seg], c = b.path[seg + 1];
      b.x = a.x + (c.x - a.x) * frac;
      b.y = a.y + (c.y - a.y) * (frac * frac * 0.7 + frac * 0.3); // gravity-ish ease-in
    }
    draw();
    requestAnimationFrame(animate);
  }

  function land(b) {
    bucketFlash[b.bucket] = 18;
    var m = TABLES[b.risk][b.bucket];
    var profit = Casino.settle('Plinko', b.bet, m);
    Casino.pushRecent('plinko-recent', m + '×', m >= 10 ? 'gold' : m >= 1 ? 'win' : 'lose');
    if (m >= 10) {
      Sound.bigwin();
      Casino.toast('PLINKO ' + m + '× — +' + Casino.fmt(profit) + ' 🔻', 'win');
    } else if (m >= 1) {
      Sound.win();
    } else {
      Sound.lose();
    }
  }

  function drop() {
    var bet = Casino.getBet('plinko-amount');
    if (bet === null) return;
    Casino.debit(bet);
    Sound.bet();

    var bits = PF.floats(ROWS).map(function (f) { return f < 0.5 ? 0 : 1; });
    var bucket = bits.reduce(function (a, b) { return a + b; }, 0);

    // waypoints: start above the board, deflect ±half a gap per row
    var path = [{ x: CX, y: TOP - 40 }];
    var x = CX;
    for (var r = 0; r < ROWS; r++) {
      x += (bits[r] ? 0.5 : -0.5) * PEG_GAP;
      path.push({ x: x, y: TOP + r * DY });
    }
    path.push({ x: CX + (bucket - 8) * PEG_GAP, y: BUCKET_Y - 10 });

    balls.push({ path: path, t0: performance.now(), x: CX, y: TOP - 40, bet: bet, bucket: bucket, risk: risk });
  }

  document.querySelectorAll('#page-plinko [data-risk]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      risk = btn.getAttribute('data-risk');
      document.querySelectorAll('#page-plinko [data-risk]').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      Sound.click();
    });
  });

  $('plinko-drop').addEventListener('click', drop);

  draw();
  requestAnimationFrame(animate);
})();
