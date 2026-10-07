import {afterEach,describe,it,expect,vi} from 'vitest';
import {whatsappMessage,whatsappPhone,whatsappCharacterCount,copyWhatsappMessage,openIssueWhatsapp,splitWhatsappMessage,whatsappPartLabel} from './whatsappIssues';
import type {IssueFinding} from './sendIssuesApi';

const finding=(changes:Partial<IssueFinding>={}):IssueFinding=>({id:'f1',dataset:'beneficiaries',rule:'Invalid contact number',ruleArabic:'رقم اتصال غير صالح',reviewPage:'Beneficiaries Review',severity:'High',row:2,recordId:'C12',caseId:'C12',assessmentId:'',serviceId:'',hotlineId:'',awarenessId:'',detail:'7 digits',detailArabic:'عدد الأرقام: 7',affectedFields:['Contact Number'],action:'Correct the number',lawyer:'Alice',project:'Project',location:'Erbil',...changes});
afterEach(()=>vi.unstubAllGlobals());

describe('compact WhatsApp messages',()=>{
  it('accepts international numbers and rejects invalid or injected recipients',()=>{
    expect(whatsappPhone('+964 770 123 4567')).toBe('9647701234567');
    expect(whatsappPhone('00964 770 123 4567')).toBe('9647701234567');
    for(const value of ['07701234567','7701234567','0770 123 4567','(0770) 123-4567'])expect(whatsappPhone(value)).toBe('9647701234567');
    expect(whatsappPhone('+44 7700 900123')).toBe('447700900123');
    for(const value of ['0770123','123','+964abc7701234567','+9647701234567?text=hello',''])expect(whatsappPhone(value)).toBe('');
  });
  it('groups English issues under one case without adding Arabic translations',()=>{
    const text=whatsappMessage('Alice',[finding(),finding({rule:'Missing date',ruleArabic:'تاريخ مفقود',detail:'Date is blank',detailArabic:'التاريخ فارغ',affectedFields:['Date of Service Provision'],serviceId:'S34'})],'en',{deadline:'2026-10-15',signature:'Sender Signature'});
    expect(text.match(/Case: C12/g)).toHaveLength(1);
    for(const value of ['Dear Alice','Contact Number','7 digits','Date of Service Provision (Service: S34)','2026-10-15','Sender Signature','confirm'])expect(text).toContain(value);
    expect(text.match(/Sender Signature/g)).toHaveLength(1);expect(text).not.toContain('رقم اتصال غير صالح');
    expect(text).not.toContain('```');expect(text).not.toContain('Action:');expect(text).not.toContain('Correct the number');expect(text).not.toContain('Part ');
  });
  it('keeps fallback record groups distinct across datasets and identifies individual records',()=>{
    const text=whatsappMessage('Alice',[
      finding({caseId:'',dataset:'assessments',assessmentId:'A1'}),
      finding({caseId:'',dataset:'legalservices',serviceId:'S1'}),
      finding({caseId:'',dataset:'legalhotlines',hotlineId:'H1'}),
      finding({caseId:'',dataset:'awareness',awarenessId:'W1'}),
      finding({caseId:'',recordId:'R1'}),
      finding({caseId:'',dataset:'awareness',recordId:'R1'}),
      finding({caseId:'',recordId:'',row:99}),
      finding({assessmentId:'A2'}),
    ],'en');
    for(const reference of ['Assessment: A1','Service: S1','Hotline: H1','Awareness: W1','Record: Row 99','(Assessment: A2)'])expect(text).toContain(reference);
    expect(text.match(/Record: R1/g)).toHaveLength(2);
  });
  it('falls back to rule titles and original details without inventing translations',()=>{
    const text=whatsappMessage('Alice',[finding({affectedFields:[],rule:'New rule',ruleArabic:'New rule',detail:'Original detail',detailArabic:''})],'en');
    expect(text).toContain('- New rule: New rule - Original detail');
    expect(text).not.toContain('undefined');
  });
  it('preserves matching lawyers and closure context',()=>{
    const text=whatsappMessage('Alice',[
      finding({matchingCases:'Case D2 - Bob (similar)'}),
      finding({rule:'Open assessment with all services closed (Closure requested by lawyer)',assessmentId:'A1',assessmentStatus:'Open',requestForClosedStatus:'Yes',linkedServiceCount:2,linkedServiceStatuses:'Closed, Completed'}),
    ],'en');
    for(const value of ['Case D2 - Bob (similar)','Assessment: A1','Assessment status: Open','Closure request: Yes','Linked services: 2','Closed, Completed'])expect(text).toContain(value);
  });
  it('includes other-lawyer awareness references and participants in the message',()=>{
    const matches='Awareness W2 (row 3) - أحمد علي - Bob - Documentation (exact)\nAwareness W1 (row 4) - أحمد علي - Alice - Documentation (exact)';
    const text=whatsappMessage('Alice',[finding({dataset:'awareness',caseId:'',awarenessId:'W1',rule:'Duplicate participant in session',matchingCases:matches})],'en');
    expect(text).toContain('Matching records and lawyers: '+matches);
    expect(text).toContain('Dear Alice,');expect(text).not.toContain('Dear Bob');
  });
  it('keeps long Unicode details intact in a single message',()=>{
    const detail='تفاصيل 😀\n'.repeat(1000);
    const text=whatsappMessage('Alice',[finding({detail,detailArabic:''})],'en');
    expect(text).toContain(detail);expect(text.length).toBeGreaterThan(1500);
    expect(whatsappCharacterCount(' A\n😀 ')).toBe(5);
  });
});

describe('WhatsApp copy and open',()=>{
  const setup=()=>{
    const popup={opener:{},location:{href:''},close:vi.fn()};
    const open=vi.fn(()=>popup),writeText=vi.fn(async(_text:string)=>{});
    vi.stubGlobal('window',{open});vi.stubGlobal('navigator',{clipboard:{writeText}});
    return {popup,open,writeText};
  };
  it('copies exact edited preview text including whitespace',async()=>{
    const {writeText}=setup();const validate=vi.fn(async()=>{});
    const text='  Edited\nتفاصيل 😀\n'+'x'.repeat(10000)+'  ';
    await copyWhatsappMessage(text,validate);
    expect(validate).toHaveBeenCalledOnce();expect(writeText).toHaveBeenCalledWith(text);
  });
  it('validates then copies before navigating one chat without message in URL',async()=>{
    const {popup,open,writeText}=setup();const order:string[]=[];
    writeText.mockImplementation(async()=>{expect(popup.location.href).toBe('');order.push('copy');});
    await openIssueWhatsapp('+964 770 123 4567','Full message',async()=>{order.push('validate');});
    expect(order).toEqual(['validate','copy']);expect(open).toHaveBeenCalledOnce();
    expect(popup.opener).toBeNull();expect(popup.location.href).toBe('https://web.whatsapp.com/send?phone=9647701234567');
  });
  it('uses the desktop launcher after validation and copying without opening a webview popup',async()=>{
    const {open,writeText}=setup();const order:string[]=[];
    const launch=vi.fn(async()=>{order.push('launch');return true;});
    (window as any).pywebview={api:{open_issue_whatsapp:launch}};
    writeText.mockImplementation(async()=>{order.push('copy');});
    await openIssueWhatsapp('0770 123 4567','Edited message',async()=>{order.push('validate');});
    expect(order).toEqual(['validate','copy','launch']);
    expect(launch).toHaveBeenCalledWith('9647701234567');expect(open).not.toHaveBeenCalled();
  });
  it('does not launch the desktop app for stale findings or denied clipboard access',async()=>{
    const {writeText}=setup();const launch=vi.fn(async()=>true);
    (window as any).pywebview={api:{open_issue_whatsapp:launch}};
    await expect(openIssueWhatsapp('+9647701234567','Message',async()=>{throw new Error('Findings changed');})).rejects.toThrow('Findings changed');
    expect(writeText).not.toHaveBeenCalled();
    writeText.mockRejectedValue(new Error('Denied'));
    await expect(openIssueWhatsapp('+9647701234567','Message',async()=>{})).rejects.toThrow('copy the text manually');
    expect(launch).not.toHaveBeenCalled();
  });
  it('reports a failed desktop launch without losing the copied message',async()=>{
    const {writeText}=setup();
    (window as any).pywebview={api:{open_issue_whatsapp:vi.fn(async()=>false)}};
    await expect(openIssueWhatsapp('+9647701234567','Edited message',async()=>{})).rejects.toThrow('Unable to open WhatsApp');
    expect(writeText).toHaveBeenCalledWith('Edited message');
  });
  it('closes the popup and avoids copying when findings changed',async()=>{
    const {popup,writeText}=setup();
    await expect(openIssueWhatsapp('+9647701234567','Full message',async()=>{throw new Error('Review findings changed');})).rejects.toThrow('Review findings changed');
    expect(writeText).not.toHaveBeenCalled();expect(popup.close).toHaveBeenCalledOnce();expect(popup.location.href).toBe('');
  });
  it('provides manual-copy instructions and closes the popup on clipboard failure',async()=>{
    const {popup,writeText}=setup();writeText.mockRejectedValue(new Error('Denied'));
    await expect(openIssueWhatsapp('+9647701234567','Full message',async()=>{})).rejects.toThrow('copy the text manually');
    expect(popup.close).toHaveBeenCalledOnce();expect(popup.location.href).toBe('');
  });
  it('reports blocked popups and invalid recipients without copying',async()=>{
    const {open,writeText}=setup();
    await expect(openIssueWhatsapp('invalid','Full message',async()=>{})).rejects.toThrow('valid WhatsApp number');
    expect(open).not.toHaveBeenCalled();
    open.mockReturnValue(null as never);
    await expect(openIssueWhatsapp('+9647701234567','Full message',async()=>{})).rejects.toThrow('Allow pop-ups');
    expect(writeText).not.toHaveBeenCalled();
  });
  it('rejects empty messages without copying',async()=>{
    const {writeText}=setup();await expect(copyWhatsappMessage('   ',async()=>{})).rejects.toThrow('Enter or regenerate');
    expect(writeText).not.toHaveBeenCalled();
  });
});


describe('WhatsApp language selection and splitting',()=>{
  it('localizes generated text and keeps source names and values intact',()=>{
    const row=finding({dataset:'awareness',caseId:'',awarenessId:'0007',affectedFields:['Participant Name'],matchingCases:'Awareness 0008 - Bob',duplicateMatches:[{caseId:'',row:3,awarenessId:'0008',lawyer:'Bob',name:'Original name',sessionTopic:'Original topic',matchType:'exact'}]});
    const ar=whatsappMessage('Alice',[row],'ar',{deadline:'2026-10-15',signature:'INTERSOS'});
    for(const value of ['الأستاذ/ة Alice','الموعد النهائي للتصحيح','اسم المشارك','رقم اتصال غير صالح','عدد الأرقام: 7','التوعية: 0007','التوعية: 0008','Original name','Original topic','Bob','INTERSOS'])expect(ar).toContain(value);
    for(const value of ['Dear','Correction deadline','Invalid contact number','Matching records and lawyers'])expect(ar).not.toContain(value);
    const both=whatsappMessage('Alice',[row],'bilingual');
    for(const value of ['Dear Alice','الأستاذ/ة Alice','Invalid contact number','رقم اتصال غير صالح','Matching records and lawyers','السجلات والمحامون المطابقون'])expect(both).toContain(value);
  });
  it('uses original details in Arabic when translations are unavailable',()=>{
    const text=whatsappMessage('Alice',[finding({rule:'New rule',ruleArabic:'',detail:'Original detail',detailArabic:''})],'ar');
    expect(text).toContain('New rule - Original detail');expect(text).not.toContain('translation unavailable');
  });
  it('localizes closure context and identifies an unassigned matching lawyer',()=>{
    const text=whatsappMessage('Alice',[finding({rule:'Open assessment with all services closed',linkedServiceCount:0,duplicateMatches:[{caseId:'002',row:3,lawyer:'Unassigned',matchType:'exact'}]})],'ar');
    for(const value of ['حالة التقييم','طلب الإغلاق','الخدمات المرتبطة: 0','غير معين','الحالة: 002'])expect(text).toContain(value);
  });
  it('leaves messages up to 4,000 characters unchanged',()=>{
    expect(splitWhatsappMessage('','en')).toEqual([]);
    expect(splitWhatsappMessage('   ','en')).toEqual([]);
    for(const length of [1,3999,4000]){const message='x'.repeat(length);const parts=splitWhatsappMessage(message,'en');expect(parts).toHaveLength(1);expect(parts[0].text).toBe(message);}
  });
  it('preserves every character, including Unicode and whitespace, within the part limit',()=>{
    for(const language of ['en','ar','bilingual'] as const){
      for(const message of ['x'.repeat(4001),'تفاصيل 😀\n'.repeat(1100),'  Intro\n\nCase: C1\n- finding '+('very long '.repeat(10000))+'  ']){
        const parts=splitWhatsappMessage(message,language);
        expect(parts.length).toBeGreaterThan(1);expect(parts.map(part=>part.body).join('')).toBe(message);
        parts.forEach((part,index)=>{expect(whatsappCharacterCount(part.text)).toBeLessThanOrEqual(4000);expect(part.label).toBe(whatsappPartLabel(index+1,parts.length,language));expect(part.text).not.toMatch(/[\uD800-\uDBFF]$/);});
      }
    }
  });
  it('keeps case blocks together and recomputes parts after edits',()=>{
    const block='Case: C1\n- '+ 'x'.repeat(2100)+'\n\n';
    const message=block+block.replace('C1','C2');
    const parts=splitWhatsappMessage(message,'en');
    expect(parts).toHaveLength(2);expect(parts[0].body).toBe(block);expect(parts[1].body).toContain('Case: C2');
    expect(splitWhatsappMessage('Edited message','en')).toHaveLength(1);
  });
  it('copies a selected numbered part exactly after revalidation',async()=>{
    const parts=splitWhatsappMessage('😀'.repeat(9000),'ar');const writeText=vi.fn(async()=>{}),validate=vi.fn(async()=>{});
    vi.stubGlobal('navigator',{clipboard:{writeText}});
    await copyWhatsappMessage(parts[1].text,validate);
    expect(validate).toHaveBeenCalledOnce();expect(writeText).toHaveBeenCalledWith(parts[1].text);
    validate.mockRejectedValue(new Error('Review findings changed'));
    await expect(copyWhatsappMessage(parts[2].text,validate)).rejects.toThrow('Review findings changed');
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
