import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type SiEnvLayerInlineEditProps = {
  value: string;
  placeholder?: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

export function SiEnvLayerInlineEdit({
  value,
  placeholder = '',
  ariaLabel,
  onCommit,
  onCancel,
}: SiEnvLayerInlineEditProps) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [value]);

  const commit = () => {
    onCommit(draft.trim());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      className="si-layer-tree__inline-input"
      type="text"
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
    />
  );
}
