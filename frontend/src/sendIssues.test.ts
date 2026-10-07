import {describe,it,expect} from 'vitest';
import {issueGroups,toggleIssueSelection} from './SendIssues';
import {isIssueEmailValid,type IssueFinding} from './sendIssuesApi';

describe('Send Issues selection',()=>{
  it('selects entire filtered tables beyond the displayed page and preserves other selections',()=>{
    const ids=Array.from({length:70},(_,index)=>String(index));
    const selected=toggleIssueSelection(new Set(['elsewhere']),ids,true);
    expect(selected.size).toBe(71);
    expect(toggleIssueSelection(selected,ids,false)).toEqual(new Set(['elsewhere']));
    expect(selected.size).toBe(71);
  });
  it('keeps separate review pages with the same issue name',()=>{
    const rows=[{id:'a',dataset:'beneficiaries',rule:'Invalid contact number'},{id:'b',dataset:'legalhotlines',rule:'Invalid contact number'},{id:'c',dataset:'beneficiaries',rule:'Invalid contact number'}] as IssueFinding[];
    expect(issueGroups(rows).map(([,group])=>group.map(row=>row.id))).toEqual([['a','c'],['b']]);
  });
  it('rejects missing addresses, recipient lists and injected email headers',()=>{
    expect(isIssueEmailValid('lawyer@example.org')).toBe(true);
    for(const email of ['', 'invalid', 'x@example.org;evil@example.org', 'x@example.org\r\nBcc:y@example.org'])expect(isIssueEmailValid(email)).toBe(false);
  });
});
