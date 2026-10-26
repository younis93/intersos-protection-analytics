import {afterEach,describe,expect,it,vi} from 'vitest';
import {readStartupPage,saveStartupPage} from './startupPage';

afterEach(()=>vi.unstubAllGlobals());
function setup(search='',native?:unknown){
  const stored=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value)});
  vi.stubGlobal('window',{location:{search},pywebview:native});
  return stored;
}
describe('startup preference persistence',()=>{
  it('supports Custom Analysis on launch',async()=>{setup('?startupPage=custom');expect(readStartupPage()).toBe('custom');await saveStartupPage('custom');expect(readStartupPage()).toBe('custom')});
  it('loads the durable native preference after a fresh launch',()=>{
    setup('?startupPage=kobo&startupEpoch=123');
    expect(readStartupPage()).toBe('kobo');
  });
  it('defaults new or invalid settings to Home',()=>{
    setup('?startupPage=unknown');
    expect(readStartupPage()).toBe('home');
  });
  it('saves through the native bridge and shows the new preference when Home is revisited',async()=>{
    const save=vi.fn(async()=>true);
    setup('?startupPage=home&startupEpoch=123',{api:{save_startup_page:save}});
    await saveStartupPage('legal');
    expect(save).toHaveBeenCalledWith('legal');
    expect(readStartupPage()).toBe('legal');
  });
  it('keeps the saved value when a native save fails',async()=>{
    setup('?startupPage=kobo&startupEpoch=123',{api:{save_startup_page:async()=>{throw new Error('Disk full')}}});
    await expect(saveStartupPage('legal')).rejects.toThrow('Disk full');
    expect(readStartupPage()).toBe('kobo');
  });
  it('does not report a durable save while the desktop bridge is unavailable',async()=>{
    setup('?startupEpoch=123');
    await expect(saveStartupPage('legal')).rejects.toThrow('still starting');
  });
  it('persists browser preferences in local storage',async()=>{
    setup();
    await saveStartupPage('kobo');
    expect(readStartupPage()).toBe('kobo');
  });
});
