import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('wrangler/package.json')),{build}=require('esbuild');
const runtime=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/'),{createCanvas,loadImage}=runtime('@napi-rs/canvas');
globalThis.document={createElement:()=>createCanvas(16,16)};
globalThis.createImageBitmap=async blob=>{const image=await loadImage(Buffer.from(await blob.arrayBuffer()));image.close=()=>{};return image;};
const bundle=await build({stdin:{contents:"export * from './lib/prisma/profile-layout.ts';export * from './lib/prisma/profile-types.ts';export {cropAroundFace} from './lib/prisma/face-crop.ts';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
const {prepareProfilePhoto,paintAvatar,paintProfileLayer,avatarCropRect,cropAroundFace,defaultProfileLayout}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const source=createCanvas(420,1000),g=source.getContext('2d'),portrait=await loadImage('outputs/reference-avatar.png');
g.fillStyle='#43445e';g.fillRect(0,0,420,1000);g.drawImage(portrait,70,20,280,280);g.fillStyle='#292938';g.fillRect(130,300,160,700);
const photo=await prepareProfilePhoto(new File([source.toBuffer('image/png')],'portrait.png',{type:'image/png'})),image=await createImageBitmap(photo);
assert.equal(image.width,420);assert.equal(image.height,1000);
console.log('PASS portrait uploads preserve the full head and original aspect ratio');
const face={originX:150,originY:80,width:120,height:150},crop=cropAroundFace(face,420,1000),rect=avatarCropRect(420,1000,crop);
assert.ok(rect.y<=20);assert.ok(rect.x>=0&&rect.x+rect.side<=420);assert.ok(rect.y+rect.side<=1000);
const center={x:rect.x+rect.side/2,y:rect.y+rect.side/2},radius=rect.side/2;
for(const point of [{x:210,y:40},{x:210,y:240}])assert.ok(Math.hypot(point.x-center.x,point.y-center.y)<radius,'hair and chin stay within the circle');
const canvas=createCanvas(640,400),ctx=canvas.getContext('2d');ctx.fillStyle='#f5f1fa';ctx.fillRect(0,0,640,400);
for(const [x,value] of [[20,null],[340,crop]]){ctx.save();ctx.beginPath();ctx.arc(x+140,160,140,0,Math.PI*2);ctx.clip();paintAvatar(ctx,image,420,1000,x,20,280,value);ctx.restore();}
ctx.fillStyle='#503e68';ctx.font='20px sans-serif';ctx.fillText('Antes: centro do quadro',20,340);ctx.fillText('Depois: cabeça e rosto',340,340);fs.writeFileSync('outputs/face-crop-check.png',canvas.toBuffer('image/png'));
const base=createCanvas(1080,1920),frame=createCanvas(1080,1920);
paintProfileLayer(base.getContext('2d'),image,420,1000,1080,1920,'perfil',defaultProfileLayout);
paintProfileLayer(frame.getContext('2d'),image,420,1000,1080,1920,'perfil',defaultProfileLayout,crop);
// Avatar changes, while the translucent full photo is identical below it.
assert.notDeepEqual(base.getContext('2d').getImageData(200,280,40,40).data,frame.getContext('2d').getImageData(200,280,40,40).data);
assert.deepEqual(base.getContext('2d').getImageData(500,900,40,40).data,frame.getContext('2d').getImageData(500,900,40,40).data);
console.log('PASS saved face crop changes only the circular avatar, preserving the translucent full photo');
for(const crop of [{x:0,y:0,zoom:8},{x:1,y:1,zoom:8},{x:.5,y:.2,zoom:1}]){const rect=avatarCropRect(420,1000,crop);assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.side<=420&&rect.y+rect.side<=1000);}
assert.equal(fs.readFileSync('public/prisma-faces/blaze-face-short-range.tflite').subarray(4,8).toString(),'TFL3');
for(const directory of ['public/prisma-engine','public/prisma-engine/mt']){const manifest=JSON.parse(fs.readFileSync(directory+'/manifest.json'));assert.equal(manifest.chunks.reduce((sum,name)=>sum+fs.statSync(directory+'/'+name).size,0),manifest.bytes);}
console.log('PASS bounded crops and self-hosted face/FFmpeg assets');
console.log('ALL PROFILE FRAMING TESTS PASSED');
