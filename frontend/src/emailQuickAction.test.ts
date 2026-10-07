import {afterEach,describe,expect,it,vi} from 'vitest';
import {emailComposeUrl,openIssueEmail} from './emailQuickAction';

const preview={recipient:'lawyer@example.org',subject:'Review & تصحيح + #1',html:'<table><tr><td>001</td></tr></table>',text:'001'};
afterEach(()=>vi.unstubAllGlobals());
describe('email quick actions',()=>{
  it('encodes the recipient and subject without exposing case details in compose URLs',()=>{
    for(const provider of ['gmail','outlook'] as const){
      const url=new URL(emailComposeUrl(provider,preview));
      expect(url.protocol).toBe('https:');
      expect(url.searchParams.get('to')).toBe(preview.recipient);
      expect(url.searchParams.get(provider==='gmail'?'su':'subject')).toBe(preview.subject);
      expect(url.searchParams.has('body')).toBe(false);
    }
  });
  it('validates and copies before invoking Chrome without sending the email',async()=>{
    const calls:string[]=[];
    const open=vi.fn(async()=>{calls.push('open');return true;});
    vi.stubGlobal('window',{pywebview:{api:{open_issue_email_in_chrome:open}}});
    await openIssueEmail('gmail',preview,async()=>{calls.push('validate');},async()=>{calls.push('copy');});
    expect(calls).toEqual(['validate','copy','open']);
    expect(open).toHaveBeenCalledWith('gmail',preview.recipient,preview.subject);
  });
  it('closes the reserved tab when review findings change',async()=>{
    const popup={opener:{},location:{href:''},close:vi.fn()};
    const copy=vi.fn();
    vi.stubGlobal('window',{open:vi.fn(()=>popup)});
    await expect(openIssueEmail('outlook',preview,async()=>{throw new Error('Review changed');},copy)).rejects.toThrow('Review changed');
    expect(copy).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.href).toBe('');
  });
  it('copies the full message before navigating the browser tab',async()=>{
    const popup={opener:{},location:{href:''},close:vi.fn()};
    vi.stubGlobal('window',{open:vi.fn(()=>popup)});
    const copy=vi.fn();
    await openIssueEmail('outlook',preview,async()=>{},copy);
    expect(copy).toHaveBeenCalledOnce();
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toBe(emailComposeUrl('outlook',preview));
  });
  it('reports popup and clipboard failures without launching an incomplete draft',async()=>{
    vi.stubGlobal('window',{open:()=>null});
    await expect(openIssueEmail('gmail',preview,async()=>{},async()=>{})).rejects.toThrow('Allow pop-ups');
    const open=vi.fn();
    vi.stubGlobal('window',{pywebview:{api:{open_issue_email_in_chrome:open}}});
    await expect(openIssueEmail('gmail',preview,async()=>{},async()=>{throw new Error('Clipboard unavailable');})).rejects.toThrow('Clipboard unavailable');
    expect(open).not.toHaveBeenCalled();
  });
});
