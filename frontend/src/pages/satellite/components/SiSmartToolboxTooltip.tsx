import type { ReactNode } from 'react';

export type SiSmartToolboxTooltipProps = {
  title: string;
  hint?: string;
  children: ReactNode;
  side?: 'start' | 'end';
};

export function SiSmartToolboxTooltip({
  title,
  hint,
  children,
  side = 'start',
}: SiSmartToolboxTooltipProps) {
  return (
    <span
      className={
        'si-smart-tb-tip' + (side === 'end' ? ' si-smart-tb-tip--end' : ' si-smart-tb-tip--start')
      }
    >
      {children}
      <span className="si-smart-tb-tip__bubble" role="tooltip">
        <span className="si-smart-tb-tip__title">{title}</span>
        {hint ? <span className="si-smart-tb-tip__hint">{hint}</span> : null}
      </span>
    </span>
  );
}
