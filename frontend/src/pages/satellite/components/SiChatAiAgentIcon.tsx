import { useId } from 'react';
import './SiChatAiAgentIcon.css';

export type SiChatAiAgentIconProps = {
  className?: string;
  /** Larger hit area for map toolbox rail buttons */
  size?: 'default' | 'rail' | 'chip';
};

/**
 * Agent Chat mark — refined speech bubble with AI agent core (spatial copilot entry points).
 */
export function SiChatAiAgentIcon({ className = '', size = 'default' }: SiChatAiAgentIconProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gBubble = `si-cai-bubble-${raw}`;
  const gCore = `si-cai-core-${raw}`;
  const gRing = `si-cai-ring-${raw}`;
  const gSpark = `si-cai-spark-${raw}`;
  const gGloss = `si-cai-gloss-${raw}`;

  const sizeClass =
    size === 'rail' ? 'si-chat-ai-agent-icon-wrap--rail' : size === 'chip' ? 'si-chat-ai-agent-icon-wrap--chip' : '';

  return (
    <span className={['si-chat-ai-agent-icon-wrap', sizeClass, className].filter(Boolean).join(' ')} aria-hidden>
      <svg className="si-chat-ai-agent-icon__svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gBubble} x1="3" y1="2" x2="21" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="#5b5ef7" />
            <stop offset="0.42" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
          <radialGradient
            id={gCore}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(11.25 10.25) scale(2.4)"
          >
            <stop stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#e0e7ff" />
            <stop offset="1" stopColor="#67e8f9" />
          </radialGradient>
          <linearGradient id={gRing} x1="8" y1="7" x2="15" y2="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#a5b4fc" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id={gSpark} x1="16" y1="3" x2="20.5" y2="8" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="0.45" stopColor="#f0abfc" />
            <stop offset="1" stopColor="#67e8f9" />
          </linearGradient>
          <linearGradient id={gGloss} x1="5" y1="4" x2="13" y2="11" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Compact chat bubble — tall silhouette, clear at 18px rail */}
        <path
          className="si-chat-ai-agent-icon__bubble"
          d="M5.25 4.75h10.5c1.05 0 1.9.85 1.9 1.9v5.35c0 1.05-.85 1.9-1.9 1.9H8.35l-2.65 2.95.85-2.95H5.25c-1.05 0-1.9-.85-1.9-1.9V6.65c0-1.05.85-1.9 1.9-1.9Z"
          fill={`url(#${gBubble})`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="0.45"
          strokeLinejoin="round"
        />

        <path
          d="M6.35 5.85h8.4c.5 0 .9.4.9.9v3.55c0 .5-.4.9-.9.9H9.1l-1.4 1.55.45-1.55H6.35c-.5 0-.9-.4-.9-.9V6.75c0-.5.4-.9.9-.9Z"
          fill={`url(#${gGloss})`}
          opacity="0.38"
        />

        {/* Agent orbit ring */}
        <ellipse
          className="si-chat-ai-agent-icon__ring"
          cx="11.25"
          cy="10.25"
          rx="3.15"
          ry="2.55"
          fill="none"
          stroke={`url(#${gRing})`}
          strokeWidth="0.55"
          strokeDasharray="1.2 1.8"
          opacity="0.9"
        />

        {/* AI agent nucleus */}
        <circle className="si-chat-ai-agent-icon__core" cx="11.25" cy="10.25" r="1.35" fill={`url(#${gCore})`} />
        <circle cx="11.25" cy="10.25" r="1.35" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="0.4" />

        {/* Neural agent mesh — symmetric */}
        <g className="si-chat-ai-agent-icon__mesh" stroke="rgba(255,255,255,0.78)" strokeWidth="0.5" strokeLinecap="round">
          <path d="M11.25 8.55v.75" />
          <path d="M9.55 11.35l.78-.55" />
          <path d="M12.95 11.35l-.78-.55" />
        </g>
        <circle className="si-chat-ai-agent-icon__node si-chat-ai-agent-icon__node--t" cx="11.25" cy="8.35" r="0.48" fill="#ffffff" />
        <circle className="si-chat-ai-agent-icon__node si-chat-ai-agent-icon__node--l" cx="9.2" cy="11.55" r="0.42" fill="#e0e7ff" />
        <circle className="si-chat-ai-agent-icon__node si-chat-ai-agent-icon__node--r" cx="13.3" cy="11.55" r="0.42" fill="#e0e7ff" />

        {/* Copilot sparkle */}
        <path
          className="si-chat-ai-agent-icon__spark"
          d="M17.35 4.15l.28.82.82.28-.82.28-.28.82-.28-.82-.82-.28.82-.28.28-.82Z"
          fill={`url(#${gSpark})`}
        />
      </svg>
    </span>
  );
}
