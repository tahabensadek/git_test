/* ================= LIMBO =================
   Pick a target multiplier. Result R = 0.99 / (1 - f).
   Win (paid target×) when R >= target — exactly 1% house edge. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var busy = false;

  function target() {
    var t = parseFloat($('limbo-target').value) || 2;
    return Math.min(Math.max(t, 1.01), 1000);
  }

  function render() {
    var t = target();
    $('limbo-chance').textContent = (99 / t).toFixed(2) + '%';
    $('limbo-payout').textContent = t.toFixed(2) + '×';
    $('limbo-line').textContent = 'target ' + t.toFixed(2) + '×';
  }
  $('limbo-target').addEventListener('input', render);
  $('limbo-target').addEventListener('change', function () {
    $('limbo-target').value = target().toFixed(2);
    render();
  });

  $('limbo-bet').addEventListener('click', function () {
    if (busy) return;
    var bet = Casino.getBet('limbo-amount');
    if (bet === null) return;

    busy = true;
    $('limbo-bet').disabled = true;
    Casino.debit(bet);
    Sound.bet();

    var t = target();
    var f = PF.float();
    var R = Math.max(1, Math.floor((0.99 / (1 - f)) * 100) / 100);
    var win = R >= t;

    // count-up reveal toward the result
    var el = $('limbo-result');
    el.className = 'limbo-result';
    var shown = 1;
    var iv = setInterval(function () {
      shown = Math.min(shown * 1.28 + 0.01, R);
      el.textContent = shown.toFixed(2) + '×';
      Sound.tick();
      if (shown >= R || shown > 9000) {
        clearInterval(iv);
        land();
      }
    }, 55);

    function land() {
      el.textContent = R.toFixed(2) + '×';
      el.className = 'limbo-result ' + (win ? 'win' : 'lose');
      var profit = Casino.settle('Limbo', bet, win ? t : 0);
      if (win) {
        (t >= 10 ? Sound.bigwin : Sound.win)();
        Casino.toast('Limbo hit ' + R.toFixed(2) + '× — +' + Casino.fmt(profit) + ' 📈', 'win');
      } else {
        Sound.lose();
      }
      Casino.pushRecent('limbo-recent', R.toFixed(2) + '×', win ? 'win' : 'lose');
      busy = false;
      $('limbo-bet').disabled = false;
    }
  });

  render();
})();
