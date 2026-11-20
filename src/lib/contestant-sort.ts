export function sortContestantsByNumber<T extends {
  contestant_number?: string | number | null;
  sort_order?: number | null;
  name?: string | null;
}>(contestants: T[]): T[] {
  return [...contestants].sort((a, b) => {
    const aNumber = Number.parseInt(String(a.contestant_number ?? "").replace(/\D/g, ""), 10);
    const bNumber = Number.parseInt(String(b.contestant_number ?? "").replace(/\D/g, ""), 10);
    const aHasNumber = Number.isFinite(aNumber);
    const bHasNumber = Number.isFinite(bNumber);

    if (aHasNumber && bHasNumber && aNumber !== bNumber) return aNumber - bNumber;
    if (aHasNumber !== bHasNumber) return aHasNumber ? -1 : 1;

    const aSort = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;

    return (a.name ?? "").localeCompare(b.name ?? "", undefined, { numeric: true });
  });
}
