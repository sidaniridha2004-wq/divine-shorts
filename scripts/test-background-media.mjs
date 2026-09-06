import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = new Map();
async function moduleUrl(path) {
  if (modules.has(path)) return modules.get(path);
  let code = stripTypeScriptTypes(await readFile(path, 'utf8')).replaceAll('import.meta.env', '({VITE_PIXABAY_API_KEY:"test-only"})');
  for (const match of [...code.matchAll(/from\s+"(\.[^"]+)"/g)]) {
    const child = resolve(dirname(path), match[1] + (match[1].endsWith('.ts') ? '' : '.ts'));
    code = code.replace(match[0], 'from "' + await moduleUrl(child) + '"');
  }
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  modules.set(path, url); return url;
}
const { BackgroundMedia, isVideoSource } = await import(await moduleUrl(resolve(root, 'src/lib/video/background-media.ts')));
const { getBestPixabayVideoUrl, resolvePixabayVideoUrl } = await import(await moduleUrl(resolve(root, 'src/lib/pixabay-api.ts')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let options = {}, videos = [];
class Video extends EventTarget {
  constructor() { super(); this.options = {...options}; this.src=''; this.readyState=0; this.duration=NaN; this.videoWidth=0; this.videoHeight=0; this.paused=true; this.seeking=false; this.error=null; this.time=0; this.decodedTime=0; this.plays=0; this.timers=[]; videos.push(this); }
  load() {
    this.timers.forEach(clearTimeout); this.timers=[];
    if (!this.src) { this.readyState=0; return; }
    this.timers.push(setTimeout(() => {
      if (this.options.fail) { this.error = new Error('test network failure'); this.dispatchEvent(new Event('error')); return; }
      this.duration=2; this.videoWidth=320; this.videoHeight=180; this.readyState=2;
      this.dispatchEvent(new Event('loadeddata'));
    }, this.options.loadMs ?? 5));
  }
  get currentTime() { return this.time; }
  set currentTime(t) {
    this.time=t; this.seeking=true; this.readyState=1;
    this.timers.push(setTimeout(() => { this.decodedTime=t; this.seeking=false; this.readyState=2; this.dispatchEvent(new Event('seeked')); }, this.options.seekMs ?? 5));
  }
  pause() { this.paused=true; }
  play() { this.paused=false; this.plays++; return Promise.resolve(); }
  removeAttribute(name) { if (name==='src') this.src=''; }
}
globalThis.HTMLVideoElement=Video;
globalThis.document={ createElement: tag => { assert.equal(tag,'video'); return new Video(); } };
function media(opts={}) { options=opts; videos=[]; return new BackgroundMedia([{key:'global',url:'fixture.mp4',kind:'video'}]); }
const file=(url,width,height,size)=>({url,width,height,size,thumbnail:'poster.jpg'});

test('legacy fallback reproduces a successful return while a frame is still unavailable', async()=>{
  options={seekMs:450}; const v=new Video(); v.readyState=2; v.videoWidth=320; v.videoHeight=180; v.duration=2;
  // Exact legacy 250ms success-on-timeout behavior from PreviewCanvas.
  const seek = (v,t) => {
    if (!Number.isFinite(t) || v.readyState<2 || Math.abs(v.currentTime-t)<0.015) return Promise.resolve();
    return new Promise(resolve=>{ let settled=false; const done=()=>{if(settled)return;settled=true;clearTimeout(timer);v.removeEventListener('seeked',done);resolve();};v.addEventListener('seeked',done,{once:true});const timer=setTimeout(done,250);v.currentTime=t; });
  };
  await seek(v,1);
  assert.equal(v.seeking,true); assert.equal(v.readyState,1); assert.equal(v.decodedTime,0);
  v.removeAttribute('src');v.load();
});
test('video URL classification accepts query strings and rejects photo URLs',()=>{
  assert.equal(isVideoSource('https://cdn.pixabay.com/video/2024/06/29/218714_large.mp4'),true);
  assert.equal(isVideoSource('https://x.test/clip.mp4?token=x'),true);
  assert.equal(isVideoSource('https://x.test/poster.jpg?description=mp4'),false);
});
test('334 MB UHD rendition is replaced by a bounded API-provided HD file',()=>{
  const url=getBestPixabayVideoUrl({videos:{large:file('uhd.mp4',3840,2160,334_000_000),medium:file('hd.mp4',1920,1080,40_000_000),small:file('sd.mp4',960,540,10_000_000)}});
  assert.equal(url,'hd.mp4');
});
test('an oversized HD file yields to a smaller real rendition',()=>{
  assert.equal(getBestPixabayVideoUrl({videos:{large:file('uhd.mp4',3840,2160,334_000_000),medium:file('hd.mp4',1920,1080,120_000_000),small:file('sd.mp4',960,540,30_000_000)}}),'sd.mp4');
});
test('legacy shared URL resolves through the API without guessing rendition paths',async()=>{
  const originalFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async url=>{calls++;assert.equal(new URL(url).searchParams.get('id'),'218714');return {ok:true,json:async()=>({hits:[{id:218714,videos:{medium:file('https://cdn.pixabay.com/video/different-real-path/hd.mp4',1920,1080,40_000_000)}}]})};};
  try { const url='https://cdn.pixabay.com/video/2024/06/29/218714_large.mp4';
    assert.equal(await resolvePixabayVideoUrl(url),'https://cdn.pixabay.com/video/different-real-path/hd.mp4');
    await resolvePixabayVideoUrl(url);assert.equal(calls,1);
    assert.equal(await resolvePixabayVideoUrl('https://other.test/218714_large.mp4'),'https://other.test/218714_large.mp4');
  } finally {globalThis.fetch=originalFetch;}
});
test('loading is awaited, late events cannot autoplay, and export creates no duplicate video',async()=>{
  const m=media({loadMs:180}); const start=performance.now();
  try {await m.lock(); assert.ok(performance.now()-start>=150);assert.equal(videos.length,1);assert.equal(videos[0].plays,0);assert.equal(videos[0].paused,true);await m.seek(0.5,['global']);assert.equal(videos.length,1);}
  finally{m.close();}
});
test('slow seeks wait for decoded data instead of returning at 250ms',async()=>{
  const m=media({seekMs:420});
  try {await m.lock();const start=performance.now();await m.seek(1,['global']);assert.ok(performance.now()-start>=390);assert.equal(videos[0].decodedTime,1);assert.equal(videos[0].seeking,false);assert.equal(videos[0].readyState,2);}
  finally{m.close();}
});
test('loop boundaries and backward seeks advance to the requested source time',async()=>{
  const m=media();try{await m.lock();for(const t of [0.25,1.25,2.25,3.25,0.25]){await m.seek(t,['global']);assert.equal(videos[0].decodedTime,t%2);}}finally{m.close();}
});
test('a still-pending seek at the same currentTime is not treated as ready',async()=>{
  const m=media({seekMs:80});try{await m.lock();videos[0].currentTime=1;await m.seek(1,['global']);assert.equal(videos[0].seeking,false);assert.equal(videos[0].decodedTime,1);}finally{m.close();}
});
test('network/decode errors reject preparation, not a successful black frame',async()=>{
  const m=media({fail:true});try{await assert.rejects(m.lock(),/Background could not be loaded/);}finally{m.close();}
});
test('aborting a pending export seek rejects promptly',async()=>{
  const m=media({seekMs:500});const abort=new AbortController();
  try{await m.lock();const work=m.seek(1,['global'],abort.signal);setTimeout(()=>abort.abort(),20);await assert.rejects(work,e=>e.name==='AbortError');}
  finally{m.close();}
});
test('disposing an old selection cancels loading and removes its media',async()=>{
  const m=media({loadMs:250});const loading=m.ready;await sleep(10);m.close();await assert.rejects(loading,e=>e.name==='AbortError');assert.equal(m.elements.size,0);assert.equal(videos[0].src,'');assert.equal(videos[0].plays,0);
});
test('preview play cannot resume the video while export owns it',async()=>{
  const m=media();try{await m.lock();m.play();assert.equal(videos[0].paused,true);m.unlock();m.play();assert.equal(videos[0].paused,false);}finally{m.close();}
});
