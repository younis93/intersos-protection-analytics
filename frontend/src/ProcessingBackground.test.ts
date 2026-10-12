import {afterEach,expect,it,vi} from 'vitest';
import {mountProcessingBackground} from './ProcessingBackground';

afterEach(()=>vi.unstubAllGlobals());
it('moves one live canvas from preparation to processing without restarting the renderer',async()=>{
  const stop=vi.fn(),renderer=vi.fn(()=>stop);
  const canvas={className:'',parentElement:null as unknown,remove:vi.fn()};
  const preparation={append:vi.fn(()=>{canvas.parentElement=preparation;})};
  const processing={append:vi.fn(()=>{canvas.parentElement=processing;})};
  const createElement=vi.fn(()=>canvas);
  vi.stubGlobal('window',{createProcessingRingField:renderer});
  vi.stubGlobal('document',{createElement});
  const unmountPreparation=mountProcessingBackground(preparation as unknown as HTMLElement,true);
  await Promise.resolve();
  const unmountProcessing=mountProcessingBackground(processing as unknown as HTMLElement,true);
  unmountPreparation();
  expect(createElement).toHaveBeenCalledOnce();expect(renderer).toHaveBeenCalledOnce();
  expect(stop).not.toHaveBeenCalled();expect(canvas.parentElement).toBe(processing);
  unmountProcessing();expect(stop).toHaveBeenCalledOnce();
});
