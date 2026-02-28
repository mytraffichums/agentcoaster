import { useEffect, useRef, useState } from 'react';
import { getAgentName, getAgentColor } from '../utils/agents';

const PAD = { top: 30, right: 80, bottom: 30, left: 50 };
const SUPPORT_INTERVAL = 8;
const CART_W = 38;
const CART_H = 21;
const TOTAL_TICKS = 120;

function norm(v, min, max) {
  return max === min ? 0.5 : (v - min) / (max - min);
}

export default function RollercoasterChart({ priceHistory, bets }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 800, height: 400 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setDims({ width: Math.max(width, 100), height: Math.max(height, 100) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const prices = priceHistory || [];
  const { width, height } = dims;
  const iW = width - PAD.left - PAD.right;
  const iH = height - PAD.top - PAD.bottom;

  if (prices.length < 2) {
    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <svg width={width} height={height}>
          <text x={width / 2} y={height / 2} fill="#222" textAnchor="middle"
            fontFamily="JetBrains Mono, monospace" fontSize={14}>
            Waiting for round...
          </text>
        </svg>
      </div>
    );
  }

  const minP = Math.min(...prices) * 0.995;
  const maxP = Math.max(...prices) * 1.005;

  const toX = (i) => (i / TOTAL_TICKS) * iW;
  const toY = (p) => iH * (1 - norm(p, minP, maxP));

  const pts = prices.map((p, i) => ({ x: toX(i), y: toY(p) }));
  const poly = (arr) => arr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Unit tangent at last point for cart rotation
  const last = pts.length - 1;
  const a = pts[Math.max(0, last - 1)];
  const b = pts[last];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const cartAngle = Math.atan2(dy / len, dx / len) * (180 / Math.PI);

  // Track color based on direction
  const goingUp = prices[last] >= prices[last - 1];
  const trackColor = goingUp ? '#00ff88' : '#ff4444';

  // Vertical supports
  const supports = [];
  for (let i = 0; i < pts.length; i += SUPPORT_INTERVAL) {
    supports.push({ x: pts[i].x, top: pts[i].y });
  }

  // Price axis labels
  const PRICE_LABELS = 5;
  const priceLabels = Array.from({ length: PRICE_LABELS }, (_, i) => {
    const p = minP + (maxP - minP) * (i / (PRICE_LABELS - 1));
    return { p, y: toY(p) };
  });

  // Active bust lines
  const activeBets = (bets || []).filter(b => b.active);

  // Entry markers
  const markers = (bets || []).map(b => {
    const t = b.entryTick ?? 0;
    if (t >= prices.length) return null;
    return {
      x: toX(t),
      y: toY(prices[t]),
      up: b.direction === 0,
      color: getAgentColor(b.agent),
      label: `${getAgentName(b.agent)} ×${b.multiplier}`,
    };
  }).filter(Boolean);

  const pointsStr = poly(pts);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg width={width} height={height}>
        <defs>
          <filter id="cartGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${PAD.left},${PAD.top})`}>

          {/* Grid */}
          {priceLabels.map(({ y }, i) => (
            <line key={i} x1={0} y1={y} x2={iW} y2={y} stroke="#0d0d0d" strokeWidth={1} />
          ))}

          {/* Price labels */}
          {priceLabels.map(({ p, y }, i) => (
            <text key={i} x={-6} y={y} fill="#2a2a2a" fontSize={9}
              textAnchor="end" dominantBaseline="middle"
              fontFamily="JetBrains Mono, monospace">
              {(p / 100).toFixed(0)}
            </text>
          ))}

          {/* Tick labels */}
          {[0, 30, 60, 90, 120].map(t => (
            <text key={t} x={toX(t)} y={iH + 18} fill="#2a2a2a" fontSize={9}
              textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              {t}
            </text>
          ))}

          {/* Support pillars */}
          {supports.map((s, i) => (
            <line key={i} x1={s.x} y1={s.top} x2={s.x} y2={iH}
              stroke="#111" strokeWidth={1} strokeDasharray="2,6" />
          ))}

          {/* Bust lines */}
          {activeBets.map((b, i) => {
            const y = toY(b.bustPrice);
            const c = getAgentColor(b.agent);
            return (
              <g key={i}>
                <line x1={0} y1={y} x2={iW} y2={y}
                  stroke={c} strokeWidth={1} strokeDasharray="5,4" opacity={0.35} />
                <text x={iW + 4} y={y} fill={c} fontSize={9}
                  dominantBaseline="middle" fontFamily="JetBrains Mono, monospace" opacity={0.6}>
                  {getAgentName(b.agent)} bust
                </text>
              </g>
            );
          })}

          {/* Glow line — 4 layers: outermost to core */}
          <polyline points={pointsStr} fill="none"
            stroke={trackColor} strokeWidth={28} strokeLinejoin="round" strokeLinecap="round" opacity={0.04} />
          <polyline points={pointsStr} fill="none"
            stroke={trackColor} strokeWidth={14} strokeLinejoin="round" strokeLinecap="round" opacity={0.12} />
          <polyline points={pointsStr} fill="none"
            stroke={trackColor} strokeWidth={7}  strokeLinejoin="round" strokeLinecap="round" opacity={0.30} />
          <polyline points={pointsStr} fill="none"
            stroke={trackColor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={1} />

          {/* Cart */}
          <g filter="url(#cartGlow)"
            transform={`translate(${pts[last].x.toFixed(1)},${pts[last].y.toFixed(1)}) rotate(${cartAngle.toFixed(1)})`}>
            <rect
              x={-CART_W / 2} y={-CART_H - 4}
              width={CART_W} height={CART_H}
              rx={2} fill="#161616" stroke={trackColor} strokeWidth={2}
            />
            <rect
              x={-CART_W / 2 + 4} y={-CART_H - 1}
              width={CART_W - 8} height={4}
              rx={1} fill={trackColor} opacity={0.7}
            />
            {[-CART_W / 3, CART_W / 3].map((wx, i) => (
              <circle key={i} cx={wx} cy={2} r={4}
                fill="#0d0d0d" stroke={trackColor} strokeWidth={1.5} />
            ))}
          </g>

          {/* Entry markers — rendered last so always on top of everything */}
          {markers.map((m, i) => {
            const poleLen = 55;
            const tipY    = m.up ? -poleLen : poleLen;
            const labelY  = m.up ? -poleLen - 14 : poleLen + 14;
            const labelW  = 90;
            const labelH  = 14;
            return (
              <g key={i} transform={`translate(${m.x},${m.y})`}>
                {/* Dot on the line */}
                <circle cx={0} cy={0} r={5} fill={m.color} />
                {/* Pole */}
                <line x1={0} y1={0} x2={0} y2={tipY}
                  stroke={m.color} strokeWidth={1.5} opacity={0.9} />
                {/* Arrowhead at tip */}
                <polygon
                  points={m.up ? '0,0 6,10 -6,10' : '0,0 6,-10 -6,-10'}
                  transform={`translate(0,${tipY})`}
                  fill={m.color}
                />
                {/* Dark background behind label */}
                <rect
                  x={-labelW / 2} y={labelY - labelH}
                  width={labelW} height={labelH + 3}
                  rx={2} fill="#000" opacity={0.85}
                />
                {/* Label text */}
                <text x={0} y={labelY - 3} fill={m.color} fontSize={10} fontWeight="700"
                  textAnchor="middle" fontFamily="JetBrains Mono, monospace">
                  {m.label}
                </text>
              </g>
            );
          })}

        </g>
      </svg>
    </div>
  );
}
