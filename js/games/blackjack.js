/* ================= BLACKJACK =================
   Single deck shuffled per hand from the provably-fair stream.
   Dealer stands on all 17s. Blackjack pays 3:2. Hit / Stand / Double. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  var st = { phase: 'idle', deck: [], player: [], dealer: [], bet: 0, doubled: false };

  function freshDeck() {
    var deck = [];
    for (var s = 0; s < 4; s++) {
      for (var r = 0; r < 13; r++) deck.push({ rank: RANKS[r], suit: SUITS[s] });
    }
    var floats = PF.floats(51);
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(floats[deck.length - 1 - i] * (i + 1));
      var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    return deck;
  }

  function cardValue(rank) {
    if (rank === 'A') return 11;
    if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
    return parseInt(rank, 10);
  }

  function handValue(cards) {
    var total = 0, aces = 0;
    cards.forEach(function (c) {
      total += cardValue(c.rank);
      if (c.rank === 'A') aces++;
    });
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  function isBlackjack(cards) { return cards.length === 2 && handValue(cards) === 21; }

  function cardEl(card, faceDown) {
    var d = document.createElement('div');
    if (faceDown) {
      d.className = 'playing-card back';
      return d;
    }
    var red = card.suit === '♥' || card.suit === '♦';
    d.className = 'playing-card' + (red ? ' red' : '');
    d.innerHTML =
      '<div>' + card.rank + card.suit + '</div>' +
      '<div class="suit-big">' + card.suit + '</div>' +
      '<div class="bottom">' + card.rank + card.suit + '</div>';
    return d;
  }

  function render(hideHole) {
    var pc = $('bj-player-cards'), dc = $('bj-dealer-cards');
    pc.innerHTML = '';
    dc.innerHTML = '';
    st.player.forEach(function (c) { pc.appendChild(cardEl(c)); });
    st.dealer.forEach(function (c, i) { dc.appendChild(cardEl(c, hideHole && i === 1)); });
    $('bj-player-total').textContent = st.player.length ? handValue(st.player) : '';
    $('bj-dealer-total').textContent = st.dealer.length
      ? (hideHole ? cardValue(st.dealer[0].rank) + ' + ?' : handValue(st.dealer))
      : '';
  }

  function setButtons() {
    var playing = st.phase === 'player';
    $('bj-deal').disabled = playing;
    $('bj-hit').disabled = !playing;
    $('bj-stand').disabled = !playing;
    $('bj-double').disabled = !(playing && st.player.length === 2 && Casino.state.balance >= st.bet);
  }

  function message(txt, cls) {
    var el = $('bj-message');
    el.textContent = txt;
    el.className = 'bj-message' + (cls ? ' ' + cls : '');
  }

  function deal() {
    var bet = Casino.getBet('bj-amount');
    if (bet === null) return;
    Casino.debit(bet);
    Sound.bet();

    st = { phase: 'player', deck: freshDeck(), player: [], dealer: [], bet: bet, doubled: false };
    st.player.push(st.deck.pop());
    st.dealer.push(st.deck.pop());
    st.player.push(st.deck.pop());
    st.dealer.push(st.deck.pop());

    render(true);
    setButtons();
    message('Hit, stand or double', '');

    if (isBlackjack(st.player)) {
      // natural — resolve immediately against the dealer's hand
      stand();
    }
  }

  function hit() {
    if (st.phase !== 'player') return;
    Sound.click();
    st.player.push(st.deck.pop());
    render(true);
    setButtons();
    var v = handValue(st.player);
    if (v > 21) {
      finish(0, 'Bust with ' + v + ' — you lose', 'lose');
    } else if (v === 21) {
      stand();
    } else {
      $('bj-double').disabled = true;
    }
  }

  function doubleDown() {
    if (st.phase !== 'player' || st.player.length !== 2 || Casino.state.balance < st.bet) return;
    Sound.bet();
    Casino.debit(st.bet);
    st.bet *= 2;
    st.doubled = true;
    st.player.push(st.deck.pop());
    render(true);
    if (handValue(st.player) > 21) {
      finish(0, 'Bust with ' + handValue(st.player) + ' — you lose', 'lose');
    } else {
      stand();
    }
  }

  function stand() {
    if (st.phase !== 'player') return;
    st.phase = 'dealer';
    setButtons();
    render(false);

    var playerBJ = isBlackjack(st.player);
    var step = function () {
      if (!playerBJ && handValue(st.dealer) < 17) {
        st.dealer.push(st.deck.pop());
        Sound.tick();
        render(false);
        setTimeout(step, 550);
        return;
      }
      resolve(playerBJ);
    };
    setTimeout(step, 550);
  }

  function resolve(playerBJ) {
    var pv = handValue(st.player);
    var dv = handValue(st.dealer);
    var dealerBJ = isBlackjack(st.dealer);

    if (playerBJ && dealerBJ) return finish(1, 'Both blackjack — push', 'push');
    if (playerBJ) return finish(2.5, 'BLACKJACK! Paid 3:2 🃏', 'win');
    if (dealerBJ) return finish(0, 'Dealer blackjack — you lose', 'lose');
    if (dv > 21) return finish(2, 'Dealer busts with ' + dv + ' — you win!', 'win');
    if (pv > dv) return finish(2, pv + ' beats ' + dv + ' — you win!', 'win');
    if (pv < dv) return finish(0, dv + ' beats ' + pv + ' — you lose', 'lose');
    return finish(1, 'Push at ' + pv, 'push');
  }

  function finish(mult, txt, cls) {
    st.phase = 'idle';
    render(false);
    setButtons();
    var profit = Casino.settle('Blackjack', st.bet, mult);
    message(txt, cls);
    if (mult > 1) {
      (mult >= 2.5 ? Sound.bigwin : Sound.win)();
      Casino.toast(txt + ' +' + Casino.fmt(profit), 'win');
    } else if (mult === 1) {
      Sound.click();
    } else {
      Sound.lose();
    }
  }

  $('bj-deal').addEventListener('click', deal);
  $('bj-hit').addEventListener('click', hit);
  $('bj-stand').addEventListener('click', stand);
  $('bj-double').addEventListener('click', doubleDown);

  setButtons();
})();
