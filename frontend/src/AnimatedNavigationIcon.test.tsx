import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AnimatedNavigationIcon,AnimatedSectionIcon,navigationIconMotions} from './AnimatedNavigationIcon';
import {Backpack,BarChart3,CheckCheck,Tent} from 'lucide-react';
import type {NavigationIconStyle} from './navigationIconNodes';
import {nav} from './LegalPlatform';

const outlines=(markup:string)=>Array.from(markup.matchAll(/<(path|rect|circle)\b([^>]*)>/g),match=>
  `${match[1]}:${Array.from(match[2].matchAll(/([\w-]+)="([^"]*)"/g),attribute=>`${attribute[1]}=${attribute[2]}`).sort().join(';')}`,
).sort();

describe('icon-specific navigation animations',()=>{
  it.each([
    ['check-check',CheckCheck],['chart-column',BarChart3],['backpack',Backpack],['tent',Tent],
  ] as const)('preserves the existing %s section icon while animating its own parts',(iconStyle,Icon)=>{
    const markup=renderToStaticMarkup(<AnimatedSectionIcon Icon={Icon} iconStyle={iconStyle as NavigationIconStyle} size={17}/>);
    expect(outlines(markup)).toEqual(outlines(renderToStaticMarkup(<Icon/>)));
    expect(markup).toContain('--animated-icon-size:17px');
    expect(markup).toContain('animated-section-icon');
    expect(markup).toContain('data-nav-part');
  });
  it.each(nav)('retains every original %s icon outline in its settled layers',(page,Icon)=>{
    const original=renderToStaticMarkup(<Icon/>);
    const layered=renderToStaticMarkup(<AnimatedNavigationIcon page={page} Icon={Icon} active/>);
    const withoutEcho=layered.replace(/<i\b[^>]*\bnav-icon-echo\b[^>]*>[\s\S]*?<\/i>/g,'');
    expect(outlines(withoutEcho)).toEqual(outlines(original));
    expect(layered).toContain('aria-hidden="true"');
    expect(layered.match(/data-nav-part=/g)!.length).toBeGreaterThanOrEqual(2);
    const definition=navigationIconMotions[page];
    const end=Math.max(...definition.parts.filter(part=>part.motion!=='none').map(part=>(part.delay||0)+(part.duration||480)));
    expect(end).toBeGreaterThanOrEqual(450);expect(end).toBeLessThanOrEqual(650);
  });
  it.each(nav)('uses the original static %s symbol when inactive',(page,Icon)=>{
    const markup=renderToStaticMarkup(<AnimatedNavigationIcon page={page} Icon={Icon} active={false}/>);
    expect(outlines(markup)).toEqual(outlines(renderToStaticMarkup(<Icon/>)));
    expect(markup).not.toContain('data-nav-part');
  });
});
