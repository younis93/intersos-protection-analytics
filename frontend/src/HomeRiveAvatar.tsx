import {useCallback,useEffect,useRef,useState} from 'react';
import type {FracturePhase} from './ScreenFracture';
import {CartoonBoy} from './CartoonBoy';
import {ActiveClock,ACTIVITIES,BOY,DURATIONS,ROUTINE,clamp,mixPose,poseAt,smooth,standingPose,type Activity,type Pose,type Recovery} from './boyMotion';
import {bindBoy,paintBoy} from './boyRenderer';
import {RIG} from './boyRig';
import './cartoonBoy.css';

export const AVATAR_GREETING_MS=BOY.greeting;
export const AVATAR_TUMBLE_MS=BOY.tumble;
export const AVATAR_DOWN_MS=BOY.down;
export const AVATAR_GET_UP_MS=BOY.getUp;
export const AVATAR_LANDING_MS=BOY.tumble+BOY.down+BOY.getUp;
export const AVATAR_THINK_DELAY_MS=BOY.thinkDelay;
export const AVATAR_WALK_MIN_MS=3000;
export const AVATAR_WALK_RANGE_MS=3000;
export const AVATAR_ACTIVITIES=ACTIVITIES;
export type AvatarActivity=Activity;
export const nextWalkDuration=(random=Math.random)=>AVATAR_WALK_MIN_MS+Math.floor(clamp(random(),0,.999999)*AVATAR_WALK_RANGE_MS);
export const nextAvatarActivity=(random=Math.random):Activity=>ACTIVITIES[Math.floor(clamp(random(),0,.999999)*ACTIVITIES.length)];
export const clampAvatarPosition=(value:number,min:number,max:number)=>clamp(value,min,Math.max(min,max));
export const avatarTravelBounds=(viewportWidth:number,viewportHeight:number,width:number,height:number)=>({maxX:Math.max(0,viewportWidth-width-32),maxLift:Math.max(0,viewportHeight-height-12)});
export const avatarDropDuration=(height:number)=>Math.round(clamp(Math.sqrt(Math.max(0,height)/1000)*1000,180,650));
const motionQuery=()=>window.matchMedia('(prefers-reduced-motion: reduce)');
interface Performance {
  activity:Activity; recovery:Recovery; start:number; deadline:number; index:number; initial:boolean;
  x:number; y:number; fromX:number; targetX:number; walkMs:number; dropHeight:number; dropMs:number;
  holding:boolean; dragging:boolean; pose:Pose; fromPose:Pose; blendStart:number;
  direction:1|-1;
}
const initialPerformance=():Performance=>({activity:'greeting',recovery:null,start:0,deadline:BOY.greeting,index:0,initial:true,
  x:0,y:0,fromX:0,targetX:0,walkMs:6000,dropHeight:0,dropMs:440,holding:false,dragging:false,pose:standingPose(),fromPose:standingPose(),blendStart:0,direction:1});

/** All motion, travel, and scheduling read the same pausable clock. React only handles events. */
export function HomeRiveAvatar({disabled,phase,className=''}:{disabled:boolean;phase:FracturePhase;className?:string}){
  const avatar=useRef<HTMLButtonElement>(null),clock=useRef(new ActiveClock()),performance=useRef(initialPerformance());
  const [reduced,setReduced]=useState(()=>motionQuery().matches),[hidden,setHidden]=useState(()=>document.hidden),[visible,setVisible]=useState(true);
  const [version,refresh]=useState(0);
  const gesture=useRef<{id:number;x:number;y:number;left:number;lift:number;moved:boolean}|null>(null);
  const suppressClick=useRef(false);
  const inactive=disabled||phase!=='normal',paused=hidden||!visible||inactive;
  const bounds=useCallback(()=>avatarTravelBounds(window.innerWidth,window.innerHeight,avatar.current?.offsetWidth||152,avatar.current?.offsetHeight||200),[]);
  const change=useCallback((activity:Activity,recovery:Recovery=null)=>{
    const s=performance.current;s.fromPose={...s.pose};s.blendStart=clock.current.time;s.start=clock.current.time;
    s.activity=activity;s.recovery=recovery;s.deadline=s.start+DURATIONS[activity];refresh(v=>v+1);
  },[]);
  const cancelGesture=useCallback(()=>{
    const g=gesture.current;gesture.current=null;
    if(g&&avatar.current?.hasPointerCapture(g.id))avatar.current.releasePointerCapture(g.id);
    const s=performance.current;s.holding=s.dragging=false;suppressClick.current=false;
  },[]);
  useEffect(()=>{
    const query=motionQuery(),media=()=>setReduced(query.matches),visibility=()=>setHidden(document.hidden);
    query.addEventListener('change',media);document.addEventListener('visibilitychange',visibility);
    const observer=new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??true));
    if(avatar.current)observer.observe(avatar.current);
    return()=>{query.removeEventListener('change',media);document.removeEventListener('visibilitychange',visibility);observer.disconnect()};
  },[]);
  useEffect(()=>{
    const resize=()=>{
      cancelGesture();const s=performance.current;s.x=clamp(s.x,0,bounds().maxX);s.y=0;s.initial=false;change('idle');
      if(avatar.current)avatar.current.style.transform='translate3d('+s.x+'px,0,0)';
    };
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[bounds,cancelGesture,change]);
  useEffect(()=>{
    // A backgrounded/disabled button cannot keep pointer capture or a held routine forever.
    if(!(hidden||inactive)||!gesture.current)return;
    const moved=gesture.current.moved;cancelGesture();
    if(moved){const s=performance.current;s.initial=false;s.dropHeight=s.y;s.dropMs=avatarDropDuration(s.y);
      change('idle','falling');s.deadline=clock.current.time+s.dropMs+BOY.tumble}
  },[hidden,inactive,cancelGesture,change]);
  useEffect(()=>{
    if(!reduced)return;
    cancelGesture();const s=performance.current;s.y=0;s.pose=standingPose();s.initial=false;change('idle');
  },[reduced,cancelGesture,change]);
  useEffect(()=>{
    const node=avatar.current;if(!node)return;
    const parts=bindBoy(node),s=performance.current;
    const paint=()=>{node.style.transform='translate3d('+s.x+'px,'+(-s.y)+'px,0)';paintBoy(parts,s.pose,s.y,node.offsetHeight/210)};
    if(reduced){s.pose=standingPose();paint();clock.current.pause();return}
    if(paused){clock.current.pause();return}
    let frame=0;
    const render=(now:number)=>{
      const time=clock.current.tick(now);
      if(!s.holding&&time>=s.deadline){
        if(s.activity==='walking')s.x=s.targetX;
        if(s.recovery==='falling'){s.y=0;change('idle','down');s.deadline=time+BOY.down}
        else if(s.recovery==='down'){change('idle','getting-up');s.deadline=time+BOY.getUp}
        else if(s.recovery==='getting-up'){change('idle');s.deadline=time+DURATIONS.idle}
        else if(s.initial){s.initial=false;change('idle');s.deadline=time+BOY.thinkDelay}
        else {
          const next=ROUTINE[s.index++%ROUTINE.length];change(next);
          if(next==='walking'){
            s.fromX=s.x;s.targetX=s.x<bounds().maxX/2?bounds().maxX:0;
            s.direction=s.targetX>=s.fromX?1:-1;
            s.walkMs=clamp(Math.abs(s.targetX-s.x)/BOY.speed*1000,3000,14000);s.deadline=time+RIG.turnIn+s.walkMs+RIG.turnOut;
          }
        }
      }
      const t=time-s.start;
      if(s.activity==='walking'&&!s.holding)s.x=s.fromX+(s.targetX-s.fromX)*clamp((t-RIG.turnIn)/s.walkMs);
      if(s.recovery==='falling')s.y=s.dropHeight*(1-clamp(t/s.dropMs)**2);
      const speed=Math.abs(s.targetX-s.fromX)/s.walkMs*1000;
      const stride=BOY.stride*BOY.speed/Math.max(25,speed);
      const scale=node.offsetHeight/210;
      const target=poseAt(s.activity,t,time,s.dragging,s.recovery,s.dropMs,stride,
        {direction:s.direction,walkMs:s.walkMs,strideUnits:clamp(speed*stride/1000/scale,12,80)});
      const blend=s.recovery?smooth((time-s.blendStart)/100):smooth((time-s.blendStart)/BOY.blend);
      s.pose=mixPose(s.fromPose,target,blend);paint();
      frame=requestAnimationFrame(render);
    };
    frame=requestAnimationFrame(render);
    return()=>{cancelAnimationFrame(frame);clock.current.pause()};
  },[paused,reduced,bounds,change]);
  const greet=(event:React.MouseEvent<HTMLButtonElement>)=>{
    if(suppressClick.current&&event.detail!==0){suppressClick.current=false;return}
    suppressClick.current=false;const s=performance.current;
    if(inactive||s.recovery||reduced)return;
    s.initial=true;change('greeting');
  };
  const startDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const s=performance.current;suppressClick.current=false;
    if(inactive||reduced||s.recovery||event.button!==0||!event.isPrimary||gesture.current)return;
    gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:s.x,lift:s.y,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);s.holding=true;change('idle');
  };
  const moveDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;if(Math.hypot(dx,dy)>4)g.moved=true;if(!g.moved)return;
    const s=performance.current;
    if(!s.dragging){s.dragging=true;change('idle')}
    s.x=clamp(g.left+dx,0,bounds().maxX);s.y=clamp(g.lift-dy,0,bounds().maxLift);
    event.currentTarget.style.transform='translate3d('+s.x+'px,'+(-s.y)+'px,0)';
  };
  const finishDrag=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;gesture.current=null;
    if(event.currentTarget.hasPointerCapture(g.id))event.currentTarget.releasePointerCapture(g.id);
    const s=performance.current;s.holding=s.dragging=false;
    if(g.moved){
      suppressClick.current=event.type==='pointerup';s.initial=false;s.dropHeight=s.y;s.dropMs=avatarDropDuration(s.y);
      change('idle','falling');s.deadline=clock.current.time+s.dropMs+BOY.tumble;
    }else refresh(v=>v+1);
  };
  const s=performance.current;
  return <button ref={avatar} type="button" className={['home-rive-avatar','cartoon-home-avatar',className].filter(Boolean).join(' ')} disabled={inactive}
    data-activity={reduced?'idle':s.activity} data-dragging={s.dragging||undefined} data-landing={!!s.recovery||undefined} data-recovery={s.recovery||undefined}
    data-paused={paused||undefined} data-performance={version} data-facing={s.activity==='walking'?(s.direction===1?'right':'left'):'front'} aria-label="Cartoon boy: click to wave, or drag to move"
    onClick={greet} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}>
    <CartoonBoy/>
  </button>;
}
