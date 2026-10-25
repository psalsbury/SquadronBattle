# SquadronBattle

Dedicated game repository migrated from psalsbury/PetesGames on 18 October 2026. Live game: https://salsbury.uk/squadron-battle/

## Deployment

Deploy only `public_html/squadron-battle/` to `/var/www/salsbury.uk/squadron-battle/`. Do not replace the site root. Keep the URL, storage keys and database unchanged to preserve progress and existing records.

Site home page, shared `/assets/`, the core PHP API (`/api/index.php`, `_lib/bootstrap.php`), authentication and private server data remain managed by PetesGames/on the server.

## Server API (since 2026-10-25)

Squadron Battle's own server code moved here from PetesGames:

- `public_html/api/games/squadron-battle.php` → `/var/www/salsbury.uk/api/games/squadron-battle.php`: actions `sq_*` (high scores, daily sorties) and its tables (`squadron_scores`, `squadron_daily_runs`, `squadron_daily_scores`).
- `public_html/api/_lib/squadron_daily.php` → `/var/www/salsbury.uk/api/_lib/squadron_daily.php`: the daily sortie logic. (Its header comment still says "owned by PetesGames"; this repo now owns it.)
- `tools/test-squadron-daily.php`: run `php tools/test-squadron-daily.php` (in-memory database; prints PASS).

Deploy these two files individually, never by syncing `api/`. PetesGames' `deploy-preserve-games.txt` excludes both, and its `api/_lib/admin_stats.php` still reads the daily tables for /stats/. This hosted game continues using those services. Never commit private data, credentials or daily puzzle solutions.

Original history remains in PetesGames; this repository starts with a migration snapshot.
