import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboAppearanceControls from './KoboAppearanceControls';
import KoboTitleFormatting from './KoboTitleFormatting';

it('renders answer size as a slider in single-question and shared appearance controls',()=>{
 const value={fontSize:13},onChange=()=>{};
 const editors=[
  <KoboTitleFormatting value={value} onChange={onChange}/>,
  <KoboAppearanceControls chart="bar" breakdowns={false} bulk value={value} onChange={onChange}/>,
 ];
 for(const editor of editors){
  const html=renderToStaticMarkup(editor);
  expect(html).toMatch(/<input(?=[^>]*type="range")(?=[^>]*min="8")(?=[^>]*max="36")(?=[^>]*aria-valuetext="13 pixels")[^>]*>/);
  expect(html).not.toContain('aria-label="Answer size"');
  expect(html).toContain('aria-label="Chart font"');
 }
});

it('shows a custom height slider and vertical alignment for a side legend',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls chart="column" breakdowns value={{customHeight:517,legend:'right',legendVerticalAlign:'middle'}} onChange={()=>{}}/>);
 expect(html).toContain('Height in pixels');
 expect(html).toContain('aria-valuetext="517 pixels"');
 expect(html).toContain('aria-label="Side legend alignment"');
 expect(html).toContain('>Middle<');
});

describe('chart label controls shared by Kobo and custom analysis',()=>{
 for(const bulk of [false,true])for(const measured of [false,true]){
  it(`explains the hidden choice with bulk=${bulk} and measured=${measured}`,()=>{
   const html=renderToStaticMarkup(<KoboAppearanceControls value={{labels:'hidden'}} onChange={()=>{}} chart="bar" breakdowns bulk={bulk} measured={measured}/>);
   expect(html).toContain(measured?'Hide value':'Count without labels');
   expect(html).toContain('Chart values');
   expect(html).not.toContain('Data labels');
   expect(html).not.toContain('Value label position');
  });
 }
});

it('shows existing crossed scales and labels as a custom saved setting',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls onChange={()=>{}} chart="column" breakdowns={false}
  value={{metric:'count',labels:'percent'}}/>);
 expect(html).toContain('Custom saved setting');
 expect(html).toContain('0% labels');
});

it('shows value-based choices for calculated sums',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls onChange={()=>{}} chart="column" breakdowns={false}
  calculated value={{metric:'count',labels:'both'}}/>);
 expect(html).toContain('Value &amp; percentage');
});

it('renders binary appearance settings as native radios and retains larger dropdowns',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls value={{bars:'stack',valueAxis:'hide',horizontalAxisLine:'show',verticalAxisLine:'hide',labels:'percent'}} onChange={()=>{}} chart="bar" breakdowns showTitle={false}/>);
 expect(html.match(/type="radio"/g)).toHaveLength(16);
 const placement=html.match(/<fieldset[^>]*><legend>Value label position<\/legend>[\s\S]*?<\/fieldset>/)?.[0];
 expect(placement?.match(/type="radio"/g)).toHaveLength(2);
 expect(placement).toMatch(/<input(?=[^>]*value="outside")(?=[^>]*checked="")[^>]*>/);
 expect(placement).toContain('value="inside"');
 expect(html).toContain('<legend>0% labels</legend>');
 const scale=html.match(/<fieldset[^>]*><legend>Value axis scale<\/legend>[\s\S]*?<\/fieldset>/)?.[0];
 const horizontal=html.match(/<fieldset[^>]*><legend>Horizontal axis line<\/legend>[\s\S]*?<\/fieldset>/)?.[0];
 const vertical=html.match(/<fieldset[^>]*><legend>Vertical axis line<\/legend>[\s\S]*?<\/fieldset>/)?.[0];
 expect(scale).toMatch(/<input(?=[^>]*value="hide")(?=[^>]*checked="")[^>]*>/);
 expect(horizontal).toMatch(/<input(?=[^>]*value="show")(?=[^>]*checked="")[^>]*>/);
 expect(vertical).toMatch(/<input(?=[^>]*value="hide")(?=[^>]*checked="")[^>]*>/);
 expect(html).toContain('Breakdown bars');
 expect(html).not.toContain('Value axis maximum');
 expect(html).toMatch(/<input(?=[^>]*value="stack")(?=[^>]*checked="")[^>]*>/);expect(html).not.toContain('Chart title (optional)');
 expect(html).toContain('aria-label="Legend"');
});
it('shows unselected radios for mixed bulk values instead of adding a third option',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls onChange={()=>{}} chart="pie" breakdowns={false} bulk
  targets={[{chart:'bar',breakdowns:true,appearance:{labels:'percent'}},{chart:'pie',breakdowns:false}]}
  mixedKeys={['bars','valueAxis','horizontalAxisLine','verticalAxisLine','zeroPercentLabels','labelPosition','grid']}/>);
 expect(html.match(/type="radio"/g)).toHaveLength(16);
 expect(html.match(/checked=""/g)).toHaveLength(1);expect(html).toContain('Mixed values - choose an option to apply');
});

it('groups settings in order and hides options that cannot affect the current chart',()=>{
 const pie=renderToStaticMarkup(<KoboAppearanceControls onChange={()=>{}} chart="pie" breakdowns={false}/>);
 expect(pie.indexOf('Typography')).toBeLessThan(pie.indexOf('Values &amp; labels'));
 expect(pie.indexOf('Values &amp; labels')).toBeLessThan(pie.indexOf('Chart layout'));
 expect(pie).not.toMatch(/Value label position|0% labels|Gridlines|Value axis scale|axis line|Value axis maximum|Category label wrapping/);
 const heatmap=renderToStaticMarkup(<KoboAppearanceControls onChange={()=>{}} chart="heatmap" breakdowns value={{metric:'percent'}}/>);
 expect(heatmap).toContain('0% labels');
 expect(heatmap).not.toMatch(/Value label position|aria-label="Legend"|Value axis scale|axis line/);
});

it('shows the percentage slider only for a custom bar width',()=>{
 const custom=renderToStaticMarkup(<KoboAppearanceControls chart="bar" breakdowns={false} value={{barWidth:'custom',customBarWidth:35}} onChange={()=>{}}/>);
 expect(custom).toContain('Bar width in percent');
 expect(custom).toMatch(/<input(?=[^>]*type="range")(?=[^>]*min="10")(?=[^>]*max="100")(?=[^>]*aria-valuetext="35 percent")[^>]*>/);
 const preset=renderToStaticMarkup(<KoboAppearanceControls chart="bar" breakdowns={false} value={{barWidth:'narrow'}} onChange={()=>{}}/>);
 expect(preset).not.toContain('Bar width in percent');
});

it.each([['bar','show'],['heatmap','hide']])('shows two Gridlines choices for %s with the existing default selected',(chart,selected)=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls chart={chart} breakdowns onChange={()=>{}}/>);
 const grid=html.match(/<fieldset[^>]*><legend>Gridlines<\/legend>[\s\S]*?<\/fieldset>/)?.[0];
 expect(grid?.match(/type="radio"/g)).toHaveLength(2);
 expect(grid).toMatch(new RegExp(`<input(?=[^>]*value="${selected}")(?=[^>]*checked="")[^>]*>`));
 expect(grid).not.toContain('Automatic');
});

it('keeps an inapplicable pending bulk edit available to undo',()=>{
 const html=renderToStaticMarkup(<KoboAppearanceControls bulk onChange={()=>{}} chart="pie" breakdowns={false} value={{labelPosition:'inside'}}/>);
 expect(html).toContain('Undo value label position');
 expect(html).toContain('This change does not apply to the current charts.');
 expect(html).not.toContain('<legend>Value label position</legend>');
});

it('shows the saved bar width and horizontal legend alignment',()=>{
 const render=(value:Parameters<typeof KoboAppearanceControls>[0]['value'])=>
  renderToStaticMarkup(<KoboAppearanceControls chart="column" breakdowns value={value} onChange={()=>{}}/>);
 const horizontal=render({legend:'top',legendAlign:'center',barWidth:'narrow'});
 expect(horizontal).toMatch(/aria-label="Legend alignment"[^>]*>[^]*?<span>Center<\/span>/);
 expect(horizontal).toMatch(/aria-label="Bar width"[^>]*>[^]*?<span>Narrow<\/span>/);
 expect(render({legend:'left'})).not.toContain('aria-label="Legend alignment"');
 expect(render({legend:'hidden'})).not.toContain('aria-label="Legend alignment"');
 expect(render({legend:'auto',legendAlign:'center'})).toContain('aria-label="Legend alignment"');
 expect(render(undefined)).toContain('aria-label="Legend alignment"');
});

it('hides alignment when Automatic would leave the chart without a legend',()=>{
 const render=(chart:string,automaticLegend?:boolean)=>renderToStaticMarkup(
  <KoboAppearanceControls chart={chart} breakdowns={false} value={{legend:'auto'}} automaticLegend={automaticLegend} onChange={()=>{}}/>);
 expect(render('column')).not.toContain('aria-label="Legend alignment"');
 expect(render('pie')).toContain('aria-label="Legend alignment"');
 expect(render('pie',false)).not.toContain('aria-label="Legend alignment"');
});
