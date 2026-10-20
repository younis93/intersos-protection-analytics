import {ExternalLink, Info} from 'lucide-react';
import {useId} from 'react';
import {PLATFORM_HOTLINE_URL, PLATFORM_REPORTING_URL, PLATFORM_SIGN_IN_URL} from './platformSourceLinks';

export default function ImportSourceGuide({compact = false}: {compact?: boolean}) {
  const titleId = useId();
  if (compact) return (
    <div className="data-source-download-guide" role="group" aria-labelledby={titleId}>
      <h3 id={titleId}>Download the data</h3>
      <p><a role="menuitem" href={PLATFORM_SIGN_IN_URL} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">Sign in<ExternalLink aria-hidden="true"/></a> to the Legal Platform, then download your CSV files.</p>
      <div className="data-source-download-links">
        <a role="menuitem" href={PLATFORM_REPORTING_URL} target="_blank" rel="noopener noreferrer" title="Opens in a new tab"><span>Reporting files</span><ExternalLink aria-hidden="true"/></a>
        <a role="menuitem" href={PLATFORM_HOTLINE_URL} target="_blank" rel="noopener noreferrer" title="Opens in a new tab"><span>Hotline data</span><ExternalLink aria-hidden="true"/></a>
      </div>
    </div>
  );
  return (
    <aside className="legal-import-source-guide" aria-labelledby={titleId}>
      <Info aria-hidden="true"/>
      <div>
        <h3 id={titleId}>Download the data</h3>
        <p>
          <a href={PLATFORM_SIGN_IN_URL} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">Sign in<ExternalLink aria-hidden="true"/></a>
          {' '}to the Legal Platform, then{' '}
          <a href={PLATFORM_REPORTING_URL} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">download the reporting files<ExternalLink aria-hidden="true"/></a>
          {' '}from the platform. For hotline records,{' '}
          <a href={PLATFORM_HOTLINE_URL} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">download hotline data<ExternalLink aria-hidden="true"/></a>.
        </p>
        <p>Save the CSV files, then choose an import option below.</p>
      </div>
    </aside>
  );
}
