# Deterministic EN card compiler coverage

Local read-only catalog audit, 2026-09-21. Source: `jogartcg_db.lorcana_cards`.
Rules reference: [Disney Lorcana Comprehensive Rules 2.2.0, effective July 9, 2026](https://files.disneylorcana.com/Comprehensive-Rules_2.2.0-EN.pdf).

## Current measured coverage

| Card type | Fully compiled printings | Active printings |
| --- | ---: | ---: |
| Character | 959 | 2,470 |
| Action | 120 | 424 |
| Item | 43 | 233 |
| Location | 18 | 115 |
| Total | **1,140 (35.16%)** | **3,242** |

947 distinct exact EN full-name strings have a fully compiled printing. The source
has 2,547 exact EN full-name strings; MariaDB's case/accent-insensitive collation
counts 2,543. These are different identity-counting methods, not different snapshots.
327 supported printings have genuinely empty rules text; the other 813 are not
silently treated as vanilla.

| Structured record kind | Fully understood records | Total records |
| --- | ---: | ---: |
| Keyword | 997 | 1,056 |
| Static, including intrinsic reminders/construction clauses | 324 | 826 |
| Triggered | 275 | 1,575 |
| Activated | 96 | 311 |
| Action effect | 121 | 427 |

Record counts include records on otherwise unsupported cards. A recognized record
does **not** authorize playing a partially understood card. `supported` is exactly
`unsupported.length === 0`; the engine must enforce this for the whole deck.
Compiler recognition and correct engine execution are separate checks. All fourteen
standard keywords are emitted; engine support must include Alert, Vanish, and Boost.
The final safe expansion adds exact known static keyword reminders, compound static
keyword grants, and recovery of another item with self-exclusion. No AST types changed.
Final integration check: all 1,140 fully compiled printings pass the current engine's
`createGame` rule validator. This checks contract acceptance, not exhaustive execution
of every possible card interaction. Game-core TypeScript checking also passes.

Audit-source SHA-256 (canonical JSON of the fields selected by the audit, including
resolved colors): `89dcc5d2123f43ddd155afffa2e5b5be92c753d9162ca76b0c3e7c61b1d56b34`.

## Contract and semantic boundaries

`compileCardRules(card)` accepts the existing CardDetail-style shape:
`{id, original: {name, type, full_text, abilities, effects}}`. It uses EN records
only, performs no I/O, preserves source strings, and does not mutate the input.

- Every non-keyword record must reconcile `name`, `costsText`, `effect`, and
  `fullText`. The complete rules box must reconcile with all records in order.
- Parsing consumes the entire record. An unknown cost, qualifier, dependency,
  reminder, additional sentence, or ability type rejects that whole record.
- Separate, fully understood records may remain in diagnostic output; none are
  executable when the card has an `unsupported` entry.
- Empty/null record arrays are acceptable only alongside verified rules text.
  Missing EN `full_text` is unsupported; nonempty orphan prose is unsupported.
- The exact ordinary song reminder is intrinsic (CR 5.4.4.2). The engine implements
  singing using the Song classification and card cost; no static aura is emitted.
- The exact catalog clauses allowing 99 copies of Dalmatian Puppy - Tail Wagger
  and limiting The Glass Slipper to 2 copies are understood construction rules
  (CR 1.10.1.3). Name/type and complete effect are checked. The backend still must
  enforce `max_copies_in_deck`; other abilities on those cards are not exempted.
- Target `kind: player, owner: any` means each player. `kind: chosen` without a
  zone/filter means a chosen player. Discard targets are players who choose their
  own cards, not permission for the opposing controller to inspect/select a hand.
- `upTo` on heal controls damage amount independently for each target; selector
  `min/max` controls how many distinct targets are chosen. A choice is made at
  resolution. Ward blocks opposing choices, not effects affecting all characters.
- `damage` means **deal** damage. Putting/moving counters cannot use this operation.
- `recover` selects cards in discard and moves them to hand. `inkTop` puts the top
  deck card into ink, with explicit `entersExerted`; it is not Boost.
- `challenge` means the source initiates a challenge; defender and banishment-in-
  challenge triggers are not aliases. Start/end triggers specify whose turn.
- Secondary trigger conditions are checked at resolution (CR 6.2.4), not when
  adding the trigger to the bag. Game state checks occur after the complete
  action/ability effect sequence, not after each AST operation (CR 1.8/6.7.5).
- `costReduction` selectors omit a zone because payment reduction applies when
  playing the card from any allowed zone. A card's own reduction can apply before
  entering play; non-self reductions from that card require it to be in play.
- Temporary buffs have explicit expiration. Static buffs remain conditional and
  continuously count `per` selectors. No arbitrary prose is used as a condition.

Unsupported families include dependent/sequential payments; replacements; hidden
deck selection/ordering; stack/under-card manipulations; nonstandard Shift variants;
temporary keyword grants; location-relative selectors; history-sensitive or
opponent-hand conditions; and event triggers outside the declared trigger union.
Unknown compound abilities are rejected even when individual fragments are known.

## Saved deck coverage (IDs only)

No account fields or player-provided deck names were read or included. No decks were changed.

| Deck ID | Supported copies | Total | Unsupported printed IDs |
| --- | ---: | ---: | --- |
| 1 | 60 | 60 | none; exact construction clause on 436 recognized |
| 5 | 23 | 60 | 147, 161, 2218, 2344, 2354, 2495, 2618, 2726, 2986, 3005, 3139 |
| 6 | 27 | 60 | 2280, 2286, 2617, 2622, 2797, 2874, 3063, 3068, 3070 |
| 7 | 18 | 60 | 161, 379, 805, 807, 820, 823, 853, 2078, 2338, 2358, 2621, 2870, 3103, 3106, 3119 |

Remaining deck 6 extensions (explicitly deferred in this baseline pass):

| Printed ID | Missing semantics | Estimated implementation scope |
| --- | --- | --- |
| 2286 | Put damage counters (bypasses Resist) | Separate effect operation |
| 3063 | Source is challenged; chosen opponent chooses discard | Trigger event |
| 2874 | Another character played this turn | Play-history condition |
| 3068 | An opponent has more hand cards | Resolution-time hand-count condition |
| 2280 | Other Emerald defenders banished; banish attacker; Emerald Ward aura | Color filter and challenge event context |
| 2797 | Optional discard payment enables bounce; count all discard-zone entries | Dependent effects and zone-entry history |
| 2617 | Inspect N top cards based on cards underneath, take one, order remainder | Private selection and ordering |
| 2622 | Top card underneath; relocate former undercards after challenge banishment | Stack history and zone-aware movement |
| 3070 | Duo Shift onto two names; replace banish with ink entry for the stack | Alternate payment plus replacement processing |

## Verified local training lists

Each list is 15 distinct identities, **4 copies of each ID**, for 60 cards. Every
selected printing has `Infinity.allowed: true` in the local catalog and compiles
fully. These are training suggestions, not purchased, saved, or tournament-tuned decks.
The application should still fetch from its legal catalog and validate before play.

Amber/Amethyst: `7, 20, 22, 12, 11, 3, 4, 49, 41, 38, 36, 55, 64, 27, 62`.
All 60 cards are inkable. Costs 1/2/3/4/5/6: 16/8/20/8/4/4 copies.
Exercises Support, Bodyguard, Challenger, Singer, play triggers, healing, draw,
exertion, temporary strength reduction, songs, and return-to-hand effects.

Sapphire/Steel: `140, 148, 150, 154, 156, 158, 160, 171, 174, 180, 194, 197, 198, 199, 204`.
44 cards are inkable. Costs 1/2/3/4/5/6/7: 8/16/16/8/4/4/4 copies.
Exercises top-deck ink, Support, Challenger, draw/discard, single/all-character
damage, and activated item damage.

Representative supported IDs by ink:

- Amber: `3, 4, 7, 11, 12, 20, 21, 22, 27, 30, 32, 436`.
- Amethyst: `36, 38, 41, 43, 46, 49, 54, 55, 56, 62, 64, 66`.
- Emerald: `69, 70, 73, 75, 77, 78, 79, 83, 94, 95, 96, 98`.
- Ruby: `103, 105, 106, 108, 110, 111, 113, 114, 128, 130, 132, 133`.
- Sapphire: `138, 140, 148, 150, 154, 156, 158, 160, 162, 164, 167, 169`.
- Steel: `171, 172, 173, 174, 180, 186, 194, 196, 197, 198, 199, 204`.

## Reproduce

```text
node --test packages/game-core/cards.test.mjs
node packages/game-core/cards.test.mjs --catalog
node packages/game-core/cards.test.mjs --catalog --unsupported
npm run typecheck --workspace @jogartcg/game-core
```

Node >=22.18 can load the TypeScript source using native type stripping. The
ordinary tests need no database. `--catalog` uses the documented local XAMPP
root/no-password connection with `--no-defaults`, only SELECT statements, and no
secret/config-file reads. It does not write a snapshot or modify catalog/deck rows.
The audit reports counts, IDs and copy quantities only for saved decks. Colors
fall back from absent `colors_json` to canonical `color_en`, split for dual inks.
The six `suggestedSupportedIds` groups are populated (Amber 25, Amethyst 21,
Emerald 17, Ruby 24, Sapphire 19, Steel 22; representative first-set printings).
`--unsupported` includes all **2,102** remaining unsupported printed IDs with the
exact rejected source strings, without writing another file.

23 checks pass (21 standalone + 2 catalog), including the full-catalog determinism/immutability audit and
unknown-suffix mutation of every supported non-keyword ability/effect record.
The mutation audit caught and closed a named-card selector swallowing a following
sentence. Exact-copy-rule tests also reject altered numbers, names and suffixes.
