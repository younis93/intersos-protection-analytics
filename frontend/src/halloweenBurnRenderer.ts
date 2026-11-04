import {clearFrame,composite,createFrame,createFx} from './vendor/pixelfx/core/index.js';
import * as burnAway from './vendor/pixelfx/fx/transitions/burn-away.js';

export function createBurnRenderer(canvas:HTMLCanvasElement){
  canvas.width=320;canvas.height=180;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Transition canvas unavailable');
  const frame=createFrame(320,180),image=new ImageData(320,180);
  const fx=createFx(burnAway,{color:'#0b0912',seed:3,light:.65});
  let time=0;
  return {draw(seconds:number){
    const target=Math.min(3,seconds*1.5);
    fx.update(Math.max(0,target-time));time=target;
    clearFrame(frame);fx.draw(frame);composite(frame,image.data);ctx.putImageData(image,0,0);
  }};
}
