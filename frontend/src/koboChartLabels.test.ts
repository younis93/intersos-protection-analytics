import {describe,it,expect} from 'vitest';
import {chartCaption} from './koboChartLabels';
describe('chart captions',()=>{
 it('wraps and limits long captions without changing source text',()=>{const source='Refugee registered with UNHCR or authorities';const caption=chartCaption(source,14,3);expect(caption.split('<br>').length).toBe(3);expect(caption).toContain('…');expect(source).toBe('Refugee registered with UNHCR or authorities')});
 it('breaks long tokens and preserves Arabic characters',()=>{expect(chartCaption('x'.repeat(100),12).split('<br>').length).toBe(4);expect(chartCaption('احتياجات المجتمع والنازحين والأشخاص المتضررين',12)).toContain('<br>')});
 it('escapes markup while preserving generated line breaks',()=>{expect(chartCaption('<tag> & text',30)).toBe('&lt;tag&gt; &amp; text')});
});
