/* ================= COINFLIP =================
   Pick a side, 49.5% to land it, pays 1.98× (1% edge). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var side = 'heads';
  var flipping = false;
  var spins = 0; // accumulated rotation so consecutive flips keep spinning forward

  $('cf-heads').addEventListener('click', function () {
    side = 'heads';
    $('cf-heads').classList.add('active');
    $('cf-tails').classList.remove('active');
    Sound.click();
  });
  $('cf-tails').addEventListener('click', function () {
    side = 'tails';
    $('cf-tails').classList.add('active');
    $('cf-heads').classList.remove('active');
    Sound.click();
  });

  $('cf-flip').addEventListener('click', function () {
    if (flipping) return;
    var bet = Casino.getBet('cf-amount');
    if (bet === null) return;

    flipping = true;
    $('cf-flip').disabled = true;
    Casino.debit(bet);
    Sound.bet();
    Sound.flip();

    var result = PF.float() < 0.5 ? 'heads' : 'tails';
    var win = result === side;

    // 5 full spins, land on the right face (heads = 0deg, tails = 180deg)
    spins += 5 * 360;
    var final = spins + (result === 'tails' ? 180 : 0);
    $('coin3d').style.transform = 'rotateY(' + final + 'deg)';
    spins = final - (result === 'tails' ? 180 : 0);

    var resEl = $('cf-result');
    resEl.className = 'cf-result';
    resEl.textContent = 'Flipping…';

    setTimeout(function () {
      var profit = Casino.settle('Coinflip', bet, win ? 1.98 : 0);
      resEl.textContent = (result === 'heads' ? '🌞 HEADS' : '🌙 TAILS') +
        (win ? ' — you win +' + Casino.fmt(profit) : ' — you lose');
      resEl.className = 'cf-result ' + (win ? 'win' : 'lose');
      if (win) { Sound.win(); } else { Sound.lose(); }
      Casino.pushRecent('cf-recent', result === 'heads' ? '🌞' : '🌙', win ? 'win' : 'lose');
      flipping = false;
      $('cf-flip').disabled = false;
    }, 1450);
  });
})();
