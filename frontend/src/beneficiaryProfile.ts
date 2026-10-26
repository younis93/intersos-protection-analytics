/** Keep both beneficiary contacts visible, without borrowing linked contacts. */
export function beneficiaryProfileFields(row:Record<string,unknown>):Record<string,unknown>{
  const normalize=(key:string)=>key.normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/\s+/g,' ').trim().toLowerCase();
  const suffix='(?:$|\\s*[/:-]|\\s+[\\u0600-\\u06ff])';
  const primary=new RegExp('^(?:contact number\\s*1?|primary contact number|phone number\\s*1)'+suffix);
  const secondary=new RegExp('^(?:secondary contact number|contact number\\s*2|phone number\\s*2)'+suffix);
  const filled=(value:unknown)=>value!==null&&value!==undefined&&String(value).trim()!=='';
  const find=(pattern:RegExp)=>{
    const candidates=Object.keys(row).filter(key=>pattern.test(normalize(key)));
    return candidates.find(key=>filled(row[key]))||candidates[0];
  };
  const first=find(primary),second=find(secondary);
  const contact=(key:string|undefined)=>key&&filled(row[key])?row[key]:'';
  return {
    'Contact number 1':contact(first),
    'Contact number 2':contact(second),
    ...Object.fromEntries(Object.entries(row).filter(([key])=>key!==first&&key!==second)),
  };
}
