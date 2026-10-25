<?php
// Squadron daily missions. Shared API module, owned by PetesGames.
if (!defined('SUK')) { http_response_code(404); exit; }

function sq_daily_config(?string $day = null): array {
    $day ??= (new DateTimeImmutable('now', new DateTimeZone('Europe/London')))->format('Y-m-d');
    $seed = (int)hexdec(substr(hash('sha256', 'squadron-daily-v16|' . $day), 0, 7));
    $type = ['survival', 'rescue', 'boss'][$seed % 3];
    $titles = ['survival' => 'Hold the skies', 'rescue' => 'Bring them home', 'boss' => 'Boss scramble'];
    $desc = [
        'survival' => 'Survive for two minutes. Destroy enemy formations and collect points.',
        'rescue' => 'Dive straight into the caves. Rescue pilots and defeat guardians; each escape leads to another rescue.',
        'boss' => 'Face successive bosses for two minutes. Destroy their weapons, expose their cores and keep flying.',
    ];
    return ['day' => $day, 'seed' => $seed, 'type' => $type, 'title' => $titles[$type], 'description' => $desc[$type],
        'stage' => (int)(intdiv($seed, 3) % 6), 'weapon' => (int)(intdiv($seed, 19) % 4), 'duration' => 120, 'version' => 16];
}

// The tables are created with the rest of the schema, in migrate() (api/_lib/bootstrap.php).
function sq_daily_db(): PDO { return db(); }

function sq_daily_mine(PDO $pdo, string $day, int $uid): ?array {
    $st = $pdo->prepare('SELECT score, submitted_at FROM squadron_daily_scores WHERE day=? AND user_id=?');
    $st->execute([$day, $uid]); $row = $st->fetch(); if (!$row) return null;
    $st = $pdo->prepare('SELECT COUNT(*) FROM squadron_daily_scores WHERE day=? AND (score>? OR (score=? AND (submitted_at<? OR (submitted_at=? AND user_id<?))))');
    $st->execute([$day,$row['score'],$row['score'],$row['submitted_at'],$row['submitted_at'],$uid]);
    return ['score'=>(int)$row['score'],'rank'=>(int)$st->fetchColumn()+1];
}

function act_sq_daily(): void {
    $pdo=sq_daily_db(); $c=sq_daily_config(); $u=current_user();
    $st=$pdo->prepare('SELECT u.name,s.score FROM squadron_daily_scores s JOIN users u ON u.id=s.user_id WHERE s.day=? ORDER BY s.score DESC,s.submitted_at ASC,s.user_id ASC LIMIT 10');
    $st->execute([$c['day']]);
    json_out(['mission'=>$c,'rows'=>array_map(fn($r)=>['name'=>$r['name'],'score'=>(int)$r['score']],$st->fetchAll()),
        'mine'=>$u?sq_daily_mine($pdo,$c['day'],(int)$u['id']):null]);
}

function act_sq_daily_start(): void {
    $c=sq_daily_config(); $u=current_user();
    // Visitors can fly the same mission; only signed-in players submit scores.
    if (!$u) json_out(['mission'=>$c,'token'=>null]);
    $pdo=sq_daily_db();
    $st=$pdo->prepare('SELECT MAX(started_at) FROM squadron_daily_runs WHERE user_id=?');$st->execute([$u['id']]);
    if((int)$st->fetchColumn()>time()-3) fail('Please wait a moment before starting another sortie.',429);
    $token=bin2hex(random_bytes(24));
    $pdo->prepare('INSERT INTO squadron_daily_runs(token_hash,user_id,day,started_at) VALUES(?,?,?,?)')
        ->execute([hash('sha256',$token),$u['id'],$c['day'],time()]);
    $pdo->prepare('DELETE FROM squadron_daily_runs WHERE started_at<?')->execute([time()-172800]);
    json_out(['mission'=>$c,'token'=>$token]);
}

function act_sq_daily_submit(): void {
    $u=require_user();$b=body();$pdo=sq_daily_db();
    $token=(string)($b['token']??'');$score=filter_var($b['score']??null,FILTER_VALIDATE_INT);
    $secs=filter_var($b['secs']??null,FILTER_VALIDATE_INT);$rescued=filter_var($b['rescued']??null,FILTER_VALIDATE_INT);$bosses=filter_var($b['bosses']??null,FILTER_VALIDATE_INT);
    if(!preg_match('/^[a-f0-9]{48}$/D',$token)||$score===false||$secs===false||$rescued===false||$bosses===false||
        $secs<0||$secs>120||$score<0||$score>2000000||$score>($secs+1)*30000||$rescued<0||$rescued>6||$bosses<0||$bosses>40)fail('That daily score could not be saved.');
    $hash=hash('sha256',$token);$st=$pdo->prepare('SELECT * FROM squadron_daily_runs WHERE token_hash=? AND user_id=?');$st->execute([$hash,$u['id']]);$run=$st->fetch();
    if(!$run||time()-(int)$run['started_at']>14400||time()-(int)$run['started_at']<$secs-3)fail('This sortie could not be verified. Start a new daily sortie.');
    if((int)$run['consumed']){json_out(sq_daily_mine($pdo,$run['day'],(int)$u['id'])??['score'=>0,'rank'=>1]);}
    $pdo->beginTransaction();
    $st=$pdo->prepare('UPDATE squadron_daily_runs SET consumed=1 WHERE token_hash=? AND consumed=0');$st->execute([$hash]);
    if(!$st->rowCount()){$pdo->rollBack();fail('This sortie has already been submitted.');}
    $pdo->prepare('INSERT INTO squadron_daily_scores(day,user_id,score,secs,rescued,bosses,submitted_at) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(day,user_id) DO UPDATE SET score=excluded.score,secs=excluded.secs,rescued=excluded.rescued,bosses=excluded.bosses,submitted_at=excluded.submitted_at
        WHERE excluded.score>squadron_daily_scores.score')->execute([$run['day'],$u['id'],$score,$secs,$rescued,$bosses,time()]);
    $pdo->commit();json_out(sq_daily_mine($pdo,$run['day'],(int)$u['id']));
}
