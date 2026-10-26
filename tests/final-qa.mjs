// Synthetic regression checks: no real camera, microphone or cloud API.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { EventEmitter } from 'node:events';
import { createAiHandler, resolveAiConfig, resolveTranscribeConfig } from '../server/aiProxy.mjs';
const out = await build({stdin:{contents:`export {Conversation} from './src/lang/conversation'; export {EventLog} from './src/engine/events'; export {VoiceClip} from './src/lang/voiceClip'; export {ArtRecorder} from './src/export/recorder'; export {MicAnalyzer} from './src/audio/micAnalyzer'; export {findConcepts} from './src/lang/lexicon'; export {buildReport} from './src/report/report';`,resolveDir:new URL('..',import.meta.url).pathname},bundle:true,platform:'node',format:'esm',write:false});
const {Conversation,EventLog,VoiceClip,ArtRecorder,MicAnalyzer,findConcepts,buildReport}=await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
globalThis.window=globalThis; globalThis.document={baseURI:'http://localhost:5173/'};
const flush=()=>new Promise(r=>setImmediate(r));
const fresh=()=>new Conversation(new EventLog(),()=>({A:'zh',B:'en'}));
const response=text=>({ok:true,json:async()=>({translation:{text,to:'en'},keywords:{},sharedTopics:[],similarity:0})});
await test('four-language phrasebook, demo provenance, reply and self-report',()=>{
 const c=fresh(),a=c.submit('A','妈妈做的饭让我有家的感觉。','zh','manual','typed');
 assert.equal(a.translation.source,'phrasebook'); assert.equal(a.translation.text,"My mother's cooking makes me feel at home.");
 c.check(a.id,'B','clear'); assert.equal(a.check.by,'B');
 const b=c.submit('B','Me too.','en','manual','typed',undefined,undefined,{replyTo:a.id});
 assert.equal(b.translation.text,'我也是。'); assert.equal(b.replyTo,a.id);
 for(const [lang,text] of [['ja','母の手料理を食べると、家にいるような気持ちになります。'],['es','La comida de mi madre me hace sentir en casa.']]) assert.equal(c.submit('A',text,lang,'auto','typed').translation.source,'phrasebook');
 assert.equal(c.submit('A','自由就是家','zh','manual','typed').translation.source,'demo_gloss');
});
await test('late AI cannot alter a reset session or make pending count negative',async()=>{
 const requests=[]; globalThis.fetch=(_url,opts)=>new Promise(resolve=>requests.push({resolve,signal:opts.signal}));
 const c=fresh(); c.aiEnabled=true; const m=c.submit('A','自由就是家','zh','manual','typed'); c.reset();
 assert.equal(requests[0].signal.aborted,true); requests[0].resolve(response('stale')); await flush();
 assert.equal(c.messages.length,0); assert.equal(c.aiPending,0); assert.equal(m.translation.source,'demo_gloss');
});
await test('out-of-order AI respects language correction and manual translation',async()=>{
 const requests=[]; globalThis.fetch=()=>new Promise(resolve=>requests.push(resolve));
 const c=fresh(); c.aiEnabled=true; const m=c.submit('A','自由就是家','zh','manual','typed'); c.correctLanguage(m.id,'ja');
 requests[1](response('current')); await flush(); requests[0](response('stale')); await flush();
 assert.equal(m.translation.text,'current'); assert.equal(c.aiPending,0);
 const n=c.submit('A','我想种花','zh','manual','typed'); c.editTranslation(n.id,'Human correction'); requests[2](response('overwrite')); await flush();
 assert.equal(n.translation.source,'manual'); assert.equal(n.translation.text,'Human correction');
});
class FakeRecorder {
 static isTypeSupported(){return true;} state='inactive'; mimeType='audio/webm';
 start(){this.state='recording';}
 stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['test'])});this.onstop?.();});}
}
globalThis.MediaRecorder=FakeRecorder;
const device=()=>{const track={readyState:'live',stop(){this.readyState='ended';}};return {track,stream:{getTracks:()=>[track],getAudioTracks:()=>[track]}};};
const media=fn=>Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:fn}}});
await test('push-to-talk release during permission startup stops the late track',async()=>{
 const d=device();let grant;media(()=>new Promise(r=>{grant=r;}));const clip=new VoiceClip(),started=clip.start();
 await clip.stop();grant(d.stream);await started;assert.equal(d.track.readyState,'ended');assert.equal(clip.recording,false);
});
await test('voice and art recorder stop is idempotent and releases tracks',async()=>{
 const d=device();media(async()=>d.stream);const clip=new VoiceClip();await clip.start();const a=clip.stop(),b=clip.stop();
 assert.strictEqual(a,b);assert.ok((await a).blob.size>0);assert.equal(d.track.readyState,'ended');
 const v=device();globalThis.HTMLCanvasElement=class{captureStream(){return v.stream;}};document.createElement=()=>new HTMLCanvasElement();
 const engine={recordTarget:null},art=new ArtRecorder(engine);assert.equal(art.start(),true);const x=art.stop(),y=art.stop();
 assert.strictEqual(x,y);assert.ok((await x).size>0);assert.equal(engine.recordTarget,null);assert.equal(v.track.readyState,'ended');
});
await test('microphone off during permission startup releases the late track',async()=>{
 const d=device();let grant;media(()=>new Promise(r=>{grant=r;}));const mic=new MicAnalyzer(),started=mic.start();mic.stop();grant(d.stream);await started;
 assert.equal(d.track.readyState,'ended');assert.equal(mic.running,false);
});
const request=(handler,url,method='GET',body,origin='http://localhost:5173')=>new Promise(resolve=>{
 const req=new EventEmitter();req.url=url;req.method=method;req.headers={host:'localhost:5173',origin};
 const res={statusCode:200,setHeader(){},end(v){resolve({status:this.statusCode,body:JSON.parse(v)});}};
 void handler(req,res,()=>resolve({status:404}));if(body)req.emit('data',Buffer.from(JSON.stringify(body)));req.emit('end');
});
await test('AI config, no-key fallback, same-origin guard and transcript language mapping',async()=>{
 assert.equal(resolveAiConfig({DEEPSEEK_API_KEY:'test'}).model,'deepseek-flash');assert.equal(resolveAiConfig({OPENAI_API_KEY:'test'}).model,'');assert.equal(resolveTranscribeConfig({}).model,'gpt-transcribe');
 const noKey=createAiHandler({});assert.equal((await request(noKey,'/api/ai/status')).body.available,false);
 assert.equal((await request(noKey,'/api/ai/analyze','POST',{})).status,503);assert.equal((await request(noKey,'/api/ai/status','GET',null,'https://elsewhere.example')).status,403);
 const h=createAiHandler({TRANSCRIBE_API_KEY:'synthetic-test-key'},async(_url,opts)=>{assert.equal(opts.body.get('model'),'gpt-transcribe');return {ok:true,json:async()=>({text:'こんにちは',languages:[{code:'ja'}]})};});
 const r=await request(h,'/api/ai/transcribe','POST',{audio:Buffer.alloc(1200).toString('base64'),mime:'audio/webm'});
 assert.equal(r.status,200);assert.equal(r.body.language,'ja');assert.equal(r.body.detectedBy,'speech_model');assert.ok(!JSON.stringify(r.body).includes('synthetic-test-key'));
});

await test('AI provider failure retains labelled local translation',async()=>{
 globalThis.fetch=async()=>{throw new Error('Synthetic provider unavailable');};
 const c=fresh();c.aiEnabled=true;const m=c.submit('A','自由就是家','zh','manual','typed');await flush();
 assert.equal(m.translation.source,'demo_gloss');assert.match(c.aiError,/Synthetic provider unavailable/);assert.equal(c.aiPending,0);
});

await test('lexicon: no single-character cross-language false positives (夏天 is not sky, 有空 is not sky)',()=>{
 assert.deepEqual(findConcepts('我最想念外婆家的院子，夏天有很多花。','zh').sort(),['flower','home','miss']);
 assert.deepEqual(findConcepts('我有空的时候','zh'),[]);
 assert.deepEqual(findConcepts('空がきれい','ja'),['sky']);
});

await test('report: zh↔es exchange gives responses, self-reports, evidence; counts-only fields are separable',()=>{
 const log=new EventLog(); const c=new Conversation(log,()=>({A:'zh',B:'es'}));
 const a=c.submit('A','妈妈做的饭让我有家的感觉。','zh','manual','typed');
 assert.equal(a.translation.text,'La comida de mi madre me hace sentir en casa.');
 c.check(a.id,'B','clear');
 const b=c.submit('B','Yo también.','es','manual','typed',undefined,undefined,{replyTo:a.id});
 assert.equal(b.translation.text,'我也是。');
 log.push({type:'body_input',participantId:'system',source:'system',features:{mode:'mouse_sim'}});
 log.push({type:'weave_start',participantId:'shared',source:'derived',features:{handDistance:0.12}});
 log.push({type:'shared_shape',participantId:'shared',source:'derived',features:{x:0.5,y:0.4,rings:3,size:30}});
 const d=log.exportData();
 const art={sharedShapes:1,crossings:0,motifs:0,fusion:0.03,symbols:{},userSymbolsBy:{A:0,B:0,shared:0}};
 const sanctuary={active:false,growth:0,stage:-1,stageName:'',wing:{A:{spread:0,feathers:4,energy:0,texture:0},B:{spread:0,feathers:4,energy:0,texture:0}},coordinatedSec:0,sealed:0,categories:[]};
 const r=buildReport({prompt:'p',durationSec:10,events:d.events,summaries:d.summaries,eventCounts:d.eventCounts,art,messages:c.messages,topics:c.topics,similarity:{value:0,source:'local_lexicon'},sanctuary});
 assert.equal(r.responses.total,1); assert.equal(r.responses.pairs[0].toId,a.id);
 assert.equal(r.selfReports.clear,1); assert.deepEqual(r.translationSources,{phrasebook:2});
 assert.match(r.evidence.body.input,/SIMULATED/); assert.equal(r.evidence.body.session.weaveStarts[0].handDistance,0.12);
 assert.equal(r.evidence.language.messages[0].concepts.find(x=>x.id==='home').element,'house');
 assert.ok(r.limits.some(l=>/not measured understanding/.test(l)));
});
