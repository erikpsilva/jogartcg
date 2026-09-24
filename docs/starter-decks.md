# Starter Deck (PHP)

Route: `/starter-decks/` (or `/jogartcg/starter-decks/` locally).
This section is PHP + HTML + CSS + plain JavaScript. No Node process or build is required.

## Catalog

- `config/starter_decks.php`: server-owned snapshot of 23 LorcanaJSON Starter Deck lists, checked 2026-09-23 (S1–S10 and S12; there is no S11 starter in the source).
- 60 cards per list. Booster contents are random and excluded.
- S12 has two lists from one 2-Player Starter Set package, shown with the same box cover.
- Gateway and Illumineer's Quest are distinct products, not Starter Deck lists.
- Card IDs are matched to the existing local LorcanaJSON catalog; missing cards disable import rather than substituting cards.
- Covers in `images/starter-decks/`; the manifest records exact source URLs and language. Older box covers are German editions. Card list content is language-independent.
- Sources: https://lorcanajson.org/ ; https://www.legendensammler.de/decks ; https://www.ravensburger.ie/en-IE/ravensburger/products/disney-lorcana/starter-decks

## Publication

1. Back up the production DB and execute `database/migrations/2026-09-23-starter-decks.sql` once in the hosting DB panel. It only adds the collection mapping table. Already applied locally.
2. Package with `powershell -File scripts/build-release.ps1`. The default now packages existing versioned assets without Node. Optional `-RebuildLegacyAssets` retains the old build only for explicit legacy maintenance.
3. The release includes `starter-decks/`, covers, API, catalog config and navigation integration. No SQL or credentials are published. No deployment was performed by this change.
4. Ensure the production card catalog contains the starter cards; otherwise the API returns an unavailable state.

The existing React client remains a legacy compiled client; this change does not migrate all existing pages. `client/native-navigation.js` adds the native PHP menu to the currently compiled header and handles the login return hash. Its source copy in `apps/game-client/public/` and the source header preserve the entry in future legacy builds. The new PHP section is outside the existing service-worker scope and requires connectivity.

## API and safety

The PHP page mounts the same `AppHeader` component as the client via `src/native-header.tsx`, with the same compiled site stylesheet, auth, settings and install providers. Starter-specific CSS is scoped to `.starter-content` so it cannot override header controls. Compile both browser entries without Node using `php scripts/build-client-native.php`; deploy `client/assets/shared-header-v1.js` along with the PHP page. Header navigation points to the client routes, not PHP-local hash routes.

- `GET /api/index.php?r=/v1/starter-decks`: public list.
- `GET /api/index.php?r=/v1/starter-decks/S1-1`: card details and quantities.
- `POST /api/index.php?r=/v1/starter-decks/S1-1/collect`: active login and CSRF header required.
- Body card lists, quantities and account IDs are ignored. Source list comes only from the server manifest.
- Imports save an editable `preconstructed` deck in Meus Decks. It is not a physical inventory or a guarantee that every gameplay effect is implemented.
- Transaction + account row lock + unique collection key prevent duplicate imports. Repeated imports return the existing deck without resetting the user's edits. Deleting the deck cascades the link and allows importing again.
- Gameplay engines, rules, room flow and existing decks are unchanged.

Checks: `C:\xampp\php\php.exe tests/api/starter_decks_test.php`. Uses disposable local users, no UI navigation. Optional `JOGARTCG_TEST_API` changes the test HTTP endpoint; always target the same local DB used by the CLI.
