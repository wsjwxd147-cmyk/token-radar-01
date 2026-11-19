# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/wsjwxd147-cmyk/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/wsjwxd147-cmyk/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: which pre-token DeFi protocols are worth farming next,
and what to do about it. Built for the make.fun bounty
[token-radar-01](https://make.fun/c/token-radar-01) ("Build the best token
launch radar").

## What it does

`main.ts` (Node 22, standard library only) reads the sealed DefiLlama
snapshot at `/input/snapshot.json` (758 protocols at or above $5M TVL, 40 on
the watchlist, as of 2026-11-14) and writes:

- `board.json` — 226 ranked pre-token protocols (the 40 watchlist protocols
  plus 186 below the $50M floor), each with a 7-step farm plan.
- `data.js` — the board data the dashboard reads.
- `dashboard/` — a sortable, filterable dashboard (search, category and chain
  filters, watchlist-only toggle, pre-token / live-token tabs, per-protocol
  detail view with a model breakdown and a recompute check, and a model
  sandbox that re-scores live as you move the weights).
- `screenshots/` — three renders of the dashboard (board, protocol detail,
  filtered view).
- `dossier.json` — the judge's dossier, built with the kit's vendored
  `vendor/makefun-board.ts`.

## The value model (radar-2)

Implied value is a model, not a promise. Each category is priced at the
multiple its own live protocols trade at:

```
implied = TVL × category multiple × growth multiplier × maturity multiplier × chain multiplier
```

- **Category multiple**: median market-cap/TVL of the snapshot's live
  protocols in the category, winsorized at 5, shrunk toward the global
  median (k=4), clamped to [0.05, 2.0]. Global median multiple: 0.2138.
- **Growth multiplier**: 7-day TVL change clamped to [-60%, +120%], weight
  0.5 — growing protocols are worth more, shrinking ones less.
- **Maturity multiplier**: 0.6 + min(age, 1095 days) / 1095 × 0.4; a
  protocol with no recorded listing date is scored at 365 days.
- **Chain multiplier**: 1 + 0.02 × min(chains − 1, 5).

The same function scores every protocol, so the ranking is a field-wide
answer, not a hand-kept list of names. Live-token protocols (24) are set
aside in their own tab; they calibrate the multiples, they are not ranked
as farm targets.

Top of the board on this snapshot: Steakhouse Financial, $2.75B TVL,
implied value $1.83B.

## What the dashboard shows

- The ranked board: every pre-token protocol, strongest implied value first,
  with TVL, seven-day growth, age with no token, and the implied value bar.
- Protocol detail: click a row for the model's own inputs, the recomputed
  check against board.json, and the seven-step farm plan.
- Model sandbox: move the growth weight, maturity floor or multiple scale
  and the board recomputes live.
- Where the value sits: the board grouped by category, with each category's
  total TVL, total implied value, median multiple, best row and share.
- Growing fastest: the ten pre-token rows with the strongest seven-day TVL
  growth, so the earliest risers are visible before their implied value
  catches up.
- Download CSV: the rows on screen, in the order shown, as a spreadsheet.

## Farm plans

Every row carries a 7-step plan: a fresh wallet, a first deposit sized to
the protocol, one qualifying action a week, a 30-day hold so the activity
is counted in more than one snapshot, points-program checks, and an exit
rule. Each step names its cost and time. Steps are category-specific
(lending, Dexs, risk curators, and the rest farm differently).

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json | directory>
```

Outside the grader's container `MAKEFUN_OUTPUT_DIR` stands in for
`/output`; inside it, the program reads `/input/snapshot.json` and writes
`/output`. The program is deterministic: two runs on the same snapshot
write byte-identical outputs. No network access is needed or used.

## Verify

```sh
node cli/makefun.mjs check --kit <kit> --repo . --transcripts <bundle.tar.gz>
```

## License

MIT.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ctmvgy3t&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
