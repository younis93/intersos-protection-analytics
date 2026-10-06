// Source field names used by review checks mapped to their existing table labels.
const fieldLabels: Record<string, string[]> = {
  "Name of the detained person": ["Detained-person name"],
  "Name of the caller": ["Caller name"],
  "Refer to Lawyer": [],
  "Is the beneficiary detained": ["Detained", "Is the beneficiary detained"],
  "Has the beneficiary referred to the helpline?": ["Helpline referral"],
  "Name (Filter Color Red)": ["Name"],
  "Participant Name": ["Name"],
  "Session Topic": ["Session topic"],
  "Contact Number / Phone Number": ["Phone number"],
  "Contact Number": ["Phone number"],
  "Date of Birth": ["Date of birth", "Current age"],
  "Spouse DoB": ["Spouse date of birth", "Spouse current age"],
  "Spouse name": ["Spouse name"],
  "Marital Status": ["Marital status"],
  "Date of Assessment": ["Date of assessment"],
  "Assessment Status": ["Assessment status"],
  "Type of Legal Service Needed": ["Type of Legal Service Needed", "Assessment service needed"],
  "Is it an immigration related charge": ["Is it an immigration related charge?"],
  "Type of Documents to be issued": ["Assessment documents", "Type of documents to be issued"],
  "Legal Services: Type of Document": ["Service documents", "Type of Document"],
  "Legal Services: Type of Service Provided": ["Service type provided", "Type of Service Provided"],
  "Legal Services: Service Status": ["Service statuses", "Linked services"],
  "Detention Governorate": ["Detention Governorate mismatch"],
  "Project Location": ["Project location"],
};

/** Keep issue fields first, identifiers next, and all other columns in source order. */
export function reviewColumnIndices(dataset: string, rule: string, labels: string[], checkedFields: string[]): number[] {
  const identifiers = dataset === "legalservices"
    ? ["Beneficiary ID", "Assessment ID", "Service ID"]
    : dataset === "assessments" ? ["Case ID", "Assessment ID"]
    : dataset === "beneficiaries" ? ["Case ID"] : [];
  const issueLabels = checkedFields.flatMap((field) => fieldLabels[field] || [field]);
  if (rule === "Type of document in Assessments vs Services") issueLabels.push("Finding");
  const order: number[] = [];
  const usedLabels = new Set<string>();
  const add = (index: number) => {
    const label = labels[index];
    if (order.includes(index) || (label && usedLabels.has(label))) return;
    if (["Case ID", "Beneficiary ID", "Assessment ID", "Service ID"].includes(label) && !identifiers.includes(label)) return;
    order.push(index);
    if (label) usedLabels.add(label);
  };
  // The first four are selection, finding detail, action, and lawyer/referral.
  for (let index = 0; index < Math.min(4, labels.length); index++) add(index);
  for (const label of issueLabels) {
    if (!identifiers.includes(label)) labels.forEach((candidate, index) => { if (candidate === label) add(index); });
  }
  for (const label of identifiers) labels.forEach((candidate, index) => { if (candidate === label) add(index); });
  labels.forEach((_, index) => add(index));
  return order;
}
