/* ================================================================
   NEBULA Casino — core engine
   Wallet, provably-fair RNG, persistence, sounds, toasts, nav,
   live-bets feed, stats & bet history.
   ================================================================ */
(function () {
  'use strict';

  var LS_KEY = 'nebula_casino_v1';
  var $ = function (id) { return document.getElementById(id); };

  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.prototype.map.call(arr, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  /* ---------------- persistent state ---------------- */
  var defaults = function () {
    return {
      balance: 1000,
      serverSeed: randomHex(32),
      clientSeed: randomHex(8),
      prevServerSeed: '',
      nonce: 0,
      soundOn: true,
      stats: { wagered: 0, profit: 0, wins: 0, losses: 0, bigWin: 0 },
      history: []
    };
  };

  var state;
  try {
    state = Object.assign(defaults(), JSON.parse(localStorage.getItem(LS_KEY) || '{}'));
    state.stats = Object.assign(defaults().stats, state.stats || {});
  } catch (e) {
    state = defaults();
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  /* ---------------- provably fair RNG ---------------- */
  var PF = {
    // Returns `count` floats in [0,1) for the current nonce, then bumps the nonce.
    floats: function (count) {
      var out = [];
      var block = 0;
      while (out.length < count) {
        var h = sha256hex(state.serverSeed + ':' + state.clientSeed + ':' + state.nonce + ':' + block);
        for (var i = 0; i < 64 && out.length < count; i += 8) {
          out.push(parseInt(h.slice(i, i + 8), 16) / 4294967296);
        }
        block++;
      }
      state.nonce++;
      save();
      PF.renderModal();
      return out;
    },
    float: function () { return PF.floats(1)[0]; },
    rotate: function () {
      state.prevServerSeed = state.serverSeed;
      state.serverSeed = randomHex(32);
      state.nonce = 0;
      save();
      PF.renderModal();
      Casino.toast('Seed pair rotated — previous seed revealed', 'info');
    },
    renderModal: function () {
      if (!$('pf-hash')) return;
      $('pf-hash').value = sha256hex(state.serverSeed);
      $('pf-client').value = state.clientSeed;
      $('pf-nonce').value = state.nonce;
      $('pf-revealed').value = state.prevServerSeed;
    }
  };

  /* ---------------- sound (WebAudio, no assets) ---------------- */
  var Sound = (function () {
    var ctx = null;
    function ac() {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, gain, when, slideTo) {
      var c = ac();
      if (!c || !state.soundOn) return;
      var t0 = c.currentTime + (when || 0);
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.08, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }
    return {
      unlock: ac,
      click: function () { tone(650, 0.06, 'triangle', 0.05); },
      bet: function () { tone(420, 0.09, 'triangle', 0.07); tone(560, 0.09, 'triangle', 0.05, 0.06); },
      tick: function () { tone(880, 0.03, 'square', 0.02); },
      reveal: function () { tone(760, 0.1, 'sine', 0.06); tone(1140, 0.12, 'sine', 0.05, 0.05); },
      win: function () { tone(523, 0.12, 'sine', 0.08); tone(659, 0.12, 'sine', 0.08, 0.09); tone(784, 0.2, 'sine', 0.09, 0.18); },
      bigwin: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.16, 'sine', 0.09, i * 0.08); }); },
      lose: function () { tone(220, 0.25, 'sawtooth', 0.05, 0, 110); },
      boom: function () { tone(90, 0.4, 'sawtooth', 0.12, 0, 40); tone(60, 0.5, 'square', 0.08, 0.02, 30); },
      cashout: function () { tone(880, 0.1, 'triangle', 0.08); tone(1320, 0.18, 'triangle', 0.08, 0.08); },
      flip: function () { for (var i = 0; i < 6; i++) tone(500 + i * 120, 0.05, 'triangle', 0.03, i * 0.12); }
    };
  })();

  /* ---------------- wallet ---------------- */
  function fmt(n) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderBalance() {
    $('balance').textContent = fmt(state.balance);
    var pill = $('balance-pill');
    pill.classList.remove('bump');
    void pill.offsetWidth; // restart animation
    pill.classList.add('bump');
  }

  function getBet(inputId) {
    var el = $(inputId);
    var amt = Math.floor((parseFloat(el.value) || 0) * 100) / 100;
    if (amt <= 0) { Casino.toast('Enter a bet amount', 'lose'); return null; }
    if (amt > state.balance) { Casino.toast('Insufficient balance — hit “+ Add Funds”', 'lose'); return null; }
    el.value = amt.toFixed(2);
    return amt;
  }

  function debit(amt) {
    state.balance = Math.round((state.balance - amt) * 100) / 100;
    save();
    renderBalance();
  }

  function credit(amt) {
    state.balance = Math.round((state.balance + amt) * 100) / 100;
    save();
    renderBalance();
  }

  /* ---------------- stats & history ---------------- */
  function settle(game, bet, mult) {
    // Call once per finished bet. mult 0 = loss; bet was already debited.
    var payout = Math.round(bet * mult * 100) / 100;
    if (payout > 0) credit(payout);
    var profit = Math.round((payout - bet) * 100) / 100;

    state.stats.wagered = Math.round((state.stats.wagered + bet) * 100) / 100;
    state.stats.profit = Math.round((state.stats.profit + profit) * 100) / 100;
    if (profit > 0) {
      state.stats.wins++;
      if (profit > state.stats.bigWin) state.stats.bigWin = profit;
    } else if (profit < 0) {
      state.stats.losses++;
    }
    state.history.unshift({ game: game, bet: bet, mult: mult, profit: profit });
    if (state.history.length > 30) state.history.length = 30;
    save();
    renderStats();
    renderMyBets();
    return profit;
  }

  function renderStats() {
    $('stat-wagered').textContent = fmt(state.stats.wagered);
    var p = $('stat-profit');
    p.textContent = (state.stats.profit >= 0 ? '+' : '') + fmt(state.stats.profit);
    p.className = 'stat-value ' + (state.stats.profit > 0 ? 'pos' : state.stats.profit < 0 ? 'neg' : '');
    $('stat-wl').textContent = state.stats.wins + ' / ' + state.stats.losses;
    $('stat-bigwin').textContent = fmt(state.stats.bigWin);
  }

  function renderMyBets() {
    var tbody = $('my-bets').querySelector('tbody');
    if (!state.history.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No bets yet — go play!</td></tr>';
      return;
    }
    tbody.innerHTML = state.history.slice(0, 10).map(function (h) {
      var cls = h.profit > 0 ? 'pos' : h.profit < 0 ? 'neg' : '';
      var sign = h.profit > 0 ? '+' : '';
      return '<tr><td>' + h.game + '</td><td class="num">' + fmt(h.bet) +
        '</td><td class="num">' + h.mult.toFixed(2) + '×</td><td class="num ' + cls + '">' +
        sign + fmt(h.profit) + '</td></tr>';
    }).join('');
  }

  /* ---------------- toasts ---------------- */
  function toast(msg, type) {
    var box = document.createElement('div');
    box.className = 'toast ' + (type || 'info');
    box.textContent = msg;
    $('toasts').appendChild(box);
    setTimeout(function () {
      box.classList.add('out');
      setTimeout(function () { box.remove(); }, 320);
    }, 3200);
  }

  /* ---------------- navigation ---------------- */
  var pageTitles = {
    home: 'Home', dice: 'Dice', crash: 'Crash', mines: 'Mines',
    plinko: 'Plinko', roulette: 'Roulette', blackjack: 'Blackjack', coinflip: 'Coinflip'
  };
  var pageListeners = {};

  function showPage(name) {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var page = $('page-' + name);
    if (!page) return;
    page.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-nav') === name);
    });
    $('page-title').textContent = pageTitles[name] || name;
    (pageListeners[name] || []).forEach(function (fn) { fn(); });
  }

  document.addEventListener('click', function (e) {
    var nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      Sound.click();
      showPage(nav.getAttribute('data-nav'));
    }
  });

  /* ---------------- shared bet controls (½ / 2×) ---------------- */
  document.querySelectorAll('.amount-row').forEach(function (row) {
    var input = row.querySelector('input');
    var half = row.querySelector('[data-half]');
    var dbl = row.querySelector('[data-double]');
    function set(v) {
      v = Math.max(0, Math.floor(v * 100) / 100);
      input.value = v.toFixed(2);
    }
    if (half) half.addEventListener('click', function () { Sound.click(); set((parseFloat(input.value) || 0) / 2); });
    if (dbl) dbl.addEventListener('click', function () {
      Sound.click();
      set(Math.min((parseFloat(input.value) || 0) * 2 || 1, state.balance));
    });
  });

  /* ---------------- fake live-bets feed ---------------- */
  var feedNames = ['Zephyr', 'Moonshot', 'kroko77', 'DegenKing', 'Aria', 'pixelpusha', 'NoRisk',
    'BigSlick', 'Juno', 'Frostbyte', 'ladyluck', 'Havoc', 'Rex', 'mistral', 'GoldRush9', 'sn0wman'];
  var feedGames = ['Dice', 'Crash', 'Mines', 'Plinko', 'Roulette', 'Blackjack', 'Coinflip'];

  function liveFeedTick() {
    var tbody = $('live-bets').querySelector('tbody');
    var name = feedNames[Math.floor(Math.random() * feedNames.length)];
    var game = feedGames[Math.floor(Math.random() * feedGames.length)];
    var bet = Math.round((Math.random() * Math.random() * 500 + 1) * 100) / 100;
    var won = Math.random() < 0.44;
    var mult = 0;
    if (won) {
      var r = Math.random();
      mult = r < 0.8 ? 1 + Math.random() * 2.5 : r < 0.97 ? 3 + Math.random() * 12 : 20 + Math.random() * 200;
      mult = Math.round(mult * 100) / 100;
    }
    var payout = Math.round(bet * mult * 100) / 100;
    var tr = document.createElement('tr');
    tr.className = 'flash-in';
    tr.innerHTML = '<td>' + name + '</td><td>' + game + '</td><td class="num">' + fmt(bet) +
      '</td><td class="num ' + (won ? 'pos' : 'neg') + '">' + mult.toFixed(2) + '×</td>' +
      '<td class="num ' + (won ? 'pos' : 'neg') + '">' + (won ? fmt(payout) : '0.00') + '</td>';
    tbody.insertBefore(tr, tbody.firstChild);
    while (tbody.children.length > 9) tbody.removeChild(tbody.lastChild);
  }

  /* ---------------- recent-result chips helper ---------------- */
  function pushRecent(containerId, label, cls) {
    var box = $(containerId);
    if (!box) return;
    var chip = document.createElement('span');
    chip.className = 'rchip ' + cls;
    chip.textContent = label;
    box.insertBefore(chip, box.firstChild);
    while (box.children.length > 8) box.removeChild(box.lastChild);
  }

  /* ---------------- topbar & modal wiring ---------------- */
  $('btn-faucet').addEventListener('click', function () {
    Sound.cashout();
    credit(1000);
    toast('+1,000.00 demo credits added 🪙', 'win');
  });

  $('btn-sound').addEventListener('click', function () {
    state.soundOn = !state.soundOn;
    save();
    $('btn-sound').classList.toggle('muted', !state.soundOn);
    if (state.soundOn) Sound.click();
  });
  $('btn-sound').classList.toggle('muted', !state.soundOn);

  $('btn-fairness').addEventListener('click', function () {
    PF.renderModal();
    $('modal-fairness').classList.add('open');
  });
  document.querySelectorAll('.modal-close').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('.modal-backdrop').classList.remove('open'); });
  });
  document.querySelectorAll('.modal-backdrop').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('open'); });
  });

  $('pf-rotate').addEventListener('click', function () { Sound.reveal(); PF.rotate(); });
  $('pf-client').addEventListener('change', function () {
    var v = $('pf-client').value.replace(/[^\x20-\x7e]/g, '').trim() || randomHex(8);
    state.clientSeed = v;
    state.nonce = 0;
    save();
    PF.renderModal();
    toast('Client seed updated', 'info');
  });
  $('pf-reset').addEventListener('click', function () {
    state.balance = 1000;
    state.stats = { wagered: 0, profit: 0, wins: 0, losses: 0, bigWin: 0 };
    state.history = [];
    save();
    renderBalance();
    renderStats();
    renderMyBets();
    toast('Bankroll reset to 1,000.00', 'info');
  });

  // Unlock audio on first interaction (browser autoplay policy).
  document.addEventListener('pointerdown', function once() {
    Sound.unlock();
    document.removeEventListener('pointerdown', once);
  });

  /* ---------------- public API ---------------- */
  window.Casino = {
    state: state,
    fmt: fmt,
    getBet: getBet,
    debit: debit,
    credit: credit,
    settle: settle,
    toast: toast,
    pushRecent: pushRecent,
    showPage: showPage,
    onPageShow: function (name, fn) {
      (pageListeners[name] = pageListeners[name] || []).push(fn);
    },
    save: save
  };
  window.PF = PF;
  window.Sound = Sound;

  /* ---------------- boot ---------------- */
  renderBalance();
  renderStats();
  renderMyBets();
  PF.renderModal();
  for (var i = 0; i < 6; i++) liveFeedTick();
  setInterval(liveFeedTick, 2600);
})();
