# 🎰 NEBULA Casino

A fully local, play-money online casino in the style of duel.com / stake.com —
dark UI, seven "originals" games, a provably-fair RNG, sounds, animations,
and a persistent demo wallet. **No real money, no server, no dependencies.**

![games](https://img.shields.io/badge/games-7-ffb636) ![deps](https://img.shields.io/badge/dependencies-0-2bd97c) ![money](https://img.shields.io/badge/real%20money-none-ff4d5e)

## Run it

Any static file server works. From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve`, or just double-click `index.html` — everything is
self-contained vanilla HTML/CSS/JS with zero network requests.

You start with **1,000.00 demo credits**; the **+ Add Funds** button tops you
up any time, and *Provably Fair → Reset Bankroll* starts you over. Balance,
seeds, stats and bet history persist in `localStorage`.

## Games

| Game | The gist | Max win |
|---|---|---|
| 🎲 **Dice** | Slide a target, roll under/over it | 49.50× |
| 🚀 **Crash** | Cash out before the curve explodes (manual + auto cashout) | 5,000× |
| 💣 **Mines** | 5×5 grid, 1–24 mines, cash out any time | huge |
| 🔻 **Plinko** | 16 rows, low/medium/high risk, balls can stack | 1,000× |
| 🎡 **Roulette** | 15-slot wheel — 7 red, 7 black, 1 green | 14× |
| 🃏 **Blackjack** | Hit / stand / double, dealer stands on 17, BJ pays 3:2 | 2.5× |
| 🪙 **Coinflip** | Heads or tails | 1.98× |

All games carry a ~1% house edge, like the real thing.

## Provably fair

Every outcome is derived from
`SHA-256(serverSeed : clientSeed : nonce : block)`:

- The **server seed** is committed by its SHA-256 hash *before* you bet.
- You can edit the **client seed**; the **nonce** increments every bet.
- **Rotate Seed Pair** reveals the previous server seed so you can re-compute
  any past result and verify it wasn't manipulated.

The SHA-256 implementation is dependency-free (`js/sha256.js`) and derives its
round constants from prime roots at runtime.

## Project layout

```
index.html          app shell — all pages/markup
css/style.css       the entire theme
js/sha256.js        compact synchronous SHA-256
js/engine.js        wallet, RNG, sounds, toasts, nav, feed, stats
js/games/*.js       one module per game
js/main.js          boot + sha256 self-test
```

## Disclaimer

Demo credits only — nothing here is or converts to real money. If gambling
stops being fun for you or someone you know: https://www.begambleaware.org
