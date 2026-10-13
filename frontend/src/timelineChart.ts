export const isSingleMonth = (months: string[]) => new Set(months).size === 1;

export const fullMonthLabel = (month: string) => new Intl.DateTimeFormat("en", {
  month: "long", year: "numeric", timeZone: "UTC",
}).format(new Date(`${month}-01T00:00:00Z`));

export interface TimelineSeries {
  label: string;
  values: number[];
  color: string;
  customdata?: number[][];
  hovertemplate?: string;
}

export function singleMonthTraces(months: string[], series: TimelineSeries[], selected: string[], textColor: string, percent: boolean) {
  return series.map(item => ({
    type: "bar" as const,
    name: item.label,
    x: months,
    y: item.values,
    width: series.length > 1 ? .24 : .38,
    marker: {color: item.color, line: {color: item.color, width: 1}},
    selectedpoints: selected.length ? months.map((month,index)=>selected.includes(month)?index:-1).filter(index=>index>=0) : null,
    selected: {marker: {opacity: 1}},
    unselected: {marker: {opacity: .58}},
    text: item.values.map(value=>new Intl.NumberFormat("en-US", percent
      ? {style:"percent",maximumFractionDigits:1} : {maximumFractionDigits:0}).format(value)),
    textposition: "outside" as const,
    textfont: {color: textColor, size: 14},
    cliponaxis: false,
    customdata: item.customdata,
    hovertemplate: item.hovertemplate || `<b>${item.label}</b><br>%{y:${percent?".1%":",.0f"}}<extra></extra>`,
  }));
}
