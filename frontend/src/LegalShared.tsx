// Compatibility exports. Page implementations import focused shared modules.
export { exportSvgChart } from './chartExportLoader';
export { ASSESSMENT_OMIT,ASSESSMENT_STATUS_FIELDS,AssessmentNode,CaseTree,NestedTable,RecordGrid,SERVICE_OMIT,ServiceNode,getField } from './LegalCaseTree';
export { IraqDetentionMapMetrics } from './LegalMapMetrics';
export { labels } from './legalPageMetadata';
export type { LegalPage } from './legalPageMetadata';
export { SecuredDocumentActions,englishOnly,renderCell,value } from './LegalRecordCells';
export { LegalScrollControls } from './LegalScrollControls';
export { LegalSkeleton,Unavailable } from './LegalSkeleton';
export type { SkeletonVariant } from './LegalSkeleton';
