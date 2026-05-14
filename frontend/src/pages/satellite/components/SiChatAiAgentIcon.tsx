import { useId } from 'react';
import './SiChatAiAgentIcon.css';

export type SiChatAiAgentIconProps = {
  className?: string;
  /** Larger hit area for map toolbox rail buttons */
  size?: 'default' | 'rail' | 'chip';
};

/**
 * Custom “Chat AI agent” mark: speech bubble + sparkles, glossy indigo–violet gradients.
 * Replaces generic chat bubbles for Geo AI entry points.
 */
export function SiChatAiAgentIcon({ className = '', size = 'default' }: SiChatAiAgentIconProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gBubble = `si-cai-b-${raw}`;
  const gShine = `si-cai-s-${raw}`;
  const gSpark = `si-cai-p-${raw}`;
  const gSpark2 = `si-cai-p2-${raw}`;

  const sizeClass =
    size === 'rail' ? 'si-chat-ai-agent-icon-wrap--rail' : size === 'chip' ? 'si-chat-ai-agent-icon-wrap--chip' : '';

  return (
    <span className={['si-chat-ai-agent-icon-wrap', sizeClass, className].filter(Boolean).join(' ')} aria-hidden>
      <svg className="si-chat-ai-agent-icon__svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gBubble} x1="3" y1="2" x2="21" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4338ca" />
            <stop offset="0.42" stopColor="#7c3aed" />
            <stop offset="1" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id={gShine} x1="6" y1="4" x2="14" y2="12" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.58" />
            <stop offset="0.38" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={gSpark} x1="15" y1="4" x2="21" y2="11" gradientUnits="userSpaceOnUse">
            <stop stopColor="#faf5ff" />
            <stop offset="0.45" stopColor="#e9d5ff" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
          <linearGradient id={gSpark2} x1="16" y1="12" x2="20" y2="17" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fef9c3" />
            <stop offset="1" stopColor="#f0abfc" />
          </linearGradient>
        </defs>

        <path
          d="M6.2 4.2C5.4 4.9 5 5.9 5 7v8.2c0 1.7 1.3 3.1 3 3.1h1.9l2.1 3.2c.2.3.6.3.8 0l2-3.2H16c1.7 0 3-1.4 3-3.1V7c0-1.8-1.3-3.1-3-3.1H9.2c-.9 0-1.7.3-2.3.9Z"
          fill={`url(#${gBubble})`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="0.55"
        />

        <ellipse cx="11" cy="8.5" rx="5.2" ry="3.6" fill={`url(#${gShine})`} />

        <circle cx="9.2" cy="10.2" r="0.85" fill="rgba(15,23,42,0.52)" />
        <circle cx="13.2" cy="10.2" r="0.85" fill="rgba(15,23,42,0.52)" />
        <path
          d="M9.4 12.4c.8.6 1.9.9 3 .5"
          stroke="rgba(15,23,42,0.38)"
          strokeWidth="0.65"
          strokeLinecap="round"
          fill="none"
        />

        <path
          d="M17.8 5.2l.35 1.05 1.05.35-1.05.35-.35 1.05-.35-1.05-1.05-.35 1.05-.35.35-1.05Z"
          fill={`url(#${gSpark})`}
          className="si-chat-ai-agent-icon__spark si-chat-ai-agent-icon__spark--a"
        />
        <path
          d="M19.2 12.5l.28.82.82.28-.82.28-.28.82-.28-.82-.82-.28.82-.28.28-.82Z"
          fill={`url(#${gSpark2})`}
          className="si-chat-ai-agent-icon__spark si-chat-ai-agent-icon__spark--b"
        />
        <path
          d="M14.4 3.6l.22.68.68.22-.68.22-.22.68-.22-.68-.68-.22.68-.22.22-.68Z"
          fill="#f8fafc"
          opacity="0.92"
          className="si-chat-ai-agent-icon__spark si-chat-ai-agent-icon__spark--c"
        />
      </svg>
    </span>
  );
}
