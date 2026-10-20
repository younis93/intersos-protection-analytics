// Shared offline fluid-light renderer for native startup and React processing.
// Original domain-warped shader inspired by the Fluid Field visual reference.
const vertexSource = `attribute vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;
const fragmentSource = `precision highp float;
uniform vec2 resolution, pointer;
uniform float time, presence, dark;
uniform vec3 background, baseColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float field(vec2 p){
  float n=0.,a=.55;
  for(int i=0;i<4;i++){n+=a*noise(p);p=mat2(.8,-.6,.6,.8)*p*2.03+3.1;a*=.5;}
  return n;
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*resolution)/min(resolution.x,resolution.y);
  vec2 m=(pointer-.5)*resolution/min(resolution.x,resolution.y);
  vec2 delta=p-m;
  float twist=presence*.16*exp(-dot(delta,delta)*3.);
  p=m+mat2(cos(twist),-sin(twist),sin(twist),cos(twist))*delta;
  float t=time*.10;
  vec2 warp=vec2(field(p*1.7+vec2(t*.23,-t*.17)),field(p*1.7+vec2(4.7-t*.19,1.2+t*.21)));
  vec2 q=p+(warp-.5)*.85;
  float phase=q.x+q.y*1.5+field(q*1.9+vec2(-t*.18,t*.12))*1.35-t*.5;
  float wave=.5+.5*sin(phase*2.4);
  float beam=pow(wave,2.);
  float detail=.96+.04*sin(phase*8.+field(q*3.)*4.);
  float glow=beam*detail;
  float hue=smoothstep(.2,.85,field(q*1.4+vec2(t*.08,4.)));
  vec3 tint=mix(baseColor,vec3(.22,.73,.82),hue);
  vec3 light=mix(background,mix(tint,vec3(1.),.22),.025+glow*.34);
  vec3 night=background+tint*(.025+glow*.32);
  gl_FragColor=vec4(mix(light,night,dark),1.);
}`;

export function createProcessingRingField(canvas, {active = true, speed = 1} = {}) {
  const gl = canvas.getContext('webgl', {alpha:true,antialias:false,depth:false,powerPreference:'low-power'});
  canvas.dataset.renderer = 'fallback';
  canvas.dataset.motion = 'static';
  if (!gl) return () => {};
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let saved=window.__processingFluidState;
  if(!saved){try{saved=JSON.parse(new URLSearchParams(window.location?.search||'').get('processingFieldState')||'null');}catch{/* Start normally if no valid handoff state is available. */}}
  const restored=(key,fallback,min,max)=>Number.isFinite(saved?.[key])?Math.min(max,Math.max(min,saved[key])):fallback;
  let frame=0, previous=0, lastDraw=0, elapsed=restored('elapsed',0,0,86400), disposed=false, lost=false;
  let program=null, buffer=null, shaders=[], uniforms={};
  let targetX=restored('targetX',.5,0,1),targetY=restored('targetY',.5,0,1),pointerX=restored('pointerX',.5,0,1),pointerY=restored('pointerY',.5,0,1),presence=restored('presence',0,0,1),pointerAt=presence>0?performance.now():-Infinity;
  let background=[.93,.96,.98],blue=[.086,.514,.847],dark=0;
  const rgb=(value,fallback)=>{
    const hex=value.trim().replace('#','');
    if(!/^[a-f0-9]{6}$/i.test(hex))return fallback;
    return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  };
  function colors(){
    const style=getComputedStyle(canvas);
    background=rgb(style.getPropertyValue('--bg'),background);
    blue=rgb(style.getPropertyValue('--blue'),blue);
    dark=background.reduce((a,b)=>a+b,0)/3<.35?1:0;
  }
  function release(){
    if(buffer)gl.deleteBuffer(buffer);
    if(program)gl.deleteProgram(program);
    shaders.forEach(shader=>gl.deleteShader(shader));
    buffer=null;program=null;shaders=[];
  }
  function initialize(){
    try{
      for(const [kind,source] of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){
        const shader=gl.createShader(kind);if(!shader)throw new Error('Shader unavailable');
        shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Shader compilation failed');
      }
      program=gl.createProgram();if(!program)throw new Error('Program unavailable');
      shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Shader linking failed');
      gl.useProgram(program);buffer=gl.createBuffer();if(!buffer)throw new Error('Buffer unavailable');
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      uniforms=Object.fromEntries(['resolution','pointer','time','presence','dark','background','baseColor'].map(name=>[name,gl.getUniformLocation(program,name)]));
      canvas.dataset.renderer='webgl';return true;
    }catch{
      release();canvas.dataset.renderer='fallback';return false;
    }
  }
  function draw(now,moving){
    if(!program||lost||disposed)return;
    if(moving&&lastDraw)elapsed+=Math.min(now-lastDraw,80)/1000*speed;
    lastDraw=moving?now:0;
    const hover=moving&&now-pointerAt<2500?1:0;
    presence+=(hover-presence)*.045;
    pointerX+=(targetX-pointerX)*.06;pointerY+=(targetY-pointerY)*.06;
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);
    gl.uniform2f(uniforms.pointer,pointerX,pointerY);
    gl.uniform1f(uniforms.time,elapsed);
    gl.uniform1f(uniforms.presence,presence);
    gl.uniform1f(uniforms.dark,dark);
    gl.uniform3fv(uniforms.background,background);gl.uniform3fv(uniforms.baseColor,blue);
    gl.drawArrays(gl.TRIANGLES,0,3);
    // Preserve the fluid phase and cursor position across React remounts and
    // expose the same small snapshot to the native startup handoff.
    window.__processingFluidState={elapsed,targetX,targetY,pointerX,pointerY,presence};
  }
  function resize(){
    const bounds=canvas.getBoundingClientRect();
    const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height);
    const ratio=Math.min(window.devicePixelRatio||1,1.25,Math.sqrt(1200000/(width*height)));
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    gl.viewport(0,0,canvas.width,canvas.height);draw(performance.now(),false);
  }
  const enabled=()=>active&&!motion.matches&&!document.hidden&&!disposed&&!lost&&Boolean(program);
  function tick(now){
    if(!enabled()){frame=0;lastDraw=0;return;}
    if(now-previous>=32){draw(now,true);previous=now;}
    frame=requestAnimationFrame(tick);
  }
  function sync(){
    cancelAnimationFrame(frame);frame=0;lastDraw=0;
    if(enabled())frame=requestAnimationFrame(tick);else draw(performance.now(),false);
    canvas.dataset.motion=enabled()?'running':'static';
  }
  function move(event){
    const bounds=canvas.getBoundingClientRect();
    targetX=(event.clientX-bounds.left)/Math.max(1,bounds.width);
    targetY=1-(event.clientY-bounds.top)/Math.max(1,bounds.height);
    pointerAt=performance.now();
  }
  function contextLost(event){event.preventDefault();lost=true;sync();}
  function contextRestored(){
    lost=false;program=null;buffer=null;shaders=[];
    initialize();resize();sync();
  }
  colors();if(!initialize())return()=>{disposed=true;};
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  const theme=new MutationObserver(()=>{colors();if(!enabled())draw(performance.now(),false);});
  theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class']});
  window.addEventListener('pointermove',move,{passive:true});
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync);
  canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
  resize();sync();
  return()=>{
    disposed=true;cancelAnimationFrame(frame);observer.disconnect();theme.disconnect();
    window.removeEventListener('pointermove',move);document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);
    canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);
    if(!lost){release();gl.getExtension('WEBGL_lose_context')?.loseContext();}
  };
}
if(typeof window!=='undefined')window.createProcessingRingField=createProcessingRingField;
