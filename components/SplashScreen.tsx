'use client'

import { useEffect, useRef } from 'react'

interface Props {
  onDismiss: () => void
}

export default function SplashScreen({ onDismiss }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const el = overlayRef.current
      if (!el) return
      el.classList.add('splash-dismiss')
      const done = setTimeout(onDismiss, 400)
      return () => clearTimeout(done)
    }, 3000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <>
      <style>{`
        @keyframes body-reveal {
          from { clip-path: inset(0 0 100% 0); }
          to   { clip-path: inset(0 0 0% 0); }
        }
        @keyframes dot-left-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ecg-draw {
          from { stroke-dashoffset: 300; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes dot-right-pulse {
          0%   { transform: scale(0); opacity: 0; }
          60%  { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes text-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .splash-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: #0a0a0a;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          opacity: 1;
          transition: opacity 400ms ease;
        }
        .splash-dismiss {
          opacity: 0;
        }

        .splash-body-group {
          animation: body-reveal 600ms ease-in-out forwards;
        }
        .splash-dot-left {
          opacity: 0;
          animation: dot-left-in 200ms ease forwards;
          animation-delay: 400ms;
        }
        .splash-ecg {
          stroke-dasharray: 300;
          stroke-dashoffset: 300;
          animation: ecg-draw 500ms ease-in-out forwards;
          animation-delay: 650ms;
        }
        .splash-dot-right {
          transform-origin: 428px 160px;
          transform: scale(0);
          opacity: 0;
          animation: dot-right-pulse 300ms ease forwards;
          animation-delay: 1200ms;
        }
        .splash-wordmark {
          opacity: 0;
          transform: translateY(8px);
          animation: text-rise 700ms ease-out forwards;
          animation-delay: 1600ms;
        }
        .splash-tagline {
          opacity: 0;
          transform: translateY(8px);
          animation: text-rise 700ms ease-out forwards;
          animation-delay: 1600ms;
        }
      `}</style>

      <div ref={overlayRef} className="splash-overlay">
        <svg width="85vw" style={{ maxWidth: '420px' }} viewBox="220 36 220 250" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <clipPath id="body-clip">
              <rect x="220" y="0" width="120" height="0"/>
            </clipPath>
          </defs>

          <g className="splash-body-group" id="body-group">
            <path d="M 249,90 C 244,108 238,126 241,162" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M 242,200 C 240,222 242,252 245,272" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M 264,46 C 276,44 285,56 285,72 C 285,84 276,90 272,94 C 270,98 268,106 272,116 C 276,122 288,122 292,128 C 294,134 280,150 258,160 C 258,167 274,177 278,188 C 282,197 284,207 278,222 C 274,232 264,252 256,277 C 254,252 250,234 249,220 C 248,208 249,197 250,188 C 251,178 251,168 251,160 C 251,150 249,138 238,128 C 238,120 242,114 252,106 C 254,100 256,92 252,88 C 250,82 244,70 244,60 C 246,50 254,44 264,46 Z" fill="rgba(255,255,255,0.95)"/>
          </g>

          <polyline className="splash-ecg" id="ecg-line" points="260,160 294,160 300,124 308,190 314,148 325,160 428,160" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>

          <circle className="splash-dot-left" id="dot-left" cx="260" cy="160" r="5.5" fill="#E8940A"/>
          <circle className="splash-dot-right" id="dot-right" cx="428" cy="160" r="5.5" fill="#E8940A"/>
        </svg>

        <div
          className="splash-wordmark"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 5,
            color: '#ffffff',
            marginTop: 24,
          }}
        >
          BODYCIPHER
        </div>

        <div
          className="splash-tagline"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 5,
            color: '#E8940A',
            marginTop: 8,
          }}
        >
          DECODE YOUR BODY
        </div>
      </div>
    </>
  )
}
