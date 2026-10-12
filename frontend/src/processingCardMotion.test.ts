import {afterEach,expect,it,vi} from 'vitest';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.resetModules()});

async function setup(reduced=false){
 let now=0;
 vi.stubGlobal('performance',{now:()=>now});
 vi.stubGlobal('window',{location:{search:''},innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:reduced}),dispatchEvent:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('getComputedStyle',()=>({borderRadius:'26px'}));
 const animation={currentTime:0,cancel:vi.fn(),finished:new Promise<void>(()=>{})};
 const animate=vi.fn((_frames:Keyframe[],_options:KeyframeAnimationOptions)=>animation);
 const card={style:{overflow:'auto'},animate:vi.fn(),querySelector:()=>({animate,getBoundingClientRect:()=>({width:470,height:380})}),getBoundingClientRect:()=>({width:470,height:380})};
 const api=await import('./processingCardMotion');
 return {api,card:card as unknown as HTMLElement,animate,animation,setNow:(value:number)=>{now=value}};
}

it('resizes only the centered surface without scaling or hiding content',async()=>{
 const {api,card,animate}=await setup();
 api.beginProcessingCardMotion({width:440,height:350});
 api.animateProcessingCard(card);
 expect(animate).toHaveBeenCalledWith([
  {width:'440px',height:'350px',borderRadius:'28px'},
  {width:'470px',height:'380px',borderRadius:'26px'},
 ],{duration:940,easing:'cubic-bezier(.4,0,.2,1)'});
});

it('resumes the same timeline after the workspace replaces its fallback',async()=>{
 const {api,card,animation,setNow}=await setup();
 api.beginProcessingCardMotion({width:440,height:350});
 const stop=api.animateProcessingCard(card);
 setNow(160);stop();
 api.animateProcessingCard(card);
 expect(animation.currentTime).toBe(160);
 setNow(1000);stop();
 const before=animation.cancel.mock.calls.length;
 api.animateProcessingCard(card)();
 expect(animation.cancel.mock.calls.length).toBe(before);
});

it('uses the final layout immediately when reduced motion is enabled',async()=>{
 const {api,card,animate}=await setup(true);
 api.beginProcessingCardMotion({width:440,height:350});
 api.animateProcessingCard(card);
 expect(animate).not.toHaveBeenCalled();
 expect(card.style.overflow).toBe('auto');
});

it('reads fresh native card bounds once and clamps them to the viewport',async()=>{
 const {api,card,animate,setNow}=await setup();
 window.location.search=`?startupEpoch=${Date.now()}&startupCardWidth=440&startupCardHeight=700`;
 window.innerWidth=390;window.innerHeight=600;
 api.animateProcessingCard(card);
 expect(animate).toHaveBeenCalledWith([
  {width:'358px',height:'568px',borderRadius:'28px'},expect.anything(),
 ],expect.anything());
 setNow(1000);api.animateProcessingCard(card);
 expect(animate).toHaveBeenCalledOnce();
});

it('settles immediately on resize and does not replay when restored',async()=>{
 const {api,card,animation,animate}=await setup();
 api.beginProcessingCardMotion({width:440,height:350});api.animateProcessingCard(card);
 const resize=vi.mocked(window.addEventListener).mock.calls.find(([event])=>event==='resize')![1] as ()=>void;
 resize();api.animateProcessingCard(card);
 expect(animation.cancel).toHaveBeenCalledOnce();
 expect(animate).toHaveBeenCalledOnce();
 expect(card.style.overflow).toBe('auto');
});
