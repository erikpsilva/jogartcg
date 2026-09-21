# Lorcana bot match: rules checklist and regression plan

## Authority and scope

- Baseline: [official Comprehensive Rules 2.2.0, English](https://files.disneylorcana.com/Comprehensive-Rules_2.2.0-EN.pdf), effective **2026-07-09**, checked **2026-09-21**. The [official resources page](https://www.disneylorcana.com/en-US/resources) linked this version on the review date.
- Reviewed: sections 1-8 in full (concepts, gameplay, turns, turn actions, card types/states, effects, zones, keywords), glossary, and the July/April 2026 update summaries. References below are to this version, not older numbering.
- Intended scope: one human versus one bot, ordinary two-player Constructed gameplay. Multiplayer/team procedures and Pack Rush are excluded; notably, Pack Rush's deck recycling must not leak into ordinary matches. Series selection, tournament policy, current bans/rotation, and individual card errata/release notes need separate validation before claiming format or card-pool completeness.
- English rules and current official card text govern. Card exceptions override general rules; prohibitions override permissions. Reminder text and translated catalog text are not the authority (1.1.4-1.2.3).
- Download fingerprint: 55 pages; SHA-256 `5ffa31172fcaae2cbdbf127aebdd54987f01a4e72008812c96556c29d0942d8f`. The PDF was read in memory; no source copy or extraction files were added to the repository.

This is an implementation specification with **partial, independently verified regression evidence**, not a full compliance report. All six original review findings are **VERIFIED FIXED in the recorded snapshot**. The final source-backed run passed **81 tests: 49 engine and 32 bot, zero failures/skips**. The complete 46-case rules matrix remains **PARTIAL / acceptance pending**; test counts do not imply one-to-one or complete coverage. Synthetic fixtures describe isolated rule situations, not newly asserted card text.

## Repository mapping: implementation present, partial acceptance evidence

The engine appeared during this review and was subsequently inspected and regression-tested at the user's request. Mapping identifies existing functions and tested subcases; it does not certify complete rules support. Evidence is tied to the source hashes below because development continued concurrently.

| Surface | Observed implementation | Acceptance / case mapping |
| --- | --- | --- |
| `packages/game-core/src/engine.ts`: `createGame`, `choose`, `startTurn`, `completeEnd` | Seeded state, opening hands/alteration, turn transitions, own-turn-end deck loss. | Automated evidence for setup/alteration, first Draw skip, Ready checkpoint, Set lore, bag-before-Draw, and own-turn-end deck loss. S01-S06 and E01-E06 still contain unverified subcases. |
| Same file: `getLegalActions`, `challengeTargets`, `playCard`, `combatDamage`, `getStats` | Legal-action enumeration, basic challenges/keywords, ordinary Shift, songs, movement and Boost. | Automated subcase evidence for Bodyguard/location legality, Evasive/Alert, raw Challenger arithmetic, ordinary Shift inheritance/disposal, song payment, movement, Support and Boost. C01-C10, K01-K10, L01-L03 are not fully accepted. |
| Same file: `drain`, `beginEffect`, `executeEffect`, `stateCheck` | Effect queue, bag ownership/order, choices and repeated lethal checks. | Automated evidence for current bag-controller priority, whole-sequence checks, optional/target choices, simultaneous damage calculation and resolving-action lifetime. R01-R11 remain partial; the effect vocabulary is limited. |
| `packages/game-core/src/cards.ts` | English-text compiler with unsupported-text diagnostics; six trigger kinds and thirteen effect operations in the reviewed contract. | Syntactic compilation is not proof of correct engine semantics. Replacements, nested plays, delayed/floating triggers, general sequential effects and other event watchers remain outside this contract. |
| `packages/game-core/src/bot.ts`: `informationSet`, `chooseBotAction` | Search uses engine legal actions and recursively masks concealed information, including nested stacks and copied contexts. | F04 fixed: getter-trap, nested snapshot and hypothetical-bounce regressions pass. Public-state invariance tests pass; this is not an exhaustive information-flow proof. |
| `apps/game-client/src/game/bot-session.ts`, `PlayLobbyPage.tsx` | Local match creation and compiler-based deck gating. | Integration/coverage reporting needs to match actual engine capabilities. UI correctness, full matches and current catalog coverage were not audited here. |

Only this document was edited by this task. Engine, compiler, bot and application changes belong to concurrent work. This review verifies the specified snapshot, not untested later edits.

### Focused review evidence, 2026-09-21

Initial read-only probes reproduced F01-F06; findings were sent directly to the engine task and main task. After their fixes, this reviewer independently loaded the existing [engine regressions](../packages/game-core/engine.test.mjs) and [bot regressions](../packages/game-core/tests/bot.test.mjs) against **actual TypeScript source**, remapping their build imports with Node module hooks and stripping types in memory. No build output or test files were created. Final result: **49 engine + 32 bot = 81 passed; 0 failed, cancelled, skipped or todo**. This supersedes the intermediate 42-engine/31-bot run, which also passed.

Tested source SHA-256:

- `engine.ts`: `0283825256d956e9cb7cbec9f017ab14b5eea1f504a4ff3ef0dd263b58375a3c`
- `bot.ts`: `a2c24226cebea6d4c06784e8fafc916b25eb1e737a97fdc4b32dbb3ffe0506b2`
- `cards.ts`: `518fc3c476bada31b224c95aaedce685fc72fa44f259531ee0728d24c7d2dfae`

| Finding | Status and independently observed regression result |
| --- | --- |
| F01 / high: Ready checkpoint (`startTurn`) | **VERIFIED FIXED.** The Willpower-2 location with 2 damage loses its temporary +1 in Ready and is banished before Set lore: owner stays at 19. Its already-queued start trigger survives. Engine test: `Ready-end state check banishes expiring lethal locations before Set lore; their start trigger remains` (1.8.1; 3.2.1-2). |
| F02 / high: inactive cost reducer (`effectiveCost`) | **VERIFIED FIXED.** Global reduction on a cost-3 card in hand does not make itself playable for 2; a self-referential reduction does. Engine test: `a global hand reducer cannot discount itself; self-referential hand reductions work` (4.3.6). |
| F03 / high: Challenger arithmetic (`getStats`, `combatDamage`) | **VERIFIED FIXED.** Strength 2 - 4 + Challenger 3 is 1 during the declaration bag and deals 1, then returns to 0 outside the attacking challenge. Engine test: `Challenger applies to raw strength before flooring and is visible during the declaration bag` (4.6.4.5; 6.6.1-2; 8.5). |
| F04 / high: concealed Boost information (`informationSet`) | **VERIFIED FIXED for tested paths.** Hidden-definition getter traps are not read; copied source snapshots mask nested facedown stacks; simulated bounce does not reveal actual hidden identities. Bot tests: `masks facedown Boost stacks even inside queued source snapshots`, `hypothetical bounce cannot expose a facedown card identity or read its getter`, and `never inspects hidden card objects, even when they would throw on access` (5.1.1.5,10; 8.4.2). |
| F05: Support amount and duplicate grants | **VERIFIED FIXED.** Quest-trigger buff changes the source from 2 to 6 before Support; recipient finishes at 7, including when the source leaves first. Printed plus granted Support generates one trigger. Engine tests: `Support uses resolution-time strength and duplicate granted Support triggers only once` and `Support retains last-known effective strength when its source leaves before resolution` (6.7.7; 8.1.2; 8.13). |
| F06: resolving action in discard (`playCard`, `drain`) | **VERIFIED FIXED.** Recover cannot choose its own still-resolving action; a later optional choice keeps it in `resolvingAction`, outside discard, until completion. Engine test: `an action cannot recover itself from discard and remains transient throughout pending choices` (4.3.3.2; 5.4.1.2; 6.7.1.2). This does not establish nested-play support. |

Additional automated evidence, always **subcase coverage** unless explicitly stated:

| Rules cases / concern | Passing evidence in the final run | Still not established |
| --- | --- | --- |
| S01-S02, S05, L01 | Ordered alteration draws before reshuffle, first-turn normal Draw skip, Ready/Set state, start bag before normal Draw; F01 location checkpoint. | Complete format validation, every skip/Set-created-card interaction. |
| S06, C02-C04, K01, L02-L03 | Drying/Rush limits; Bodyguard permits locations; Evasive/Alert distinction; ordinary Shift carries damage, drying, exertion, location and stack; drying movement pays without exerting. | Every rejected combination, all departure destinations, advanced Shift variants. |
| K07, K10, R05, R11 | Sing Together threshold/payment and transactional invalid decisions; large singer choices; successful once-per-turn Boost; failed empty-deck Boost pays without consuming successful-use allowance; bot avoids repeating zero-cost failed Boost forever. | Every singing watcher, general once-only/delayed/floating abilities. |
| R01, R06, C08 | Current bag controller finishes its entries before newly triggered active-player entries; whole sequence can heal lethal damage before checks; area damage computes all Resist values before simultaneous placement. | General event watchers and the complete deal-versus-take matrix. |
| C06, R03-R04 | Declining the whole optional sentence causes no target choice/Vanish; accepting it and choosing an amount of zero does trigger Vanish; choosing zero targets does not. | All compound optional/dependent sentences and replacement interactions. |
| E01-E03, E05-E06 | Empty deck does not lose on failed draw; own-turn end does; earlier lore win remains possible; concession during a pending action preserves its card. | Every deck-refill/end-turn ordering, simultaneous same-player win/loss clarification. |

Four additional in-memory probes independently confirmed the optional/Vanish distinction, including a mandatory chosen target with zero amount and a declined optional sentence followed by an independent lore effect. Under **6.1.4**, declining a whole optional sentence performs none of that sentence: do not move its target choice before the yes/no decision. Distinguish an optional sentence, an optional target count, and an optional amount on a mandatory chosen target (6.1.3-4; 8.14).

This verification did not run the compiler's separate suite, a TypeScript typecheck/build, browser QA, a full bot-match acceptance exercise, or production/catalog access. Those results must be reported separately by their owners; accepting a catalog row is not proof of rules completeness.

## Implementation checklist

Unchecked boxes mean the **whole requirement is not yet accepted**, not that implementation is absent or every subcase is untested. Verified fixes and automated subcases are listed above; do not close a broad box from a single passing fixture.

- [ ] **State:** six distinct zones; unique card instances; ordered decks; stacks/location membership; readiness, drying, damage, printed characteristics, modifiers, durations, and last-known references. Zone changes normally reset gained state (5.1; 6.7.7; 7).
- [ ] **Bot observations:** expose own hand and public information, not hidden faces. Neither player may inspect their own ink or facedown Boost cards. Preserve legitimately known information without giving the bot hidden engine state (5.1; 7; 8.4.2).
- [ ] **Setup:** validate Constructed requirements and exceptions; randomize starting player/decks; zero lore, seven-card hands, empty play/ink/discard. Implement the ordered, one-time hand alteration in S01 (1.10.1; 2.1-2.2; 5.2.5-6).
- [ ] **Turns:** Ready -> Set -> Draw -> Main -> End-of-Turn; queue Ready triggers until Set, gain location lore outside the bag, skip the first turn's Draw step, and honor explicit skips (3; 6.4.3).
- [ ] **Commands:** gate ink/play/activate/quest/challenge/move to the active player's Main Phase after prior resolution/checks/bag finish, except card permissions. Prevalidate before spending or revealing; distinguish transaction rollback from retrying an illegal effect choice (1.2; 1.7; 4.1).
- [ ] **Ink/costs:** separate normal inking quotas from direct placement effects; one ink per ink card. Track printed cost, payment modifiers and one chosen alternate cost separately; require complete payment and correct free-play behavior (1.5; 4.2-4.4; 6.1.7; 7.5).
- [ ] **Readiness:** dry and ready are independent. Enforce quest/sing/exert-cost restrictions, Rush's challenge exception, immediate non-exert/item abilities, persistent damage, and lore totals bounded below by zero (1.7.5; 1.9.6; 1.11; 4.4-4.5; 6.3; 8.9).
- [ ] **Challenge:** declaration/legality/costs -> exert -> challenge-duration effects -> checks/declaration bag -> simultaneous damage -> checks/damage bag -> end challenge-duration effects -> after-challenge triggers. Preserve context and banish attribution, including early termination (1.8.1.4; 4.6).
- [ ] **Damage:** separate deal/put/move/remove and deal/take events. Calculate base, modifiers, then simultaneous placement for the same effect/challenge. Resist affects dealt damage only; moving damage back onto its own source with the same effect is forbidden (1.9; 6.7.2; 8.8).
- [ ] **Resolution:** current-state choices during resolution; damage choices during calculation; complete action/ability text before checks. Model optional/sequential effects, secondary conditions, replacements, static effects, durations and deferred nested plays (6).
- [ ] **Bag:** triggered abilities only; active player starts, then each resolving player chooses/drains their own entries, including new ones, before passing. Do not let a new active-player trigger interrupt an opponent's remaining entries (7.7).
- [ ] **Keywords:** all 14 keywords and six Shift variants; only `+N` keywords stack. Preserve Shift state/effects/damage without copying underlying text; respect stack and Temporary Shift exceptions (5.1; 8).
- [ ] **Locations:** separate play/move costs, own destinations, no inherent exert/dry movement requirement, automatic Set lore, no orientation/retaliation, and residents surviving departure subject to checks (3.2.2; 4.6.8; 4.7; 5.6).
- [ ] **Checkpoints/outcomes:** check after each Start-of-Turn step, challenge declaration/damage, completed turn action, complete action/ability resolution, and turn end. Repeat to stability before bag resolution, respecting deferred Ready triggers. Handle lethal damage, 20+ lore, concession and own-turn-end empty-deck loss (1.8; 2.3.3; 3.4).

## Regression cases

Every row defines the full-case acceptance target. The evidence tables above identify **verified subcases**; unmapped requirements remain **PENDING**, and no row is claimed completely covered merely because a related test passes. Include legal and rejected commands, state deltas, ordered events, pending choices/bag, and terminal outcomes. Use fixed deck orders and deterministic randomness; human and bot commands should use the same validator.

### Setup, ink, and start of turn

| ID | Fixture / expected result | Rules |
| --- | --- | --- |
| S01 | Alter 0, 1, or all 7 opening cards. Replacements come from the remaining top cards before reshuffling; selected cards stay hidden. No hand-size penalty, second alteration, or shuffle for choosing zero. Both replacement draws finish before altered decks are shuffled. | 2.2.1-2.2.3 |
| S02 | Starting player gets no first-turn Draw step; the other player's first turn draws normally. No initial ink or automatic ink per turn. Assert seven-card opening hands and zero lore. | 2.2; 3.2.3; 4.2 |
| S03 | Reject 59-card decks, a fifth copy of the same full name, and excess ink types. Different versions count separately; dual-ink cards count toward both types. A construction-exception card must itself be eligible before its exception applies. Actual ban/rotation fixtures remain pending separate source validation. | 1.10.1.1-3; 5.2.5-6 |
| S04 | Normal ink placement reveals an inkable card, then makes it facedown/ready. Reject a second normal placement or an uninkable card. An effect that directly puts any card into ink need not reveal it or consume the normal quota. Removing/replaying an extra-ink enabler does not reset already-used placements. | 4.2; 7.5 |
| S05 | Ready changes orientation but neither heals damage nor itself resolves start triggers. Set dries existing characters and awards location lore before those triggers resolve; Draw occurs afterward. A character newly played by a Set trigger is still drying. A pre-existing Draw-skip effect suppresses that entire step. | 1.9.6; 3.2; 5.3.5; 6.4.3 |
| S06 | A newly played character cannot quest, sing, or pay an exert-symbol ability cost; a non-exert ability or movement can be legal. Rush permits a legal challenge, not singing/questing. Readying a drying character does not make it dry. An effect may exert a drying character; that is distinct from paying an exert cost. | 1.7.5; 4.4.2; 5.1; 6.3.1; 8.9 |

### Challenges and defensive keywords

| ID | Fixture / expected result | Rules |
| --- | --- | --- |
| C01 | Reject challenging one's own card, an item, or an ordinarily ready opposing character. Declaration triggers resolve before damage; changed Strength/Resist then affect damage. If a participant leaves before damage, finish the early-end procedure without a phantom damage exchange. Readying the challenger alone does not remove it from the challenge. | 4.6.1-4.6.9 |
| C02 | Two legal exerted Bodyguards allow a choice between them; other opposing characters are excluded. A ready Bodyguard normally cannot protect by forcing an illegal target. A Bodyguard may enter exerted immediately, without waiting for a trigger, while still drying. | 4.6.4; 8.3 |
| C03 | A non-Evasive/non-Alert challenger cannot challenge an Evasive Bodyguard; if no Bodyguard is otherwise legally challengeable, another legal character can be chosen. Bodyguard does not force a character target instead of a location. | 4.6.4; 4.6.8; 8.2-8.3; 8.6 |
| C04 | Alert can challenge an exerted Evasive character but grants neither Evasive protection nor permission to challenge ready characters. Check Bodyguard independently. Respect Evasive if an effect grants it to a location, too. | 4.6.4; 8.2; 8.6 |
| C05 | Ward blocks an opponent's effect choices, not normal challenges. It permits the owner's choices and does not stop a non-choosing board-wide effect. Check who makes a choice; an effect instructing a player to choose their own card is not automatically a choice by the opponent. | 1.4.3; 8.15 |
| C06 | Opponent chooses a Vanish character with an action/song: queue Vanish, finish the whole action, then resolve it. Choices by character/item abilities, a challenge, the owner's action, or a non-choosing effect do not trigger Vanish. Ward prevents the prohibited choice from happening at all. | 5.4.4; 6.7.4; 8.14-8.15 |
| C07 | An action returns a chosen Vanish character to hand: its pending Vanish does not banish it from hand. Leaving and replaying the same physical card must not let that old trigger banish the new in-play instance. | 7.1.6; 8.14.2 |
| C08 | Resist +1 and +2 combine to reduce 4 dealt damage to 1. A positive damage amount reduced to zero still produces a deal event, but no take-damage event/counter. Putting or moving counters ignores Resist and does count as taking damage. Base Strength 0 or less deals no challenge damage; do not confuse this with positive damage reduced to zero. | 1.9.2-5; 5.3.6.2; 8.8 |
| C09 | Simultaneously lethal combat banishes both participants at the check. Challenger bonuses apply only while attacking, including location challenges. A source leaving simultaneously with other cards still sees relevant leave-play triggers; preserve banish attribution for damage from a character since the last check. | 1.8.1.4; 4.6.6-7; 7.4.3; 8.5 |
| C10 | Ready, dry Reckless character with a legal character/location target blocks ending the turn, not every other action. Singing or another legal exert cost can remove that obligation. If no legal challenge exists, ending is allowed; questing remains prohibited. | 8.7 |

### Shift, songs, Support, and Boost

| ID | Fixture / expected result | Rules |
| --- | --- | --- |
| K01 | Shift onto the appropriate name, regardless of version, paying the selected alternate cost in full. Preserve exertion, dry/drying state, damage and applicable effects; use the new printed characteristics, not the underlying text. A dry/ready shifted character can sing using its new singing value. Check lethal retained damage against new Willpower. | 4.3; 5.2.6; 8.10.1-6 |
| K02 | A base character's relevant card-play watcher can trigger when another card is played on top of it. The shifted character's own on-play ability can also trigger. Paying printed cost without shifting creates an ordinary new character. Free play cannot be combined with a Shift alternate cost. | 4.3.2-4; 6.1.7; 8.10 |
| K03 | Banish, bounce, deck placement, or ink placement normally moves the entire Shift/Boost stack to the destination as separate cards; preserve destination states and face visibility. Underlying cards are not separately selectable in play. Public faceup cards returned to a deck have a publicly known relative placement; hidden cards remain hidden. | 5.1.1.5-10; 7.2.3; 8.10.7 |
| K04 | Cover Classification and Universal Shift eligibility, Duo's two matching characters, Combo's one/two-base options, and Potato's specified item. For two bases, any drying base makes the result drying and any exerted base makes it exerted. A non-character base must have been present since turn start to confer dryness. | 8.10.4; 8.10.8.1-4,6 |
| K05 | Temporary Shift's end-turn delayed trigger checks that card is still in play, removes its damage, and returns only that card to hand. Do not apply the ordinary whole-stack departure to this exception. Combined variants must satisfy all variant conditions. | 8.10.8.5; 8.10.9 |
| K06 | A normal song accepts ink or one eligible ready/dry singer. Two small singers cannot combine without Sing Together. Singer changes singing eligibility, not printed cost; Singer 4 with a +2 singing modifier counts as 6. Ink discounts on a character do not reduce its singing value. | 1.5.4; 5.4.4; 8.11 |
| K07 | Sing Together accepts one or more eligible ready/dry characters whose singing values reach its threshold. Each participant sings and gets its own relevant trigger; one participant cannot be counted twice. No partial singer payment plus ink to bridge a shortfall. The song fully resolves before singing triggers. | 1.5.3; 4.3.2; 5.4.4; 8.11-8.12 |
| K08 | Two singers both reference replaying that specific song from discard. After the first replay moves it elsewhere, the second cannot substitute another copy with the same name. | 6.1.11.1 |
| K09 | Support is optional, triggers on questing, and can select another friendly or opposing character subject to choice restrictions. Use the source's Strength at resolution, or its last-known value after leaving play; do not subtract Strength from the source. Buff lasts this turn. Extra Support does not create a second instance. | 6.6.2; 6.7.7; 8.1.2; 8.13 |
| K10 | A drying or exerted character can Boost if its payment is legal: no exert cost is inherent. A successful Boost tucks one top-deck card facedown, once during that turn for that ability; no reveal, draw event, play event, or inherited underlying text. Boosting the last deck card does not itself lose the game. | 5.1; 6.1.13.2; 8.4 |

### Locations

| ID | Fixture / expected result | Rules |
| --- | --- | --- |
| L01 | An empty location gives its printed/effective lore in Set. A location played during Main gives no immediate automatic lore. With an empty bag, reaching 20 from Set lore ends the game at the relevant check before Draw. | 1.8.1; 3.2.2; 5.6.5.4 |
| L02 | Move a drying/exerted character to one's own location by paying that destination's move cost. Reject an opposing destination, moving to the same current location, or an ordinary move to nowhere. Movement neither readies nor exerts the character and can repeat if payments and other restrictions allow. | 4.1.1; 4.7 |
| L03 | Challenge a location without checking ready/exerted state; it deals no retaliation damage. When it leaves, residents are not automatically banished. Removing its Willpower bonus can nevertheless cause a later check to banish a now-lethally-damaged resident. | 1.8.3; 4.6.8; 5.6.6 |

### Resolution, choices, and game-state checks

| ID | Fixture / expected result | Rules |
| --- | --- | --- |
| R01 | Queue two active-player triggers and one opponent trigger. Active player chooses their order and includes newly generated own triggers before passing. Once opponent resolves, new active-player triggers wait until the opponent has exhausted theirs. No FIFO/LIFO or active-player preemption after every effect. | 7.7.3-6 |
| R02 | A pending effect's chosen character is selected from the state at resolution, not locked when queued. A secondary trigger condition is checked then, not required to be true at trigger creation. A card being played or an activated ability is not itself a bag entry. | 1.7.3; 6.2.4; 6.7.2; 7.7.2 |
| R03 | One selection of up to two characters allows zero, but not the same character twice. Separate choice instructions may choose the same character where otherwise legal. Recheck requirements, Ward, and other limiters at each choice. | 6.1.3; 6.7.3 |
| R04 | An action with an impossible character choice but an independent draw still performs the draw. Declining a whole optional sentence makes no choices within it and does not trigger Vanish. Accepting it and choosing a target with an amount of zero can trigger Vanish; choosing zero targets cannot. For a dependent sequence, failure to complete its prerequisite prevents the dependent part; an unaffordable optional payment is treated as declined. | 1.2.3; 1.7.7; 6.1.4-5; 8.14 |
| R05 | Insufficient play/activation payment rejects the transaction with no spent resources or generated triggers. An illegal target during an otherwise legal resolution retries that choice rather than refunding the whole card. Free card play ignores its costs; a free activated ability still requires its exert cost. A next-character discount is used even when that next character is played free. | 1.7.6-7; 4.3.2,6; 4.4.3; 6.1.7 |
| R06 | A character temporarily reaches lethal damage but has that damage removed/moved away later in the same ability: evaluate only after the complete ability. Cascading loss of static Willpower bonuses requires repeated checks before triggers resolve. Never insert a banish check between sentences of one resolving ability. | 1.8.1-5; 6.1.2; 6.7.5 |
| R07 | Self-replacements take precedence. The affected player chooses between applicable different replacements; recalculate applicability after each. The replaced event does not trigger its original event watchers. Each replacement applies only once per event; multiple instances of the same replacement do not form an unlimited prevention reserve. | 6.5 |
| R08 | Distinguish a continuing effect that covers later arrivals from a resolved modifier applied only to cards present at resolution. Preserve negative Strength/lore internally when combining modifiers, while treating them as zero where the rules require. Ending a source-dependent bonus updates characteristics immediately, with banishment at the next checkpoint. | 6.4; 6.6 |
| R09 | A parent effect plays a child action and then continues. Finish the parent's remaining effects, then resolve the child's generated action effects before bag triggers, even if the child card changed zones. Do not treat that deferred action effect as a triggered ability. | 6.7.1.2; 6.7.8; 7.1.6.1 |
| R10 | Draw several cards one at a time; a put-into-hand operation does not trigger drawing. Resolve multi-player instructions in turn order within one complete resolution. Private-zone searches may fail to find; mandatory appropriate public-zone searches cannot. No automatic maximum-hand-size discard. | 1.12; 6.7.6; 7.1.4; 7.3 |
| R11 | A once-per-turn ability checks its own completed resolution history; another copy is independent. Delayed/floating triggers exist outside the bag until their trigger occurs. A repeated optional loop must use a finite chosen iteration count followed by a different decision, not hang the bot. | 6.1.10; 6.1.13.2; 6.2.7 |

### End of turn and empty decks: 2026 baseline

| ID | Fixture / expected result | Rules |
| --- | --- | --- |
| E01 | Draw the last card, attempt to draw from an already empty deck, or request more draws than remain: do as much as possible, with no immediate deck-loss result. Do not create successful draw events for nonexistent cards. Independent effects continue. | 1.2.3; 1.8.1.2; 1.12 |
| E02 | Active player ends their turn at fewer than 20 lore with an empty deck: lose at the final game-state check even if no draw was attempted. The next player never starts a turn. | 1.8.1.2; 2.3.3.2; 3.4.2 |
| E03 | Empty a non-active player's deck during the opponent's turn: that empty deck alone does not end the game. The affected player has until their own turn ends to win or replenish it. Emptying the deck is not a persistent loss flag. | 1.8.1.2; 2.3.3.2 |
| E04 | End-turn trigger puts a card into the active player's empty deck: finish triggers and expiration processing, then do not lose to deck exhaustion if it remains nonempty. An end-turn draw that leaves it empty instead causes the final-check loss. | 3.4; 1.8.1.2 |
| E05 | With an empty deck, reach 20 lore at a prior legal checkpoint: win without waiting for end of turn. If both players meet winning conditions at one check, apply players' results in turn order; do not pick by callback arrival. Same-player simultaneous win/loss needs the clarification noted below. | 1.8.1.1-2; 1.8.4 |
| E06 | Refuse End Turn while a required choice, unfinished action, bag entry, or Reckless challenge obligation remains. Process end-turn triggers while this-turn bonuses still exist, then expire those bonuses and resolve resulting checks/triggers, then the final empty-deck check. Concession is permitted independently, including during setup. | 2.3.3.4; 3.3.2-3.4; 8.7 |

## Differences from older rules and common recollections

The PDF's update summaries establish the dated changes below. Other entries are implementation traps under the current rules, not claims that the rule was newly introduced in July 2026.

| Older assumption | Current baseline / consequence |
| --- | --- |
| An unsuccessful draw immediately loses the game. | Empty deck is a loss at the end of that player's own turn (1.8.1.2; 2.3.3.2). Do not import fatigue, automatic discard recycling, or a failed-draw loss flag. The included April/July summaries do not establish the original introduction date of this change. |
| Damage reduced to zero was not dealt. | July 2026 explicitly separates dealing damage from taking damage: positive damage reduced to zero is still dealt, but the recipient takes none (1.9.5). |
| Only dealt damage counts as taking damage. | April 2026 clarification includes putting/moving damage; Resist still applies only to dealt damage (1.9.2-3; 8.8.3). |
| Check for lethal damage after every sentence or mutation. | April 2026 clarifies named checkpoints and evaluation after all effects of an action/ability, using the state then present (1.8.1,5; 6.7.5). |
| Shift only covers one same-name character. | July 2026 adds Duo, Combo, Temporary, and Potato Shift plus mixed-state/non-character inheritance rules (8.10.4; 8.10.8-9). Existing Classification/Universal variants also matter. |
| A free play preserves the next-card discount; readying cancels a challenge. | July 2026 clarifies that the relevant discount still applies to a free play and readying does not remove a challenger (4.3.6; 4.6.4.4). |
| Only Evasive can bypass Evasive; Ward blocks challenges; any effect choice triggers Vanish. | Alert bypasses Evasive's limiter without granting Evasive. Ward limits opponents' effect choices. Vanish is specifically an opposing action's choice and waits for that action to finish (8.2; 8.14-15). |
| The bag is a stack, or the active player always interrupts. | Each resolving player drains their own triggers before passing; only triggers enter the bag (7.7). |
| Mulligan cards are shuffled back before replacement draws; every song can combine singers. | Bottom the selected cards, replace, then shuffle after alterations. Combining singers requires Sing Together, which also permits a single qualifying singer (2.2.2; 8.12). |
| Boost's July wording means a new exert ability or a revealed card. | July notes explicitly say functionality is unchanged: a paid sequential effect at activated-ability timing, with a hidden underlying card (8.4). |

## Open work and interpretation limits

- **F01-F06 are regression-verified fixes; full rules acceptance remains pending.** The independent 81-test source run verifies the listed snapshot and subcases, not all 46 specification rows or every catalog card. No remaining failure of those six reproductions was observed. Full-match/browser QA and build/typecheck evidence are separate work.
- Before enabling a real deck, map each included card's current English text and official clarifications to supported effects. Unknown abilities must produce an explicit unsupported-card result rather than silently behaving like vanilla cards. Validate bans/rotation separately; this review does not certify every catalog card for Core.
- The PDF specifies simultaneous same-player results (1.8.4), but does not explicitly adjudicate a player first meeting both 20+ lore and own-turn empty-deck loss at the very same final checkpoint. Do not invent win-over-loss priority; obtain an official clarification and add a separate terminal-outcome fixture. Ordinary earlier-checkpoint wins are covered by E05.
- Advanced multi-base Shift fixtures need card-specific confirmation for conflicts beyond the explicitly stated ready/exerted and dry/drying rules, such as bases at different locations or combining carried effects/damage. The empty-deck failed Boost case is now tested; other incomplete sequences and general once-only abilities still need deliberate completed-resolution bookkeeping (6.1.1; 6.1.13.2), not a blanket flag on button click.
- Prefer operative numbered rules over stale cross-references: the location example in 1.8.3 points to a nonexistent 1.8.1.5, while current lethal-damage checking is 1.8.1.4; 3.4.2 points to 1.9.1 although game-state checks are in 1.8. These editorial issues are not alternate rules.
- Expand the subcase-to-test mapping before marking complete case IDs accepted. Preserve the distinction between **verified regression**, **partial case coverage**, and **planned/unsupported behavior**, including observable choices/events and final state. New broad effects are outside this review's fix-verification scope.
