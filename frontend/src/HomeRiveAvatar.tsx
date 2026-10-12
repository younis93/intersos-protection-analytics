import {type CSSProperties,useCallback,useEffect,useRef,useState} from 'react';
import type {FracturePhase} from './ScreenFracture';
import {CartoonBoy} from './CartoonBoy';
import './cartoonBoy.css';

export const AVATAR_GREETING_MS=2400;
export const AVATAR_LANDING_MS=2300;
export const AVATAR_TUMBLE_MS=450;
export const AVATAR_DOWN_MS=650;
export const AVATAR_GET_UP_MS=1200;
export const AVATAR_THINK_DELAY_MS=8000;
export const AVATAR_WALK_MIN_MS=3000;
export const AVATAR_WALK_RANGE_MS=3000;
export const AVATAR_ACTIVITIES=['idle','walking','sitting','reading','playing','stretching','looking','celebrating'] as const;
export type AvatarActivity=typeof AVATAR_ACTIVITIES[number]|'thinking'|'greeting';
export const nextWalkDuration=(random=Math.random)=>AVATAR_WALK_MIN_MS+Math.floor(Math.max(0,Math.min(.999999,random()))*AVATAR_WALK_RANGE_MS);
export const nextAvatarActivity=(random=Math.random):AvatarActivity=>AVATAR_ACTIVITIES[Math.min(AVATAR_ACTIVITIES.length-1,Math.floor(Math.max(0,Math.min(.999999,random()))*AVATAR_ACTIVITIES.length))];
export const clampAvatarPosition=(value:number,min:number,max:number)=>Math.min(Math.max(value,min),Math.max(min,max));
const ROUTINE:AvatarActivity[]=['thinking','reading','idle','walking','idle','playing','sitting','idle','stretching','looking','celebrating','idle'];
const DURATION:Record<AvatarActivity,number>={idle:4500,walking:6000,sitting:5000,reading:6500,playing:4500,thinking:4000,greeting:AVATAR_GREETING_MS,stretching:3200,looking:3600,celebrating:2200};
const motionQuery=()=>window.matchMedia('(prefers-reduced-motion: reduce)');
export const avatarTravelBounds=(viewportWidth:number,viewportHeight:number,width:number,height:number)=>({maxX:Math.max(0,viewportWidth-width-32),maxLift:Math.max(0,viewportHeight-height-12)});
export const avatarDropDuration=(height:number)=>Math.round(Math.min(650,Math.max(180,Math.sqrt(Math.max(0,height)/1000)*1000)));

/** The public component name is retained for existing Home callers. */
export function HomeRiveAvatar({disabled,phase,className=''}:{disabled:boolean;phase:FracturePhase;className?:string}){
  const [activity,setActivity]=useState<AvatarActivity>('greeting');
  const [performance,setPerformance]=useState(0);
  const [reduced,setReduced]=useState(()=>motionQuery().matches);
  const [hidden,setHidden]=useState(()=>document.hidden);
  const [position,setPosition]=useState({x:0,y:0});
  const [walkMs,setWalkMs]=useState(6000);
  const [dragging,setDragging]=useState(false);
  const [holding,setHolding]=useState(false);
  const [recovery,setRecovery]=useState<'falling'|'down'|'getting-up'|null>(null);
  const landing=recovery!==null;
  const [dropMs,setDropMs]=useState(440);
  const avatar=useRef<HTMLButtonElement>(null);
  const currentX=useRef(0);
  const routineIndex=useRef(0);
  const suppressClick=useRef(false);
  const gesture=useRef<{id:number;x:number;y:number;left:number;top:number;width:number;height:number;moved:boolean}|null>(null);
  const inactive=disabled||phase!=='normal';
  const freezePosition=useCallback(()=>{
    const node=avatar.current;
    if(!node)return {x:0,y:0};
    const matrix=new DOMMatrixReadOnly(getComputedStyle(node).transform);
    const bounds=avatarTravelBounds(window.innerWidth,window.innerHeight,node.offsetWidth,node.offsetHeight);
    const next={x:clampAvatarPosition(matrix.m41,0,bounds.maxX),y:clampAvatarPosition(-matrix.m42,0,bounds.maxLift)};
    currentX.current=next.x;setPosition(next);setActivity('idle');
    return next;
  },[]);
  const cancelGesture=useCallback(()=>{
    const g=gesture.current;gesture.current=null;
    if(g&&avatar.current?.hasPointerCapture(g.id))avatar.current.releasePointerCapture(g.id);
    setHolding(false);setDragging(false);setRecovery(null);suppressClick.current=false;
  },[]);
  useEffect(()=>{
    const stop=()=>{const next=freezePosition();cancelGesture();setPosition({...next,y:0})};
    const query=motionQuery(),change=()=>{if(query.matches)stop();setReduced(query.matches)},visibility=()=>{if(document.hidden)stop();setHidden(document.hidden)};
    query.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);
    return()=>{query.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility)};
  },[freezePosition,cancelGesture]);
  useEffect(()=>{
    const resize=()=>{const next=freezePosition();cancelGesture();setPosition({...next,y:0});setPerformance(value=>value+1)};
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[freezePosition,cancelGesture]);
  useEffect(()=>{if(inactive){const next=freezePosition();cancelGesture();setPosition({...next,y:0})}},[inactive,freezePosition,cancelGesture]);
  useEffect(()=>{
    if(inactive||reduced||hidden||holding||landing)return;
    let timer:number;
    const schedule=()=>{
      const next=ROUTINE[routineIndex.current++%ROUTINE.length];setActivity(next);
      let duration=DURATION[next];
      if(next==='walking'){
        const far=Math.max(0,window.innerWidth-(avatar.current?.offsetWidth||152)-32);
        const target=currentX.current<far/2?far:0;
        duration=Math.max(3000,Math.min(14000,Math.abs(target-currentX.current)/75*1000));
        setWalkMs(duration);currentX.current=target;setPosition({x:target,y:0});
      }
      timer=window.setTimeout(schedule,duration);
    };
    timer=window.setTimeout(()=>{setActivity('idle');timer=window.setTimeout(schedule,AVATAR_THINK_DELAY_MS)},AVATAR_GREETING_MS);
    return()=>window.clearTimeout(timer);
  },[inactive,reduced,hidden,holding,landing,performance]);
  useEffect(()=>{
    if(!recovery)return;
    const delay=recovery==='falling'?dropMs+AVATAR_TUMBLE_MS:recovery==='down'?AVATAR_DOWN_MS:AVATAR_GET_UP_MS;
    const timer=window.setTimeout(()=>{
      if(recovery==='falling')setRecovery('down');
      else if(recovery==='down')setRecovery('getting-up');
      else{setRecovery(null);setActivity('idle')}
    },delay);
    return()=>window.clearTimeout(timer);
  },[recovery,dropMs]);
  const greet=(event:React.MouseEvent<HTMLButtonElement>)=>{
    if(suppressClick.current&&event.detail!==0){suppressClick.current=false;return}
    suppressClick.current=false;
    if(inactive||landing)return;
    freezePosition();
    setActivity('greeting');setPerformance(value=>value+1);
  };
  const startDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
    suppressClick.current=false;
    if(inactive||reduced||landing||event.button!==0||!event.isPrimary||gesture.current)return;
    const rect=event.currentTarget.getBoundingClientRect();
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,width:rect.width,height:rect.height,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
    freezePosition();setHolding(true);
  };
  const moveDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(Math.hypot(dx,dy)>4)g.moved=true;
    if(!g.moved)return;
    setDragging(true);
    const left=clampAvatarPosition(g.left+dx,16,window.innerWidth-g.width-16);
    const top=clampAvatarPosition(g.top+dy,0,window.innerHeight-g.height-12);
    currentX.current=left-16;setPosition({x:currentX.current,y:Math.max(0,window.innerHeight-12-g.height-top)});
  };
  const finishDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;gesture.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    setHolding(false);setDragging(false);
    if(g.moved){suppressClick.current=event.type!=='pointercancel';const next=freezePosition();setDropMs(avatarDropDuration(next.y));setPosition({...next,y:0});setRecovery('falling');setActivity('idle')}
  };
  return <button ref={avatar} type="button" className={['home-rive-avatar','cartoon-home-avatar',className].filter(Boolean).join(' ')} disabled={inactive} data-activity={reduced||inactive?'idle':activity} data-dragging={dragging||undefined} data-landing={landing||undefined} data-recovery={recovery||undefined} data-paused={hidden||inactive||undefined} style={{'--boy-x':position.x+'px','--boy-y':-position.y+'px','--boy-travel-ms':walkMs+'ms','--boy-drop-ms':dropMs+'ms'} as CSSProperties} aria-label="Cartoon boy: click to wave, or drag to move" onClick={greet} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
    <CartoonBoy key={performance}/>
  </button>;
}
