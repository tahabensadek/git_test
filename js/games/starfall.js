/* ================= STARFALL =================
   5x3 video slot, 10 paylines, wilds, scatters, free spins.
   Symbol weights 18/17/15/13/10/8/6/5(wild)/4(scatter).
   Paytable tuned by 2M-spin Monte Carlo to 96.1% RTP.
   3+ scatters trigger 8 free spins with all wins doubled; the
   triggering bet and its free spins settle as ONE wager so the
   wallet/ledger stays a strict one-debit-one-settle pipeline. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var SYM = ['🌙', '⭐', '☄️', '🪐', '💎', '👑', '7️⃣', '🌟', '🚀'];
  var WILD = 7, SCAT = 8;
  var WEIGHTS = [18, 17, 15, 13, 10, 8, 6, 5, 4];
  var TOTW = 96;
  var CUM = [];
  (function () { var t = 0; for (var i = 0; i < WEIGHTS.length; i++) { t += WEIGHTS[i]; CUM.push(t); } })();

  // pays[sym][count] as multiples of total bet
  var PAY = [
    [0, 0, 0, 0.4, 1, 3.2],
    [0, 0, 0, 0.5, 1.4, 4],
    [0, 0, 0, 0.6, 1.8, 6],
    [0, 0, 0, 0.9, 2.4, 7.5],
    [0, 0, 0, 1.5, 4, 12],
    [0, 0, 0, 2.6, 7, 25],
    [0, 0, 0, 4.2, 12, 60],
    [0, 0, 0, 5, 18, 120]
  ];
  var SCPAY = { 3: 3, 4: 8, 5: 40 };
  var LINES = [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 1, 1, 0]
  ];
  var FS_SPINS = 8, FS_MULT = 2;

  var st = {
    busy: false,
    fsLeft: 0,      // free spins remaining
    fsTotal: 0,     // accumulated free-spin win (bet multiples)
    trigWin: 0,     // win of the triggering spin
    bet: 0
  };

  /* ---- build the 5x3 machine ---- */
  var grid = $('sf-grid');
  var reels = [];
  for (var r = 0; r < 5; r++) {
    var col = document.createElement('div');
    col.className = 'sf-reel';
    for (var row = 0; row < 3; row++) {
      var cell = document.createElement('div');
      cell.className = 'sf-cell';
      cell.textContent = SYM[Math.floor(Math.random() * 7)];
      col.appendChild(cell);
    }
    grid.appendChild(col);
    reels.push(col);
  }
  function cellAt(reel, row) { return reels[reel].children[row]; }

  function pick(f) {
    var v = f * TOTW;
    for (var i = 0; i < CUM.length; i++) if (v < CUM[i]) return i;
    return CUM.length - 1;
  }

  /* ---- evaluation (mirrors the tuning simulation exactly) ---- */
  function evalGrid(g) {
    var win = 0;
    var hitCells = {};
    for (var li = 0; li < LINES.length; li++) {
      var L = LINES[li];
      var sym = -1, cnt = 0;
      for (var reel = 0; reel < 5; reel++) {
        var s = g[reel * 3 + L[reel]];
        if (s === SCAT) break;
        if (s === WILD) { cnt++; continue; }
        if (sym === -1) { sym = s; cnt++; }
        else if (s === sym) { cnt++; }
        else break;
      }
      if (sym === -1 && cnt > 0) sym = WILD;
      if (cnt >= 3 && sym >= 0) {
        win += PAY[sym][cnt];
        for (var k = 0; k < cnt; k++) hitCells[k + '-' + L[k]] = 1;
      }
    }
    var sc = 0;
    for (var i = 0; i < 15; i++) {
      if (g[i] === SCAT) { sc++; hitCells[Math.floor(i / 3) + '-' + (i % 3)] = 2; }
    }
    if (sc >= 3) win += SCPAY[Math.min(sc, 5)];
    return { win: win, scatters: sc, fs: sc >= 3, hits: hitCells };
  }

  /* ---- one spin (visual) ---- */
  function runSpin(fast, done) {
    var f = PF.floats(15);
    var g = [];
    for (var i = 0; i < 15; i++) g.push(pick(f[i]));

    // scramble + staggered stops
    var timers = [];
    reels.forEach(function (col, ri) {
      col.classList.add('spin');
      timers.push(setInterval(function () {
        for (var row = 0; row < 3; row++) {
          cellAt(ri, row).textContent = SYM[Math.floor(Math.random() * 9)];
        }
      }, 65));
    });

    var baseDelay = fast ? 350 : 550;
    var step = fast ? 130 : 210;
    reels.forEach(function (col, ri) {
      setTimeout(function () {
        clearInterval(timers[ri]);
        for (var row = 0; row < 3; row++) {
          var c = cellAt(ri, row);
          c.textContent = SYM[g[ri * 3 + row]];
          c.classList.remove('hit', 'scat');
        }
        col.classList.remove('spin');
        col.classList.add('lock');
        Sound.tick();
        setTimeout(function () { col.classList.remove('lock'); }, 300);
      }, baseDelay + ri * step);
    });

    setTimeout(function () {
      var res = evalGrid(g);
      // highlight winners
      Object.keys(res.hits).forEach(function (key) {
        var p = key.split('-');
        cellAt(+p[0], +p[1]).classList.add(res.hits[key] === 2 ? 'scat' : 'hit');
      });
      done(res);
    }, baseDelay + 4 * step + 340);
  }

  function setMsg(txt, cls) {
    var el = $('sf-msg');
    el.textContent = txt;
    el.className = 'sf-msg' + (cls ? ' ' + cls : '');
  }

  function showBigWin(amount) {
    var bw = $('sf-bigwin');
    $('sf-bigwin-amt').textContent = '+' + Casino.fmt(amount);
    bw.classList.add('show');
    if (window.FX) FX.bigWin();
    Sound.bigwin();
    setTimeout(function () { bw.classList.remove('show'); }, 2200);
  }

  function renderPanel() {
    $('sf-fsleft').textContent = st.fsLeft;
    $('sf-fstotal').textContent = st.fsLeft > 0 || st.fsTotal > 0
      ? (st.fsTotal * st.bet).toFixed(2) : '—';
  }

  /* ---- flow ---- */
  function spin() {
    if (st.busy) return;
    var bet = Casino.getBet('sf-amount');
    if (bet === null) return;

    st.busy = true;
    st.bet = bet;
    st.fsTotal = 0;
    st.trigWin = 0;
    $('sf-spin').disabled = true;
    Casino.debit(bet);
    Sound.bet();
    setMsg('Spinning…');

    runSpin(false, function (res) {
      st.trigWin = res.win;
      $('sf-lastwin').textContent = res.win > 0 ? (res.win * bet).toFixed(2) : '0.00';

      if (res.fs) {
        // enter free spins — settlement deferred until the feature ends
        st.fsLeft = FS_SPINS;
        $('sf-stage').classList.add('fs-mode');
        $('sf-banner').textContent = '🚀 FREE SPINS — ALL WINS ×2 🚀';
        setMsg(res.scatters + ' scatters! ' + FS_SPINS + ' free spins, wins doubled', 'win');
        Sound.bigwin();
        renderPanel();
        setTimeout(freeSpin, 1600);
      } else {
        finish(res.win);
      }
    });
  }

  function freeSpin() {
    if (st.fsLeft <= 0) { endFeature(); return; }
    st.fsLeft--;
    renderPanel();
    Sound.click();
    runSpin(true, function (res) {
      var w = res.win * FS_MULT;
      st.fsTotal += w;
      if (res.win > 0) {
        Sound.win();
        setMsg('Free spin win: ' + (w * st.bet).toFixed(2) + ' (×2)', 'win');
      } else {
        setMsg(st.fsLeft + ' free spins left…');
      }
      renderPanel();
      setTimeout(freeSpin, res.win > 0 ? 1100 : 650);
    });
  }

  function endFeature() {
    $('sf-stage').classList.remove('fs-mode');
    $('sf-banner').textContent = '⭐ STARFALL ⭐';
    finish(st.trigWin + st.fsTotal);
  }

  function finish(totalMult) {
    var profit = Casino.settle('Starfall', st.bet, totalMult);
    var amount = totalMult * st.bet;
    if (totalMult >= 15) {
      showBigWin(amount);
      setMsg('★ ' + totalMult.toFixed(2) + '× — +' + Casino.fmt(profit) + ' ★', 'win');
    } else if (totalMult > 0) {
      Sound.win();
      setMsg(totalMult.toFixed(2) + '× — you win +' + Casino.fmt(amount), 'win');
    } else {
      Sound.lose();
      setMsg('No win — the stars realign…', 'lose');
    }
    Casino.pushRecent('sf-recent', totalMult.toFixed(1) + '×',
      totalMult >= 15 ? 'gold' : totalMult > 0 ? 'win' : 'lose');
    st.fsTotal = 0;
    st.busy = false;
    $('sf-spin').disabled = false;
    renderPanel();
  }

  $('sf-spin').addEventListener('click', spin);
  renderPanel();
})();
