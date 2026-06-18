import { SI_AGOL_TABLE_PAGE_SIZES, type SiAgolTablePageSize } from '../utils/siAgolTablePaging';
import './SiAgolTablePagination.css';

export type SiAgolTablePaginationProps = {
  page: number;
  pageSize: SiAgolTablePageSize;
  totalRows: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: SiAgolTablePageSize) => void;
};

export function SiAgolTablePagination({
  page,
  pageSize,
  totalRows,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: SiAgolTablePaginationProps) {
  const safePage = totalPages > 0 ? Math.min(page, totalPages - 1) : 0;
  const from = totalRows === 0 ? 0 : safePage * pageSize + 1;
  const to = totalRows === 0 ? 0 : Math.min(totalRows, (safePage + 1) * pageSize);

  return (
    <footer className="si-agol-table__pager" aria-label="Table pagination">
      <span className="si-agol-table__pager-range">
        {totalRows === 0 ? 'No records' : `${from}–${to} of ${totalRows}`}
      </span>
      <div className="si-agol-table__pager-controls">
        <label className="si-agol-table__pager-size">
          <span>Rows</span>
          <select
            value={pageSize}
            aria-label="Rows per page"
            onChange={e => onPageSizeChange(Number(e.target.value) as SiAgolTablePageSize)}
          >
            {SI_AGOL_TABLE_PAGE_SIZES.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="si-agol-table__pager-btn"
          disabled={safePage <= 0}
          aria-label="Previous page"
          onClick={() => onPageChange(safePage - 1)}
        >
          <i className="fa-solid fa-chevron-left" aria-hidden />
        </button>
        <span className="si-agol-table__pager-index">
          Page {totalPages === 0 ? 0 : safePage + 1} / {totalPages || 1}
        </span>
        <button
          type="button"
          className="si-agol-table__pager-btn"
          disabled={totalPages === 0 || safePage >= totalPages - 1}
          aria-label="Next page"
          onClick={() => onPageChange(safePage + 1)}
        >
          <i className="fa-solid fa-chevron-right" aria-hidden />
        </button>
      </div>
    </footer>
  );
}
