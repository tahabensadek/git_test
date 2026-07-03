/* ================= ROULETTE =================
   15-slot wheel: 1 green (14×), 7 red (2×), 7 black (2×).
   Result index = floor(f × 15): 0 green, 1-7 red, 8-14 black. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  // visual order around the wheel
  var SEQ = [
    { n: 0, c: 'green' },
    { n: 1, c: 'red' }, { n: 8, c: 'black' }, { n: 2, c: 'red' }, { n: 9, c: 'black' },
    { n: 3, c: 'red' }, { n: 10, c: 'black' }, { n: 4, c: 'red' }, { n: 11, c: 'black' },
    { n: 5, c: 'red' }, { n: 12, c: 'black' }, { n: 6, c: 'red' }, { n: 13, c: 'black' },
    { n: 7, c: 'red' }, { n: 14, c: 'black' }
  ];
  var SLOT_W = 88; // 78px tile + 2×5px margin
  var REPEATS = 10;
  var LAND_REPEAT = 7;

  var strip = $('roulette-strip');
  var spinning = false;

  for (var rep = 0; rep < REPEATS; rep++) {
    SEQ.forEach(function (s) {
      var d = document.createElement('div');
      d.className = 'rslot ' + s.c;
      d.textContent = s.n;
      strip.appendChild(d);
    });
  }

  function colorOf(idx) { return idx === 0 ? 'green' : idx <= 7 ? 'red' : 'black'; }
  function seqIndexOf(n) {
    for (var i = 0; i < SEQ.length; i++) if (SEQ[i].n === n) return i;
    return 0;
  }

  function spin(pick) {
    if (spinning) return;
    var bet = Casino.getBet('roulette-amount');
    if (bet === null) return;

    spinning = true;
    ['roulette-red', 'roulette-green', 'roulette-black'].forEach(function (id) { $(id).disabled = true; });
    Casino.debit(bet);
    Sound.bet();

    var idx = Math.floor(PF.float() * 15);   // 0..14
    var color = colorOf(idx);
    var win = color === pick;
    var mult = win ? (pick === 'green' ? 14 : 2) : 0;

    var resEl = $('roulette-result');
    resEl.className = 'roulette-result';
    resEl.textContent = 'Spinning…';

    // jump back to an early repeat (no transition), then ease out to the target
    var winW = $('roulette-strip').parentElement.clientWidth;
    var startOffset = 1 * SEQ.length * SLOT_W;
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(' + (-(startOffset - winW / 2 + SLOT_W / 2)) + 'px)';
    void strip.offsetWidth;

    var target = (LAND_REPEAT * SEQ.length + seqIndexOf(idx)) * SLOT_W + SLOT_W / 2;
    var jitter = (Math.random() - 0.5) * (SLOT_W * 0.55);
    strip.style.transition = 'transform 4.2s cubic-bezier(.08, .65, .1, 1)';
    strip.style.transform = 'translateX(' + (-(target - winW / 2 + jitter)) + 'px)';

    var ticks = 0;
    var tickTimer = setInterval(function () {
      Sound.tick();
      if (++ticks > 26) clearInterval(tickTimer);
    }, 130);

    setTimeout(function () {
      clearInterval(tickTimer);
      var profit = Casino.settle('Roulette', bet, mult);
      var label = idx + ' ' + color.toUpperCase();
      if (win) {
        (mult >= 14 ? Sound.bigwin : Sound.win)();
        resEl.textContent = label + ' — you win +' + Casino.fmt(profit) + '!';
        resEl.className = 'roulette-result win';
        Casino.toast('Roulette hit ' + label + ' — +' + Casino.fmt(profit) + ' 🎡', 'win');
      } else {
        Sound.lose();
        resEl.textContent = label + ' — you lose';
        resEl.className = 'roulette-result lose';
      }
      Casino.pushRecent('roulette-recent', String(idx),
        color === 'green' ? 'gold' : win ? 'win' : 'lose');
      spinning = false;
      ['roulette-red', 'roulette-green', 'roulette-black'].forEach(function (id) { $(id).disabled = false; });
    }, 4350);
  }

  $('roulette-red').addEventListener('click', function () { spin('red'); });
  $('roulette-green').addEventListener('click', function () { spin('green'); });
  $('roulette-black').addEventListener('click', function () { spin('black'); });

  // initial position: centre the strip on an early green
  Casino.onPageShow('roulette', function () {
    if (spinning) return;
    var winW = strip.parentElement.clientWidth;
    if (!winW) return;
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(' + (-(SEQ.length * SLOT_W + SLOT_W / 2 - winW / 2)) + 'px)';
  });
})();
