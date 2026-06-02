import { useId } from 'react';
import './SiChatAiAgentIcon.css';

export type SiChatAiAgentIconProps = {
  className?: string;
  /** Larger hit area for map toolbox rail buttons */
  size?: 'default' | 'rail' | 'chip' | 'fab';
};

/**
 * Premium Agent Chat mark — glass speech bubble with conversation lines (spatial copilot).
 */
export function SiChatAiAgentIcon({ className = '', size = 'default' }: SiChatAiAgentIconProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gShell = `si-cai-shell-${raw}`;
  const gFace = `si-cai-face-${raw}`;
  const gLine = `si-cai-line-${raw}`;
  const gGloss = `si-cai-gloss-${raw}`;
  const gDot = `si-cai-dot-${raw}`;

  const sizeClass =
    size === 'rail'
      ? 'si-chat-ai-agent-icon-wrap--rail'
      : size === 'chip'
        ? 'si-chat-ai-agent-icon-wrap--chip'
        : size === 'fab'
          ? 'si-chat-ai-agent-icon-wrap--fab'
          : '';

  return (
    <span className={['si-chat-ai-agent-icon-wrap', sizeClass, className].filter(Boolean).join(' ')} aria-hidden>
      <svg className="si-chat-ai-agent-icon__svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gShell} x1="4" y1="3" x2="20" y2="19" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="0.45" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <linearGradient id={gFace} x1="6" y1="6" x2="18" y2="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1e1b4b" stopOpacity="0.55" />
            <stop offset="1" stopColor="#0f172a" stopOpacity="0.72" />
          </linearGradient>
          <linearGradient id={gLine} x1="8" y1="9" x2="16" y2="13" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#bae6fd" />
          </linearGradient>
          <linearGradient id={gGloss} x1="6" y1="5" x2="14" y2="11" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={gDot} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(17.2 7.1) scale(1.8)">
            <stop stopColor="#f0abfc" />
            <stop offset="1" stopColor="#67e8f9" />
          </radialGradient>
        </defs>

        <path
          className="si-chat-ai-agent-icon__bubble"
          d="M4.75 4.25h11.25c1.24 0 2.25 1.01 2.25 2.25v5.85c0 1.24-1.01 2.25-2.25 2.25H9.15L5.5 18.25l1.05-4.6H4.75c-1.24 0-2.25-1.01-2.25-2.25V6.5c0-1.24 1.01-2.25 2.25-2.25Z"
          fill={`url(#${gShell})`}
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />

        <path
          d="M6.15 5.35h9.05c.62 0 1.12.5 1.12 1.12v4.05c0 .62-.5 1.12-1.12 1.12H9.55l-1.55 1.7.5-1.7H6.15c-.62 0-1.12-.5-1.12-1.12V6.47c0-.62.5-1.12 1.12-1.12Z"
          fill={`url(#${gGloss})`}
          opacity="0.42"
        />

        <path
          className="si-chat-ai-agent-icon__inner"
          d="M7.35 6.85h9.3c.55 0 1 .45 1 1v4.35c0 .55-.45 1-1 1H9.55l-1.75 1.9.6-1.9H7.35c-.55 0-1-.45-1-1V7.85c0-.55.45-1 1-1Z"
          fill={`url(#${gFace})`}
        />

        <g className="si-chat-ai-agent-icon__lines" stroke={`url(#${gLine})`} strokeWidth="1.05" strokeLinecap="round">
          <path d="M9.1 9.85h5.8" />
          <path d="M9.1 12.15h3.9" opacity="0.82" />
        </g>

        <circle className="si-chat-ai-agent-icon__dot" cx="17.15" cy="7.05" r="1.05" fill={`url(#${gDot})`} />
        <circle cx="17.15" cy="7.05" r="1.05" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.35" />
      </svg>
    </span>
  );
}
