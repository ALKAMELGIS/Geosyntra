import { useCallback, useRef } from 'react';
import type { SiMapPrintElementId, SiMapPrintLayoutOffsets } from '../utils/siMapPrintTypes';
import { siMapPrintLayoutToPercentRects, type SiMapPrintLayoutPlan } from '../utils/siMapPrintLayout';
import './SiMapPrintCustomLayout.css';

const LABELS: Record<SiMapPrintElementId, string> = {
  title: 'Title',
  legend: 'Key',
  scaleNorth: 'Scale & N',
  credits: 'Credits',
};

export type SiMapPrintCustomLayoutProps = {
  plan: SiMapPrintLayoutPlan;
  offsets: SiMapPrintLayoutOffsets;
  onOffsetsChange: (next: SiMapPrintLayoutOffsets) => void;
  enabled: boolean;
};

export function SiMapPrintCustomLayout({ plan, offsets, onOffsetsChange, enabled }: SiMapPrintCustomLayoutProps) {
  const dragRef = useRef<{
    id: SiMapPrintElementId;
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
  } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  const rects = siMapPrintLayoutToPercentRects(plan);

  const onPointerDown = useCallback(
    (id: SiMapPrintElementId, e: React.PointerEvent) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = offsets[id] ?? { dxPct: 0, dyPct: 0 };
      dragRef.current = { id, startX: e.clientX, startY: e.clientY, baseDx: cur.dxPct, baseDy: cur.dyPct };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [enabled, offsets],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      const host = hostRef.current;
      if (!d || !host) return;
      const box = host.getBoundingClientRect();
      const dxPct = d.baseDx + (e.clientX - d.startX) / box.width;
      const dyPct = d.baseDy + (e.clientY - d.startY) / box.height;
      onOffsetsChange({
        ...offsets,
        [d.id]: { dxPct, dyPct },
      });
    },
    [offsets, onOffsetsChange],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  if (!enabled) return null;

  return (
    <div
      ref={hostRef}
      className="si-map-print-custom-layout"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {(Object.keys(LABELS) as SiMapPrintElementId[]).map(id => {
        const style = rects[id];
        if (!style) return null;
        return (
          <button
            key={id}
            type="button"
            className="si-map-print-custom-layout__handle"
            style={style}
            title={`Drag ${LABELS[id]}`}
            onPointerDown={e => onPointerDown(id, e)}
          >
            <span>{LABELS[id]}</span>
          </button>
        );
      })}
    </div>
  );
}
