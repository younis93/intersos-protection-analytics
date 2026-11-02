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
