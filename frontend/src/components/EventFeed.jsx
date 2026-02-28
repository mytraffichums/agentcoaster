import { useEffect, useRef } from 'react';
import { formatPrice, directionLabel } from '../utils/format';
import { getAgentName, getAgentColor } from '../utils/agents';

export default function EventFeed({ events }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events]);

  return (
    <div className="event-feed">
      <h3>Events</h3>
      <div className="event-list" ref={listRef}>
        {events.map((e, i) => (
          <div key={i} className={`event-item ${e.type}${i === 0 ? ' new' : ''}`}>
            {renderEvent(e)}
          </div>
        ))}
        {events.length === 0 && <div className="no-data">No events yet</div>}
      </div>
    </div>
  );
}

function renderEvent(e) {
  const time = new Date(e.time).toLocaleTimeString();

  switch (e.type) {
    case 'roundStart':
      return (
        <>
          <span className="event-time">{time}</span>
          <span className="event-icon">{'\u{1F3C1}'}</span>
          {' '}Round #{e.roundId} started
        </>
      );

    case 'betPlaced':
      return (
        <>
          <span className="event-time">{time}</span>
          <span className="event-icon">{e.direction === 0 ? '\u{2B06}\u{FE0F}' : '\u{2B07}\u{FE0F}'}</span>
          <span className={`event-dir ${e.direction === 0 ? 'up' : 'down'}`}>
            {directionLabel(e.direction)}
          </span>
          {' '}<span style={{ color: getAgentColor(e.agent) }}>{getAgentName(e.agent)}</span> bet x{e.multiplier} at ${formatPrice(e.entryPrice)}
        </>
      );

    case 'betLiquidated':
      return (
        <>
          <span className="event-time">{time}</span>
          <span className="event-icon">{'\u{1F480}'}</span>
          <span className="event-bust">BUST</span>
          {' '}<span style={{ color: getAgentColor(e.agent) }}>{getAgentName(e.agent)}</span> liquidated
        </>
      );

    case 'betClosed':
      return (
        <>
          <span className="event-time">{time}</span>
          <span className="event-icon">{'\u{1F4B0}'}</span>
          <span className="event-close">CLOSE</span>
          {' '}Bet #{e.betId} closed, pnl={Number(e.pnl) >= 0 ? '+' : ''}{(Number(e.pnl) / 1e18).toFixed(4)}
        </>
      );

    case 'roundEnd':
      return (
        <>
          <span className="event-time">{time}</span>
          <span className="event-icon">{'\u{1F3C1}'}</span>
          {' '}Round #{e.roundId} ended at ${formatPrice(e.finalPrice)}
        </>
      );

    default:
      return <><span className="event-time">{time}</span> {e.type}</>;
  }
}
