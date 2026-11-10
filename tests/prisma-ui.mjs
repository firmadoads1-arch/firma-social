import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
const temp=fs.mkdtempSync(path.join(tmpdir(),'prisma-ui-'));fs.symlinkSync(path.resolve('node_modules'),path.join(temp,'node_modules'),'dir');
try{
 const out=path.join(temp,'ui.mjs');await build({stdin:{contents:"export {default as Studio} from './app/prisma/studio';export {default as Workspace} from './app/prisma/workspace';export * from './lib/prisma/client-api';",resolveDir:process.cwd()},outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},jsx:'automatic'});
 const ui=await import(pathToFileURL(out));const html=renderToStaticMarkup(React.createElement(ui.Studio,{onBusyChange:()=>{},userName:'Firma QA',publicWorkspace:true}));
 assert(html.includes('Firma QA')&&!html.includes('John Soares'));assert(html.includes('FIRMA SOCIAL / PRISMA'));assert.equal((html.match(/class="tool-card"/g)||[]).length,14);assert(!html.includes('<video'));assert(!html.includes('src="/demo.mp4"'));
 console.log('✓ Prisma renders all fourteen tools without loading video players or changing Firma navigation.');
 const postcss=createRequire(import.meta.resolve('@tailwindcss/postcss'))('postcss');for(const name of ['globals','video-layout','video-batch','integration']){const doc=postcss.parse(fs.readFileSync('app/prisma/'+name+'.css','utf8'));doc.walkRules(rule=>{if(rule.parent.type==='atrule'&&/keyframes/.test(rule.parent.name))return;assert(rule.selector.split(/,(?![^()]*\))/).every(s=>s.trim().startsWith('.prisma-app')),name+': '+rule.selector);});}
 console.log('✓ Prisma styles are scoped; they cannot restyle Firma calendars, posts, modals or library.');
 globalThis.location={origin:'https://firma.test'};ui.configureProject({project:'project-a',group:'group-a'});const saved={id:'output-id'},calls=[];
 globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),method:options.method??'GET'});if(options.method==='POST')throw Error('Response lost after commit');return Response.json({...saved,id:new URL(String(url)).searchParams.get('uploadId')});};
 const blob=new Blob(['valid media file'],{type:'video/mp4'});const first=await ui.api('files?name=out.mp4&kind=export',{method:'POST',body:blob}),second=await ui.api('files?name=out.mp4&kind=export',{method:'POST',body:blob});assert.equal(first.id,second.id);assert.deepEqual(calls.map(c=>c.method),['POST','GET','POST','GET']);assert(calls.every(c=>c.url.startsWith('https://firma.test/api/prisma/files?')&&c.url.includes('project=project-a')&&c.url.includes('group=group-a')));
 console.log('✓ A lost save response is reconciled by GET; manual save retries reuse the same receipt ID.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
