const fs=require('fs'),vm=require('vm'),assert=require('assert');
const noop=()=>{};
function environment(){
  const nodes=new Map(),ctx=new Proxy({measureText:s=>({width:s.length*6}),createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
  class Node{constructor(id){this.id=id;this.hidden=false;this.style={};this.dataset={};this.classList={toggle:noop,add:noop,remove:noop};this.clientWidth=360;this.clientHeight=640;this.width=360;this.height=640;this.children=[];this._html='';}
    get innerHTML(){return this._html;}set innerHTML(s){this._html=s;for(const m of s.matchAll(/id="([^"]+)"/g))node(m[1]);}
    addEventListener(){}focus(){}getContext(){return ctx;}getBoundingClientRect(){return {width:360,height:640,left:0,top:0};}toDataURL(){return '';}
    querySelector(sel){if(sel==='b')return node(this.id+'-b');if(sel==='canvas')return node(this.id+'-canvas');if(sel==='.sc-body')return node(this.id+'-body');return null;}
    querySelectorAll(sel){if(sel==='.stage-card')return Array.from({length:6},(_,i)=>{const n=node('stage-'+i);n.dataset.stage=String(i);return n;});return [];}
    insertAdjacentHTML(_,s){this.innerHTML+=s;}setAttribute(){}append(){}setPointerCapture(){}
  }
  function node(id){if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);}
  const storage={};let posted=[];
  const mission={day:'2026-10-20',seed:28193,type:'survival',stage:0,weapon:1,title:'Hold the skies',duration:120};
  const sandbox={console,Math,Date,Set,Map,JSON,Number,Array,Object,String,Promise,Uint8Array,Float32Array,performance:{now:()=>0},
    localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},location:{hash:''},
    document:{getElementById:node,createElement:()=>new Node('temp'),querySelector:()=>null,querySelectorAll:()=>[],body:{dataset:{}},fonts:{load:async()=>{}},addEventListener:noop,hidden:false},
    requestAnimationFrame:()=>1,cancelAnimationFrame:noop,ResizeObserver:class{observe(){}},navigator:{vibrate:noop},setTimeout:noop,clearInterval:noop,setInterval:noop,
    GH:{install:noop,backNav:noop,account:noop,open:noop},
    SUK:{api:async(a,data)=>{if(data)posted.push([a,data]);if(a==='sq_daily'||a==='sq_daily_start')return {mission,rows:[],mine:null,token:null};return {boards:{},user:null};},firstName:s=>s.split(' ')[0]}
  };
  sandbox.window=sandbox;sandbox.addEventListener=noop;sandbox.scrollTo=noop;sandbox.devicePixelRatio=1;sandbox.innerHeight=640;
  vm.createContext(sandbox);
  let source=fs.readFileSync(require('path').resolve(__dirname,'../public_html/squadron-battle/game.js'),'utf8').replace('\ninit();','\n// init omitted in isolated simulation');
  source=source.replace('window.__sq = {', 'window.__sq = { buildCave, D, DIFF, CAVE_BOSSES, spawnBoss, startDive,');
  vm.runInContext(source,sandbox);return {sq:sandbox.__sq,node,sandbox,mission,posted};
}
(async()=>{
  const {sq,node,sandbox,mission,posted}=environment(),f=sq.features;
  sq.play(0,false);assert.equal(sq.G.state,'play');
  for(let si=0;si<6;si++){
    sq.startStage(si);
    const plan=sq.buildCave(si);
    assert.equal(plan.at(-1).w,'cboss');assert.equal(plan.at(-1).t,60);
    assert.equal(plan.filter(e=>e.w==='cage').length,1);
    assert.equal(plan.find(e=>e.w==='cage').t,30);
    assert(plan.some(e=>e.t>45&&['cturret','swarm','weavers','divers'].includes(e.w)));
    for(let d=0;d<3;d++){
      sq.G.diff=d;sq.G.mode='surf';assert.equal(sq.D().rate,sq.DIFF[d].rate);
      sq.G.mode='cave';assert.equal(sq.D().rate,sq.DIFF[d].rate*1.25);
      assert.equal(sq.D().hp,sq.DIFF[d].hp);assert.equal(sq.D().bs,sq.DIFF[d].bs);
    }
    sq.G.diff=1;sq.G.mode='surf';
    sq.startDive({x:180,y:400});
    for(let n=0;n<3800;n++){sq.setInv(100);sq.G.lives=9;sq.update(1/60);}
    assert(sq.G.boss&&sq.G.boss.cave,'Guardian must spawn after the extended route');
    sq.render();
  }
  sq.play(0,false);
  console.log('PASS: all six extended caves, rescue timing, second-half enemies, transitions, guardians and 25% fire-rate increase at every difficulty.');
  f.beginTraining();assert.equal(sq.G.training.step,0);
  sq.P.x+=40;sq.P.tx=sq.P.x;sq.update(1/60);assert.equal(sq.G.training.step,1);
  f.collect(sq.G.it[0]);assert.equal(sq.G.training.step,2);assert.equal(sq.P.wl,2);
  sq.useBomb();assert.equal(sq.G.training.step,3);assert(sq.G.en.some(e=>e.k==='gate'));
  sq.P.x=180;sq.P.y=sq.P.ty=sq.P.tx=430; // Gate entry is checked by the normal enemy update.
  const gate=sq.G.en.find(e=>e.k==='gate');sq.P.x=sq.P.tx=gate.x;sq.P.y=sq.P.ty=gate.y;
  // Training protection should not prevent entering a tutorial gate.
  sq.update(1/60);assert.equal(sq.G.training,null);assert(sq.save.trainingDone);
  assert(node('over').innerHTML.includes('Flight school complete'));
  sq.play(0,false);
  for(let si=0;si<6;si++){sq.startStage(si);f.encounter();assert(sq.G.en.length>0);for(let n=0;n<300;n++){sq.setInv(100);sq.update(1/60);}sq.render();}
  sq.startStage(0);sq.G.rescued=1;sq.G.formations=1;sq.G.stageActive=123;sq.G.deathsStage=0;sq.G.score=8000;sq.G.stageScore=0;f.recordClear();
  const r=sq.save.records['1:0'];assert(r.rescue&&r.clean&&r.formation);assert.equal(r.seconds,123);
  sq.G.formations=0;sq.G.rescued=0;sq.G.deathsStage=2;sq.G.score=100;f.recordClear();assert(sq.save.records['1:0'].clean);assert.equal(sq.save.records['1:0'].score,8000);
  sq.startStage(5);f.encounter();f.spawnBoss(sq.BOSSES[5]);assert(!f.coreOpen(sq.G.boss));
  f.damage(sq.G.en.find(e=>e.k==='generator'),1000);sq.G.boss.parts.filter(p=>!p.core).forEach(p=>p.alive=false);assert(f.coreOpen(sq.G.boss));
  const pod={k:'cap',ci:0,t:1.49,lockedCi:0};assert.equal(f.podColour(pod),0);f.collect(pod);assert.equal(sq.P.wt,0);
  const before=sq.save.reached;
  await f.beginDaily();assert.equal(sq.G.diff,1);assert.equal(sq.P.wt,mission.weapon);assert.equal(sq.P.wl,3);assert.equal(sq.save.reached,before);
  const first=JSON.stringify(f.dailyTimeline(mission));assert.equal(first,JSON.stringify(f.dailyTimeline(mission)));
  function snapshot(){return JSON.stringify(sq.G.en.map(e=>({k:e.k,x:e.x,y:e.y,hp:e.hp})));}
  for(let i=0;i<180;i++){sq.setInv(100);sq.update(1/60);}const snap1=snapshot();
  await f.beginDaily();for(let i=0;i<180;i++){sq.setInv(100);sq.update(1/60);sq.render();}assert.equal(snap1,snapshot(),'Rendering must not change the daily simulation');
  sq.G.daily.active=119.99;sq.update(.02);assert.equal(sq.G.state,'clear');assert(sq.G.daily.finished);assert(node('over').innerHTML.includes('Sortie complete'));
  assert(!posted.some(p=>p[0]==='sq_score'),'Daily scores must not reach campaign leaderboard');
  // All three daily modes run without updating campaign unlocks.
  for(const type of ['rescue','boss']){mission.type=type;await f.beginDaily();for(let i=0;i<900;i++){sq.setInv(100);sq.update(1/60);}sq.render();assert.equal(sq.save.reached,before);}
  console.log('PASS: lessons, six encounters, cumulative medals, personal records, shield logic, weapon locks, deterministic daily simulation, 120-second cutoff, daily/campaign isolation and all daily modes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
