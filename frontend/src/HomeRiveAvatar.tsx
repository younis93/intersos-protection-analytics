import {useCallback,useEffect,useRef,useState} from 'react';
import {Alignment,Fit,Layout,useRive} from '@rive-app/react-webgl2';
import type {FracturePhase} from './ScreenFracture';

export const RIVE_AVATAR={src:'/avatar/intersos-guardian.riv',artboard:'Artboard',stateMachine:'State Machine 1',inputs:{walking:'Number 1'}} as const;
export const AVATAR_THINK_DELAY_MS=8000;
export const AVATAR_WALK_MIN_MS=3000;
export const AVATAR_WALK_RANGE_MS=3000;
export const AVATAR_ACTIVITIES=['idle','walking','sitting','reading','playing'] as const;
export type AvatarActivity=typeof AVATAR_ACTIVITIES[number]|'thinking';
export const nextWalkDuration=(random=Math.random)=>AVATAR_WALK_MIN_MS+Math.floor(Math.max(0,Math.min(.999999,random()))*AVATAR_WALK_RANGE_MS);
export const nextAvatarActivity=(random=Math.random):AvatarActivity=>AVATAR_ACTIVITIES[Math.min(AVATAR_ACTIVITIES.length-1,Math.floor(Math.max(0,Math.min(.999999,random()))*AVATAR_ACTIVITIES.length))];
export const clampAvatarPosition=(value:number,min:number,max:number)=>Math.min(Math.max(value,min),Math.max(min,max));
const ACTION_DURATION:Record<AvatarActivity,number>={idle:3600,walking:5600,sitting:5200,reading:6800,playing:4800,thinking:5400};
const prefersReducedMotion=()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const removeConnectedDarkMatte=(pixels:Uint8ClampedArray,width:number,height:number)=>{
  const total=width*height,seen=new Uint8Array(total),queue=new Int32Array(total);let head=0,tail=0;
  const corners=[0,width-1,(height-1)*width,total-1],opaqueCorners=corners.filter(index=>pixels[index*4+3]>0);
  if(!opaqueCorners.length)return;
  const background=opaqueCorners.reduce((sum,index)=>{const p=index*4;sum[0]+=pixels[p];sum[1]+=pixels[p+1];sum[2]+=pixels[p+2];return sum},[0,0,0]).map(value=>value/opaqueCorners.length);
  const isMatte=(index:number)=>{const p=index*4;return pixels[p+3]>0&&Math.abs(pixels[p]-background[0])<24&&Math.abs(pixels[p+1]-background[1])<24&&Math.abs(pixels[p+2]-background[2])<24};
  const add=(index:number)=>{if(!seen[index]&&isMatte(index)){seen[index]=1;queue[tail++]=index}};
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x)}
  for(let y=1;y<height-1;y++){add(y*width);add(y*width+width-1)}
  while(head<tail){const index=queue[head++],x=index%width,y=Math.floor(index/width);pixels[index*4+3]=0;if(x)add(index-1);if(x<width-1)add(index+1);if(y)add(index-width);if(y<height-1)add(index+width)}
};

export function HomeRiveAvatar({disabled,phase,className=''}:{disabled:boolean;phase:FracturePhase;className?:string}){
  const [loadFailed,setLoadFailed]=useState(false);
  const [activity,setActivity]=useState<AvatarActivity>('idle');
  const [atFarEdge,setAtFarEdge]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [dropStage,setDropStage]=useState<'falling'|'getting-up'|null>(null);
  const [positionX,setPositionX]=useState(0);
  const [lift,setLift]=useState(0);
  const [matteReady,setMatteReady]=useState(false);
  const avatarRef=useRef<HTMLDivElement>(null);
  const matteCanvasRef=useRef<HTMLCanvasElement>(null);
  const reduced=useRef(prefersReducedMotion());
  const activityTimer=useRef<number|undefined>(undefined);
  const thinkTimer=useRef<number|undefined>(undefined);
  const dropTimer=useRef<number|undefined>(undefined);
  const interactionLocked=useRef(false);
  const draggingRef=useRef(false);
  const walkingRef=useRef<{value:number}|null>(null);
  const dragMoved=useRef(false);
  const dragStart=useRef({x:0,y:0});
  const dragOffset=useRef({x:0,y:0,width:0,height:0});
  const {rive,RiveComponent}=useRive({src:RIVE_AVATAR.src,artboard:RIVE_AVATAR.artboard,stateMachines:RIVE_AVATAR.stateMachine,autoplay:true,layout:new Layout({fit:Fit.Contain,alignment:Alignment.BottomCenter}),onLoadError:()=>setLoadFailed(true)});
  const inactive=disabled||phase!=='normal'||reduced.current;
  const clearTimer=(timer:React.MutableRefObject<number|undefined>)=>{if(timer.current!==undefined){window.clearTimeout(timer.current);timer.current=undefined}};
  const stopWalking=useCallback(()=>{if(walkingRef.current)walkingRef.current.value=0},[]);

  // Do not use Rive's useStateMachineInput here. Its load listener survives a
  // component unmount in the current web runtime and can crash a route change.
  useEffect(()=>{
    if(!rive){walkingRef.current=null;return}
    try{walkingRef.current=(rive.stateMachineInputs(RIVE_AVATAR.stateMachine)?.find(input=>input.name===RIVE_AVATAR.inputs.walking) as {value:number}|undefined)??null}
    catch{walkingRef.current=null}
    return()=>{walkingRef.current=null}
  },[rive]);
  const resetThinking=useCallback(()=>{
    clearTimer(thinkTimer);
    if(inactive)return;
    thinkTimer.current=window.setTimeout(()=>{stopWalking();setActivity('thinking')},AVATAR_THINK_DELAY_MS);
  },[inactive,stopWalking]);
  const playKnockdown=useCallback(()=>{
    interactionLocked.current=true;clearTimer(dropTimer);setActivity('idle');setDropStage('falling');setLift(0);stopWalking();
    dropTimer.current=window.setTimeout(()=>{setDropStage('getting-up');dropTimer.current=window.setTimeout(()=>{setDropStage(null);setActivity('idle');interactionLocked.current=false;resetThinking()},950)},620);
  },[resetThinking,stopWalking]);
  const completeDrag=useCallback((pointerId?:number)=>{
    if(!draggingRef.current)return;
    draggingRef.current=false;setDragging(false);
    if(!dragMoved.current){interactionLocked.current=false;return}
    playKnockdown();
  },[playKnockdown]);
  const updateDrag=useCallback((clientX:number,clientY:number)=>{
    if(!draggingRef.current)return;
    if(Math.hypot(clientX-dragStart.current.x,clientY-dragStart.current.y)>4)dragMoved.current=true;
    const left=clampAvatarPosition(clientX-dragOffset.current.x,0,window.innerWidth-dragOffset.current.width);
    const top=clampAvatarPosition(clientY-dragOffset.current.y,0,window.innerHeight-dragOffset.current.height);
    setPositionX(left-14);setLift(Math.max(0,window.innerHeight-3-dragOffset.current.height-top));
  },[]);

  useEffect(()=>{if(!rive)return;const sync=()=>document.hidden?rive.pause():rive.play(RIVE_AVATAR.stateMachine);document.addEventListener('visibilitychange',sync);sync();return()=>document.removeEventListener('visibilitychange',sync)},[rive]);
  useEffect(()=>{
    if(!rive)return;let frame=0,cancelled=false,ready=false;
    const render=()=>{
      if(cancelled)return;
      const source=avatarRef.current?.querySelector('.avatar-rive-stage canvas') as HTMLCanvasElement|null;
      const output=matteCanvasRef.current;
      if(source&&output&&source.width&&source.height){
        try{
          if(output.width!==source.width||output.height!==source.height){output.width=source.width;output.height=source.height}
          const context=output.getContext('2d',{willReadFrequently:true});
          if(context){context.clearRect(0,0,output.width,output.height);context.drawImage(source,0,0);const image=context.getImageData(0,0,output.width,output.height);removeConnectedDarkMatte(image.data,image.width,image.height);context.putImageData(image,0,0);if(!ready){ready=true;setMatteReady(true)}}
        }catch{setMatteReady(false)}
      }
      frame=window.requestAnimationFrame(render);
    };
    frame=window.requestAnimationFrame(render);
    return()=>{cancelled=true;window.cancelAnimationFrame(frame)};
  },[rive]);
  useEffect(()=>{
    if(inactive||!walkingRef.current){stopWalking();setActivity('idle');return}
    let cancelled=false;
    const schedule=()=>{
      if(interactionLocked.current){activityTimer.current=window.setTimeout(()=>{if(!cancelled)schedule()},500);return}
      const next=nextAvatarActivity();
      setActivity(next);
      if(walkingRef.current)walkingRef.current.value=next==='walking'?1:0;
      if(next==='walking')setPositionX(current=>{const far=Math.max(0,window.innerWidth-(window.innerWidth<=760?112:170)),goFar=current<far/2;setAtFarEdge(goFar);return goFar?far:0});
      activityTimer.current=window.setTimeout(()=>{if(!cancelled)schedule()},next==='walking'?nextWalkDuration():ACTION_DURATION[next]);
    };
    activityTimer.current=window.setTimeout(schedule,1800);
    return()=>{cancelled=true;clearTimer(activityTimer);stopWalking()};
  },[inactive,stopWalking,rive]);
  useEffect(()=>{
    const noteActivity=()=>{setActivity('idle');resetThinking()};
    if(!inactive){window.addEventListener('pointerdown',noteActivity);window.addEventListener('keydown',noteActivity);resetThinking()}
    return()=>{window.removeEventListener('pointerdown',noteActivity);window.removeEventListener('keydown',noteActivity);clearTimer(thinkTimer)};
  },[inactive,resetThinking]);
  useEffect(()=>{const move=(event:PointerEvent)=>{if(draggingRef.current){event.preventDefault();updateDrag(event.clientX,event.clientY)}};const release=(event:PointerEvent)=>completeDrag(event.pointerId);window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',release,true);window.addEventListener('pointercancel',release,true);return()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',release,true);window.removeEventListener('pointercancel',release,true)}},[completeDrag,updateDrag]);
  useEffect(()=>()=>{clearTimer(activityTimer);clearTimer(thinkTimer);clearTimer(dropTimer)},[]);
  const startDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(inactive||dropStage)return;
    const rect=event.currentTarget.getBoundingClientRect();
    event.stopPropagation();
    dragOffset.current={x:event.clientX-rect.left,y:event.clientY-rect.top,width:rect.width,height:rect.height};
    dragStart.current={x:event.clientX,y:event.clientY};dragMoved.current=false;draggingRef.current=true;interactionLocked.current=true;
    setPositionX(rect.left-14);setLift(Math.max(0,window.innerHeight-3-rect.bottom));setDragging(true);setActivity('idle');stopWalking();
  };
  const moveDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!draggingRef.current)return;
    event.preventDefault();event.stopPropagation();
    updateDrag(event.clientX,event.clientY);
  };
  const finishDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!draggingRef.current)return;
    event.stopPropagation();completeDrag(event.pointerId);
  };
  const activate=(event:React.MouseEvent|React.KeyboardEvent)=>{
    event.stopPropagation();
    if(dragMoved.current){dragMoved.current=false;return}
    if(inactive||dropStage)return;
    if('key' in event&&event.key!=='Enter'&&event.key!==' ')return;
    if('key' in event)event.preventDefault();
    playKnockdown();
  };
  if(loadFailed)return null;
  return <div ref={avatarRef} className={`home-rive-avatar ${className}`.trim()} data-phase={phase} data-disabled={inactive||undefined} data-activity={activity} data-edge={atFarEdge?'far':'near'} data-dragging={dragging||undefined} data-drop={dropStage||undefined} style={{'--avatar-travel-ms':`${nextWalkDuration(()=>.85)}ms`,'--avatar-x':`${positionX}px`,'--avatar-y':`${-lift}px`} as React.CSSProperties} role="button" tabIndex={inactive?-1:0} aria-label={`INTERSOS guardian avatar, ${dragging?'being dragged':dropStage||activity}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={activate} onKeyDown={activate}>
    <div className="avatar-character">
      <div className={`avatar-rive-stage ${matteReady?'is-matte-ready':''}`}><RiveComponent aria-hidden="true"/><canvas ref={matteCanvasRef} className="avatar-matte-canvas" aria-hidden="true"/></div>
      <span className="avatar-book" aria-hidden="true"><i/><i/></span>
      <span className="avatar-ball" aria-hidden="true"/>
      <span className="avatar-thought" aria-hidden="true"><i/><i/><b>•••</b></span>
    </div>
  </div>;
}
