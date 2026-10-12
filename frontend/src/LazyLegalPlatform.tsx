import { deferredComponent } from './DeferredComponent';
import ProcessingRecords from './ProcessingRecords';
// Start the actual processing surface immediately. The workspace renders the
// same surface on its first commit while metadata and import progress load.
const LegalPlatform=deferredComponent(()=>import('./LegalPlatform'),<ProcessingRecords progress={null} restoring/>);
if(typeof window!=='undefined'&&window.location.hash.startsWith('#/legal'))void LegalPlatform.preload();
export default LegalPlatform;
