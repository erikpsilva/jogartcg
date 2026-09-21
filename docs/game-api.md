# Local game bootstrap API

Both endpoints require the existing player session cookie (fetch with
`credentials: 'include'`) and return `Cache-Control: no-store`. GET does not
require CSRF. These endpoints only read data; they do not save refreshed deck
validation, create a match, or persist engine state.

## GET /api/v1/game/decks/{id}

```ts
type GameDeckResponse = {
  success: true;
  language: 'pt-BR' | 'en';
  data: Omit<SavedDeck, 'cards'> & {
    cards: Array<{ quantity: number; card: GameCardDetail }>;
  };
};

type GameCardDetail = CardDetail & {
  colors: string[]; // canonical English ink names
  subtypes: string[] | null; // localized, with English fallback
  original: LocalizedCardText & { keyword_abilities: string[] | null };
  pt_br: LocalizedCardText & { keyword_abilities: string[] | null };
};
```

`SavedDeck`, `CardDetail`, and `LocalizedCardText` refer to the existing client
service interfaces. A deck includes `id`, `name`, `format`, `status`,
`total_cards`, `colors`, `validation`, `created_at`, `updated_at`, and `cards`.
`validation`, `status`, `total_cards`, and `colors` are recalculated with
`validateDeckPayload`. `format` is the validator's canonical format key.
`validation` contains `valid: boolean`, `issues: string[]`, `format: DeckFormat`,
and `checked_at: string` (UTC ISO 8601). Saved timestamps remain unchanged.

Each card contains the existing localized catalog summary (`id`, `set_code`,
`number`, `name`, `version`, `full_name`, `type`, `color`, `rarity`, `cost`,
`inkwell`, `strength`, `willpower`, `lore`, `image`, `translation_status`,
`max_copies_in_deck`), plus `original`, `pt_br`, `move_cost`, `artists`,
`foil_types`, `allowed_in_formats`, `allowed_in_tournaments_from_date`,
`translation_engine`, `translated_at`, `colors`, and `subtypes`.

Both text blocks contain `name`, `version`, `full_name`, `type`, `color`,
`rarity`, `story`, `subtypes_text`, `full_text`, `flavor_text`, `subtypes`,
`keyword_abilities`, `abilities`, `effects`, `clarifications`, and `errata`.
Nullable source fields stay null. Ability objects preserve all structured
fields, including keywords, costs, and effects; no rules text is translated
before reaching the compiler. The compiler can consume the card directly:

```ts
type CardRuleSource = {
  id: number;
  original: {
    name: string | null;
    type: string | null;
    full_text: string | null;
    abilities: unknown[] | null;
    effects: unknown[] | null;
  };
};
```

`?lang=en` selects English display fields; otherwise display defaults to
`pt-BR` with the existing English fallback. `original` is always English;
`pt_br` always contains the available stored Portuguese text, including nulls.
`image` retains `{full, thumbnail, full_foil}` URLs from the catalog.

Owned invalid/incomplete decks return HTTP 200 with `validation.valid=false`.
Inactive/missing card references are included in validation input and reported
as issues; unavailable definitions are omitted from `cards`. The client must
check validation before starting a game. Validation describes deck legality,
not whether the local engine has implemented every ability.

`pack_rush` decks are rejected by this bootstrap endpoint with HTTP 422 and
`unsupported_game_format` until the local engine supports Pack Rush rules.
Ownership is checked first; saved decks and the deck-building API are unchanged.

## GET /api/v1/game/catalog

Returns `{success: true, language: 'pt-BR' | 'en', data: GameCardDetail[]}`.
The same language parameter applies. It returns all matching printings in
ascending card ID order, with no pagination. The scope is active Action,
Character, Item, and Location cards with a legal Core or Infinity printing
of the same English full name, respecting configured format bans. This excludes
quest-only cards and includes legal reprints. It is intended for local coverage
auditing and training selection, not as an assertion of engine support.

Only whitelisted public card fields are serialized. Neither endpoint exposes
`source_payload_json`, database rows, source hashes, account data, or deck owner
IDs. A catalog entry's `allowed_in_formats` describes that printing's source
metadata; reprint legality is resolved by full English name when selecting it.

## Errors

- Anonymous: HTTP 401, `authentication_required`.
- Missing or another user's deck: identical HTTP 404, `deck_not_found`.
- Owned Pack Rush deck: HTTP 422, `unsupported_game_format`.
- Unknown game route: HTTP 404, `endpoint_not_found`.
- Authenticated POST/PUT/DELETE: HTTP 405, `method_not_allowed`, `Allow: GET`.

Errors use `{success: false, error: string, message?: string}`.

## Repeatable local PHP checks

From the repository root on this Windows/XAMPP workstation:

```powershell
& C:\xampp\php\php.exe tests/php/game-api.test.php
```

On systems with PHP on PATH, use `php tests/php/game-api.test.php`. The command
returns exit code 0 only when all 15 test cases pass. It is independent of the
TypeScript/core suite.

Requirements: local PHP 8.1+ with `pdo_sqlite` and `mbstring` enabled, plus
`proc_open`, `allow_url_fopen`, and permission to bind an ephemeral loopback
port. Use the local PHP configuration; no environment variables, account
credentials, `.env` files, or database configuration are needed. Apache and
MySQL/MariaDB do not need to be running.

The runner starts its own PHP server on `127.0.0.1`, invokes the actual game
handler, authentication helper, validator, and serializers over HTTP, and
terminates the server on completion. The test router builds synthetic decks
and cards in a fresh `sqlite::memory:` database and uses memory-only synthetic
sessions. It does not load `config/database.php`, connect to an application
database, fetch image URLs, or read/write existing accounts, decks, or sessions.
After fixture setup, SQLite is set to `PRAGMA query_only=ON`; every response
also compares table snapshots to verify that fixture rows stayed unchanged.

The 15 cases cover anonymous access, deck ownership, fresh validation, complete
English ability/effect serialization, localization/fallbacks, scalar and image
metadata, private-field exclusion, inactive/missing cards, catalog eligibility
and Song subtypes, Pack Rush rejection, unsupported methods, and strict route/ID
handling. Every HTTP request checks `Cache-Control: no-store`, JSON content type,
and unchanged fixture rows. Session cache headers are disabled in the fixture
so they cannot hide a missing `no-store` header in the game handler.

This suite tests the handler against isolated fixtures, not Apache rewriting,
real login, or production MySQL behavior. The four existing response/catalog
helpers live in `api/payload.php` and are shared with `api/index.php`, so the
tests exercise the production serializer without loading application secrets.
Test files stay under `tests/php/` and this document under `docs/`; neither
directory is included by the current release script.
