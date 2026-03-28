'use client';

import { useEffect } from 'react';
import { initGame } from '@/lib/game';

export default function GameCanvas() {
  useEffect(() => {
    const cleanup = initGame();
    return cleanup;
  }, []);

  return (
    <div
      style={{
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        height: '100dvh',
        overflow: 'hidden',
        touchAction: 'none',
        fontFamily: 'monospace',
      }}
    >
      <div
        id="canvasWrapper"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          minHeight: 0,
        }}
      >
        <canvas
          id="gameCanvas"
          style={{
            imageRendering: 'pixelated',
            display: 'block',
            willChange: 'transform',
          }}
        />
      </div>

      <div
        id="controls"
        style={{
          width: '100%',
          height: '110px',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        <div id="dpad" style={{ display: 'flex', gap: '10px' }}>
          <button id="btn-left"  className="ctrl-btn">◀</button>
          <button id="btn-right" className="ctrl-btn">▶</button>
        </div>
        <button id="btn-jump" className="ctrl-btn jump-btn">▲</button>
      </div>
    </div>
  );
}
