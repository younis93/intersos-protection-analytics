export type Page = 'executive'|'assessment'|'services'|'deportation'|'studio'|'explorer'|'quality';
export type Theme = 'glass-light'|'glass-dark'|'unhcr'|'executive'|'multicolor';
export type Measure = 'records'|'beneficiaries';
export type Display = 'both'|'count'|'percent';
export type Filters = Record<string,string[]>;
export interface ExplorerColumn {name:string;type:'text'|'number'|'date';values:string[]}
export interface ExplorerSheet {id:string;name:string;rows:number;columns:ExplorerColumn[]}
export interface Metadata {ready:boolean;loading?:boolean;source:string|null;loadedAt:string|null;pages:Record<string,{rows:number;filters:Record<string,string[]>;dimensions?:string[]}>;dataExplorer?:{sheets:ExplorerSheet[];warnings:string[]}}
export interface ExplorerFilter {column:string;operator:string;value?:string;value2?:string}
export interface ExplorerResult {sheetId:string;totalRows:number;matchedRows:number;page:number;pageSize:number;columns:string[];rows:Record<string,unknown>[]}
export interface Row {label:string;count:number;percent:number}
export interface Chart {id:string;title:string;kind:string;rows:Row[];multiChoice:boolean}
export interface Dashboard {page:string;measure:string;total:number;filteredRows:number;kpis:{label:string;value:number;format:string}[];trend:Row[];openTrend?:Row[];closedTrend?:Row[];completionTrend?:Row[];flow?:{source:string;target:string;count:number}[];charts:Chart[];filterOptions?:Record<string,string[]>}
export interface QualityRow {page:string;severity:string;check:string;count:number;rate:number;impact:string}
export interface StudioCell {row:string;column:string;count:number;percent:number}
export interface StudioResult {page:string;rowDimension:string;columnDimension?:string;measure:string;total:number;cells:StudioCell[]}
export interface LegalAnalyticsDashboard {dataset:string;total:number;matchedRows:number;page:number;pageSize:number;kpis:{label:string;value:number;format:string}[];trend:Row[];charts:Chart[];filterOptions:Record<string,string[]>;columns:string[];rows:Record<string,unknown>[];warnings:string[]}
export type StudioSort = 'value-desc'|'value-asc'|'label-asc'|'label-desc'|'source';
export type StudioTopN = 'all'|5|10|15|20;
export type StudioValueMode = 'count'|'percent-total'|'percent-series'|'percent-row';
export type StudioLabelMode = 'auto'|'show'|'hide';
export type StudioOrientation = 'horizontal'|'vertical';
export interface StudioChartOptions {sort:StudioSort;topN:StudioTopN;valueMode:StudioValueMode;labelMode:StudioLabelMode;orientation:StudioOrientation}
export interface UpdateCheck {enabled:boolean;currentVersion:string;available:boolean;latestVersion?:string;notes?:string;publishedAt?:string;message?:string}
export interface UpdateStatus {phase:'idle'|'downloading'|'verifying'|'installing'|'restarting'|'error';progress:number;error?:string|null;currentVersion:string}
export interface LegalSheet {id:string;name:string;rows:number;columns:string[]}
export interface LegalOverviewChart {label:string;count:number}
export interface LegalOverview {beneficiaries:number;assessments:number;services:number;followups:number|null;fees:number|null;awareness:number|null;deportations:number|null;lawyers:number;totalFlags:number;severity:Record<string,number>;rules:Record<string,number>;charts?:{assessmentsByLocation:LegalOverviewChart[];assessmentsByLawyer:LegalOverviewChart[];assessmentStatus:LegalOverviewChart[];representationServiceStatus:LegalOverviewChart[]};representationCompletionRate?:number;activityTrend?:{month:string;assessments:number;services:number}[];representationTrend?:{month:string;representation:number}[];locationPerformance?:{location:string;assessments:number;representationServices:number;detained:number;released:number;completionRate:number}[];insight?:string;dataQuality?:LegalOverviewChart[];deportationsByGovernorate?:LegalOverviewChart[];detention2026?:{trend:{month:string;detainedAssessments:number;released:number}[];map:{label:string;count:number;detained:number;released:number;values:string[]}[]}}
export interface LegalMetadata {ready:boolean;loading?:boolean;source:string|null;warnings:string[];availability:Record<string,boolean>;features?:{awareness?:boolean;detention:boolean;deportation:boolean};sheets:LegalSheet[];months:string[];reviewCounts:Record<string,number>;overview?:LegalOverview}
export interface IndicatorMatrixRow {project:string;location:string;values:number[];beneficiaryIds?:string[][];assessmentIds?:string[][]}
export interface IndicatorSection {id:string;label:string;rows:IndicatorMatrixRow[];totals:number[];total:number;totalBeneficiaryIds?:string[][];warnings:{unclassified:number;unknownLocation:number}}
export interface IndicatorNarrativeRow {indicator:string;population:string;totalAchievement:number;remarks:string;locations:{project:string;location:string;total:number}[]}
export interface IndicatorReportItem {id:string;title:string;source:string;dateField:string;rule:string;population:string;total:number;sections:IndicatorSection[];children:IndicatorReportItem[];contributions:Record<string,unknown>;narrative?:{remark:string;rows:IndicatorNarrativeRow[]}}
export interface IndicatorReportGroup {id:"all"|"refugee"|"idp"|"individual-beneficiaries-reached";label:string;indicators:IndicatorReportItem[]}
export interface IndicatorReport {fromDate:string;toDate:string;ageGroups:string[];filterOptions:{projects:string[];locations:string[];locationsByProject:Record<string,string[]>;years:string[];quarters:string[];months:string[];communityTypes:string[]};activeFilters:{projects:string[];locations:string[];years:string[];quarters:string[];months:string[];communityTypes:string[]};groups:IndicatorReportGroup[]}
export interface LegalFlag {dataset:string;rule:string;severity:string;row:number;recordId:string;name:string;caseId:string;assessmentId:string;serviceId:string;detail:string;action:string;lawyer:string;project:string;location:string;phone:string;dateOfBirth:string;beneficiaryAge?:number|null;awarenessId:string;sessionTopic:string;duplicateGroup?:string;nameMatchMode?:"exact"|"variation"|"contact-and-name";duplicateSimilarity?:number;spouseName?:string;spouseDateOfBirth?:string;spouseAge?:number|null;maritalStatus?:string;assessmentDate?:string;identificationDate?:string;awarenessDate?:string;createdOn?:string;assessmentStatus?:string;legalServiceNeeded?:string;beneficiaryDetained?:string;immigrationRelatedCharge?:string;serviceTypeProvided?:string;typeOfDocument?:string;courtVerdictDetail?:string;otherDocumentDetail?:string;legalConcernSpecified?:string;legalConcern?:string;detentionGovernorate?:string;comparisonFinding?:string;assessmentDocuments?:string;serviceDocuments?:string;requestedServiceTypes?:string;providedServiceTypes?:string;missingValues?:string}
export interface LegalReview {dataset:string;total:number;page:number;pageSize:number;rules:string[];ruleCounts:Record<string,number>;filterOptions:Record<'severity'|'lawyer'|'project'|'location'|'date',string[]>;availableMonths:string[];activeComparisonMonth:string;nameRecordCount:number;eligibleNameRecordCount:number;nameCompareCharsApplied:number;allowNameVariationsApplied:boolean;rows:LegalFlag[]}
export interface DuplicateExclusion {caseId:string;dataset?:string;rule:string;identifierType?:string;identifierValue?:string;name:string;project:string;excludedAt:string;source:string}
export interface LegalExplorerResult {dataset:string;total:number;page:number;pageSize:number;columns:string[];rows:Record<string,unknown>[]}
