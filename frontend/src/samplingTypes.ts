export type SamplingState = {
  columnFilters?:import('./columnFilters').ColumnFilter[];
  search:string;
  filters:Record<string,string[]>;
  page:number;
  removeDuplicateBeneficiaryIds:boolean;
  removeDuplicateContacts:boolean;
  hotlineOnly:boolean;
  hotlineOperator:string;
};

export const initialSamplingState = ():SamplingState => ({
  search:'',filters:{},page:1,removeDuplicateBeneficiaryIds:false,removeDuplicateContacts:false,
  hotlineOnly:false,hotlineOperator:'',
});

export type SamplingResult = {
  available:boolean;
  reason:string;
  columns:string[];
  rows:Record<string,unknown>[];
  total:number;
  page:number;
  pageSize:number;
  filterOptions:Record<string,string[]>;
  quickFilters:string[];
  emptyReason:string;
  hotlineMatchReason:string;
  hotlineOperatorReason:string;
  hotlineOperators:string[];
};
