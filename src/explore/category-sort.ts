export interface CategorySortEntry {
    name: string;
    viewers: number;
    count: number;
}

export function compareCategoryCards(a: CategorySortEntry, b: CategorySortEntry): number {
    if (a.viewers !== b.viewers) return b.viewers - a.viewers;
    if (a.count !== b.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
}
