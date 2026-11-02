import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboValueSelector from './KoboValueSelector';
import {questionDefaults} from './koboTypes';

describe('value selector caption',()=>{
 it.each(['en','ar'] as const)('omits the custom caption in %s while retaining all value controls',language=>{
  const html=renderToStaticMarkup(<KoboValueSelector settings={questionDefaults} language={language} question="Question" onChange={()=>{}}/>);
  expect(html).not.toContain('kobo-value-custom');expect(html).not.toContain('>Custom<');expect(html).not.toContain('>مخصص<');
  expect(html.match(/aria-pressed=/g)).toHaveLength(3);
 });
});
