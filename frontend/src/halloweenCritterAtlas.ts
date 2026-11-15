import {clearFrame,composite,createFrame,createFx} from './vendor/pixelfx/core/index.js';
import * as bat from './vendor/pixelfx/fx/critters/bat.js';
import * as eyeball from './vendor/pixelfx/fx/critters/eyeball.js';
import * as skull from './vendor/pixelfx/fx/critters/flying-skull.js';
import type {CritterKind} from './halloweenSimulation';

const sources={bat,eyeball,'flying-skull':skull};
const atlases=new Map<CritterKind,{canvas:HTMLCanvasElement;count:number}>();
export const CRITTER_TILE=128,CRITTER_COLUMNS=8;

export function getCritterAtlas(kind:CritterKind){
  const cached=atlases.get(kind);
  if(cached)return cached;
  const source=sources[kind],fps=15,count=Math.round(source.meta.duration*fps);
  const size=CRITTER_TILE,center=size/2;
  const canvas=document.createElement('canvas');
  canvas.width=size*CRITTER_COLUMNS;canvas.height=size*Math.ceil(count/CRITTER_COLUMNS);
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const frame=createFrame(size,size),image=new ImageData(size,size);
  const fx=createFx(source,{x:center,y:center,hover:0,seed:1,light:.65});
  for(let i=0;i<count;i++){
    if(i)fx.update(1/fps);
    clearFrame(frame);fx.draw(frame,'front');composite(frame,image.data);
    ctx.putImageData(image,(i%CRITTER_COLUMNS)*size,Math.floor(i/CRITTER_COLUMNS)*size);
  }
  const atlas={canvas,count};
  atlases.set(kind,atlas);
  return atlas;
}
