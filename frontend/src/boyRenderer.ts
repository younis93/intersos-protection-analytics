import {BOY,clamp,type Pose} from './boyMotion';
import {RIG,armGeometry,legGeometry,handPath,shoeGeometry} from './boyRig';

const names=['rig','upper-body','head','face','pupils','eyes','lid-left','lid-right','arm-left','arm-right',
  'forearm-left','forearm-right','leg-front','leg-back','shin-front','shin-back','foot-front','foot-back',
  'book','stool','thought','ball','shadow','hips','hand-left','hand-right','lash-left','lash-right',
  'arm-fill-L','arm-fill-R','arm-outline-L','arm-outline-R','leg-fill-L','leg-fill-R','leg-outline-L','leg-outline-R',
  'hand-fill-L','hand-fill-R','hand-outline-L','hand-outline-R','fingers-L','fingers-R',
  'shoe-upper-L','shoe-upper-R','shoe-sole-L','shoe-sole-R','shoe-seam-L','shoe-seam-R',
  'shoe-laces-L','shoe-laces-R','shoe-toe-L','shoe-toe-R','torso','body-shell','head-shell','cap-shell','cap-brim'] as const;
type Part=typeof names[number];
type Parts=Record<Part,SVGElement>;
export function bindBoy(node:HTMLElement):Parts {
  return Object.fromEntries(names.map(name=>[name,node.querySelector(`.boy-${name}`)!])) as Parts;
}
const rotate=(degrees:number,pivot:readonly [number,number])=>`rotate(${degrees} ${pivot[0]} ${pivot[1]})`;
export function paintBoy(parts:Parts,p:Pose,height:number,scale:number){
  const transform=(name:Part,value:string)=>parts[name].setAttribute('transform',value);
  const opacity=(name:Part,value:number)=>parts[name].setAttribute('opacity',String(value));
  const pivot=BOY.pivots;
  const baseRig=`translate(${p.shift} ${-p.lift}) translate(80 197) ${rotate(p.lean,[0,0])} scale(${1/p.sy**.6} ${p.sy}) translate(-80 -197)`;
  transform('rig',baseRig);
  transform('upper-body',`translate(0 ${p.upperY})`);
  const turn=Math.abs(p.facing);
  transform('hips',`translate(0 ${p.upperY}) translate(80 0) scale(${1-.18*turn} 1) translate(-80 0)`);
  transform('torso',`translate(${p.facing*2} 0) translate(80 0) scale(${1-.16*turn} 1) translate(-80 0)`);
  transform('head',`translate(80 0) scale(${1-.1*turn} 1) translate(-80 0) ${rotate(p.head,pivot.head)}`);
  transform('face',`translate(${p.yaw*4} 0)`);
  const brimFront=[50,34,77,30,109,37,119,40,114,44,81,43,52,39];
  const brimSide=p.facing>=0?[51,34,80,30,111,37,123,40,117,45,84,44,53,39]:[43,37,71,30,109,34,113,36,108,39,76,44,45,44];
  const brim=brimFront.map((v,i)=>v+(brimSide[i]-v)*turn);
  parts['cap-brim'].setAttribute('d',`M ${brim.slice(0,2)} Q ${brim.slice(2,6)} Q ${brim.slice(6,10)} Q ${brim.slice(10,14)} Z`);
  transform('pupils',`translate(${clamp(p.gazeX,-1.5,1.5)} ${clamp(p.gazeY,-1,1)})`);
  for(const name of ['lid-left','lid-right'] as const)parts[name].setAttribute('height',String(16*clamp(p.lid)));
  opacity('lash-left',clamp((p.lid-.7)/.3));opacity('lash-right',clamp((p.lid-.7)/.3));
  transform('arm-left',`translate(${6*turn} 0) ${rotate(p.armL,pivot.armL)}`);
  transform('arm-right',`translate(${-6*turn} 0) ${rotate(p.armR,pivot.armR)}`);
  transform('forearm-left',rotate(p.elbowL,pivot.elbowL));transform('forearm-right',rotate(p.elbowR,pivot.elbowR));
  for(const side of ['L','R'] as const){
    const left=side==='L',label=left?'front':'back',wrist=left?pivot.wristL:pivot.wristR;
    const arm=armGeometry(side,left?p.elbowL:p.elbowR),leg=legGeometry(side,left?p.kneeL:p.kneeR,p.thighScale);
    const hand=handPath(left?p.openL:p.openR,left?p.gripL:p.gripR);
    const shoe=shoeGeometry(left?p.shoeL:p.shoeR);
    for(const key of ['upper','sole','seam','laces','toe'] as const)parts[`shoe-${key}-${side}`].setAttribute('d',shoe[key]);
    parts[`arm-fill-${side}`].setAttribute('d',arm.fill);parts[`arm-outline-${side}`].setAttribute('d',arm.outline);
    parts[`leg-fill-${side}`].setAttribute('d',leg.fill);parts[`leg-outline-${side}`].setAttribute('d',leg.outline);
    parts[`hand-fill-${side}`].setAttribute('d',hand);parts[`hand-outline-${side}`].setAttribute('d',hand.replace('Z',''));
    opacity(`fingers-${side}`,.28+.4*(left?p.openL:p.openR));
    transform(left?'hand-left':'hand-right',`translate(${wrist[0]} ${wrist[1]}) rotate(${left?p.wristL:p.wristR})`);
    const hip=left?pivot.legL:pivot.legR,knee=left?pivot.kneeL:pivot.kneeR,ankle=left?pivot.footL:pivot.footR;
    const kneeShift=(knee[1]-hip[1])*(p.thighScale-1);
    const legAngle=left?p.legL:p.legR,kneeAngle=left?p.kneeL:p.kneeR,radians=Math.PI/180;
    const ankleY=hip[1]+p.upperY+(knee[1]-hip[1])*p.thighScale*Math.cos(legAngle*radians)+(ankle[1]-knee[1])*Math.cos((legAngle+kneeAngle)*radians);
    // Contact adjustment must stay within the cloth overlap at the hip. An impossible
    // deep bend may lift the shoe, but must never detach the leg to reach the ground.
    const contact=clamp(p.plant*(1-p.walk)*(RIG.floor-ankleY-RIG.soleDepth),-RIG.hipContactAllowance,RIG.hipContactAllowance);
    transform(`leg-${label}`,`translate(${(left?4:-4)*turn} ${p.upperY+p.plant*p.lift-(1-p.walk)*(left?p.stepL:p.stepR)+contact}) ${rotate(legAngle,hip)}`);
    transform(`shin-${label}`,`translate(0 ${kneeShift}) ${rotate(left?p.kneeL:p.kneeR,knee)}`);
    transform(`foot-${label}`,`translate(${ankle[0]} ${ankle[1]}) rotate(${clamp(left?p.footL:p.footR,-RIG.limits.ankle,RIG.limits.ankle)})`);
  }
  if(p.groundAlign>0){
    // Only recovery needs silhouette contact. Keep real drawn geometry above the floor,
    // including hands and shoes, while the body rolls and changes its support points.
    const root=parts.rig.ownerSVGElement!,inverse=root.getCTM()!.inverse();
    let minX=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const key of ['arm-fill-L','arm-fill-R','leg-fill-L','leg-fill-R','hand-fill-L','hand-fill-R',
      'shoe-upper-L','shoe-upper-R','shoe-sole-L','shoe-sole-R','body-shell','head-shell','cap-shell'] as const){
      const node=parts[key] as SVGGraphicsElement,box=node.getBBox(),matrix=inverse.multiply(node.getCTM()!);
      for(const [x,y] of [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]]){
        const point=new DOMPoint(x,y).matrixTransform(matrix);minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);maxY=Math.max(maxY,point.y);
      }
    }
    const screenInverse=root.getScreenCTM()!.inverse();
    const left=new DOMPoint(12,0).matrixTransform(screenInverse).x,right=new DOMPoint(window.innerWidth-12,0).matrixTransform(screenInverse).x;
    const dx=clamp(0,left-minX,right-maxX),dy=RIG.floor-maxY;
    transform('rig',`translate(${dx*p.groundAlign} ${dy*p.groundAlign}) ${baseRig}`);
  }
  for(const prop of ['book','stool','thought','ball'] as const)opacity(prop,p[prop]);
  transform('book',`translate(0 ${(1-p.book)*65})`);transform('stool',`translate(${(1-p.stool)*-100} 0)`);
  transform('thought',`translate(0 ${(1-p.thought)*5})`);
  transform('ball',`translate(${p.ballX} ${p.ballY}) ${rotate(p.ballSpin,[126,187])}`);
  const lift=Math.max(0,height/Math.max(.1,scale)+p.lift),shadow=clamp(1-lift/700,.4,1);
  transform('shadow',`translate(0 ${height/Math.max(.1,scale)}) translate(80 201) scale(${shadow} ${shadow}) translate(-80 -201)`);
  opacity('shadow',.16*shadow);
}
