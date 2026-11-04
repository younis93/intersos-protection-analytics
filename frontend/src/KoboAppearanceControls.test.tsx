import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboAppearanceControls from './KoboAppearanceControls';

describe('chart label controls shared by Kobo and custom analysis',()=>{
 for(const bulk of [false,true])for(const measured of [false,true]){
  it(`explains the hidden choice with bulk=${bulk} and measured=${measured}`,()=>{
   const html=renderToStaticMarkup(<KoboAppearanceControls value={{labels:'hidden'}} onChange={()=>{}} chart="bar" breakdowns bulk={bulk} measured={measured}/>);
   expect(html).toContain('Hide count and percentage text');
   expect(html).toContain('Axis labels, hover details, and table values remain available.');
   expect(html).toContain('Data labels');
  });
 }
});

it('renders binary appearance settings as native radios and retains larger dropdowns',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls value={{bars:'stack',valueAxis:'hide'}} onChange={()=>{}} chart="bar" breakdowns showTitle={false}/>);
 expect(html.match(/type="radio"/g)).toHaveLength(4);
 expect(html).toContain('Value axis scale');expect(html).toContain('Breakdown bars');
 expect(html).toMatch(/<input(?=[^>]*value="stack")(?=[^>]*checked="")[^>]*>/);expect(html).not.toContain('Chart title (optional)');
 expect(html).toContain('aria-label="Legend"');
});
it('shows unselected radios for mixed bulk values instead of adding a third option',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls onChange={()=>{}} chart="bar" breakdowns bulk mixedKeys={['bars','valueAxis']}/>);
 expect(html.match(/type="radio"/g)).toHaveLength(4);
 expect(html).not.toContain('checked=""');expect(html).toContain('Mixed values - choose an option to apply');
});
