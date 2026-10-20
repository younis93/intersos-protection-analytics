import {deferredComponent} from './DeferredComponent';
import {KoboModuleLoading} from './KoboLoading';
const KoboAnalysis=deferredComponent(()=>import('./KoboAnalysis'),<KoboModuleLoading/>);
export default KoboAnalysis;
