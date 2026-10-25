<?php
define('SUK',true);
class Result extends Exception { public array $value; function __construct($v){$this->value=$v;} }
function json_out($v){throw new Result($v);}
function fail($m,$code=400){throw new RuntimeException($m,$code);}
function db(){static $p;if(!$p){$p=new PDO('sqlite::memory:');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$p->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);$p->exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO users VALUES(1,'Test pilot'),(2,'Other pilot');");}return $p;}
$uid=1;$request=[];
function current_user(){global $uid;return $uid?['id'=>$uid]:null;}
function require_user(){return current_user()??fail('Sign in',401);}
function body(){global $request;return $request;}
// The tables are created by the game's API module (since the 2026-10-21 API split), so load it
// with stand-ins for the core's suk_game()/suk_hook() that create its tables in the test database.
function suk_game($game,$actions,$schema=''){db()->exec($schema);}
function suk_hook($event,$fn){}
require dirname(__DIR__).'/public_html/api/games/squadron-battle.php';
function call_api($fn){try{$fn();}catch(Result $r){return $r->value;}throw new RuntimeException('No output');}
function check($v,$m){if(!$v)throw new RuntimeException($m);}
$c=sq_daily_config('2026-10-25');check($c===sq_daily_config('2026-10-25'),'stable UK date config');
check($c['duration']===120&&$c['stage']<6&&$c['weapon']<4,'fixed mission');
$out=call_api('act_sq_daily_start');check(strlen($out['token'])===48,'run token');
db()->exec('UPDATE squadron_daily_runs SET started_at=started_at-122');
$request=['token'=>$out['token'],'score'=>50000,'secs'=>120,'rescued'=>1,'bosses'=>2];
$saved=call_api('act_sq_daily_submit');check($saved['rank']===1&&$saved['score']===50000,'save and rank');
$again=call_api('act_sq_daily_submit');check($again===$saved,'idempotent repeated submit');
$out2=call_api('act_sq_daily_start');db()->exec('UPDATE squadron_daily_runs SET started_at=started_at-122');
$request=['token'=>$out2['token'],'score'=>10000,'secs'=>120,'rescued'=>0,'bosses'=>0];$saved=call_api('act_sq_daily_submit');check($saved['score']===50000,'lower replay preserves best');
$uid=2;$out3=call_api('act_sq_daily_start');$request=['token'=>$out3['token'],'score'=>1000,'secs'=>120,'rescued'=>0,'bosses'=>0];
try{call_api('act_sq_daily_submit');throw new Exception('wall-clock check failed');}catch(RuntimeException $e){check(str_contains($e->getMessage(),'verified'),'early submission rejected');}
db()->exec('UPDATE squadron_daily_runs SET started_at=started_at-122');$request['score']=60000;$saved=call_api('act_sq_daily_submit');check($saved['rank']===1,'new leader');
$uid=1;$board=call_api('act_sq_daily');check($board['mine']['rank']===2,'rank shifts');
$uid=null;$guest=call_api('act_sq_daily_start');check($guest['token']===null,'guest practice');
echo "PASS: config, mission limits, run tokens, score save/rank, duplicate submission, best-score preservation, elapsed-time rejection, rank changes and guest flights.\n";
