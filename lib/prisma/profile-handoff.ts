import type {Settings} from './catalog';
import type {Info,Output} from './media';
export type ProfileOutputMetadata={schemaVersion:1;batchId:string;outputId:string;template:{id:string;handle:string};file:{name:string;mime:string;bytes:number};video:Pick<Info,'width'|'height'|'duration'|'audio'>;settings:Settings;createdAt:string;savedFileId?:string;source?:{id:string;name:string;bytes:number;lastModified:number;index:number}};
export type ProfileVideoReady={metadata:ProfileOutputMetadata;blob:Blob;signal?:AbortSignal};
export type ProfileVideoReadyHandler=(result:ProfileVideoReady)=>void|Promise<void>;
export function profileOutputMetadata(batchId:string,outputId:string,template:{id:string;handle:string},out:Output):ProfileOutputMetadata{
 return{schemaVersion:1,batchId,outputId,template:{...template},file:{name:out.name,mime:out.blob.type,bytes:out.blob.size},video:{width:out.info.width,height:out.info.height,duration:out.info.duration,audio:out.info.audio},settings:structuredClone(out.settings),createdAt:new Date().toISOString()};
}
export function profileBatchManifest(batchId:string,outputs:ProfileOutputMetadata[]){return{format:'prisma-profile-batch-v1',batchId,outputs:outputs.map(output=>structuredClone(output))};}
