import {Filter,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {useEffect,useRef} from 'react';
import {AnimatedSectionIcon} from './AnimatedNavigationIcon';
import './actionIcons.css';

type ActionIcon='reset'|'filters'|'funnel';
const icons={reset:RotateCcw,filters:SlidersHorizontal,funnel:Filter};
const styles={reset:'rotate-ccw',filters:'sliders-horizontal',funnel:'funnel'} as const;
const frames=(type:ActionIcon,part:string):Keyframe[]=>type==='reset'
  ?[{transform:'rotate(0deg)'},{transform:'rotate(-360deg)'}]
  :type==='funnel'
    ?[{transform:'translate3d(0,0,0) scale(1)'},{transform:'translate3d(0,1px,0) scale(.9)',offset:.45},{transform:'translate3d(0,0,0) scale(1)'}]
    :[{transform:'translate3d(0,0,0)'},{transform:`translate3d(${part==='middle-knob'?-2:2}px,0,0)`,offset:.45},{transform:'translate3d(0,0,0)'}];

/** Decorates existing buttons without owning their action, disabled state or label. */
export function AnimatedActionIcon({type,size=17}:{type:ActionIcon;size?:number}){
  const root=useRef<HTMLElement>(null);
  useEffect(()=>{
    const node=root.current,button=node?.closest('button');if(!node||!button)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let running:Animation[]=[];
    const stop=()=>{running.forEach(animation=>animation.cancel());running=[];node.querySelectorAll<HTMLElement>('[data-nav-part]').forEach(part=>part.style.willChange='auto')};
    const play=()=>{
      if(button.disabled||reduced.matches)return;
      stop();
      node.querySelectorAll<HTMLElement>('[data-nav-part]').forEach(part=>{
        if(part.dataset.navPart==='tracks')return;
        part.style.willChange='transform';
        const delay=part.dataset.navPart==='middle-knob'?50:part.dataset.navPart==='bottom-knob'?100:0;
        const animation=part.animate(frames(type,part.dataset.navPart||''),{duration:type==='reset'?500:450,delay,easing:'cubic-bezier(.4,0,.2,1)'});
        running.push(animation);
        void animation.finished.then(()=>{if(!part.getAnimations().length)part.style.willChange='auto'},()=>{});
      });
    };
    const preferenceChanged=()=>{if(reduced.matches)stop()};
    button.addEventListener('pointerenter',play);button.addEventListener('focus',play);button.addEventListener('click',play);reduced.addEventListener('change',preferenceChanged);
    return()=>{button.removeEventListener('pointerenter',play);button.removeEventListener('focus',play);button.removeEventListener('click',play);reduced.removeEventListener('change',preferenceChanged);stop()};
  },[type]);
  return <AnimatedSectionIcon Icon={icons[type]} iconStyle={styles[type]} size={size} className={`animated-action-icon action-icon-${type}`} iconRef={root}/>;
}
