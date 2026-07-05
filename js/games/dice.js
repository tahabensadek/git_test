/* ================= DICE =================
   Roll a number in [0,100). Roll Under wins if roll < target,
   Roll Over wins if roll > target. Payout = 99 / winChance (1% edge).
   Supports Auto mode: N rolls, on-win/on-loss bet adjustment,
   stop-on-profit / stop-on-loss, normal/turbo speed. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var slider = $('dice-slider');
  var under = true;
  var rolling = false;

  var auto = {
    on: false,        // auto mode selected
    running: false,   // auto loop currently firing
    left: 0,
    baseBet: 0,
    profit: 0,
    timer: null
  };

  function target() { return parseInt(slider.value, 10); }
  function chance() { return under ? target() : 100 - target(); }
  function mult() { return Math.floor((99 / chance()) * 100) / 100; }

  function render() {
    var t = target();
    $('dice-target-ro').textContent = t.toFixed(2);
    $('dice-chance').textContent = chance().toFixed(2) + '%';
    $('dice-mult').textContent = mult().toFixed(2) + '×';
    var fill = $('dice-fill');
    fill.classList.toggle('flip', !under);
    fill.style.width = (under ? t : 100 - t) + '%';
  }

  slider.addEventListener('input', function () { Sound.tick(); render(); });

  $('dice-under').addEventListener('click', function () {
    under = true;
    $('dice-under').classList.add('active');
    $('dice-over').classList.remove('active');
    Sound.click();
    render();
  });
  $('dice-over').addEventListener('click', function () {
    under = false;
    $('dice-over').classList.add('active');
    $('dice-under').classList.remove('active');
    Sound.click();
    render();
  });

  /* ---- manual / auto mode toggle ---- */
  function setMode(isAuto) {
    auto.on = isAuto;
    if (!isAuto) stopAuto();
    $('dice-mode-manual').classList.toggle('active', !isAuto);
    $('dice-mode-auto').classList.toggle('active', isAuto);
    $('dice-auto-panel').style.display = isAuto ? '' : 'none';
    updateButton();
    Sound.click();
  }
  $('dice-mode-manual').addEventListener('click', function () { setMode(false); });
  $('dice-mode-auto').addEventListener('click', function () { setMode(true); });

  function updateButton() {
    var btn = $('dice-roll');
    if (auto.on) {
      btn.textContent = auto.running ? 'Stop Auto (' + (auto.left > 900000 ? '∞' : auto.left) + ' left)' : 'Start Auto';
      btn.classList.toggle('btn-stop', auto.running);
    } else {
      btn.textContent = 'Roll Dice';
      btn.classList.remove('btn-stop');
    }
  }

  /* ---- single roll (fast mode skips the scramble animation) ---- */
  function doRoll(fast, done) {
    var bet = Casino.getBet('dice-amount');
    if (bet === null) { if (done) done(null); return; }

    rolling = true;
    Casino.debit(bet);
    if (!fast) Sound.bet();

    var roll = Math.floor(PF.float() * 10000) / 100;
    var win = under ? roll < target() : roll > target();
    var m = mult();

    function land() {
      var resEl = $('dice-result');
      resEl.textContent = roll.toFixed(2);
      resEl.className = 'dice-result ' + (win ? 'win' : 'lose');
      $('dice-marker').style.left = roll + '%';

      var profit = Casino.settle('Dice', bet, win ? m : 0);
      if (win) {
        (m >= 5 ? Sound.bigwin : Sound.win)();
        if (!fast) Casino.toast('Rolled ' + roll.toFixed(2) + ' — won +' + Casino.fmt(profit) + ' 🎲', 'win');
      } else if (!fast) {
        Sound.lose();
      }
      Casino.pushRecent('dice-recent', roll.toFixed(2), win ? 'win' : 'lose');
      rolling = false;
      if (done) done({ win: win, profit: profit, bet: bet });
    }

    if (fast) {
      land();
      return;
    }
    var resEl = $('dice-result');
    resEl.className = 'dice-result';
    var frames = 0;
    var scramble = setInterval(function () {
      resEl.textContent = (Math.random() * 100).toFixed(2);
      $('dice-marker').style.left = (Math.random() * 100) + '%';
      if (++frames >= 8) {
        clearInterval(scramble);
        land();
      }
    }, 45);
  }

  /* ---- auto loop ---- */
  function startAuto() {
    var count = parseInt($('auto-count').value, 10) || 0;
    auto.left = count === 0 ? 1000000 : count;
    auto.baseBet = parseFloat($('dice-amount').value) || 0;
    auto.profit = 0;
    auto.running = true;
    updateButton();
    autoStep();
  }

  function stopAuto() {
    auto.running = false;
    if (auto.timer) { clearTimeout(auto.timer); auto.timer = null; }
    updateButton();
  }

  function autoStep() {
    if (!auto.running) return;
    if (auto.left <= 0) { stopAuto(); Casino.toast('Auto: finished all rolls', 'info'); return; }

    doRoll(true, function (res) {
      if (!res) { stopAuto(); return; } // insufficient balance or bad amount
      auto.left--;
      auto.profit = Math.round((auto.profit + res.profit) * 100) / 100;

      // adjust next bet
      var onWin = (parseFloat($('auto-onwin').value) || 0) / 100;
      var onLoss = (parseFloat($('auto-onloss').value) || 0) / 100;
      var next = res.win
        ? (onWin === 0 ? auto.baseBet : res.bet * (1 + onWin))
        : (onLoss === 0 ? auto.baseBet : res.bet * (1 + onLoss));
      $('dice-amount').value = (Math.floor(next * 100) / 100).toFixed(2);

      // stop conditions
      var stopWin = parseFloat($('auto-stopwin').value) || 0;
      var stopLoss = parseFloat($('auto-stoploss').value) || 0;
      if (stopWin > 0 && auto.profit >= stopWin) {
        stopAuto();
        Casino.toast('Auto stopped: profit target +' + Casino.fmt(auto.profit) + ' hit 🎯', 'win');
        return;
      }
      if (stopLoss > 0 && auto.profit <= -stopLoss) {
        stopAuto();
        Casino.toast('Auto stopped: loss limit reached (' + Casino.fmt(auto.profit) + ')', 'lose');
        return;
      }

      updateButton();
      var speed = parseInt($('auto-speed').value, 10) || 500;
      auto.timer = setTimeout(autoStep, speed);
    });
  }

  $('dice-roll').addEventListener('click', function () {
    if (auto.on) {
      auto.running ? stopAuto() : startAuto();
      return;
    }
    if (rolling) return;
    $('dice-roll').disabled = true;
    doRoll(false, function () { $('dice-roll').disabled = false; });
  });

  render();
  updateButton();
})();
