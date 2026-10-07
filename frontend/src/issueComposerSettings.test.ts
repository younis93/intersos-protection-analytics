import {afterEach,describe,expect,it,vi} from 'vitest';
import {blankSender,loadSender,saveSender,loadWhatsappLanguage,saveWhatsappSettings,senderSignature,messageBlockReason,validMessageDeadline,allowMessageReplacement} from './issueComposerSettings';
afterEach(()=>vi.unstubAllGlobals());
describe('Sender details and readiness',()=>{
  it('saves and restores sender details, without persisting temporary overrides',()=>{
    const values=new Map<string,string>();
    vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key),setItem:(key:string,value:string)=>values.set(key,value)});
    const sender={name:'Manager',role:'IM Officer',organization:'INTERSOS',signature:'Thank you'};
    expect(saveSender(sender)).toBe(true);
    expect(loadSender()).toEqual(sender);
    expect(senderSignature({...sender,name:'Temporary'})).toContain('Temporary');
    expect(loadSender().name).toBe('Manager');
  });
  it('recovers from blocked storage and corrupt saved values',()=>{
    vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('Blocked')},setItem:()=>{throw new Error('Blocked')}});
    expect(loadSender()).toEqual(blankSender);expect(saveSender(blankSender)).toBe(false);
    vi.stubGlobal('localStorage',{getItem:()=>'{"name":123,"role":"Officer"}'});
    expect(loadSender()).toEqual({...blankSender,role:'Officer'});
  });
  it('explains unavailable actions and allows selected findings outside filters',()=>{
    expect(messageBlockReason('Unassigned',2,true,'email')).toContain('Assign');
    expect(messageBlockReason('Alice',0,true,'email')).toContain('Select');
    expect(messageBlockReason('Alice',2,false,'email')).toContain('email address');
    expect(messageBlockReason('Alice',2,false,'WhatsApp')).toContain('Iraq (+964)');
    expect(messageBlockReason('Alice',2,true,'email')).toBe('');
  });
  it('validates optional deadlines without silently normalizing invalid dates',()=>{
    expect(validMessageDeadline('')).toBe(true);
    expect(validMessageDeadline('2026-10-15')).toBe(true);
    expect(validMessageDeadline('2026-02-30')).toBe(false);
    expect(validMessageDeadline('invalid')).toBe(false);
  });
  it('requires consent before replacing manually edited messages',()=>{
    const confirm=vi.fn(()=>false);
    expect(allowMessageReplacement(false,confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(allowMessageReplacement(true,confirm)).toBe(false);
    expect(allowMessageReplacement(true,()=>true)).toBe(true);
  });
});


describe('WhatsApp saved settings',()=>{
  it('defaults to bilingual, then restores language and sender without draft content',()=>{
    const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key),setItem:(key:string,value:string)=>values.set(key,value)});
    expect(loadWhatsappLanguage()).toBe('bilingual');
    const sender={...blankSender,name:'Alice',signature:'INTERSOS'};
    expect(saveWhatsappSettings('ar',sender)).toBe(true);expect(loadWhatsappLanguage()).toBe('ar');expect(loadSender()).toEqual(sender);
    expect(Array.from(values.values()).some(value=>value.includes('deadline')||value.includes('message')||value.includes('phone'))).toBe(false);
    expect(saveWhatsappSettings('en',sender)).toBe(true);expect(loadWhatsappLanguage()).toBe('en');
  });
  it('handles invalid values and storage denial',()=>{
    for(const value of ['{','null','{"language":"invalid"}']){vi.stubGlobal('localStorage',{getItem:()=>value});expect(loadWhatsappLanguage()).toBe('bilingual');}
    vi.stubGlobal('localStorage',{getItem:()=>{throw Error('Denied');},setItem:()=>{throw Error('Denied');}});
    expect(loadWhatsappLanguage()).toBe('bilingual');expect(saveWhatsappSettings('ar',blankSender)).toBe(false);
  });
});
