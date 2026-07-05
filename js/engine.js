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
      history: [],
      xp: 0,
      streak: 0,
      played: {},
      ach: {},
      lastBonus: 0
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
    lastNonce: 0,
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
      PF.lastNonce = state.nonce;
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

  var shownBalance = state.balance;
  function renderBalance() {
    var el = $('balance');
    if (window.FX) {
      FX.countUp(el, shownBalance, state.balance, 450, fmt);
    } else {
      el.textContent = fmt(state.balance);
    }
    shownBalance = state.balance;
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
    state.history.unshift({ game: game, bet: bet, mult: mult, profit: profit, nonce: PF.lastNonce });
    if (state.history.length > 30) state.history.length = 30;

    // progression: XP from wagers, streaks, achievements
    state.xp = Math.round((state.xp + bet) * 100) / 100;
    state.played[game] = 1;
    if (profit > 0) state.streak++;
    else if (profit < 0) state.streak = 0;
    checkAchievements(mult);
    renderRank();

    save();
    renderStats();
    renderMyBets();

    if (window.FX && profit > 0) {
      var pill = $('balance-pill').getBoundingClientRect();
      if (mult >= 10) {
        FX.bigWin();
      } else {
        FX.burst(pill.left + pill.width / 2, pill.bottom + 6, mult >= 3 ? 46 : 22);
      }
    }
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
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No bets yet — go play!</td></tr>';
      return;
    }
    tbody.innerHTML = state.history.slice(0, 10).map(function (h) {
      var cls = h.profit > 0 ? 'pos' : h.profit < 0 ? 'neg' : '';
      var sign = h.profit > 0 ? '+' : '';
      return '<tr><td>' + h.game + '</td><td class="num">' + fmt(h.bet) +
        '</td><td class="num">' + h.mult.toFixed(2) + '×</td><td class="num ' + cls + '">' +
        sign + fmt(h.profit) + '</td><td class="num" title="Verify with your seeds + this nonce">' +
        (h.nonce != null ? '#' + h.nonce : '—') + '</td></tr>';
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
    plinko: 'Plinko', roulette: 'Roulette', blackjack: 'Blackjack', coinflip: 'Coinflip',
    slots: 'Slots', limbo: 'Limbo', starfall: 'Starfall'
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
    var max = row.querySelector('[data-max]');
    if (max) max.addEventListener('click', function () { Sound.click(); set(state.balance); });
  });

  /* ---------------- fake live-bets feed ---------------- */
  var feedNames = ['Zephyr', 'Moonshot', 'kroko77', 'DegenKing', 'Aria', 'pixelpusha', 'NoRisk',
    'BigSlick', 'Juno', 'Frostbyte', 'ladyluck', 'Havoc', 'Rex', 'mistral', 'GoldRush9', 'sn0wman'];
  var feedGames = ['Dice', 'Crash', 'Mines', 'Plinko', 'Roulette', 'Blackjack', 'Coinflip', 'Slots', 'Limbo', 'Starfall'];

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

  /* ---------------- XP, ranks & level-ups ---------------- */
  var RANKS = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Nebula'];
  function levelInfo() {
    var lvl = Math.floor(Math.sqrt(state.xp / 150));
    var cur = 150 * lvl * lvl;
    var next = 150 * (lvl + 1) * (lvl + 1);
    return {
      lvl: lvl,
      rank: RANKS[Math.min(lvl, RANKS.length - 1)],
      pct: Math.min(100, ((state.xp - cur) / (next - cur)) * 100),
      toNext: Math.max(0, next - state.xp)
    };
  }
  var lastLvl = levelInfo().lvl;
  function renderRank() {
    var info = levelInfo();
    if (!$('rank-name')) return;
    $('rank-name').textContent = info.rank;
    $('rank-lvl').textContent = 'LVL ' + info.lvl;
    $('rank-fill').style.width = info.pct + '%';
    $('rank-sub').textContent = Math.ceil(info.toNext).toLocaleString('en-US') + ' XP to next level';
    if (info.lvl > lastLvl) {
      lastLvl = info.lvl;
      Sound.bigwin();
      if (window.FX) FX.bigWin();
      toast('⬆️ LEVEL UP — ' + info.rank + ' · LVL ' + info.lvl, 'win');
    }
  }

  /* ---------------- achievements ---------------- */
  var ACH = [
    { id: 'first_bet', icon: '🎯', name: 'First Blood', desc: 'Place your first bet' },
    { id: 'first_win', icon: '🥇', name: 'Winner Winner', desc: 'Win a bet' },
    { id: 'x10', icon: '🚀', name: 'To the Moon', desc: 'Hit a 10× win' },
    { id: 'x50', icon: '💎', name: 'Diamond Hands', desc: 'Hit a 50× win' },
    { id: 'jackpot', icon: '🌌', name: 'Nebula Jackpot', desc: 'Hit a 100× win' },
    { id: 'streak5', icon: '🔥', name: 'On Fire', desc: 'Win 5 bets in a row' },
    { id: 'wager1k', icon: '💰', name: 'High Roller', desc: 'Wager 1,000 total' },
    { id: 'wager10k', icon: '👑', name: 'Whale', desc: 'Wager 10,000 total' },
    { id: 'allgames', icon: '🃏', name: 'Tourist', desc: 'Play all 10 originals' },
    { id: 'rich5k', icon: '🏦', name: 'Vault Filler', desc: 'Hold a 5,000 balance' }
  ];
  function unlock(id) {
    if (state.ach[id]) return;
    state.ach[id] = 1;
    var def = null;
    for (var i = 0; i < ACH.length; i++) if (ACH[i].id === id) def = ACH[i];
    if (def) toast('🏅 Achievement — ' + def.name + ': ' + def.desc, 'win');
    Sound.reveal();
    save();
    renderAch();
  }
  function checkAchievements(mult) {
    if (state.stats.wagered > 0) unlock('first_bet');
    if (state.stats.wins > 0) unlock('first_win');
    if (mult >= 10) unlock('x10');
    if (mult >= 50) unlock('x50');
    if (mult >= 100) unlock('jackpot');
    if (state.streak >= 5) unlock('streak5');
    if (state.stats.wagered >= 1000) unlock('wager1k');
    if (state.stats.wagered >= 10000) unlock('wager10k');
    if (Object.keys(state.played).length >= 10) unlock('allgames');
    if (state.balance >= 5000) unlock('rich5k');
  }
  function renderAch() {
    var grid = $('ach-grid');
    if (!grid) return;
    grid.innerHTML = ACH.map(function (a) {
      var got = !!state.ach[a.id];
      return '<div class="ach' + (got ? ' got' : '') + '" title="' + a.desc + '">' +
        '<span class="ach-icon">' + a.icon + '</span>' +
        '<span class="ach-name">' + a.name + '</span>' +
        '<span class="ach-desc">' + a.desc + '</span></div>';
    }).join('');
  }

  /* ---------------- bonus wheel ---------------- */
  var BONUS_CD = 3600 * 1000; // one free spin per hour
  var BONUS_PRIZES = [50, 100, 25, 250, 75, 150, 40, 500];
  var bonusSpinning = false;
  var bwheelBase = 0;

  function bonusReady() { return Date.now() - (state.lastBonus || 0) >= BONUS_CD; }

  function renderBonusState() {
    var dot = $('bonus-dot');
    if (dot) dot.classList.toggle('on', bonusReady());
    var cd = $('bonus-cd');
    var btn = $('bonus-spin');
    if (!cd || !btn) return;
    if (bonusSpinning) return;
    if (bonusReady()) {
      btn.disabled = false;
      cd.textContent = 'One free spin every hour — good luck!';
    } else {
      btn.disabled = true;
      var mins = Math.ceil((BONUS_CD - (Date.now() - state.lastBonus)) / 60000);
      cd.textContent = 'Next free spin in ' + mins + ' min';
    }
  }

  function spinBonus() {
    if (bonusSpinning || !bonusReady()) return;
    bonusSpinning = true;
    $('bonus-spin').disabled = true;
    Sound.bet();

    var idx = Math.floor(PF.float() * 8);
    var prize = BONUS_PRIZES[idx];
    var wheel = $('bwheel');
    // reset to current angle without transition, then ease out to target
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(' + (bwheelBase % 360) + 'deg)';
    void wheel.offsetWidth;
    var target = (bwheelBase % 360) + 5 * 360 + (360 - (idx * 45 + 22.5)) - (bwheelBase % 360);
    bwheelBase = target;
    wheel.style.transition = 'transform 4.2s cubic-bezier(.12, .7, .12, 1)';
    wheel.style.transform = 'rotate(' + target + 'deg)';

    var ticks = 0;
    var tt = setInterval(function () { Sound.tick(); if (++ticks > 24) clearInterval(tt); }, 140);

    setTimeout(function () {
      clearInterval(tt);
      state.lastBonus = Date.now();
      credit(prize);
      save();
      Sound.bigwin();
      if (window.FX) {
        var r = wheel.getBoundingClientRect();
        FX.burst(r.left + r.width / 2, r.top + r.height / 2, 60, true);
      }
      toast('🎁 Bonus spin — +' + fmt(prize) + '!', 'win');
      bonusSpinning = false;
      renderBonusState();
    }, 4400);
  }

  function openBonus() {
    renderBonusState();
    $('modal-bonus').classList.add('open');
  }

  if ($('btn-bonus')) $('btn-bonus').addEventListener('click', openBonus);
  if ($('bonus-spin')) $('bonus-spin').addEventListener('click', spinBonus);
  if ($('promo-bonus')) $('promo-bonus').addEventListener('click', openBonus);
  if ($('promo-pf')) $('promo-pf').addEventListener('click', function () { PF.renderModal(); $('modal-fairness').classList.add('open'); });
  if ($('promo-ach')) $('promo-ach').addEventListener('click', function () {
    var el = $('ach-title');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  if ($('foot-pf')) $('foot-pf').addEventListener('click', function (e) { e.preventDefault(); PF.renderModal(); $('modal-fairness').classList.add('open'); });

  /* ---------------- win ticker & payout odometer ---------------- */
  function buildTicker() {
    var track = $('ticker-track');
    if (!track) return;
    var items = [];
    for (var i = 0; i < 14; i++) {
      var name = feedNames[Math.floor(Math.random() * feedNames.length)];
      var game = feedGames[Math.floor(Math.random() * feedGames.length)];
      var amt = Math.round((Math.random() * Math.random() * 4000 + 20) * 100) / 100;
      items.push('<span class="tick-item">🏆 <b>' + name + '</b> won <em>' + fmt(amt) + '</em> on ' + game + '</span>');
    }
    // duplicate for a seamless marquee loop
    track.innerHTML = items.join('') + items.join('');
  }

  var payoutTotal = 8431220 + Math.floor(Math.random() * 90000);
  function payoutTick() {
    var el = $('payout-odometer');
    if (!el) return;
    var next = payoutTotal + Math.floor(80 + Math.random() * 1800);
    if (window.FX) {
      FX.countUp(el, payoutTotal, next, 900, function (n) {
        return Math.floor(n).toLocaleString('en-US');
      });
    } else {
      el.textContent = next.toLocaleString('en-US');
    }
    payoutTotal = next;
  }

  /* ---------------- boot ---------------- */
  renderBalance();
  renderStats();
  renderMyBets();
  renderRank();
  renderAch();
  renderBonusState();
  setInterval(renderBonusState, 30000);
  PF.renderModal();
  buildTicker();
  payoutTick();
  setInterval(payoutTick, 2100);
  for (var i = 0; i < 6; i++) liveFeedTick();
  setInterval(liveFeedTick, 2600);
  if (window.FX) {
    FX.tilt('.game-card');
    FX.collectPlx();
  }
})();
