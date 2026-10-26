import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {getLegalMetadata} from './api';
import {pollLegalMetadata} from './legalMetadataPolling';
import type {LegalMetadata} from './types';

vi.mock('./api',()=>({getLegalMetadata:vi.fn()}));
const loading={ready:false,loading:true} as LegalMetadata;
const ready={ready:true,loading:false} as LegalMetadata;
const load=vi.mocked(getLegalMetadata);
beforeEach(()=>{vi.useFakeTimers();load.mockReset()});
afterEach(()=>vi.useRealTimers());

describe('Legal startup metadata polling',()=>{
  it('checks readiness after 250ms and stops when ready',async()=>{
    load.mockResolvedValueOnce(loading).mockResolvedValueOnce(ready);
    const receive=vi.fn(),stop=pollLegalMetadata(receive);
    await vi.advanceTimersByTimeAsync(249);expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(receive).toHaveBeenCalledWith(loading);
    await vi.advanceTimersByTimeAsync(250);expect(receive).toHaveBeenLastCalledWith(ready);
    await vi.advanceTimersByTimeAsync(2000);expect(load).toHaveBeenCalledTimes(2);
    stop();
  });
  it('never overlaps requests and ignores completion after cleanup',async()=>{
    let resolve!:(metadata:LegalMetadata)=>void;
    load.mockImplementation(()=>new Promise(done=>{resolve=done}));
    const receive=vi.fn(),stop=pollLegalMetadata(receive);
    await vi.advanceTimersByTimeAsync(2000);expect(load).toHaveBeenCalledTimes(1);
    const signal=load.mock.calls[0][0]!;
    stop();expect(signal.aborted).toBe(true);
    resolve(ready);await vi.advanceTimersByTimeAsync(1000);
    expect(receive).not.toHaveBeenCalled();expect(load).toHaveBeenCalledTimes(1);
  });
  it('retries failures but stops when restoration ends without data',async()=>{
    load.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce({...loading,loading:false});
    const stop=pollLegalMetadata(vi.fn());
    await vi.advanceTimersByTimeAsync(2000);expect(load).toHaveBeenCalledTimes(2);
    stop();
  });
});
