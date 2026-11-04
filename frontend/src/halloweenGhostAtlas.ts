import {clearFrame,composite,createFrame,createFx} from './vendor/pixelfx/core/index.js';
import * as ghost from './vendor/pixelfx/fx/critters/ghost.js';

export const GHOST_FRAME_SIZE=128,GHOST_FRAME_COUNT=72,GHOST_COLUMNS=8;
let cached:HTMLCanvasElement|undefined;
/** One atlas shared across ghosts and home visits; the source loop is sampled at 30fps. */
export function getGhostAtlas(){
  if(cached)return cached;
  const atlas=document.createElement('canvas');atlas.width=GHOST_COLUMNS*GHOST_FRAME_SIZE;atlas.height=9*GHOST_FRAME_SIZE;
  const ctx=atlas.getContext('2d');if(!ctx)throw new Error('Ghost canvas unavailable');
  const frame=createFrame(GHOST_FRAME_SIZE,GHOST_FRAME_SIZE),image=new ImageData(GHOST_FRAME_SIZE,GHOST_FRAME_SIZE);
  const fx=createFx(ghost,{x:64,y:100,seed:1,light:.7,face:false,drift:false});
  for(let i=0;i<GHOST_FRAME_COUNT;i++){
    if(i)fx.update(1/30);
    clearFrame(frame);fx.draw(frame);composite(frame,image.data);
    ctx.putImageData(image,(i%GHOST_COLUMNS)*GHOST_FRAME_SIZE,Math.floor(i/GHOST_COLUMNS)*GHOST_FRAME_SIZE);
  }
  cached=atlas;return atlas;
}

/** Match the pinned ghost's bob and blink, independent of its original wandering gaze. */
export function ghostFacePose(index:number){
  const t=index/30,a=t/2.4*Math.PI*2;
  return {y:100+Math.round(-14-3*Math.sin(2*a+.8))-21,blink:t>1.95&&t<2.03,mouthOpen:Math.sin(a*2)>-.2};
}
