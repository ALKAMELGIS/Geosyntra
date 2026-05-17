import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../../lib/utils';
import './SiAoiWorkspaceCardFooter.css';

export type SiAoiWorkspaceSettingsDraft = {
  name: string;
  sentinelTimeStart: string;
  sentinelTimeEnd: string;
};

type SiAoiWorkspaceSettingsModalProps = {
  open: boolean;
  aoiName: string;
  aoiColor: string;
  draft: SiAoiWorkspaceSettingsDraft;
  onDraftChange: (patch: Partial<SiAoiWorkspaceSettingsDraft>) => void;
  onClose: () => void;
  onSave: () => void;
};

function SiAoiWorkspaceSettingsModal({
  open,
  aoiName,
  aoiColor,
  draft,
  onDraftChange,
  onClose,
  onSave,
}: SiAoiWorkspaceSettingsModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="si-aoi-ws-settings-backdrop"
      role="presentation"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="si-aoi-ws-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="si-aoi-ws-settings-modal__head">
          <div className="si-aoi-ws-settings-modal__title-row">
            <span className="si-aoi-ws-settings-modal__swatch" style={{ background: aoiColor }} aria-hidden />
            <div>
              <h3 id={titleId} className="si-aoi-ws-settings-modal__title">
                AOI settings
              </h3>
              <p className="si-aoi-ws-settings-modal__sub">{aoiName}</p>
            </div>
          </div>
          <button type="button" className="si-aoi-ws-settings-modal__close" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="si-aoi-ws-settings-modal__body">
          <label className="si-aoi-ws-settings-field">
            <span className="si-aoi-ws-settings-field__k">AOI name</span>
            <input
              type="text"
              className="si-aoi-ws-settings-field__input"
              value={draft.name}
              onChange={e => onDraftChange({ name: e.target.value })}
              autoFocus
            />
          </label>
          <div className="si-aoi-ws-settings-field-row">
            <label className="si-aoi-ws-settings-field">
              <span className="si-aoi-ws-settings-field__k">Time start</span>
              <input
                type="date"
                className="si-aoi-ws-settings-field__input"
                value={draft.sentinelTimeStart}
                onChange={e => onDraftChange({ sentinelTimeStart: e.target.value })}
              />
            </label>
            <label className="si-aoi-ws-settings-field">
              <span className="si-aoi-ws-settings-field__k">Time end</span>
              <input
                type="date"
                className="si-aoi-ws-settings-field__input"
                value={draft.sentinelTimeEnd}
                onChange={e => onDraftChange({ sentinelTimeEnd: e.target.value })}
              />
            </label>
          </div>
          <p className="si-aoi-ws-settings-modal__hint">
            Sentinel Hub layers for this AOI use this range when the global timeline is inactive.
          </p>
        </div>

        <footer className="si-aoi-ws-settings-modal__foot">
          <button type="button" className="si-aoi-ws-settings-btn si-aoi-ws-settings-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="si-aoi-ws-settings-btn si-aoi-ws-settings-btn--primary"
            onClick={onSave}
            disabled={!draft.name.trim()}
          >
            Save
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export type SiAoiWorkspaceCardFooterProps = {
  aoiId: string;
  aoiName: string;
  aoiColor: string;
  feature: GeoJSON.Feature;
  dateStart: string;
  dateEnd: string;
  onRename: (aoiId: string, name: string) => void;
  onSaveSettings: (aoiId: string, draft: SiAoiWorkspaceSettingsDraft) => void;
  onExport: (aoiId: string, feature: GeoJSON.Feature, name: string) => void;
  onDelete: (aoiId: string) => void;
};

const FOOTER_ACTIONS = [
  { id: 'rename' as const, icon: 'fa-solid fa-pen-to-square', label: 'Rename' },
  { id: 'export' as const, icon: 'fa-solid fa-file-export', label: 'Export' },
  { id: 'delete' as const, icon: 'fa-solid fa-trash-can', label: 'Delete', danger: true },
  { id: 'settings' as const, icon: 'fa-solid fa-gear', label: 'Settings' },
];

export function SiAoiWorkspaceCardFooter({
  aoiId,
  aoiName,
  aoiColor,
  feature,
  dateStart,
  dateEnd,
  onRename,
  onSaveSettings,
  onExport,
  onDelete,
}: SiAoiWorkspaceCardFooterProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<SiAoiWorkspaceSettingsDraft>({
    name: aoiName,
    sentinelTimeStart: dateStart,
    sentinelTimeEnd: dateEnd,
  });

  useEffect(() => {
    if (!settingsOpen) {
      setDraft({
        name: aoiName,
        sentinelTimeStart: dateStart,
        sentinelTimeEnd: dateEnd,
      });
    }
  }, [aoiName, dateStart, dateEnd, settingsOpen]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const handleRename = useCallback(() => {
    const next = window.prompt('Rename AOI', aoiName)?.trim();
    if (!next || next === aoiName) return;
    onRename(aoiId, next);
  }, [aoiId, aoiName, onRename]);

  const handleExport = useCallback(() => {
    onExport(aoiId, feature, aoiName);
  }, [aoiId, aoiName, feature, onExport]);

  const handleDelete = useCallback(() => {
    if (!window.confirm(`Remove "${aoiName}" from the workspace?`)) return;
    onDelete(aoiId);
  }, [aoiId, aoiName, onDelete]);

  const handleAction = (id: (typeof FOOTER_ACTIONS)[number]['id']) => {
    switch (id) {
      case 'rename':
        handleRename();
        break;
      case 'export':
        handleExport();
        break;
      case 'delete':
        handleDelete();
        break;
      case 'settings':
        openSettings();
        break;
      default:
        break;
    }
  };

  const handleSaveSettings = () => {
    const trimmed = draft.name.trim();
    if (!trimmed) return;
    onSaveSettings(aoiId, {
      name: trimmed,
      sentinelTimeStart: draft.sentinelTimeStart,
      sentinelTimeEnd: draft.sentinelTimeEnd,
    });
    closeSettings();
  };

  return (
    <>
      <div className="si-rs-aoi-workspace-card__footer" role="toolbar" aria-label={`Actions for ${aoiName}`}>
        {FOOTER_ACTIONS.map(action => (
          <button
            key={action.id}
            type="button"
            className={cn(
              'si-rs-aoi-workspace-card__action',
              action.danger && 'si-rs-aoi-workspace-card__action--danger',
            )}
            title={action.label}
            aria-label={action.label}
            onClick={() => handleAction(action.id)}
          >
            <i className={action.icon} aria-hidden />
          </button>
        ))}
      </div>

      <SiAoiWorkspaceSettingsModal
        open={settingsOpen}
        aoiName={aoiName}
        aoiColor={aoiColor}
        draft={draft}
        onDraftChange={patch => setDraft(d => ({ ...d, ...patch }))}
        onClose={closeSettings}
        onSave={handleSaveSettings}
      />
    </>
  );
}
