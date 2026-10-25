const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
let nodes=[],events={},context;
class Param {cancelScheduledValues(){} setTargetAtTime(){} setValueAtTime(){} exponentialRampToValueAtTime(){} linearRampToValueAtTime(){}}
class Node {
 constructor(type){this.type=type;this.edges=[];for(const k of ['gain','frequency','detune','Q','playbackRate','threshold','knee','ratio','attack','release'])this[k]=new Param();nodes.push(this);}
 connect(n){this.edges.push(n);return n;}disconnect(){this.edges=[];}
 start(){this.started=true;}stop(){this.stopped=true;}end(){this.ended=true;this.onended?.();}
}
class AudioContext {
 constructor(){context=this;this.currentTime=10;this.sampleRate=8000;this.state='running';this.destination=new Node('destination');}
 createGain(){return new Node('gain');}createDynamicsCompressor(){return new Node('compressor');}
 createBiquadFilter(){return new Node('filter');}createConvolver(){return new Node('convolver');}
 createWaveShaper(){return new Node('shaper');}createOscillator(){return new Node('oscillator');}
 createBufferSource(){return new Node('source');}
 createBuffer(ch,n){return {getChannelData:()=>new Float32Array(n)};}
 resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}
}
const sandbox={AudioContext,Math,Float32Array,Set,localStorage:{getItem:()=>null,setItem(){}},
 document:{hidden:false,addEventListener:(k,f)=>events[k]=f},
 addEventListener(){},removeEventListener(){}};
sandbox.window=sandbox;vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../public_html/squadron-battle/lib/sfx.js'),'utf8'),sandbox);
const sound=sandbox.SukSound('test');sound.unlock();
const baseline=nodes.filter(n=>n.edges.length).length;
function drain(){nodes.filter(n=>n.started).forEach(n=>n.end());}
for(let i=0;i<1000;i++){
 sound.voice('square',900,200,.1,.1,{lp:2400,drive:1.6,vib:5,wet:.3});
 sound.hiss(.1,.1,'bandpass',1900,700,{drive:1.5,wet:.2});
 sound.sample('blast',a=>a.createBuffer(1,800),.8,{lp:1800,wet:.4});
 drain();
 assert.equal(nodes.filter(n=>n.edges.length).length,baseline,'Temporary audio graph must return to baseline');
}
const before=nodes.filter(n=>n.started).length;
for(let i=0;i<100;i++)sound.voice('sine',100,100,1,.1);
assert.equal(nodes.filter(n=>n.started).length-before,32,'Bound simultaneous sources');
sound.setMuted(true);assert(nodes.filter(n=>n.started&&!n.ended).every(n=>n.stopped),'Mute stops active and scheduled effects');drain();
sound.setMuted(false);drain();
sandbox.document.hidden=true;events.visibilitychange();assert.equal(context.state,'suspended');
const hiddenCount=nodes.length;sound.voice('sine',100,100,1,.1);assert.equal(nodes.length,hiddenCount);
sandbox.document.hidden=false;events.visibilitychange();assert.equal(context.state,'running');
context.state='interrupted';sound.unlock();assert.equal(context.state,'running');
console.log('PASS: 3,000 effects release their nodes, 32-source cap, mute, background suspension and interrupted-context recovery.');
