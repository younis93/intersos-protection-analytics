import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {beneficiaryProfileFields} from './beneficiaryProfile';
import {RecordGrid} from './LegalCaseTree';

describe('beneficiary contact fields in Case Review',()=>{
  it('shows both bilingual source contacts first and preserves every other field',()=>{
    const row={'Name (Filter Color Red)':'اسم المستفيد','Contact Number / رقم الاتصال':'07501234567',
      'Secondary Contact Number / رقم الاتصال الثانوي':'000123',Gender:'Female',Nationality:'Iraqi',
      'ID Number':'000001',DoB:'1990-03-15','Custom field':'تفاصيل إضافية'};
    const fields=beneficiaryProfileFields(row);
    expect(Object.keys(fields).slice(0,2)).toEqual(['Contact number 1','Contact number 2']);
    expect(fields['Contact number 1']).toBe('07501234567');
    expect(fields['Contact number 2']).toBe('000123');
    for(const [key,value] of Object.entries(row)){
      if(!key.includes('Contact Number'))expect(fields[key as keyof typeof fields]).toBe(value);
    }
    const markup=renderToStaticMarkup(<RecordGrid row={fields}/>);
    expect(markup).toContain('Contact number 1');expect(markup).toContain('Contact number 2');
    expect(markup).toContain('07501234567');expect(markup).toContain('000123');
    expect(markup).toContain('000001');expect(markup).toContain('اسم المستفيد');
  });

  it('keeps both labels visible when the source numbers are blank or absent',()=>{
    const fields=beneficiaryProfileFields({'Contact Number':'','Secondary Contact Number':null});
    expect(fields['Contact number 1']).toBe('');
    expect(fields['Contact number 2']).toBe('');
    const markup=renderToStaticMarkup(<RecordGrid row={fields} keepEmpty={['Contact number 1','Contact number 2']}/>);
    expect(markup).toContain('Contact number 1');
    expect(markup).toContain('Contact number 2');
    expect(markup.match(/<strong><\/strong>/g)).toHaveLength(2);
    expect(markup).not.toContain('Not provided in source');
    expect(beneficiaryProfileFields({})['Contact number 1']).toBe('');
  });

  it('does not substitute a reporter or secondary phone for the primary contact',()=>{
    const fields=beneficiaryProfileFields({'Contact Number of the reporting person':'07709999999',
      'Contact Number 2':'07501111111'});
    expect(fields['Contact number 1']).toBe('');
    expect(fields['Contact number 2']).toBe('07501111111');
    expect(fields['Contact Number of the reporting person']).toBe('07709999999');
  });

  it('supports numbered contact aliases without changing the source row',()=>{
    const row={'Contact number 1':'07701234567','Contact number 2':'07801234567'};
    const before={...row};
    expect(beneficiaryProfileFields(row)).toEqual(row);
    expect(row).toEqual(before);
  });
});
