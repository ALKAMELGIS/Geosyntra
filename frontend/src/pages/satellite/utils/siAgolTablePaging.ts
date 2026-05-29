export const SI_AGOL_TABLE_PAGE_SIZES = [50, 100, 200, 500] as const;

export type SiAgolTablePageSize = (typeof SI_AGOL_TABLE_PAGE_SIZES)[number];

export function clampSiAgolTablePage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Math.max(0, Math.min(page, totalPages - 1));
}

export function siAgolTableTotalPages(rowCount: number, pageSize: number): number {
  if (rowCount <= 0 || pageSize <= 0) return 0;
  return Math.ceil(rowCount / pageSize);
}

export function sliceSiAgolTablePage<T>(rows: T[], page: number, pageSize: number): T[] {
  if (!rows.length) return [];
  const start = page * pageSize;
  return rows.slice(start, start + pageSize);
}
