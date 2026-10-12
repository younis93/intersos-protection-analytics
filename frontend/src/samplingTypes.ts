export type SamplingState = {
  search:string;
  filters:Record<string,string[]>;
  page:number;
  removeDuplicateBeneficiaryIds:boolean;
  removeDuplicateContacts:boolean;
};

export const initialSamplingState = ():SamplingState => ({search:'',filters:{},page:1,removeDuplicateBeneficiaryIds:false,removeDuplicateContacts:false});

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
};
