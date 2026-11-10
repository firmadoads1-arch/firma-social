import assert from 'node:assert/strict';
import {loadPreviewVideo} from '../lib/video-preview.ts';
const original=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/api/media/test-video');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'video/mp4','content-length':'3'}});};
 const progress=[],signal=new AbortController().signal;
 const one=await loadPreviewVideo('test-video',signal,p=>progress.push(p));
 const two=await loadPreviewVideo('test-video',signal,()=>{});
 assert.strictEqual(one,two);assert.equal(calls,1);assert.equal(one.size,3);assert.equal(progress.at(-1),100);
 globalThis.fetch=async()=>new Response(null,{status:401});await assert.rejects(()=>loadPreviewVideo('missing',signal,()=>{}));
 globalThis.fetch=async()=>new Response('x',{headers:{'content-length':String(51*1024*1024)}});await assert.rejects(()=>loadPreviewVideo('too-large',signal,()=>{}));
 let count=0;globalThis.fetch=async()=>{count++;if(count===1)throw Error('Network lost');return new Response(new Uint8Array([9]));};
 await assert.rejects(()=>loadPreviewVideo('retry-video',signal,()=>{}));assert.equal((await loadPreviewVideo('retry-video',signal,()=>{})).size,1);assert.equal(count,2);
 console.log('Preview: reopen reuses private video, download errors and size limits preserve retry; no persistent files.');
}finally{globalThis.fetch=original;}
