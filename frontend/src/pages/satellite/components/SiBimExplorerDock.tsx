import { useMemo, useState } from 'react';
import {
  SI_BIM_CATEGORY_LABELS,
  SI_BIM_CATEGORIES,
  type SiBimCategory,
} from '../utils/siIfcBimCategories';
import { getSiBimModel, listSiBimStoreys, searchSiBimElements } from '../utils/siIfcBimModelStore';
import type { SiBimSpatialNode } from '../utils/siIfcBimTypes';
import './SiBimExplorerDock.css';

export type SiBimExplorerDockProps = {
  modelId: string | null;
  customLayers: Array<{ id: string; name: string; visible: boolean; bimCategory?: string; bimModelId?: string }>;
  onToggleCategory: (category: SiBimCategory, visible: boolean) => void;
  onSelectElement: (entry: { globalId: string; layerId: string; name: string }) => void;
  onClose: () => void;
};

function SpatialTreeNode({ node, depth }: { node: SiBimSpatialNode; depth: number }) {
  const isStorey = /storey|floor|level/i.test(node.type);
  return (
    <li className={isStorey ? 'si-bim-explorer__spatial-storey' : undefined} style={{ paddingLeft: depth * 12 }}>
      <span title={node.type}>
        {node.name}
        <small>{node.type.replace(/^Ifc/i, '')}</small>
      </span>
      {node.children.length > 0 && (
        <ul>
          {node.children.map(child => (
            <SpatialTreeNode key={`${child.expressId}-${child.type}`} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SiBimExplorerDock({
  modelId,
  customLayers,
  onToggleCategory,
  onSelectElement,
  onClose,
}: SiBimExplorerDockProps) {
  const [query, setQuery] = useState('');
  const [storeyFilter, setStoreyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SiBimCategory | ''>('');

  const model = modelId ? getSiBimModel(modelId) : undefined;
  const storeys = useMemo(() => (modelId ? listSiBimStoreys(modelId) : []), [modelId]);

  const categoryRows = useMemo(() => {
    if (!model) return [];
    return SI_BIM_CATEGORIES.filter(c => (model.categoryStats[c] ?? 0) > 0).map(c => {
      const layer = customLayers.find(l => l.bimModelId === modelId && l.bimCategory === c);
      return {
        category: c,
        label: SI_BIM_CATEGORY_LABELS[c],
        count: model.categoryStats[c] ?? 0,
        visible: layer?.visible !== false,
        layerId: layer?.id,
      };
    });
  }, [customLayers, model, modelId]);

  const searchHits = useMemo(() => {
    if (!modelId) return [];
    return searchSiBimElements(modelId, query, {
      category: categoryFilter || undefined,
      storey: storeyFilter || undefined,
      limit: 60,
    });
  }, [categoryFilter, modelId, query, storeyFilter]);

  if (!modelId || !model) return null;

  return (
    <aside className="si-bim-explorer" aria-label="BIM model explorer">
      <header className="si-bim-explorer__head">
        <div>
          <strong>BIM Explorer</strong>
          <small>
            {model.filename} · {model.schema} · {model.renderedElements.toLocaleString()} elements
          </small>
        </div>
        <button type="button" className="si-bim-explorer__close" onClick={onClose} aria-label="Close BIM explorer">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-bim-explorer__filters">
        <input
          type="search"
          placeholder="Search elements, rooms, GlobalId…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search IFC elements"
        />
        <div className="si-bim-explorer__filter-row">
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as SiBimCategory | '')}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categoryRows.map(r => (
              <option key={r.category} value={r.category}>
                {r.label} ({r.count})
              </option>
            ))}
          </select>
          <select
            value={storeyFilter}
            onChange={e => setStoreyFilter(e.target.value)}
            aria-label="Filter by storey"
          >
            <option value="">All floors</option>
            {storeys.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="si-bim-explorer__groups">
        <h4>Categories</h4>
        <ul>
          {categoryRows.map(row => (
            <li key={row.category}>
              <label>
                <input
                  type="checkbox"
                  checked={row.visible}
                  onChange={e => onToggleCategory(row.category, e.target.checked)}
                />
                <span>{row.label}</span>
                <em>{row.count}</em>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {model.spatialStructure && (
        <section className="si-bim-explorer__spatial">
          <h4>Spatial structure</h4>
          <ul>
            <SpatialTreeNode node={model.spatialStructure} depth={0} />
          </ul>
        </section>
      )}

      {(query.trim() || categoryFilter || storeyFilter) && (
        <section className="si-bim-explorer__results">
          <h4>Results ({searchHits.length})</h4>
          <ul>
            {searchHits.map(hit => (
              <li key={`${hit.globalId}-${hit.expressId}`}>
                <button
                  type="button"
                  onClick={() =>
                    onSelectElement({ globalId: hit.globalId, layerId: hit.layerId, name: hit.name })
                  }
                >
                  <strong>{hit.name}</strong>
                  <small>
                    {SI_BIM_CATEGORY_LABELS[hit.category]} · {hit.ifcType}
                    {hit.storey ? ` · ${hit.storey}` : ''}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="si-bim-explorer__meta">
        {model.georeferenced ? (
          <span>
            <i className="fa-solid fa-location-crosshairs" aria-hidden /> Georeferenced
            {model.crsHint ? ` (${model.crsHint})` : ''}
          </span>
        ) : (
          <span>
            <i className="fa-solid fa-anchor" aria-hidden /> Anchored to map view
          </span>
        )}
        <span>Toggle 3D elevation for full mesh rendering</span>
      </footer>
    </aside>
  );
}
