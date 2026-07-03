/* ================= DICE =================
   Roll a number in [0,100). Roll Under wins if roll < target,
   Roll Over wins if roll > target. Payout = 99 / winChance (1% edge). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var slider = $('dice-slider');
  var under = true;
  var rolling = false;

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

  $('dice-roll').addEventListener('click', function () {
    if (rolling) return;
    var bet = Casino.getBet('dice-amount');
    if (bet === null) return;

    rolling = true;
    $('dice-roll').disabled = true;
    Casino.debit(bet);
    Sound.bet();

    var roll = Math.floor(PF.float() * 10000) / 100; // 0.00 – 99.99
    var win = under ? roll < target() : roll > target();
    var m = mult();

    // little scramble animation before landing on the result
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

    function land() {
      resEl.textContent = roll.toFixed(2);
      resEl.className = 'dice-result ' + (win ? 'win' : 'lose');
      $('dice-marker').style.left = roll + '%';

      var profit = Casino.settle('Dice', bet, win ? m : 0);
      if (win) {
        (m >= 5 ? Sound.bigwin : Sound.win)();
        Casino.toast('Rolled ' + roll.toFixed(2) + ' — won +' + Casino.fmt(profit) + ' 🎲', 'win');
      } else {
        Sound.lose();
      }
      Casino.pushRecent('dice-recent', roll.toFixed(2), win ? 'win' : 'lose');
      rolling = false;
      $('dice-roll').disabled = false;
    }
  });

  render();
})();
