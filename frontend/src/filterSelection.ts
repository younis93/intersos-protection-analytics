// A reserved control prefix preserves the existing string-array API and saved filters.
export const EXCLUDE_PREFIX = '\u0000exclude:';
export const isExcludedValue = (value:string) => value.startsWith(EXCLUDE_PREFIX);
export const filterValue = (value:string) => isExcludedValue(value)?value.slice(EXCLUDE_PREFIX.length):value;
export const excludeValue = (value:string) => EXCLUDE_PREFIX+value;
export const matchesSelection = (value:string, selection:string[]) => {
  const included=selection.filter(item=>!isExcludedValue(item));
  return (!included.length||included.includes(value))&&!selection.includes(excludeValue(value));
};
export const toggleSelection = (selection:string[],value:string) => {
  if(selection.includes(excludeValue(value)))return selection.filter(item=>item!==excludeValue(value));
  const included=selection.filter(item=>!isExcludedValue(item));
  return included.includes(value)?included.filter(item=>item!==value):[...included,value];
};
export const excludeSelection = (selection:string[],value:string) => {
  const excluded=selection.filter(isExcludedValue);
  return excluded.includes(excludeValue(value))?excluded.filter(item=>item!==excludeValue(value)):[...excluded,excludeValue(value)];
};

// Legacy exclusions remain readable, but the UI presents ordinary checked values.
export const checkedFilterValues = (selection:string[],values:string[]) => selection.some(isExcludedValue)
  ? Array.from(new Set([...values,...selection.filter(item=>!isExcludedValue(item))])).filter(value=>matchesSelection(value,selection))
  : selection;
const explicitFilterSelection = (included:string[],values:string[]) => included.length ? included : values.map(excludeValue);
export const selectAllExcept = (values:string[],value:string) => explicitFilterSelection(values.filter(item=>item!==value),values);
export const toggleFilterValue = (selection:string[],value:string,values:string[]) => {
  const included=checkedFilterValues(selection,values);
  return included.includes(value) ? included.filter(item=>item!==value) : [...included,value];
};
