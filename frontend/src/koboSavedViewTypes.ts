import type {KoboSettings} from './koboTypes';
export type KoboViewSnapshot=Pick<KoboSettings,'dateFilterModes'|'language'|'filters'|'filterFields'|'hidden'|'metadata'|'hideBlanks'|'hideZero'|'hideEmpty'|'percentageDecimals'|'questionSort'|'questions'|'viewMode'>;
export type KoboSavedView={id:string;name:string;description:string;snapshot:KoboViewSnapshot;updatedAt:string;reviewIssues:string[];questionKinds?:Record<string,string>};
