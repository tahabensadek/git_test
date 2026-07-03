/* ================= MINES =================
   5×5 grid. Multiplier after k safe picks with M mines:
   0.99 × Π (25−i)/(25−M−i), i = 0…k−1 (1% edge). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var SIZE = 25;
  var grid = $('mines-grid');
  var st = { active: false, bet: 0, mines: [], revealed: [], gems: 0 };

  // mine-count selector 1..24
  var sel = $('mines-count');
  for (var i = 1; i <= 24; i++) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i + (i === 1 ? ' mine' : ' mines');
    if (i === 3) opt.selected = true;
    sel.appendChild(opt);
  }

  function multAfter(picks, mines) {
    var m = 1;
    for (var i = 0; i < picks; i++) m *= (SIZE - i) / (SIZE - mines - i);
    return Math.floor(m * 0.99 * 100) / 100;
  }

  function buildGrid() {
    grid.innerHTML = '';
    for (var i = 0; i < SIZE; i++) {
      var b = document.createElement('button');
      b.className = 'mtile idle';
      b.dataset.i = i;
      b.disabled = true;
      grid.appendChild(b);
    }
  }

  function renderReadouts() {
    var mines = parseInt(sel.value, 10);
    $('mines-gems').textContent = st.gems;
    $('mines-current').textContent = st.active && st.gems > 0 ? multAfter(st.gems, mines).toFixed(2) + '×' : '—';
    $('mines-next').textContent = st.active ? multAfter(st.gems + 1, mines).toFixed(2) + '×' : '—';
    var co = $('mines-cashout');
    co.disabled = !(st.active && st.gems > 0);
    co.textContent = st.active && st.gems > 0
      ? 'Cashout ' + Casino.fmt(st.bet * multAfter(st.gems, mines))
      : 'Cashout';
  }

  function start() {
    var bet = Casino.getBet('mines-amount');
    if (bet === null) return;
    Casino.debit(bet);
    Sound.bet();

    var mines = parseInt(sel.value, 10);
    // Fisher-Yates over tile indices with provably-fair floats
    var floats = PF.floats(SIZE - 1);
    var idx = [];
    for (var i = 0; i < SIZE; i++) idx.push(i);
    for (i = SIZE - 1; i > 0; i--) {
      var j = Math.floor(floats[SIZE - 1 - i] * (i + 1));
      var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }

    st = { active: true, bet: bet, mines: idx.slice(0, mines), revealed: [], gems: 0 };
    buildGrid();
    grid.querySelectorAll('.mtile').forEach(function (b) {
      b.classList.remove('idle');
      b.disabled = false;
      b.addEventListener('click', onTile);
    });
    $('mines-start').disabled = true;
    sel.disabled = true;
    renderReadouts();
  }

  function onTile(e) {
    if (!st.active) return;
    var b = e.currentTarget;
    var i = parseInt(b.dataset.i, 10);
    if (st.revealed.indexOf(i) !== -1) return;
    st.revealed.push(i);
    b.disabled = true;

    if (st.mines.indexOf(i) !== -1) {
      b.textContent = '💣';
      b.classList.add('boom');
      bust();
    } else {
      b.textContent = '💎';
      b.classList.add('gem');
      st.gems++;
      Sound.reveal();
      var mines = parseInt(sel.value, 10);
      if (st.gems === SIZE - mines) {
        cashout(); // cleared every safe tile — auto cashout
      } else {
        renderReadouts();
      }
    }
  }

  function revealAll() {
    grid.querySelectorAll('.mtile').forEach(function (b) {
      var i = parseInt(b.dataset.i, 10);
      b.disabled = true;
      if (st.revealed.indexOf(i) !== -1) return;
      b.classList.add('dim');
      b.textContent = st.mines.indexOf(i) !== -1 ? '💣' : '💎';
    });
  }

  function endRound() {
    st.active = false;
    $('mines-start').disabled = false;
    sel.disabled = false;
    renderReadouts();
    $('mines-gems').textContent = st.gems;
  }

  function bust() {
    Sound.boom();
    Casino.settle('Mines', st.bet, 0);
    Casino.toast('Boom! 💣 Hit a mine after ' + st.gems + ' gem' + (st.gems === 1 ? '' : 's'), 'lose');
    revealAll();
    endRound();
  }

  function cashout() {
    if (!st.active || st.gems === 0) return;
    var mines = parseInt(sel.value, 10);
    var m = multAfter(st.gems, mines);
    var profit = Casino.settle('Mines', st.bet, m);
    Sound.cashout();
    Casino.toast('Cashed out ' + m.toFixed(2) + '× — +' + Casino.fmt(profit) + ' 💎', 'win');
    revealAll();
    endRound();
  }

  $('mines-start').addEventListener('click', start);
  $('mines-cashout').addEventListener('click', cashout);
  sel.addEventListener('change', function () { Sound.click(); renderReadouts(); });

  buildGrid();
  renderReadouts();
})();
