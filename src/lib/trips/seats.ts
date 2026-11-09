/** Seat labels from a bus's row count and column labels (R1). */
export function seatLabels(rows: number, columns: string[]): string[] {
  const out: string[] = [];
  for (let r = 1; r <= rows; r++) for (const c of columns) out.push(`${r}${c}`);
  return out;
}
