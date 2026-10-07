import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import SendIssues from './SendIssues';
import SendIssuesSkeleton from './SendIssuesSkeleton';
import {loadIssues} from './sendIssuesApi';
import {invalidateLegalQueries} from './legalQueryCache';
import {vi} from 'vitest';

describe('Send Issues initial loading',()=>{
  it('shows awareness matching record references, participant, topic and responsible lawyer',async()=>{
    const finding={id:'f1',dataset:'awareness',rule:'Duplicate participant in session',ruleArabic:'',row:2,awarenessId:'W1',lawyer:'Alice',detail:'Duplicate',reviewPage:'Awareness Review',
      matchingCases:'Awareness W2 (row 3) - أحمد علي - Bob - Documentation',duplicateMatches:[{caseId:'',row:3,lawyer:'Bob',matchType:'exact',awarenessId:'W2',reference:'Awareness W2 (row 3)',name:'أحمد علي',sessionTopic:'Documentation'}]};
    invalidateLegalQueries();vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).endsWith('/contacts')?{contacts:{}}:{revision:'matches',lawyers:['Alice','Bob'],rows:[finding],total:1,contacts:{}})));
    try{await loadIssues();const markup=renderToStaticMarkup(<SendIssues revision="matches"/>);
      for(const value of ['Matching records and lawyers','Awareness W2 (row 3)','أحمد علي','Documentation','Bob'])expect(markup).toContain(value);
    }finally{vi.unstubAllGlobals();invalidateLegalQueries();}
  });
  it('starts with a loading indicator and skeleton without showing empty results',()=>{
    const markup=renderToStaticMarkup(<SendIssues revision="test"/>);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Email preparation is being tested');
    expect(markup).toContain('Review recipients and message content before sending');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Loading review findings and lawyer contacts');
    expect(markup).toContain('si-loading-skeleton');
    expect(markup).not.toContain('Review findings could not be loaded');
    expect(markup).not.toContain('No findings match');
    expect(markup).not.toContain('Clear filters');
    expect(markup).toContain('lawyer-filter-clear');
  });
  it('provides placeholders for lawyers and finding tables without summary cards',()=>{
    const markup=renderToStaticMarkup(<SendIssuesSkeleton/>);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('si-stats');
    expect(markup).not.toContain('si-skeleton-number');
    expect(markup).toContain('si-skeleton-lawyers');
    expect(markup.match(/class="glass si-skeleton-table"/g)).toHaveLength(2);
  });
});
