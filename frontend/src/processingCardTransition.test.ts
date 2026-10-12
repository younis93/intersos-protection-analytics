import {afterEach,describe,expect,it,vi} from 'vitest';
import {animateProcessingCardSize,processingCardDuration} from './processingCardTransition';

afterEach(()=>vi.unstubAllGlobals());
describe('preparation to processing card resize',()=>{
  function setup(reduced=false){
    vi.stubGlobal('window',{innerWidth:1000,innerHeight:800,matchMedia:()=>({matches:reduced}),addEventListener:vi.fn(),removeEventListener:vi.fn()});
    vi.stubGlobal('document',{querySelector:vi.fn(()=>null)});
    let finish!:()=>void;
    const motion={cancel:vi.fn(),finished:new Promise<void>(resolve=>{finish=resolve;})};
    const animate=vi.fn((_frames:Keyframe[],_options:KeyframeAnimationOptions)=>motion);
    const child={animate:vi.fn((_frames:Keyframe[],_options:KeyframeAnimationOptions)=>({cancel:vi.fn()}))};
    const card={style:{animation:'',overflow:'auto'},children:[child],querySelector:()=>null,animate,getBoundingClientRect:()=>({width:470,height:520})};
    return {card,animate,motion,child,finish};
  }
  it('interpolates both dimensions continuously without scaling the border or content',async()=>{
    const {card,animate,finish}=setup();
    animateProcessingCardSize(card as unknown as HTMLElement,{width:440,height:350});
    expect(animate.mock.calls[0]).toEqual([
      [{width:'440px',height:'350px'},{width:'470px',height:'520px'}],
      {duration:900,easing:'cubic-bezier(.45,0,.2,1)'},
    ]);
    finish();await Promise.resolve();
    expect(card.style).toEqual({animation:'none',overflow:'auto'});
  });
  it('cancels card and content motion when minimized or unmounted',()=>{
    const {card,motion,child}=setup();
    const stop=animateProcessingCardSize(card as unknown as HTMLElement,{width:440,height:350});
    stop();expect(motion.cancel).toHaveBeenCalledOnce();
    expect(child.animate.mock.results[0].value.cancel).toHaveBeenCalledOnce();
    expect(card.style).toEqual({animation:'',overflow:'auto'});
  });
  it('keeps content at its natural width and restores its layout afterward',async()=>{
    const {card,child,finish}=setup();
    const body={...child,style:{display:''},getAttribute:()=>null,removeAttribute:vi.fn(),setAttribute:vi.fn()};
    vi.spyOn(card,'querySelector').mockImplementation((selector?:string)=>(selector==='.legal-processing-card-content'?body:null) as never);
    animateProcessingCardSize(card as unknown as HTMLElement,{width:440,height:350});
    expect(body.style.display).toBe('flow-root');
    finish();await Promise.resolve();
    expect(body.removeAttribute).toHaveBeenCalledWith('style');
  });
  it('uses the final size immediately with reduced motion',()=>{
    const {card,animate}=setup(true);
    animateProcessingCardSize(card as unknown as HTMLElement,{width:440,height:350});
    expect(animate).not.toHaveBeenCalled();expect(card.style.overflow).toBe('auto');
  });
  it('uses the selected soft timing',()=>{
    expect(processingCardDuration()).toBe(900);
  });
  it('crossfades preparation content on the same surface and removes the copy afterward',async()=>{
    const {card,finish}=setup();
    const outgoing={classList:{add:vi.fn()},setAttribute:vi.fn(),inert:false,style:{width:'',height:''},animate:vi.fn(()=>({cancel:vi.fn()})),remove:vi.fn()};
    const cloneNode=vi.fn(()=>outgoing);
    vi.mocked(document.querySelector).mockReturnValue({cloneNode} as unknown as Element);
    const append=vi.fn();Object.assign(card,{append});
    animateProcessingCardSize(card as unknown as HTMLElement,{width:440,height:350});
    expect(cloneNode).toHaveBeenCalledWith(true);
    expect(append).toHaveBeenCalledWith(outgoing);
    expect(outgoing.inert).toBe(true);
    expect(outgoing.setAttribute).toHaveBeenCalledWith('aria-hidden','true');
    expect(outgoing.animate.mock.calls[0]).toEqual([
      [{opacity:1},{opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'},
    ]);
    finish();await Promise.resolve();
    expect(outgoing.remove).toHaveBeenCalledOnce();
  });
  it('settles at the responsive layout immediately when the viewport changes',()=>{
    const {card,motion,child}=setup();
    animateProcessingCardSize(card as unknown as HTMLElement,{width:440,height:350});
    const resize=vi.mocked(window.addEventListener).mock.calls.find(([event])=>event==='resize')![1] as ()=>void;
    resize();
    expect(motion.cancel).toHaveBeenCalledOnce();
    expect(child.animate.mock.results[0].value.cancel).toHaveBeenCalledOnce();
    expect(card.style.overflow).toBe('auto');
    expect(window.removeEventListener).toHaveBeenCalledWith('resize',resize);
  });
  it('clamps starting bounds on a narrow viewport and fades content without movement',()=>{
    const {card,animate,child}=setup();
    window.innerWidth=360;window.innerHeight=600;
    animateProcessingCardSize(card as unknown as HTMLElement,{width:440,height:700});
    expect(animate.mock.calls[0][0][0]).toEqual({width:'328px',height:'568px'});
    expect(child.animate.mock.calls[0]).toEqual([
      [{opacity:0},{opacity:1}],
      {duration:540,delay:180,easing:'cubic-bezier(.45,0,.2,1)',fill:'backwards'},
    ]);
  });
});
