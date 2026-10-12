// Keep navigation and background loading in the same top-to-bottom order.
export const legalPageOrder=[
  'overview','hotline','legalhotlines','indicators','beneficiaries',
  'assessments','legalservices','awareness','send-issues','detention',
  'deportation','lawyer-intelligence','studio','explorer','cases',
] as const;

export function legalPageRank(page:string){
  const rank=legalPageOrder.findIndex(item=>item===page);
  return rank<0?legalPageOrder.length:rank;
}
