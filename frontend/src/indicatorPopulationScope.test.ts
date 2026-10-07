import {describe,it,expect} from 'vitest';
import {indicatorPopulationScope} from './indicatorPopulationScope';
import {excludeValue} from './filterSelection';

const locationsByProject={'UNHCR 2026 - AMAL CAMP':['AMAL Camp'],'UNHCR 2026 - Erbil':['Urban','Qushtapa Camp']};
describe('linked reporting project and location scope',()=>{
  it('uses AMAL location in the same way as AMAL project',()=>{
    expect(indicatorPopulationScope(locationsByProject,[],['AMAL Camp'])).toEqual({idp:true,refugee:false});
    expect(indicatorPopulationScope(locationsByProject,['UNHCR 2026 - AMAL CAMP'],[])).toEqual({idp:true,refugee:false});
  });
  it('keeps mixed locations, Select all, and Clear consistent',()=>{
    expect(indicatorPopulationScope(locationsByProject,[],['Urban'])).toEqual({idp:false,refugee:true});
    expect(indicatorPopulationScope(locationsByProject,[],['AMAL Camp','Urban'])).toEqual({idp:true,refugee:true});
    expect(indicatorPopulationScope(locationsByProject,[],Object.values(locationsByProject).flat())).toEqual({idp:true,refugee:true});
    expect(indicatorPopulationScope(locationsByProject,[],[])).toEqual({idp:true,refugee:true});
  });
  it('intersects project and location selections and respects exclusions',()=>{
    expect(indicatorPopulationScope(locationsByProject,['UNHCR 2026 - Erbil'],['AMAL Camp'])).toEqual({idp:false,refugee:false});
    expect(indicatorPopulationScope(locationsByProject,[],[excludeValue('AMAL Camp')])).toEqual({idp:false,refugee:true});
    expect(indicatorPopulationScope(locationsByProject,[excludeValue('UNHCR 2026 - Erbil')],[])).toEqual({idp:true,refugee:false});
  });
});
