// Allows rendering and saving to overlap, while bounding retained output Blobs.
export class BackgroundTasks {
 private pending=new Set<Promise<void>>();
 private errors:unknown[]=[];
 constructor(private limit=2){if(!Number.isInteger(limit)||limit<1)throw Error('Invalid concurrency');}
 async add(work:()=>Promise<void>):Promise<void>{
  while(this.pending.size>=this.limit)await Promise.race(this.pending);
  let task:Promise<void>;
  task=Promise.resolve().then(work).catch(error=>{this.errors.push(error);}).finally(()=>{this.pending.delete(task);});
  this.pending.add(task);
 }
 async drain():Promise<void>{
  while(this.pending.size)await Promise.all(this.pending);
  if(this.errors.length){const errors=this.errors.splice(0);throw new AggregateError(errors,'Background tasks failed');}
 }
}
