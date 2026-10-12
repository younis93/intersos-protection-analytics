import {afterEach,expect,it,vi} from 'vitest';

afterEach(()=>{vi.unstubAllGlobals();vi.resetModules()});

it('keeps the same running background when a workspace replaces its loading fallback',async()=>{
 const stop=vi.fn(),render=vi.fn(()=>stop);
 const canvas={className:'',parentElement:null as unknown,remove:vi.fn()};
 const create=vi.fn(()=>canvas);
 vi.stubGlobal('window',{createProcessingRingField:render});
 vi.stubGlobal('document',{createElement:create});
 const host=()=>{const element={append:vi.fn(()=>{canvas.parentElement=element})};return element as unknown as HTMLElement};
 const {mountProcessingBackground}=await import('./ProcessingBackground');
 const first=host(),second=host();
 const unmountFirst=mountProcessingBackground(first,true);
 await Promise.resolve();await Promise.resolve();
 expect(render).toHaveBeenCalledOnce();
 unmountFirst();
 const unmountSecond=mountProcessingBackground(second,true);
 await Promise.resolve();
 expect(create).toHaveBeenCalledOnce();
 expect(render).toHaveBeenCalledOnce();
 expect(stop).not.toHaveBeenCalled();
 expect(canvas.parentElement).toBe(second);
 unmountSecond();await Promise.resolve();
 expect(stop).toHaveBeenCalledOnce();
 expect(canvas.remove).toHaveBeenCalledOnce();
});
