import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Filter,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {AnimatedActionIcon} from './AnimatedActionIcon';

const geometry=(markup:string)=>Array.from(markup.matchAll(/<(path|rect|circle)\b([^>]*)>/g),match=>`${match[1]}:${match[2]}`).sort();
describe('Reset and Filters action icons',()=>{
  it.each([['reset',RotateCcw],['filters',SlidersHorizontal],['funnel',Filter]] as const)('preserves the %s button icon and decorative semantics',(type,Icon)=>{
    const markup=renderToStaticMarkup(<AnimatedActionIcon type={type}/>);
    expect(geometry(markup)).toEqual(geometry(renderToStaticMarkup(<Icon/>)));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('animated-action-icon');
    expect(markup).not.toContain('tabindex');
  });
});
