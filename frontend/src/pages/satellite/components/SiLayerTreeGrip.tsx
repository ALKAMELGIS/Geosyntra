import type { DragEvent } from 'react';

/** Six-dot drag handle (ArcGIS Online–style). */
export function SiLayerTreeGrip({
  draggable = false,
  title = 'Drag to reposition',
  ariaLabel = 'Drag to reposition',
  onDragStart,
  onDragEnd,
}: {
  draggable?: boolean;
  title?: string;
  ariaLabel?: string;
  onDragStart?: (e: DragEvent<HTMLSpanElement>) => void;
  onDragEnd?: () => void;
}) {
  if (!draggable) {
    return <span className="si-layer-tree__grip si-layer-tree__grip--spacer" aria-hidden />;
  }
  return (
    <span
      className="si-layer-tree__grip"
      draggable
      title={title}
      aria-label={ariaLabel}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={e => e.stopPropagation()}
    >
      <span className="si-layer-tree__grip-dots" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </span>
    </span>
  );
}
