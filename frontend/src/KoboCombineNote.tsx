import {ValueTable} from './ValueTable';
import {Info} from 'lucide-react';

export default function KoboCombineNote(){
 return <aside className="kobo-combine-note" role="note" aria-label="How combined sources work">
  <h5><Info aria-hidden="true"/>How combined sources work</h5>
  <p>Two or more columns supply answers to one existing question, within each respondent’s row. A blank answer can be filled from another column. Matching answers count once.</p>
  <p><strong>If nonblank answers differ, you choose how to resolve the conflict.</strong> Review the conflicts, use the first nonblank answer in your chosen source order, or leave conflicting answers blank.</p>
  <details><summary>See an example</summary><div className="kobo-combine-example"><ValueTable recordFilters="local"><caption>Illustration using a question about displacement status</caption><thead><tr><th scope="col">Existing column</th><th scope="col">Added column</th><th scope="col">Result</th></tr></thead><tbody><tr><td>IDP</td><td>Blank</td><td>IDP</td></tr><tr><td>Blank</td><td>Returnee</td><td>Returnee</td></tr><tr><td>Refugee</td><td>Refugee</td><td>Refugee, counted once</td></tr><tr><td>IDP</td><td>Returnee</td><td>Conflict requiring your decision</td></tr></tbody></ValueTable></div><p>Answer-choice mappings are applied before comparison. Different codes mapped to the same choice count as agreement.</p></details>
  <p className="kobo-combine-note-foot">The question’s wording and type stay the same. Combining does not create a new question, add respondent rows, or change your uploaded files.</p>
 </aside>;
}
