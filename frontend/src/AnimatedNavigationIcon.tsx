import {createElement,type CSSProperties,type Ref} from 'react';
import type {LucideIcon,IconNode} from 'lucide-react';
import type {LegalPage} from './legalPageMetadata';
import {navigationIconNodes,type NavigationIconStyle} from './navigationIconNodes';
import './navigationIcons.css';

type PartMotion='assemble'|'rise'|'tilt'|'call'|'settle'|'confirm'|'handle'|'flap'|'send'|'close'|'pulse'|'tap'|'grow'|'compose'|'row'|'sweep'|'signal'|'double-signal'|'none';
interface IconPart {name:string;nodes:number[];motion:PartMotion;delay?:number;duration?:number;origin?:string;echo?:boolean}
interface IconMotion {style:NavigationIconStyle;parts:IconPart[]}
const part=(name:string,nodes:number[],motion:PartMotion,delay=0,extra:Partial<IconPart>={}):IconPart=>({name,nodes,motion,delay,duration:480,...extra});
const broadcast=(motion:'tilt'|'call',echo:'signal'|'double-signal'):IconMotion=>({style:'megaphone',parts:[
  part('horn',[0,2],motion),part('handle',[1],'settle',50),part('signal',[0,2],echo,120,{echo:true,duration:500}),
]});

export const navigationIconMotions:Record<LegalPage,IconMotion>={
  overview:{style:'layout-dashboard',parts:[0,1,2,3].map((index)=>part(`tile-${index}`,[index],'assemble',index*45))},
  hotline:broadcast('tilt','signal'),
  legalhotlines:broadcast('call','double-signal'),
  awareness:broadcast('tilt','signal'),
  beneficiaries:{style:'users',parts:[part('front-person',[0,3],'rise'),part('back-person',[1,2],'assemble',120)]},
  assessments:{style:'shield-check',parts:[part('shield',[0],'settle'),part('check',[1],'confirm',120)]},
  legalservices:{style:'briefcase-business',parts:[part('case',[0,2,3],'rise'),part('handle',[1],'handle',80)]},
  'send-issues':{style:'mail',parts:[part('envelope',[1],'send',80),part('flap',[0],'flap',0,{origin:'50% 17%'})]},
  detention:{style:'lock-keyhole',parts:[part('lock',[0,1],'settle',70),part('shackle',[2],'close')]},
  deportation:{style:'shield-alert',parts:[part('shield',[0],'settle'),part('warning',[1,2],'pulse',70)]},
  'lawyer-intelligence':{style:'gavel',parts:[part('head',[1,2,3,4],'tap',0,{origin:'25% 85%',duration:560}),part('handle',[0],'tap',15,{origin:'25% 85%',duration:560})]},
  indicators:{style:'chart-column-increasing',parts:[part('axes',[2],'none'),...[3,0,1].map((node,index)=>part(`bar-${index}`,[node],'grow',index*60,{origin:'50% 71%'}))]},
  studio:{style:'chart-column-increasing',parts:[part('axes',[2],'none'),...[1,3,0].map((node,index)=>part(`bar-${index}`,[node],'compose',index*70,{origin:'50% 71%'}))]},
  explorer:{style:'table-properties',parts:[part('frame',[0,1],'none'),part('first-row',[2],'row'),part('second-row',[3],'row',100)]},
  cases:{style:'search',parts:[part('lens',[1],'sweep'),part('handle',[0],'sweep',35)]},
};

export function AnimatedNavigationIcon({page,Icon,active}:{page:LegalPage;Icon:LucideIcon;active:boolean}){
  return <LayeredIcon definition={navigationIconMotions[page]} Icon={Icon} active={active} page={page}/>;
}

export const sectionIconMotions:Record<NavigationIconStyle,IconMotion>={
  'layout-dashboard':navigationIconMotions.overview,
  megaphone:navigationIconMotions.awareness,
  users:navigationIconMotions.beneficiaries,
  'shield-check':navigationIconMotions.assessments,
  'briefcase-business':navigationIconMotions.legalservices,
  mail:navigationIconMotions['send-issues'],
  'lock-keyhole':navigationIconMotions.detention,
  'shield-alert':navigationIconMotions.deportation,
  gavel:navigationIconMotions['lawyer-intelligence'],
  'chart-column-increasing':navigationIconMotions.indicators,
  'table-properties':navigationIconMotions.explorer,
  search:navigationIconMotions.cases,
  'check-check':{style:'check-check',parts:[part('first-check',[0],'confirm'),part('second-check',[1],'confirm',100)]},
  'chart-column':{style:'chart-column',parts:[part('axes',[0],'none'),...[3,2,1].map((node,index)=>part(`bar-${index}`,[node],'grow',index*60,{origin:'50% 71%'}))]},
  backpack:{style:'backpack',parts:[part('bag',[0,4],'settle'),part('pocket',[1,2,3],'assemble',100)]},
  tent:{style:'tent',parts:[part('frame',[0,1,3],'rise'),part('entrance',[2],'assemble',100)]},
  'rotate-ccw':{style:'rotate-ccw',parts:[part('arrow',[0,1],'none')]},
  'sliders-horizontal':{style:'sliders-horizontal',parts:[part('tracks',[0,1,4,5,6,8],'none'),part('top-knob',[2],'none'),part('middle-knob',[7],'none'),part('bottom-knob',[3],'none')]},
  funnel:{style:'funnel',parts:[part('funnel',[0],'none')]},
};

export function AnimatedSectionIcon({Icon,iconStyle,active=true,size=18,className='',iconRef}:{Icon:LucideIcon;iconStyle:NavigationIconStyle;active?:boolean;size?:number;className?:string;iconRef?:Ref<HTMLElement>}){
  return <LayeredIcon definition={sectionIconMotions[iconStyle]} Icon={Icon} active={active} size={size} className={`animated-section-icon ${className}`.trim()} iconRef={iconRef}/>;
}

function LayeredIcon({definition,Icon,active,page,size=18,className='',iconRef}:{definition:IconMotion;Icon:LucideIcon;active:boolean;page?:LegalPage;size?:number;className?:string;iconRef?:Ref<HTMLElement>}){
  const nodes:IconNode=navigationIconNodes[definition.style];
  return <i ref={iconRef} className={`legal-page-nav-motion ${className}`.trim()} data-nav-page={page} data-icon-style={definition.style} aria-hidden="true" style={{'--animated-icon-size':`${size}px`} as CSSProperties}>
    {active?definition.parts.map(part=><i key={part.name} data-nav-part={part.name} className={`legal-nav-icon-part nav-part-${part.motion}${part.echo?' nav-icon-echo':''}`}
      style={{'--part-delay':`${part.delay||0}ms`,'--part-duration':`${part.duration||480}ms`,transformOrigin:part.origin||'50% 50%'} as CSSProperties}>
      <svg className="legal-page-nav-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {part.nodes.map(index=>{const [tag,attributes]=nodes[index];return createElement(tag,attributes)})}
      </svg>
    </i>):<Icon className="legal-page-nav-icon" data-nav-page={page}/>}
  </i>;
}
