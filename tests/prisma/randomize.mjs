import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('wrangler/package.json'));const {build}=require('esbuild');
const result=await build({stdin:{contents:"export * from './lib/prisma/randomize.ts';export {defaults} from './lib/prisma/catalog.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {randomizeSettings,exportVariations,defaults}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const base={...defaults,ratio:'9:16',maxSide:1920,overlay:'Meu texto',intro:1,outro:1,author:'Autor'};
const a=randomizeSettings(base,'advanced',123),b=randomizeSettings(base,'advanced',124);
assert.notDeepEqual(a,b);assert.deepEqual(a,randomizeSettings(base,'advanced',123));
for(const key of ['ratio','maxSide','overlay','introText','outroText','author','metaMode','imageFormat'])assert.equal(a[key],base[key]);
for(let seed=0;seed<500;seed++){const s=randomizeSettings(base,'advanced',seed);assert.ok(s.contrast>=.88&&s.contrast<=1.28);assert.ok(s.brightness>=-.07&&s.brightness<=.07);assert.ok(s.zoom>=1.01&&s.zoom<=1.18);assert.ok(s.speed>=.9&&s.speed<=1.15);assert.ok(s.pitch>=-2&&s.pitch<=2);assert.ok(s.intro>=.5&&s.intro<=2);}
const variants=exportVariations('variants',a);assert.equal(variants.length,3);assert.deepEqual(variants[0],a);assert.notDeepEqual(variants[1],variants[2]);assert.deepEqual(variants,exportVariations('variants',a));
assert.equal(randomizeSettings(defaults,'image',33).speed,1);assert.equal(randomizeSettings(defaults,'audio',33).zoom,1);assert.deepEqual(randomizeSettings(base,'remux'),base);assert.equal(randomizeSettings(defaults,'cloak',99).intro,0);
console.log('PASS randomized ranges, repeatability, preserved text/format and distinct export variants');
