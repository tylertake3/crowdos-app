export const gbp = (n: number): string =>
  "£" +
  n.toLocaleString("en-GB", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  });

export const gbpRound = (n: number): string =>
  "£" + Math.round(n).toLocaleString("en-GB");

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(d: Date): string {
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
}

export function fmtWeek(key: string): string {
  const [y, m, day] = key.split("-").map(Number);
  return `w/c ${day} ${MO[m - 1]} ${y !== 2026 ? y : ""}`.trim();
}

export function fmtMonth(y: number, m: number): string {
  return `${["January","February","March","April","May","June","July","August","September","October","November","December"][m]} ${y}`;
}
