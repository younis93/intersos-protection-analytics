import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {fullMonthLabel,isSingleMonth,singleMonthTraces} from './timelineChart';
import SingleMonthIndicatorChart from './SingleMonthIndicatorChart';
import {IndicatorTrendChart} from './LegalIndicatorsPage';

describe('single-month timelines',()=>{
  it('renders a single reporting month as bars and multiple reporting months with readable labels',()=>{
    const single=renderToStaticMarkup(<IndicatorTrendChart title="Quarter selection" months={['2026-07']} series={[{label:'IDP',values:[5],color:'green'}]}/>);
    expect(single).toContain('July 2026 indicator comparison');
    expect(single).toContain('data-series="IDP"');
    const multiple=renderToStaticMarkup(<IndicatorTrendChart title="Quarter selection" months={['2026-07','2026-08']} series={[{label:'IDP',values:[5,8],color:'green'}]}/>);
    expect(multiple).toContain('Jul 2026');
    expect(multiple).toContain('Aug 2026');
    expect(multiple).not.toContain('Invalid Date');
  });
  it('uses distinct months and retains surrounding zero months',()=>{
    expect(isSingleMonth([])).toBe(false);
    expect(isSingleMonth(['2026-09'])).toBe(true);
    expect(isSingleMonth(['2026-09','2026-09'])).toBe(true);
    expect(isSingleMonth(['2026-08','2026-09'])).toBe(false);
    expect(fullMonthLabel('2026-09')).toBe('September 2026');
  });
  it('keeps comparison colors, raw month selection, and separate values',()=>{
    const traces=singleMonthTraces(['2026-09'],[{label:'Detained assessments',values:[43],color:'#1683d8'},{label:'Released',values:[32],color:'#2f9e68'}],['2026-09'],'#123',false);
    expect(traces.map(item=>[item.type,item.x,item.y,item.text,item.marker.color,item.selectedpoints])).toEqual([
      ['bar',['2026-09'],[43],['43'],'#1683d8',[0]],['bar',['2026-09'],[32],['32'],'#2f9e68',[0]],
    ]);
  });
  it('formats percentages, zeros and large counts without dropping them',()=>{
    const percent=singleMonthTraces(['2026-09'],[{label:'Series',values:[.432],color:'blue'}],[],'black',true)[0];
    expect(percent.text).toEqual(['43.2%']);expect(percent.hovertemplate).toContain('.1%');
    for(const value of [0,1234567]){
      const trace=singleMonthTraces(['2026-09'],[{label:'Series',values:[value],color:'blue'}],[],'black',false)[0];
      expect(trace.text).toEqual([value.toLocaleString('en-US')]);
    }
  });
  it.each([[43,32],[0,0],[10,10],[1234567,0]])('renders SVG bars and explicit labels for %j',(first,second)=>{
    const markup=renderToStaticMarkup(<SingleMonthIndicatorChart month="2026-09" series={[{label:'First',values:[first],color:'blue'},{label:'Second',values:[second],color:'green'}]}/>);
    expect(markup).toContain('September 2026');
    expect(markup).toContain('data-series="First"');expect(markup).toContain('data-series="Second"');
    expect(markup).toContain(first.toLocaleString('en-US'));expect(markup).toContain(second.toLocaleString('en-US'));
    expect(markup).not.toContain('NaN');expect(markup).not.toContain('<polyline');
  });
});
