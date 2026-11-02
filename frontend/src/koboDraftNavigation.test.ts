import {it,expect,vi} from 'vitest';
import {allowKoboDraftNavigation,registerKoboDraftNavigation} from './koboDraftNavigation';
it('allows normal navigation and delegates draft decisions while a guard is mounted',()=>{
 const event={} as HashChangeEvent;
 expect(allowKoboDraftNavigation(event)).toBe(true);
 const guard=vi.fn(()=>false),cleanup=registerKoboDraftNavigation(guard);
 expect(allowKoboDraftNavigation(event)).toBe(false);expect(guard).toHaveBeenCalledWith(event);
 cleanup();expect(allowKoboDraftNavigation(event)).toBe(true);
});
it('restores the previous guard after a nested editor closes',()=>{
 const event={} as HashChangeEvent,outer=registerKoboDraftNavigation(()=>false),inner=registerKoboDraftNavigation(()=>true);
 expect(allowKoboDraftNavigation(event)).toBe(true);inner();expect(allowKoboDraftNavigation(event)).toBe(false);outer();expect(allowKoboDraftNavigation(event)).toBe(true);
});
