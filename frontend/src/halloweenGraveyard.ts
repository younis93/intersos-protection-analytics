/** Upright silhouette: fixed head/ears, articulated wings and scallops underneath. */
export function drawGraveyardBat(ctx:CanvasRenderingContext2D,flap:number){
  const tip=-3-Math.max(-1,Math.min(1,flap))*5;
  ctx.fillStyle='#03060ce0';
  for(const side of [-1,1]){
    ctx.save();ctx.scale(side,1);ctx.beginPath();ctx.moveTo(2,-2);
    ctx.quadraticCurveTo(7,-5,15,tip);
    ctx.lineTo(11,tip+4);ctx.quadraticCurveTo(8,tip+2,7,3);
    ctx.quadraticCurveTo(4,1,2,4);ctx.closePath();ctx.fill();ctx.restore();
  }
  // Two ears above a broad head, with a rounded body below, never mirrored vertically.
  ctx.beginPath();ctx.moveTo(-3,-1);ctx.lineTo(-3,-7);ctx.lineTo(-1,-5);
  ctx.lineTo(1,-5);ctx.lineTo(3,-7);ctx.lineTo(3,-1);
  ctx.quadraticCurveTo(3,5,0,6);ctx.quadraticCurveTo(-3,5,-3,-1);ctx.closePath();ctx.fill();
}

/** Decorative scenery only. Gameplay coordinates and collisions never depend on this layer. */
export function createGraveyardScene(canvas:HTMLCanvasElement){
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  const landscape=document.createElement('canvas'),paint=landscape.getContext('2d');if(!paint)return null;
  let width=0,height=0,lastTime=NaN,lastReduced=false;
  function build(w:number,h:number){
    width=w;height=h;canvas.width=w;canvas.height=h;landscape.width=w;landscape.height=h;
    const c=paint!;
    const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#090c18');sky.addColorStop(.55,'#1c122c');sky.addColorStop(1,'#080e16');c.fillStyle=sky;c.fillRect(0,0,w,h);
    const mx=w*.16,my=Math.min(165,h*.22),radius=Math.max(26,Math.min(54,w*.07));
    const glow=c.createRadialGradient(mx,my,radius*.4,mx,my,radius*3.5);glow.addColorStop(0,'#c6d3e329');glow.addColorStop(1,'#adbed000');c.fillStyle=glow;c.fillRect(mx-radius*4,my-radius*4,radius*8,radius*8);
    const moon=document.createElement('canvas');moon.width=40;moon.height=40;const m=moon.getContext('2d')!;
    const palette=['#48556e','#63718a','#8392a9','#a6b4c9','#cad5e3','#e3eaf1'];
    const craters=[[-8,-3,3.7],[6,6,4.6],[4,-9,2.7],[-5,10,2.6],[12,-1,2.2]];
    for(let y=0;y<40;y++)for(let x=0;x<40;x++){
      const nx=x-19.5,ny=y-19.5,r=Math.hypot(nx,ny);if(r>18.5)continue;
      let shade=4-nx*.045-ny*.025;
      if(r>17.5)shade=nx+ny<0?3:0;
      for(const [cx,cy,size]of craters){const d=Math.hypot(nx-cx,ny-cy);if(d<size){shade-=1.5;if(d>size-1&&nx-cx+ny-cy<0)shade+=.8}else if(d<size+1&&nx-cx+ny-cy>0)shade+=.6}
      m.fillStyle=palette[Math.max(0,Math.min(5,Math.round(shade)))];m.fillRect(x,y,1,1);
    }
    c.imageSmoothingEnabled=false;c.drawImage(moon,Math.round(mx-radius),Math.round(my-radius),Math.round(radius*2),Math.round(radius*2));
    // Distant hills, ruined gravestones and a crooked wrought-iron fence.
    c.fillStyle='#090c16';c.beginPath();c.moveTo(0,h);c.lineTo(0,h*.78);
    for(let x=0;x<=w+20;x+=20)c.lineTo(x,h*.82+Math.sin(x*.008)*h*.025+Math.cos(x*.017)*8);
    c.lineTo(w,h);c.closePath();c.fill();
    for(let i=0;i<Math.ceil(w/95);i++){
      const x=i*95+24,y=h*.86+Math.sin(i*2)*18,size=15+(i%3)*5;
      c.save();c.translate(x,y);c.rotate(Math.sin(i*4)*.13);c.fillStyle=i%2?'#131727':'#17192a';
      c.beginPath();c.roundRect(-size*.45,-size*1.5,size*.9,size*1.6,[size*.4,size*.4,1,1]);c.fill();
      c.restore();
    }
    c.strokeStyle='#151b2a';c.lineWidth=2;
    for(let x=0;x<w;x+=26){const y=h*.88+Math.sin(x*.012)*7;c.beginPath();c.moveTo(x,y+37);c.lineTo(x+Math.sin(x)*3,y);c.lineTo(x-3,y+7);c.moveTo(x,y);c.lineTo(x+3,y+7);c.stroke()}
    for(const y of [h*.9,h*.92]){c.beginPath();c.moveTo(0,y);c.lineTo(w,y-6);c.stroke()}
    // Bare branches frame the edges without covering the center of the home screen.
    for(const side of [-1,1]){
      c.save();c.translate(side===1?w:0,h*.67);c.scale(side===1?-1:1,1);c.strokeStyle='#080b14';c.lineCap='round';
      const branch=(x:number,y:number,length:number,angle:number,depth:number)=>{
        if(depth===0)return;const ex=x+Math.cos(angle)*length,ey=y+Math.sin(angle)*length;
        c.lineWidth=depth*1.8;c.beginPath();c.moveTo(x,y);c.lineTo(ex,ey);c.stroke();
        branch(ex,ey,length*.66,angle-.44,depth-1);branch(ex,ey,length*.58,angle+.5,depth-1);
      };
      branch(-15,30,Math.min(125,w*.18),-1.2,5);c.restore();
    }
    const vignette=c.createRadialGradient(w*.5,h*.45,w*.12,w*.5,h*.45,Math.max(w,h)*.72);vignette.addColorStop(0,'#04050b00');vignette.addColorStop(1,'#03050bc7');c.fillStyle=vignette;c.fillRect(0,0,w,h);
  }
  return {draw(w:number,h:number,time:number,reduced:boolean){
    w=Math.round(w);h=Math.round(h);const resized=w!==width||h!==height;
    if(!resized&&lastReduced===reduced&&(reduced||lastTime===time))return;
    if(resized)build(w,h);lastTime=time;lastReduced=reduced;
    ctx.clearRect(0,0,w,h);ctx.drawImage(landscape,0,0);
    const t=reduced?0:time;
    // Translucent clouds pass slowly over the moon; low fog stays below the cards.
    for(let i=0;i<4;i++){
      const x=((i*w*.34+t*(i%2?3:-2)+w*3)%(w*1.5))-w*.2,y=i<2?h*.17+i*22:h*.81+(i-2)*55;
      const fog=ctx.createRadialGradient(x,y,0,x,y,Math.max(w*.42,180));fog.addColorStop(0,i<2?'#141925a8':'#8aa0b418');fog.addColorStop(1,'#6d8baf00');
      ctx.save();ctx.translate(x,y);ctx.scale(1,.16);ctx.fillStyle=fog;ctx.translate(-x,-y);ctx.fillRect(x-w*.6,y-w*.6,w*1.2,w*1.2);ctx.restore();
    }
    for(let i=0;i<3;i++){
      const phase=t*.06+i*2.1,x=((phase*w*.22)%(w+120))-60,y=h*.22+Math.sin(phase)*25+i*13,flap=reduced?0:Math.sin(t*5+i);
      ctx.save();ctx.translate(Math.round(x),Math.round(y));drawGraveyardBat(ctx,flap);ctx.restore();
    }
  }};
}
