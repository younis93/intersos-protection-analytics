import type {KoboSettingsReview} from './koboTypes';

export default function KoboSettingsSummary({review}:{review:KoboSettingsReview}){
 return <><div className="kobo-settings-summary"><span><strong>{review.matches.length}</strong> matched questions</span><span><strong>{review.skipped.length}</strong> skipped questions</span><span><strong>{review.warnings.length}</strong> compatibility notes</span></div>
  <h3>Settings to apply</h3><p>Display options, question visibility, chart customization, response filters, and Excel sheet choices. Unmatched questions keep their existing settings.</p><p>Imported filters: <strong>{review.settings.filters.length}</strong> · Filter fields: <strong>{review.settings.filterFields.length}</strong> · Customized questions: <strong>{review.matches.filter(match=>review.settings.questions[match.target]).length}</strong></p>
  {!!review.matches.length&&<details><summary>Matched questions</summary><ul>{review.matches.map(match=><li key={match.source}><bdi>{match.source}</bdi>{match.source!==match.target&&<> → <bdi>{match.target}</bdi></>}</li>)}</ul></details>}
  {!!review.skipped.length&&<details open><summary>Skipped questions</summary><ul>{review.skipped.map(id=><li key={id}><bdi>{id}</bdi></li>)}</ul></details>}
  {!!review.warnings.length&&<details open><summary>Compatibility notes</summary><ul>{review.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
 </>;
}
