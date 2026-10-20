import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {KoboAnalysis,KoboSettings} from './koboTypes';
const api=vi.hoisted(()=>({export:vi.fn(),job:vi.fn(),cancel:vi.fn(),exportBlob:vi.fn(),analyze:vi.fn()}));
const download=vi.hoisted(()=>vi.fn());
const build=vi.hoisted(()=>vi.fn());
vi.mock('./koboApi',()=>({koboApi:api,downloadBlob:download}));
vi.mock('./koboPdf',()=>({buildKoboPdf:build}));
const settings={version:1,language:'en',filters:[],filterFields:[],hidden:[],metadata:false,hideBlanks:true,hideZero:false,hideEmpty:false,questionSort:'form',questions:{}} as KoboSettings;
const input={projectId:'p',projectName:'Project',settings,format:'excel' as const};
async function settled(){for(let i=0;i<30;i++)await Promise.resolve()}

describe('background export lifecycle',()=>{
 beforeEach(()=>{vi.resetModules();vi.useFakeTimers();vi.stubGlobal('window',globalThis);vi.clearAllMocks();api.export.mockResolvedValue({id:'j',state:'complete',progress:100,message:'Ready'});api.exportBlob.mockResolvedValue(new Blob(['excel']));api.cancel.mockResolvedValue({});build.mockResolvedValue(new Blob(['pdf']));});
 afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
 it('captures settings, downloads once, supports download again and expires from completion',async()=>{
  const manager=await import('./koboExportManager');const config=structuredClone(settings);manager.startKoboExport({...input,settings:config});config.hidden.push('later');await settled();
  expect(api.export.mock.calls[0][1].hidden).toEqual([]);expect(manager.getKoboExports()[0].state).toBe('complete');expect(download).toHaveBeenCalledTimes(1);
  await manager.downloadKoboExport(manager.getKoboExports()[0].id);expect(download).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(3600000);expect(manager.getKoboExports()[0].state).toBe('expired');
 });
 it('preserves the Excel chart metric through submission and retry',async()=>{
  const manager=await import('./koboExportManager');api.export.mockRejectedValueOnce(new Error('Busy'));
  const id=manager.startKoboExport({...input,chartMetric:'both'});await settled();
  expect(api.export.mock.calls[0][5]).toBe('both');manager.retryKoboExport(id);await settled();
  expect(api.export.mock.calls[1][5]).toBe('both');
 });
 it('cancels a submitted Excel job even when its ID arrives late',async()=>{
  let finish!:(job:unknown)=>void;api.export.mockImplementation(()=>new Promise(resolve=>finish=resolve));
  const manager=await import('./koboExportManager');const id=manager.startKoboExport(input);await manager.cancelKoboExport(id);finish({id:'late',state:'queued',progress:0,message:''});await settled();
  expect(api.cancel).toHaveBeenCalledWith('late');expect(download).not.toHaveBeenCalled();expect(manager.getKoboExports()[0].state).toBe('cancelled');
 });
 it('preserves original settings on retry and shows download errors without discarding the file',async()=>{
  const manager=await import('./koboExportManager');api.export.mockRejectedValueOnce(new Error('Busy'));const id=manager.startKoboExport(input);await settled();expect(manager.getKoboExports()[0].message).toBe('Busy');
  download.mockImplementationOnce(()=>{throw new Error('Blocked')});manager.retryKoboExport(id);await settled();const task=manager.getKoboExports()[0];expect(task.state).toBe('complete');expect(task.downloadError).toContain('Blocked');await manager.downloadKoboExport(task.id);expect(manager.getKoboExports()[0].downloadError).toBeUndefined();
 });
 it('serializes PDFs, reuses matching results, scopes questions, and aborts the active worker',async()=>{
  const manager=await import('./koboExportManager');const snapshot={settings,questions:[{id:'q'},{id:'other'}]} as unknown as KoboAnalysis;
  let done!:(blob:Blob)=>void;build.mockImplementationOnce(()=>new Promise(resolve=>done=resolve));const first=manager.startKoboExport({...input,format:'pdf',snapshot,question:'q'});manager.startKoboExport({...input,format:'pdf',snapshot});await settled();
  expect(build).toHaveBeenCalledTimes(1);expect(build.mock.calls[0][1].questions).toEqual([{id:'q'}]);expect(api.analyze).not.toHaveBeenCalled();
  await manager.cancelKoboExport(first);expect(build.mock.calls[0][2].aborted).toBe(true);done(new Blob(['cancelled']));await settled();expect(build).toHaveBeenCalledTimes(2);expect(download).toHaveBeenCalledTimes(1);
 });
 it('stops polling before cancellation and allows a failed cancellation to be retried',async()=>{
  api.export.mockResolvedValue({id:'j',state:'running',progress:20,message:'Working'});api.cancel.mockRejectedValueOnce(new Error('Offline'));
  const manager=await import('./koboExportManager');const id=manager.startKoboExport(input);await settled();await manager.cancelKoboExport(id);
  expect(manager.getKoboExports()[0].cancelError).toBe(true);await vi.advanceTimersByTimeAsync(2000);expect(api.job).not.toHaveBeenCalled();expect(download).not.toHaveBeenCalled();
  await manager.cancelKoboExport(id);expect(api.cancel).toHaveBeenCalledTimes(2);expect(manager.getKoboExports()[0].state).toBe('cancelled');
 });
 it('captures selected worksheet groups and retains them on retry',async()=>{
  api.export.mockRejectedValueOnce(new Error('Busy'));
  const manager=await import('./koboExportManager'),groups=['a','a/n'];const id=manager.startKoboExport({...input,separateGroups:groups});groups.push('b');await settled();expect(api.export.mock.calls[0][4]).toEqual(['a','a/n']);manager.retryKoboExport(id);await settled();expect(api.export.mock.calls[1][4]).toEqual(['a','a/n']);
 });
 it('requests a fresh scoped snapshot when settings differ',async()=>{
  const manager=await import('./koboExportManager');api.analyze.mockResolvedValue({settings,questions:[]});manager.startKoboExport({...input,format:'pdf',question:'q',snapshot:{settings:{...settings,hideZero:true}} as KoboAnalysis});await settled();expect(api.analyze).toHaveBeenCalledWith('p',settings,expect.any(AbortSignal),'q');
 });
});
