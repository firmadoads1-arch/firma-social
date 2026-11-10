export const storySize={width:1080,height:1920};
export function gridLines(length:number,spacing:number){
 const lines:number[]=[];for(let n=spacing;n<length;n+=spacing)lines.push(n);return lines;
}
export function centerPosition(length:number,extent:number){return Math.max(0,(length-extent)/2);}
// Prefer the exact Story center over nearby grid intersections. Clamp last so
// snapping never pushes an element outside the artboard.
export function snapPosition(value:number,extent:number,length:number,spacing:number,enabled:boolean){
 const max=Math.max(0,length-extent),center=centerPosition(length,extent);
 const next=enabled?(Math.abs(value-center)<=16?center:Math.round(value/spacing)*spacing):value;
 return Math.max(0,Math.min(max,next));
}
