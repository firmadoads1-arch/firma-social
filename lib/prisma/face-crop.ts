import {defaultProfileCrop,type ProfileCrop} from './profile-types';
type FaceBox={originX:number;originY:number;width:number;height:number};
type Detector={detect:(image:HTMLCanvasElement)=>{detections:{boundingBox?:FaceBox}[]}};
let detectorPromise:Promise<Detector>|null=null;
export function cropAroundFace(box:FaceBox,width:number,height:number):ProfileCrop{
 // Leave room for hair, forehead and chin inside the circular mask.
 const side=Math.min(Math.min(width,height),Math.max(box.width*2.2,box.height*2.6));
 return{x:Math.max(0,Math.min(1,(box.originX+box.width/2)/width)),y:Math.max(0,Math.min(1,(box.originY+box.height*.38)/height)),zoom:Math.max(1,Math.min(8,Math.min(width,height)/side))};
}
async function detector(){
 if(!detectorPromise)detectorPromise=(async()=>{
  const {FaceDetector,FilesetResolver}=await import(/* @vite-ignore */ (location.origin+'/prisma-faces/vision_bundle.mjs'));
  const fileset=await FilesetResolver.forVisionTasks(location.origin+'/prisma-faces/wasm');
  return await FaceDetector.createFromOptions(fileset,{baseOptions:{modelAssetPath:location.origin+'/prisma-faces/blaze-face-short-range.tflite',delegate:'CPU'},runningMode:'IMAGE',minDetectionConfidence:.55}) as Detector;
 })().catch(error=>{detectorPromise=null;throw error;});return detectorPromise;
}
export async function detectProfileCrop(blob:Blob):Promise<{crop:ProfileCrop;detected:boolean}>{
 const image=await createImageBitmap(blob);
 try{
  const canvas=document.createElement('canvas'),scale=Math.min(1,640/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);
  const faces=(await detector()).detect(canvas).detections.map(item=>item.boundingBox).filter((b):b is FaceBox=>!!b&&b.width>0&&b.height>0).sort((a,b)=>b.width*b.height-a.width*a.height);
  return faces.length?{crop:cropAroundFace(faces[0],canvas.width,canvas.height),detected:true}:{crop:{...defaultProfileCrop},detected:false};
 }catch{return{crop:{...defaultProfileCrop},detected:false};}finally{image.close();}
}
