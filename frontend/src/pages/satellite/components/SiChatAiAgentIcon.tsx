import { useId } from 'react';
import './SiChatAiAgentIcon.css';

export type SiChatAiAgentIconProps = {
  className?: string;
  /** Larger hit area for map toolbox rail buttons */
  size?: 'default' | 'rail' | 'chip';
};

/**
 * Agent Chat mark — speech bubble + neural agent core (spatial copilot entry points).
 */
export function SiChatAiAgentIcon({ className = '', size = 'default' }: SiChatAiAgentIconProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gShell = `si-cai-shell-${raw}`;
  const gCore = `si-cai-core-${raw}`;
  const gSpark = `si-cai-spark-${raw}`;
  const gShine = `si-cai-shine-${raw}`;

  const sizeClass =
    size === 'rail' ? 'si-chat-ai-agent-icon-wrap--rail' : size === 'chip' ? 'si-chat-ai-agent-icon-wrap--chip' : '';

  return (
    <span className={['si-chat-ai-agent-icon-wrap', sizeClass, className].filter(Boolean).join(' ')} aria-hidden>
      <svg className="si-chat-ai-agent-icon__svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gShell} x1="4" y1="3" x2="20" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="0.45" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
          <radialGradient id={gCore} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(11.5 9.75) scale(3.2)">
            <stop stopColor="#f5f3ff" />
            <stop offset="0.45" stopColor="#c4b5fd" />
            <stop offset="1" stopColor="#38bdf8" />
          </radialGradient>
          <linearGradient id={gSpark} x1="15" y1="4" x2="19.5" y2="9" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#e9d5ff" />
            <stop offset="1" stopColor="#7dd3fc" />
          </linearGradient>
          <linearGradient id={gShine} x1="6" y1="5" x2="14" y2="11" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Chat bubble — wide silhouette reads clearly at rail size */}
        <path
          className="si-chat-ai-agent-icon__bubble"
          d="M5.1 5.25h12.3c1.15 0 2.08.93 2.08 2.08v5.34c0 1.15-.93 2.08-2.08 2.08h-4.85l-2.95 3.35.95-3.35H5.1c-1.15 0-2.08-.93-2.08-2.08V7.33c0-1.15.93-2.08 2.08-2.08Z"
          fill={`url(#${gShell})`}
          stroke="rgba(255,255,255,0.32)"
          strokeWidth="0.5"
          strokeLinejoin="round"
        />

        <path
          d="M6.2 6.4h9.8c.55 0 1 .45 1 1v3.2c0 .55-.45 1-1 1H9.6l-1.55 1.75.5-1.75H6.2c-.55 0-1-.45-1-1V7.4c0-.55.45-1 1-1Z"
          fill={`url(#${gShine})`}
          opacity="0.42"
        />

        {/* Agent nucleus */}
        <circle className="si-chat-ai-agent-icon__core" cx="11.5" cy="9.75" r="2.05" fill={`url(#${gCore})`} />
        <circle cx="11.5" cy="9.75" r="2.05" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.45" />

        {/* Neural links — symmetric agent mesh */}
        <g className="si-chat-ai-agent-icon__mesh" stroke="rgba(255,255,255,0.72)" strokeWidth="0.55" strokeLinecap="round">
          <path d="M11.5 7.35v1.05" />
          <path d="M9.55 10.85l.92-.67" />
          <path d="M13.45 10.85l-.92-.67" />
        </g>
        <circle className="si-chat-ai-agent-icon__node si-chat-ai-agent-icon__node--t" cx="11.5" cy="7.1" r="0.55" fill="#f8fafc" />
        <circle className="si-chat-ai-agent-icon__node si-chat-ai-agent-icon__node--l" cx="9.15" cy="11.35" r="0.5" fill="#e0e7ff" />
        <circle className="si-chat-ai-agent-icon__node si-chat-ai-agent-icon__node--r" cx="13.85" cy="11.35" r="0.5" fill="#e0e7ff" />

        {/* AI sparkle — copilot accent */}
        <path
          className="si-chat-ai-agent-icon__spark"
          d="M17.1 4.65l.32.94.94.32-.94.32-.32.94-.32-.94-.94-.32.94-.32.32-.94Z"
          fill={`url(#${gSpark})`}
        />
      </svg>
    </span>
  );
}
