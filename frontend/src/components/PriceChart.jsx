import { useEffect, useRef, useState } from 'react';
import { createChart, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { getAgentName, getAgentColor } from '../utils/agents';

export default function PriceChart({ priceHistory, bets, tick }) {
  const containerRef = useRef(null);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const markersPluginRef = useRef(null);
  const baseTimeRef = useRef(0);
  const [dotStyle, setDotStyle] = useState(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 400,
      layout: {
        background: { color: '#000000' },
        textColor: '#666666',
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: '#111111' },
        horzLines: { color: '#111111' },
      },
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: '#1a1a1a',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1a1a1a',
      },
    });

    const series = chart.addSeries(LineSeries, {
      color: '#00d4ff',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (p) => (p / 100).toFixed(2),
      },
    });

    const markersPlugin = createSeriesMarkers(series, []);

    chartRef.current = chart;
    seriesRef.current = series;
    markersPluginRef.current = markersPlugin;

    const resizeObserver = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Update data, dynamic line color, pulsing dot
  useEffect(() => {
    if (!seriesRef.current || !priceHistory.length) return;

    // Compute stable base timestamp per round
    if (priceHistory.length === 1) {
      baseTimeRef.current = Math.floor(Date.now() / 1000);
    } else if (baseTimeRef.current === 0) {
      // First load mid-round — backdate so current tick = now
      baseTimeRef.current = Math.floor(Date.now() / 1000) - priceHistory.length + 1;
    }
    const baseTime = baseTimeRef.current;

    const data = priceHistory.map((p, i) => ({
      time: baseTime + i,
      value: p,
    }));
    seriesRef.current.setData(data);

    // Dynamic line color based on price direction
    const len = priceHistory.length;
    if (len >= 2) {
      const goingUp = priceHistory[len - 1] >= priceHistory[len - 2];
      const lineColor = goingUp ? '#00ff88' : '#ff4444';
      seriesRef.current.applyOptions({ color: lineColor });

      // Position pulsing dot at tip
      const chart = chartRef.current;
      if (chart) {
        const timeScale = chart.timeScale();
        const priceScale = seriesRef.current;
        try {
          const x = timeScale.timeToCoordinate(baseTime + len - 1);
          const y = priceScale.priceToCoordinate(priceHistory[len - 1]);
          if (x !== null && y !== null) {
            setDotStyle({
              left: x,
              top: y,
              color: lineColor,
            });
          }
        } catch {
          setDotStyle(null);
        }
      }
    }

    // Markers for bets
    const markers = [];
    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i];
      const entryTick = bet.entryTick ?? 0;
      if (entryTick < priceHistory.length) {
        markers.push({
          time: baseTime + entryTick,
          position: bet.direction === 0 ? 'belowBar' : 'aboveBar',
          color: getAgentColor(bet.agent),
          shape: bet.direction === 0 ? 'arrowUp' : 'arrowDown',
          text: `${getAgentName(bet.agent)} x${bet.multiplier}`,
        });
      }
    }
    markers.sort((a, b) => a.time - b.time);
    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(markers);
    }

    // Scroll to latest
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [priceHistory, bets]);

  // Add price lines for bust levels
  useEffect(() => {
    if (!seriesRef.current) return;

    priceLinesRef.current.forEach(line => {
      try { seriesRef.current.removePriceLine(line); } catch (e) {}
    });
    priceLinesRef.current = [];

    bets.forEach((bet) => {
      if (!bet.active) return;
      const color = getAgentColor(bet.agent);
      const line = seriesRef.current.createPriceLine({
        price: bet.bustPrice,
        color: color + '80',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${getAgentName(bet.agent)} bust`,
      });
      priceLinesRef.current.push(line);
    });
  }, [bets]);

  return (
    <div className="chart-container" ref={containerRef}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      {dotStyle && (
        <div
          className="price-dot"
          style={{
            left: dotStyle.left,
            top: dotStyle.top,
            backgroundColor: dotStyle.color,
            color: dotStyle.color,
          }}
        />
      )}
    </div>
  );
}
