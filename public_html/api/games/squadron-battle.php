<?php
// Squadron Battle: its server actions and database tables. Loaded by api/index.php; uses only the core (_lib/bootstrap.php, plus tx_begin/tx_commit from api/index.php) and nothing from other games' modules.
if (!defined('SUK')) { http_response_code(404); exit; }
require_once __DIR__ . '/../_lib/squadron_daily.php';

// Board periods: when today, this week, month and year began (UK time), as unix seconds
function sq_periods(): array {
    $tz = new DateTimeZone('Europe/London');
    $now = new DateTimeImmutable('now', $tz);
    return [
        'day' => $now->setTime(0, 0)->getTimestamp(),
        'week' => $now->modify('monday this week')->setTime(0, 0)->getTimestamp(),
        'month' => $now->modify('first day of this month')->setTime(0, 0)->getTimestamp(),
        'year' => $now->setDate((int)$now->format('Y'), 1, 1)->setTime(0, 0)->getTimestamp(),
        'all' => 0,
    ];
}

suk_game('squadron-battle', [
    'sq_score' => ['act_sq_score', true],
    'sq_board' => ['act_sq_board', false],
    'sq_daily' => ['act_sq_daily', false],
    'sq_daily_start' => ['act_sq_daily_start', true],
    'sq_daily_submit' => ['act_sq_daily_submit', true],
], <<<'SQL'
        CREATE TABLE IF NOT EXISTS squadron_scores (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            score INTEGER NOT NULL,
            stage INTEGER NOT NULL,
            diff INTEGER NOT NULL,
            rescued INTEGER NOT NULL DEFAULT 0,
            won INTEGER NOT NULL DEFAULT 0,
            secs INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sq_time ON squadron_scores(created_at, score);
        CREATE INDEX IF NOT EXISTS sq_user ON squadron_scores(user_id, score);
        -- Squadron daily sorties (api/_lib/squadron_daily.php): one-use run tokens and each player's best per day.
        CREATE TABLE IF NOT EXISTS squadron_daily_runs (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            consumed INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS squadron_daily_runs_user ON squadron_daily_runs(user_id, started_at);
        CREATE TABLE IF NOT EXISTS squadron_daily_scores (
            day TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            score INTEGER NOT NULL,
            secs INTEGER NOT NULL,
            rescued INTEGER NOT NULL,
            bosses INTEGER NOT NULL,
            submitted_at INTEGER NOT NULL,
            PRIMARY KEY (day, user_id)
        );
SQL);

// ---------- Squadron Battle high scores ----------
// One row per finished run. Same periods as Flipfall (UK time); basic range checks only, no anti-cheat.
function sq_rank(int $since, int $best): int {
    $st = db()->prepare('SELECT COUNT(*) FROM (SELECT user_id FROM squadron_scores WHERE created_at >= ? GROUP BY user_id HAVING MAX(score) > ?)');
    $st->execute([$since, $best]);
    return 1 + (int)$st->fetchColumn();
}

function sq_mine(int $uid): array {
    $out = [];
    foreach (sq_periods() as $k => $since) {
        $st = db()->prepare('SELECT MAX(score) FROM squadron_scores WHERE user_id = ? AND created_at >= ?');
        $st->execute([$uid, $since]);
        $best = $st->fetchColumn();
        $out[$k] = $best === null ? null : ['best' => (int)$best, 'rank' => sq_rank($since, (int)$best)];
    }
    return $out;
}

function act_sq_score(): void {
    $u = require_user();
    $b = body();
    $score = (int)($b['score'] ?? -1); $stage = (int)($b['stage'] ?? 0); $diff = (int)($b['diff'] ?? -1);
    $rescued = (int)($b['rescued'] ?? -1); $won = (int)($b['won'] ?? 0) ? 1 : 0; $secs = (int)($b['secs'] ?? 0);
    if ($score < 0 || $score > 20000000 || $stage < 1 || $stage > 6 || $diff < 0 || $diff > 2 || $rescued < 0 || $rescued > 6 || $secs < 0) fail('That score could not be saved.');
    $st = db()->prepare('SELECT MAX(created_at) FROM squadron_scores WHERE user_id = ?');
    $st->execute([$u['id']]);
    if ((int)$st->fetchColumn() > time() - 5) fail('Scores are coming in too fast. Try again in a moment.', 429);
    if ($score > 0) {
        db()->prepare('INSERT INTO squadron_scores (user_id, score, stage, diff, rescued, won, secs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$u['id'], $score, $stage, $diff, $rescued, $won, min($secs, 86400), time()]);
    }
    json_out(['mine' => sq_mine((int)$u['id'])]);
}

function act_sq_board(): void {
    $u = current_user();
    $boards = [];
    foreach (sq_periods() as $k => $since) {
        // SQLite fills the bare columns (stage, diff) from the row with the MAX score.
        $st = db()->prepare('SELECT u.id, u.name, u.picture, MAX(s.score) AS best, s.stage, s.diff, MIN(s.created_at) AS first_at
            FROM squadron_scores s JOIN users u ON u.id = s.user_id
            WHERE s.created_at >= ? GROUP BY s.user_id ORDER BY best DESC, first_at ASC LIMIT 10');
        $st->execute([$since]);
        $boards[$k] = array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'picture' => $r['picture'], 'score' => (int)$r['best'], 'stage' => (int)$r['stage'], 'diff' => (int)$r['diff']], $st->fetchAll());
    }
    json_out(['boards' => $boards, 'user' => $u ? public_user($u) : null, 'mine' => $u ? sq_mine((int)$u['id']) : null,
        'google_client_id' => config()['google_client_id']]);
}

// Delete my account: the player's scores and progress go.
suk_hook('delete', function (PDO $pdo, int $uid): void {
    foreach (['squadron_scores', 'squadron_daily_runs', 'squadron_daily_scores'] as $t) $pdo->prepare("DELETE FROM $t WHERE user_id = ?")->execute([$uid]);
});
