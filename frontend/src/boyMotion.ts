/** Web adaptation of rossark0/rossark-motion-skill (MIT, see rossark-motion.LICENSE).
 * One time source, continuous acting tracks, delayed joints, no per-frame React state.
 */
import {RIG} from './boyRig';
export const BOY = {
  blend: 280, greeting: 2400, thinkDelay: 8000, tumble: 600, down: 650, getUp: 1600,
  breathe: 4200, headPeriod: 5600, blinkPeriod: 3800, stride: 780, speed: 75,
  pivots: RIG.pivots,
};
export const ACTIVITIES = ['idle','walking','sitting','reading','playing','stretching','looking','celebrating'] as const;
export type Activity = typeof ACTIVITIES[number] | 'thinking' | 'greeting';
export type Recovery = 'falling' | 'down' | 'getting-up' | null;
export const ROUTINE: Activity[] = ['thinking','reading','idle','walking','idle','playing','sitting','idle','stretching','looking','celebrating','idle'];
export const DURATIONS: Record<Activity,number> = {idle:4500,walking:6000,sitting:5000,reading:6500,playing:4500,thinking:4000,greeting:2400,stretching:3200,looking:3600,celebrating:2200};
export const clamp = (v:number, lo=0, hi=1) => Math.max(lo,Math.min(hi,v));
export const wave = (t:number, period:number, phase=0) => Math.sin((t/period+phase)*Math.PI*2);
export const smooth = (p:number) => {const v=clamp(p);return v*v*(3-2*v)};
type Keys = readonly (readonly [number,number])[];
/** Monotone cubic interpolation from the skill's flow(), preserving continuous velocity. */
export function flow(t:number, keys:Keys):number {
  if(t<=keys[0][0])return keys[0][1];
  if(t>=keys[keys.length-1][0])return keys[keys.length-1][1];
  let i=0;while(keys[i+1][0]<t)i++;
  const slope=(j:number)=>(keys[j+1][1]-keys[j][1])/(keys[j+1][0]-keys[j][0]);
  const tangent=(j:number)=>{
    if(j===0||j===keys.length-1)return 0;
    const a=slope(j-1),b=slope(j);if(a*b<=0)return 0;
    const h0=keys[j][0]-keys[j-1][0],h1=keys[j+1][0]-keys[j][0],w0=2*h1+h0,w1=h1+2*h0;
    return (w0+w1)/(w0/a+w1/b);
  };
  const h=keys[i+1][0]-keys[i][0],s=(t-keys[i][0])/h;
  return (2*s**3-3*s*s+1)*keys[i][1]+(s**3-2*s*s+s)*h*tangent(i)
    +(-2*s**3+3*s*s)*keys[i+1][1]+(s**3-s*s)*h*tangent(i+1);
}
const envelope=(t:number,duration:number)=>smooth(t/420)*smooth((duration-t)/420);
const blink=(t:number)=>flow(t,[[0,0],[110,1],[150,1],[340,0]]);
export interface Pose {
  lift:number; sy:number; lean:number; shift:number; upperY:number; head:number; yaw:number;
  armL:number; armR:number; elbowL:number; elbowR:number; legL:number; legR:number;
  kneeL:number; kneeR:number; footL:number; footR:number; gazeX:number; gazeY:number; lid:number;
  wristL:number; wristR:number; openL:number; openR:number; gripL:number; gripR:number;
  thighScale:number; plant:number; stepL:number; stepR:number;
  facing:number; walk:number; shoeL:number; shoeR:number; groundAlign:number;
  book:number; stool:number; thought:number; ball:number; ballX:number; ballY:number; ballSpin:number;
}
export const standingPose = ():Pose => ({lift:0,sy:1,lean:0,shift:0,upperY:0,head:0,yaw:0,
  armL:0,armR:0,elbowL:0,elbowR:0,legL:0,legR:0,kneeL:0,kneeR:0,footL:0,footR:0,
  gazeX:0,gazeY:0,lid:0,book:0,stool:0,thought:0,ball:0,ballX:0,ballY:0,ballSpin:0,
  wristL:0,wristR:0,openL:0,openR:0,gripL:0,gripR:0,thighScale:1,plant:1,stepL:0,stepR:0,
  facing:0,walk:0,shoeL:-.35,shoeR:.35,groundAlign:0});
export function mixPose(a:Pose,b:Pose,p:number):Pose {
  if(p<=0)return {...a};if(p>=1)return {...b};
  const result={...b};for(const k of Object.keys(b) as (keyof Pose)[])result[k]=a[k]+(b[k]-a[k])*p;
  return result;
}
/** Solve actual artwork segment vectors onto a hand target. Joint angles are relative. */
export function armTo(side:'L'|'R', x:number,y:number,bendDirection:1|-1=side==='L'?-1:1):[number,number] {
  const root=BOY.pivots[side==='L'?'armL':'armR'],elbow=BOY.pivots[side==='L'?'elbowL':'elbowR'];
  const hand=BOY.pivots[side==='L'?'gripL':'gripR'];
  const u=[elbow[0]-root[0],elbow[1]-root[1]],v=[hand[0]-elbow[0],hand[1]-elbow[1]];
  const a=Math.hypot(...u),b=Math.hypot(...v),dx=x-root[0],dy=y-root[1],d=clamp(Math.hypot(dx,dy),Math.abs(a-b)+.01,a+b-.01);
  const bend=bendDirection*Math.acos(clamp((d*d-a*a-b*b)/(2*a*b),-1,1));
  const shoulder=Math.atan2(dy,dx)-Math.atan2(b*Math.sin(bend),a+b*Math.cos(bend));
  const deg=180/Math.PI;
  return [(shoulder-Math.atan2(u[1],u[0]))*deg,(bend-Math.atan2(v[1],v[0])+Math.atan2(u[1],u[0]))*deg];
}
export interface MotionContext {direction?:1|-1;walkMs?:number;strideUnits?:number}
export function walkStep(phase:number,strideUnits:number){
  const f=((phase%1)+1)%1;
  if(f<.5)return {x:(.25-f)*strideUnits,lift:0,roll:0};
  const u=(f-.5)*2;
  return {x:(-.25+.5*smooth(u))*strideUnits,lift:4.5*Math.sin(Math.PI*u),roll:-9*Math.sin(Math.PI*2*u)};
}
function walkingLeg(side:'L'|'R',x:number,lift:number,hipDrop:number,direction:1|-1):[number,number]{
  const hip=BOY.pivots[side==='L'?'legL':'legR'],knee=BOY.pivots[side==='L'?'kneeL':'kneeR'],ankle=BOY.pivots[side==='L'?'footL':'footR'];
  const a=knee[1]-hip[1],b=ankle[1]-knee[1],dy=ankle[1]-hip[1]-hipDrop-lift,d=clamp(Math.hypot(x,dy),Math.abs(a-b)+.01,a+b-.01);
  const e=direction*Math.acos(clamp((d*d-a*a-b*b)/(2*a*b),-1,1));
  const angle=Math.atan2(dy,x)-Math.atan2(b*Math.sin(e),a+b*Math.cos(e));
  return [(angle-Math.PI/2)*180/Math.PI,e*180/Math.PI];
}
export function poseAt(activity:Activity,t:number,idleTime:number,carried=false,recovery:Recovery=null,dropMs=440,stride=BOY.stride,context:MotionContext={}):Pose {
  const p=standingPose(),env=envelope(t,DURATIONS[activity]);
  p.lift=.8*(wave(idleTime,BOY.breathe)+1);p.head=1.4*wave(idleTime,BOY.headPeriod);
  p.shift=.65*wave(idleTime,5600);p.armL=1.5*wave(idleTime,4200);p.armR=1.2*wave(idleTime,5600,.4);
  p.elbowL=1.1*wave(idleTime-90,4200);p.elbowR=1.2*wave(idleTime-110,5600,.4);
  p.gazeX=flow(idleTime%7600,[[0,0],[1600,0],[2100,-1.2],[3600,-1.2],[4200,1],[6300,1],[7000,0],[7600,0]]);
  p.lid=blink(idleTime%BOY.blinkPeriod);
  if(activity==='greeting') {
    const arm:Keys=[[0,0],[180,6],[620,-120],[1850,-122],[2400,0]];
    p.armR+=flow(t,arm);p.elbowR+=flow(t,[[0,0],[580,-28],[1800,-28],[2400,0]])+.45*(flow(t-100,arm)-flow(t,arm));
    const handAngle=flow(t,[[0,0],[620,-175],[1850,-175],[2400,0]]);
    p.wristR=handAngle-p.armR-p.elbowR+12*wave(t-100,620)*envelope(t-400,1550);p.openR=env;
    p.lean=-2*env;p.head+=4*envelope(t-110,2150)-.45*p.lean;p.gazeX=0;
  } else if(activity==='walking') {
    const direction=context.direction??1,duration=context.walkMs??6000,travel=clamp(t-RIG.turnIn,0,duration);
    const turn=smooth(t/RIG.turnIn)*smooth((RIG.turnIn+duration+RIG.turnOut-t)/RIG.turnOut);
    const moving=smooth(travel/180)*smooth((duration-travel)/180),step=wave(travel,stride);
    p.facing=direction*turn;p.yaw=p.facing;p.gazeX=1.5*p.facing;
    p.shoeL=-.35+(direction+.35)*turn;p.shoeR=.35+(direction-.35)*turn;
    p.walk=1;p.upperY=6*moving;
    p.lean=direction*1.5*moving;
    const left=walkStep(travel/stride,context.strideUnits??60),right=walkStep(travel/stride+.5,context.strideUnits??60);
    [p.legL,p.kneeL]=walkingLeg('L',direction*left.x*moving,left.lift*moving,p.upperY,direction);
    [p.legR,p.kneeR]=walkingLeg('R',direction*right.x*moving,right.lift*moving,p.upperY,direction);
    p.stepL=left.lift*moving;p.stepR=right.lift*moving;
    p.footL=-p.legL-p.kneeL+direction*left.roll*moving;p.footR=-p.legR-p.kneeR+direction*right.roll*moving;
    p.lift+=1.1*(1-Math.cos(travel/stride*Math.PI*4))*moving;
    p.armL=direction*13*step*moving;p.armR=-direction*12*step*moving;
    p.elbowL=-8*moving;p.elbowR=7*moving;
    p.wristL=-p.armL-p.elbowL+2*wave(travel-100,stride)*moving;
    p.wristR=-p.armR-p.elbowR-2*wave(travel-120,stride)*moving;
    p.head-=.7*wave(travel-110,stride)*moving;
  } else if(activity==='thinking'||activity==='reading') {
    if(activity==='thinking') {
      [p.armR,p.elbowR]=armTo('R',107,76,-1);p.armR*=env;p.elbowR*=env;p.gripR=.65*env;
      p.thought=env;p.head=0;p.gazeX=1.5*env;p.gazeY=-1*env;
    } else {
      [p.armL,p.elbowL]=armTo('L',57,141);[p.armR,p.elbowR]=armTo('R',103,141);
      p.armL*=env;p.armR*=env;p.elbowL*=env;p.elbowR*=env;p.book=env;
      p.gripL=p.gripR=env;
      p.wristL=(-15-p.armL-p.elbowL)*env;p.wristR=(15-p.armR-p.elbowR)*env;
      p.head=3*env+.4*wave(idleTime,BOY.breathe);p.gazeX=1.4*wave(t,2200)*env;p.gazeY=1.3*env;
    }
  } else if(activity==='sitting') {
    p.stool=env;p.upperY=11*env;p.thighScale=1-.45*env;
    p.legL=8*env;p.legR=-7*env;p.kneeL=-8*env;p.kneeR=7*env;
    p.armL-=8*env;p.armR+=6*env;p.head+=2*env;
  } else if(activity==='playing') {
    // Ball rolls from outside the stage, reaches the shoe, then makes one ballistic arc.
    p.ball=env;
    const roll=smooth(t/1200),flight=clamp((t-1450)/1650);
    p.ballX=t<1450?48-70*roll:-22+72*flight;
    p.ballY=-76*4*flight*(1-flight);p.ballSpin=p.ballX/11*180/Math.PI;
    p.legR=flow(t,[[0,0],[1000,10],[1300,12],[1650,-24],[2050,3],[2600,0]]);
    p.kneeR=flow(t,[[0,0],[1200,-12],[1650,4],[2300,0]]);
    p.armL+=8*envelope(t-700,1900);p.gazeX=clamp(p.ballX/20,-1.5,2);p.gazeY=clamp(p.ballY/40,-1,1);p.head+=p.gazeX;
  } else if(activity==='stretching') {
    p.armL+=130*env;p.armR-=139*envelope(t-120,3000);p.elbowL-=12*env;p.elbowR+=19*env;p.lift+=2*env;p.head+=3*env;
    p.openL=.6*env;p.openR=.7*env;p.wristL=-10*env;p.wristR=8*env;
  } else if(activity==='looking') {
    p.yaw=flow(t,[[0,0],[650,-1],[1400,-1],[2200,1],[2900,1],[3600,0]]);
    p.gazeX=2*p.yaw;p.head+=3*flow(t-110,[[0,0],[650,-1],[1400,-1],[2200,1],[2900,1],[3600,0]]);
    p.lid=Math.max(p.lid,blink(t-420),blink(t-1850));
  } else if(activity==='celebrating') {
    const jump=clamp((t-450)/650),air=Math.sin(Math.PI*jump);
    p.lift+=18*air;p.sy=flow(t,[[0,1],[300,.94],[450,1.04],[1050,1.02],[1190,.86],[1500,1],[2200,1]]);
    p.armL+=105*envelope(t-150,1500);p.armR-=122*envelope(t-230,1450);
    p.kneeL=-10*air;p.kneeR=7*air;p.footL=25*air;p.footR=-22*air;
    p.plant=1-smooth(air*3);p.openL=.8*env;p.openR=env;p.wristL=-12*env;p.wristR=10*env;
  }
  // The hips carry the torso; tiny leg counter-rotations keep standing feet planted.
  if(activity!=='walking'&&activity!=='sitting'){p.legL+=p.shift;p.legR+=p.shift}
  if(carried||recovery==='falling'&&t<dropMs) {
    p.armL=12+2*wave(idleTime,2400);p.armR=-9+2*wave(idleTime-100,2800);
    p.kneeL=-8-4*wave(idleTime,2800);p.kneeR=7+3*wave(idleTime,2800,.4);p.footL=40;p.footR=-38;
    p.plant=0;p.stepL=p.stepR=0;p.wristL=8*wave(idleTime-100,2400);p.wristR=-6*wave(idleTime-120,2400);
    p.lean=2*wave(idleTime,2400);p.book=p.ball=p.thought=p.stool=0;
  }
  if(recovery&&(recovery!=='falling'||t>=dropMs)) {
    const impact=Math.max(0,t-dropMs),tip=recovery==='falling'?smooth((impact-80)/(BOY.tumble-80)):1;
    p.lean=-76*tip;p.shift=60*tip;p.lift=0;p.sy=1-.1*tip;
    p.legL=-14*tip;p.legR=22*tip;p.kneeL=48*tip;p.kneeR=-32*tip;
    p.armL=30+8*tip;p.armR=-30+10*tip;p.elbowL=-35*tip;p.elbowR=50*tip;
    p.wristL=30*tip;p.wristR=-20*tip;p.head=10*tip;p.openL=.8;p.openR=.7;
    p.shoeL=-.35-.35*tip;p.shoeR=.35-1.05*tip;
    p.groundAlign=recovery==='falling'?smooth(impact/100):1;
    if(recovery==='falling'){
      p.sy-=.2*Math.sin(Math.PI*clamp(impact/220));p.lid=Math.max(p.lid,blink(impact));
    }
    if(recovery==='getting-up'){
      // Brace, roll onto a knee, push up, straighten, then let the head/arms settle.
      p.lean=flow(t,[[0,-76],[180,-70],[480,-48],[850,-16],[1250,1],[1600,0]]);
      p.shift=flow(t,[[0,60],[300,48],[700,22],[1150,0],[1600,0]]);
      p.sy=flow(t,[[0,.9],[500,.93],[950,.98],[1300,1],[1600,1]]);
      p.upperY=flow(t,[[0,0],[400,12],[800,18],[1150,6],[1600,0]]);
      p.thighScale=flow(t,[[0,1],[400,.8],[750,.62],[1100,.8],[1600,1]]);
      p.legL=flow(t,[[0,-14],[400,28],[800,18],[1200,5],[1600,0]]);
      p.legR=flow(t,[[0,22],[400,-20],[800,-12],[1200,-4],[1600,0]]);
      p.kneeL=flow(t,[[0,48],[380,78],[800,55],[1200,18],[1600,0]]);
      p.kneeR=flow(t,[[0,-32],[400,-72],[850,-38],[1200,-12],[1600,0]]);
      p.armL=flow(t,[[0,38],[250,60],[550,45],[1000,12],[1600,0]]);
      p.elbowL=flow(t,[[0,-35],[400,-80],[800,-45],[1350,0],[1600,0]]);
      p.armR=flow(t,[[0,-20],[250,-65],[650,-35],[1100,-8],[1600,0]]);
      p.elbowR=flow(t,[[0,50],[400,85],[900,25],[1400,0],[1600,0]]);
      p.wristL=flow(t,[[0,30],[400,35],[900,-15],[1600,0]]);
      p.wristR=flow(t,[[0,-20],[450,-30],[1000,10],[1600,0]]);
      p.head=flow(t,[[0,10],[200,0],[650,-12],[1150,-4],[1600,0]]);
      p.openL=.8*(1-smooth((t-900)/600));p.openR=.7*(1-smooth((t-850)/600));
      const front=smooth((t-850)/650);p.shoeL=-.7+.35*front;p.shoeR=-.7+1.05*front;
      p.lid=Math.max(p.lid,blink(t-200));
    }
    p.book=p.ball=p.thought=p.stool=0;p.plant=0;p.stepL=p.stepR=0;
  }
  // Keep the support sole level; a swinging foot can still point slightly with the step.
  if(p.plant>.99&&activity!=='walking'){p.footL-=p.legL+p.kneeL;p.footR-=p.legR+p.kneeR}
  p.wristL=clamp(p.wristL,-RIG.limits.wrist,RIG.limits.wrist);p.wristR=clamp(p.wristR,-RIG.limits.wrist,RIG.limits.wrist);
  p.elbowL=clamp(p.elbowL,-RIG.limits.elbow,RIG.limits.elbow);p.elbowR=clamp(p.elbowR,-RIG.limits.elbow,RIG.limits.elbow);
  p.kneeL=clamp(p.kneeL,-RIG.limits.knee,RIG.limits.knee);p.kneeR=clamp(p.kneeR,-RIG.limits.knee,RIG.limits.knee);
  p.footL=clamp(p.footL,-RIG.limits.ankle,RIG.limits.ankle);p.footR=clamp(p.footR,-RIG.limits.ankle,RIG.limits.ankle);
  return p;
}

/** Pausable active-time clock. Wall-clock time spent hidden never enters the choreography. */
export class ActiveClock {
  time=0;private last:number|null=null;
  tick(now:number){if(this.last!==null)this.time+=Math.max(0,now-this.last);this.last=now;return this.time}
  pause(){this.last=null}
}
