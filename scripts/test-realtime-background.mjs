import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile(new URL('../src/lib/video/background-media.ts', import.meta.url),'utf8');
const runtime = stripTypeScriptTypes(await readFile(new URL('../src/lib/export/runtime.ts', import.meta.url),'utf8'));
const runtimeUrl='data:text/javascript;base64,'+Buffer.from(runtime).toString('base64');
const pixabayUrl='data:text/javascript;base64,'+Buffer.from('export async function resolvePixabayVideoUrl(url){return url}').toString('base64');
const code=stripTypeScriptTypes(source).replace('from "../export/runtime"','from "'+runtimeUrl+'"').replace('from "../pixabay-api"','from "'+pixabayUrl+'"');
const mod=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const {BackgroundMedia,startRealtimeBackgroundPlayback}=mod;
const recorderSource = await readFile(new URL('../src/lib/export/mediarecorder-export.ts', import.meta.url),'utf8');
let options={},instances=[];
class Video extends EventTarget{
 constructor(){super();this.src='';this.readyState=0;this.videoWidth=0;this.videoHeight=0;this.duration=4;this.currentTime=0;this.paused=true;this.seeking=false;this.error=null;this.playbackRate=1;this.seeks=0;this.plays=0;instances.push(this)}
 load(){if(!this.src){this.readyState=0;return}setTimeout(()=>{this.readyState=2;this.videoWidth=320;this.videoHeight=180;this.dispatchEvent(new Event('loadeddata'))},1)}
 pause(){this.paused=true}
 play(){this.paused=false;this.plays++;return Promise.resolve()}
 removeAttribute(k){if(k==='src')this.src=''}
 set currentTime(v){this._time=v;if(this.readyState>=2){this.seeks++;this.seeking=true;this.readyState=1;setTimeout(()=>{this.seeking=false;this.readyState=2;this.dispatchEvent(new Event('seeked'))},options.seekMs??1)}}
 get currentTime(){return this._time??0}
}
globalThis.HTMLVideoElement=Video;globalThis.document={createElement:()=>new Video()};
function make(opts={}){options=opts;instances=[];return new BackgroundMedia([{key:'global',url:'clip.mp4',kind:'video'}])}
test('recorder uses a fixed-rate stream and animation clock',()=>{assert.match(recorderSource,/captureStream\(FPS\)/);assert.match(recorderSource,/requestAnimationFrame/);assert.doesNotMatch(recorderSource,/requestFrame\(/)});
test('continuous export performs one initial seek, not one seek per frame',async()=>{const m=make({seekMs:5});try{await m.lock();const v=instances[0],before=v.seeks;await startRealtimeBackgroundPlayback(1);for(let i=0;i<1500;i++){v._time=(i/30)%4;await m.seek(i/30,['global'])}assert.equal(v.seeks,before);assert.equal(v.plays,1)}finally{m.close()}});
test('slow CDN seek is paid once during preparation',async()=>{const m=make({seekMs:350});try{await m.ready;instances[0]._time=2;const start=performance.now();await m.lock();assert.ok(performance.now()-start>=300);await startRealtimeBackgroundPlayback(.75);for(let i=0;i<300;i++){instances[0]._time=(i/30*.75)%4;await m.seek(i/30*.75,['global'])}assert.equal(instances[0].seeks,1);assert.equal(instances[0].playbackRate,.75)}finally{m.close()}});
test('paused, buffering and stalled playback reject instead of creating black frames',async()=>{const m=make();try{await m.lock();await startRealtimeBackgroundPlayback(1);const v=instances[0];v.paused=true;await assert.rejects(m.seek(.1,['global']),/stopped/);v.paused=false;v.readyState=1;await assert.rejects(m.seek(.2,['global']),/stopped/)}finally{m.close()}});
test('unlock pauses playback and releases the active export',async()=>{const m=make();try{await m.lock();await startRealtimeBackgroundPlayback(1);m.unlock();assert.equal(instances[0].paused,true);await assert.rejects(startRealtimeBackgroundPlayback(1),/unavailable/)}finally{m.close()}});
