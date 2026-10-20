import {afterEach,expect,it,vi} from 'vitest';
import {createProcessingRingField} from '../public/processing-ring-field.js';

afterEach(()=>vi.unstubAllGlobals());
function setup({active=true,speed=1,reduced=false,available=true,compiles=true,initialState,search=''}={}){
  const context=Object.fromEntries(['shaderSource','compileShader','attachShader','linkProgram','useProgram','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','viewport','uniform2f','uniform1f','uniform3fv','drawArrays','deleteBuffer','deleteProgram','deleteShader'].map(name=>[name,vi.fn()]));
  Object.assign(context,{createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>compiles,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:(_,name)=>name,getExtension:()=>null});
  const canvas={getContext:()=>available?context:null,getBoundingClientRect:()=>({width:390,height:844,left:0,top:0}),dataset:{},addEventListener:vi.fn(),removeEventListener:vi.fn()};
  const media={matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()};
  const doc={hidden:false,documentElement:{},addEventListener:vi.fn(),removeEventListener:vi.fn()};
  const win={matchMedia:()=>media,devicePixelRatio:3,addEventListener:vi.fn(),removeEventListener:vi.fn(),__processingFluidState:initialState,location:{search}};
  const raf=vi.fn(()=>1),cancel=vi.fn(),disconnect=vi.fn();
  vi.stubGlobal('window',win);vi.stubGlobal('document',doc);
  vi.stubGlobal('getComputedStyle',()=>({getPropertyValue:()=> '#1683d8'}));
  vi.stubGlobal('requestAnimationFrame',raf);vi.stubGlobal('cancelAnimationFrame',cancel);
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect=disconnect});
  vi.stubGlobal('MutationObserver',class{observe(){}disconnect=disconnect});
  return {stop:createProcessingRingField(canvas,{active,speed}),canvas,media,doc,win,raf,cancel,disconnect,context};
}
it('renders fluid light, caps resolution and releases GPU resources/listeners on unmount',()=>{
  const s=setup();expect(s.canvas.dataset.motion).toBe('running');expect(s.canvas.width).toBe(488);
  expect(s.context.drawArrays).toHaveBeenCalled();s.stop();expect(s.cancel).toHaveBeenCalledWith(1);
  expect(s.context.deleteProgram).toHaveBeenCalledTimes(1);expect(s.context.deleteShader).toHaveBeenCalledTimes(2);
  expect(s.disconnect).toHaveBeenCalledTimes(2);expect(s.win.removeEventListener).toHaveBeenCalledWith('pointermove',expect.any(Function));
});
it.each([{available:false},{compiles:false}])('uses the static CSS fallback if WebGL is unavailable: %j',options=>{
  const s=setup(options);expect(s.canvas.dataset.renderer).toBe('fallback');expect(s.canvas.dataset.motion).toBe('static');expect(s.raf).not.toHaveBeenCalled();s.stop();
});
it('stops on GPU context loss and resumes after restoration',()=>{
  const s=setup();const handlers=Object.fromEntries(s.canvas.addEventListener.mock.calls);
  const preventDefault=vi.fn();handlers.webglcontextlost({preventDefault});
  expect(preventDefault).toHaveBeenCalled();expect(s.canvas.dataset.motion).toBe('static');
  handlers.webglcontextrestored();expect(s.canvas.dataset.motion).toBe('running');s.stop();
});
it.each([{active:false},{reduced:true}])('renders a static background when motion is disabled: %j',options=>{
  const s=setup(options);expect(s.canvas.dataset.motion).toBe('static');expect(s.raf).not.toHaveBeenCalled();s.stop();
});
it('stops and resumes on visibility and live reduced-motion changes',()=>{
  const s=setup();const sync=s.doc.addEventListener.mock.calls[0][1];
  s.doc.hidden=true;sync();expect(s.canvas.dataset.motion).toBe('static');
  s.doc.hidden=false;sync();expect(s.canvas.dataset.motion).toBe('running');
  s.media.matches=true;s.media.addEventListener.mock.calls[0][1]();expect(s.canvas.dataset.motion).toBe('static');s.stop();
});
it('continues the fluid phase across processing background remounts',()=>{
  const first=setup({initialState:{elapsed:23,targetX:.3,targetY:.6,pointerX:.3,pointerY:.6,presence:0}});
  const snapshot=first.win.__processingFluidState;first.stop();
  const next=setup({initialState:snapshot});
  expect(next.context.uniform1f).toHaveBeenCalledWith('time',23);
  expect(next.context.uniform2f).toHaveBeenCalledWith('pointer',.3,.6);next.stop();
});
it('restores native startup background state from the handoff URL',()=>{
  const state={elapsed:42,pointerX:.2,pointerY:.7,targetX:.2,targetY:.7,presence:0};
  const s=setup({search:'?processingFieldState='+encodeURIComponent(JSON.stringify(state))});
  expect(s.context.uniform1f).toHaveBeenCalledWith('time',42);
  expect(s.context.uniform2f).toHaveBeenCalledWith('pointer',.2,.7);s.stop();
});
it('falls back safely when handoff state is malformed',()=>{
  const s=setup({search:'?processingFieldState=invalid'});
  expect(s.context.uniform1f).toHaveBeenCalledWith('time',0);s.stop();
});
it.each([1,3])('advances the fluid phase at the requested speed %s without changing the restored phase',speed=>{
  const s=setup({speed,initialState:{elapsed:10}});
  expect(s.context.uniform1f).toHaveBeenCalledWith('time',10);
  s.raf.mock.calls[0][0](100);
  s.raf.mock.calls[0][0](140);
  expect(s.win.__processingFluidState.elapsed).toBeCloseTo(10+.04*speed);
  s.stop();
});
