/* ================= SLOTS =================
   3 reels, middle line pays. Symbol weights 30/25/20/15/10.
   Paytable tuned by simulation to 99.9% RTP:
   7-7-7 60x · D-D-D 20x · B-B-B 10x · L-L-L 6x · C-C-C 4x ·
   two 7s 4x · any other pair 1x. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var SYM = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
  var WEIGHTS = [30, 25, 20, 15, 10];
  var CUM = [];
  (function () { var t = 0; for (var i = 0; i < WEIGHTS.length; i++) { t += WEIGHTS[i]; CUM.push(t); } })();

  var spinning = false;

  function pick(f) {
    var r = f * 100;
    for (var i = 0; i < CUM.length; i++) if (r < CUM[i]) return i;
    return CUM.length - 1;
  }

  function payout(a, b, c) {
    if (a === 4 && b === 4 && c === 4) return 60;
    if (a === 3 && b === 3 && c === 3) return 20;
    if (a === 2 && b === 2 && c === 2) return 10;
    if (a === 1 && b === 1 && c === 1) return 6;
    if (a === 0 && b === 0 && c === 0) return 4;
    var sevens = (a === 4 ? 1 : 0) + (b === 4 ? 1 : 0) + (c === 4 ? 1 : 0);
    if (sevens === 2) return 4;
    if (a === b || b === c || a === c) return 1;
    return 0;
  }

  function randSym() { return SYM[Math.floor(Math.random() * SYM.length)]; }

  function setReel(i, midSym) {
    var reel = $('reel-' + i);
    var cells = reel.querySelectorAll('.cell');
    cells[0].textContent = randSym();
    cells[1].textContent = midSym;
    cells[2].textContent = randSym();
  }

  function spin() {
    if (spinning) return;
    var bet = Casino.getBet('slots-amount');
    if (bet === null) return;

    spinning = true;
    $('slots-spin').disabled = true;
    Casino.debit(bet);
    Sound.bet();

    var f = PF.floats(3);
    var res = [pick(f[0]), pick(f[1]), pick(f[2])];
    var mult = payout(res[0], res[1], res[2]);

    var resEl = $('slots-result');
    resEl.className = 'slots-result';
    resEl.textContent = 'Spinning…';
    $('slots-glow').classList.remove('win');

    // staggered reel stop: blur-swap each reel, lock them 1-2-3
    var reels = [$('reel-0'), $('reel-1'), $('reel-2')];
    reels.forEach(function (r) { r.classList.add('spin'); });

    var timers = [];
    timers.push(setInterval(function () { setReel(0, randSym()); Sound.tick(); }, 70));
    timers.push(setInterval(function () { setReel(1, randSym()); }, 70));
    timers.push(setInterval(function () { setReel(2, randSym()); }, 70));

    function stopReel(i, delay) {
      setTimeout(function () {
        clearInterval(timers[i]);
        setReel(i, SYM[res[i]]);
        reels[i].classList.remove('spin');
        reels[i].classList.add('lock');
        Sound.reveal();
        setTimeout(function () { reels[i].classList.remove('lock'); }, 350);
      }, delay);
    }
    stopReel(0, 900);
    stopReel(1, 1500);
    stopReel(2, 2100);

    setTimeout(function () {
      var profit = Casino.settle('Slots', bet, mult);
      if (mult >= 10) {
        Sound.bigwin();
        $('slots-glow').classList.add('win');
        resEl.textContent = SYM[res[0]] + ' ' + SYM[res[1]] + ' ' + SYM[res[2]] + ' — ' + mult + '× · +' + Casino.fmt(profit) + '!';
        resEl.className = 'slots-result win';
        Casino.toast('SLOTS ' + mult + '× — +' + Casino.fmt(profit) + ' 🎰', 'win');
      } else if (mult > 1) {
        Sound.win();
        $('slots-glow').classList.add('win');
        resEl.textContent = mult + '× — you win +' + Casino.fmt(profit);
        resEl.className = 'slots-result win';
      } else if (mult === 1) {
        Sound.click();
        resEl.textContent = 'Pair — bet returned';
        resEl.className = 'slots-result push';
      } else {
        Sound.lose();
        resEl.textContent = 'No match — try again';
        resEl.className = 'slots-result lose';
      }
      Casino.pushRecent('slots-recent', mult + '×', mult >= 10 ? 'gold' : mult >= 1 ? 'win' : 'lose');
      spinning = false;
      $('slots-spin').disabled = false;
    }, 2400);
  }

  $('slots-spin').addEventListener('click', spin);
})();
