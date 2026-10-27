/** Geometry shared by the SVG artwork, pose solver, and renderer. SVG units throughout. */
export type Point = readonly [number,number];
export const RIG = {
  pivots: {head:[80,88],upper:[80,137],armL:[59,101],armR:[101,101],
    elbowL:[49,125],elbowR:[111,125],wristL:[48,146],wristR:[112,146],
    gripL:[48,153],gripR:[112,153],legL:[69,141],legR:[91,141],
    kneeL:[69,164],kneeR:[91,164],footL:[69,185],footR:[91,185]} as const,
  radii: {arm:[5.5,4.8,3.5],leg:[9,7.4,6.1]} as const,
  limits: {wrist:42,elbow:145,knee:85,ankle:45},
  floor:199,
  soleDepth:14,
  hipContactAllowance:3.5,
  turnIn:360,turnOut:300,
};
export const rotatePoint=(point:Point,pivot:Point,degrees:number):Point=>{
  const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r),x=point[0]-pivot[0],y=point[1]-pivot[1];
  return [pivot[0]+x*c-y*s,pivot[1]+x*s+y*c];
};
const add=(p:Point,n:Point,r:number):Point=>[p[0]+n[0]*r,p[1]+n[1]*r];
const coords=(p:Point)=>`${p[0].toFixed(3)} ${p[1].toFixed(3)}`;
/** One tapered outline around two bones: round outer joint, clean inner fold, no cut edge.
 * Open ends let the sleeve/cuff and hand overlap without a transverse outline at the joint.
 */
export function limbContour(root:Point,joint:Point,end:Point,radii:readonly [number,number,number]){
  const unit=(a:Point,b:Point):Point=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1]);return [(b[0]-a[0])/l,(b[1]-a[1])/l]};
  const u=unit(root,joint),v=unit(joint,end),n:Point=[-u[1],u[0]],m:Point=[-v[1],v[0]];
  const cross=u[0]*v[1]-u[1]*v[0],dot=u[0]*v[0]+u[1]*v[1];
  const [r0,r1,r2]=radii;
  const side=(sign:number,reverse=false)=>{
    const a=add(joint,n,sign*r1),b=add(joint,m,sign*r1),outer=cross*sign<0;
    const inner:Point=[joint[0]+(n[0]+m[0])*sign*r1/Math.max(.3,1+dot),joint[1]+(n[1]+m[1])*sign*r1/Math.max(.3,1+dot)];
    const bend=Math.abs(cross)<.001?`L ${coords(a)}`:outer
      ?`L ${coords(reverse?b:a)} A ${r1} ${r1} 0 0 ${(cross>0)!==reverse?1:0} ${coords(reverse?a:b)}`
      :`L ${coords(inner)}`;
    return reverse?`M ${coords(add(end,m,sign*r2))} ${bend} L ${coords(add(root,n,sign*r0))}`
      :`M ${coords(add(root,n,sign*r0))} ${bend} L ${coords(add(end,m,sign*r2))}`;
  };
  const left=side(1),right=side(-1,true);
  return {fill:`${left} L ${coords(add(end,m,-r2))} ${right.replace(/^M [^ ]+ [^ ]+ /,'')} Z`,outline:`${left} ${right}`};
}

/** Continuous front-to-three-quarter footwear silhouettes, keeping both soles a full shape. */
export function shoeGeometry(yaw:number){
  const amount=Math.min(1,Math.abs(yaw));
  const front=[-5,-4,-3,-6,3,-6,5,-3,7,3,11,10,7,13,0,13,-6,13,-12,13,-12,7,-9,3,-6,0];
  const left=[-6,-4,-3,-6,2,-6,4,-3,7,3,9,11,2,13,-1,13,-13,13,-20,13,-19,6,-13,3,-7,0];
  const right=[-5,-3,-3,-6,3,-6,6,-4,7,0,13,3,20,6,18,11,13,13,2,14,-9,14,-7,3,-5,-3];
  const target=yaw<0?left:right,points=front.map((v,i)=>v+(target[i]-v)*amount);
  let i=0;const take=(n:number)=>points.slice(i,i+=n).join(' ');
  const upper=`M ${take(2)} C ${take(6)} L ${take(2)} C ${take(6)} L ${take(2)} C ${take(6)} L ${take(2)} Z`;
  const x=yaw*5.5,wide=10+amount*2.5;
  return {upper,sole:`M ${x-wide} 8 Q ${x} 12 ${x+wide} 8 L ${x+wide-1} 12 Q ${x} 16 ${x-wide+1} 12 Z`,
    seam:`M ${x-wide+3} 11 Q ${x} 13 ${x+wide-3} 10`,
    laces:`M ${x-4} 2 l6 2 m-7 0 l6 2`,toe:`M ${x-5} 7 Q ${x} 5 ${x+4} 7`};
}
export function armGeometry(side:'L'|'R',bend=0){
  const p=RIG.pivots,root=side==='L'?p.armL:p.armR,joint=side==='L'?p.elbowL:p.elbowR,end=side==='L'?p.wristL:p.wristR;
  return limbContour(root,joint,rotatePoint(end,joint,bend),RIG.radii.arm);
}
export function legGeometry(side:'L'|'R',bend=0,thighScale=1){
  const p=RIG.pivots,root=side==='L'?p.legL:p.legR,joint=side==='L'?p.kneeL:p.kneeR,end=side==='L'?p.footL:p.footR;
  const delta=(joint[1]-root[1])*(thighScale-1),knee:Point=[joint[0],joint[1]+delta],ankle:Point=[end[0],end[1]+delta];
  return limbContour(root,knee,rotatePoint(ankle,knee,bend),RIG.radii.leg);
}
/** Same path topology for every hand shape: fingers open and curl without swapping art. */
export function handPath(open:number,grip:number){
  const o=Math.max(0,Math.min(1,open))*(1-grip),g=Math.max(0,Math.min(1,grip));
  const spread=1+o*.35,tip=14-g*5;
  return `M -3.4 -2 C -4.1 0 -4 3 -3.8 5
    L ${-4.5*spread} ${tip-3} Q ${-4.8*spread} ${tip-.5} ${-3.3*spread} ${tip-.3}
    Q ${-2.4*spread} ${tip-.2} ${-2.2*spread} ${tip-2-o*3}
    L ${-2.2*spread} ${tip+.2} Q ${-2*spread} ${tip+2} ${-.7*spread} ${tip+1.8}
    Q ${.3*spread} ${tip+1.7} ${.3*spread} ${tip-1-o*3}
    L ${.5*spread} ${tip+.2} Q ${.8*spread} ${tip+1.5} ${1.9*spread} ${tip+.7}
    Q ${2.7*spread} ${tip} ${2.6*spread} ${tip-2-o*2}
    Q ${4.2*spread} ${tip} ${4.8*spread} ${tip-2}
    L ${5.1+o} ${7-g*2} Q ${7+o} ${6-g*2} ${6.2+o} ${4-g}
    Q ${5.2+o} ${2-g} ${3.4} ${4-g*2}
    L 3.3 -2 Z`;
}
