import React from 'react';

export function SchedulerDateTimeForm({ state }) {
  const {
    hour, setHour,
    minute, setMinute,
    ampm, setAmpm,
    selectedDate, setSelectedDate,
    repeat, setRepeat,
    repeatDays, setRepeatDays,
    repeatFreq, setRepeatFreq
  } = state;

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginTop: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Time</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '4px 6px' }}>
            <select value={hour} onChange={(e) => setHour(e.target.value)} style={{ all: 'unset', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', padding: '2px 4px' }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const val = String(i + 1).padStart(2, '0');
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>:</span>
            <select value={minute} onChange={(e) => setMinute(e.target.value)} style={{ all: 'unset', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', padding: '2px 4px' }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const val = String(i * 5).padStart(2, '0');
                return <option key={val} value={val}>{val}</option>;
              })}
            </select>
            <select value={ampm} onChange={(e) => setAmpm(e.target.value)} style={{ all: 'unset', fontSize: 10, fontWeight: 700, color: 'var(--ink-soft)', cursor: 'pointer', padding: '2px 4px', background: 'var(--hairline)', borderRadius: 4 }}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--hairline)',
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              fontSize: 12,
              fontWeight: 500,
              outline: 'none',
              cursor: 'pointer'
            }}
          />
        </div>
      </div>

      <div style={{ border: '1px dashed var(--hairline)', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Repeat?</span>
          <button
            type="button"
            onClick={() => setRepeat(!repeat)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 38,
              height: 20,
              borderRadius: 10,
              background: repeat ? 'var(--accent)' : 'var(--hairline-strong)',
              position: 'relative',
              transition: 'background 0.2s ease'
            }}
          >
            <div style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'white',
              position: 'absolute',
              top: 3,
              left: repeat ? 21 : 3,
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
            }} />
          </button>
        </div>

        {repeat && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'gen-fade 0.2s ease' }}>
            <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between', marginTop: 2 }}>
              {Object.keys(repeatDays).map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setRepeatDays({ ...repeatDays, [day]: !repeatDays[day] })}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'grid',
                    placeItems: 'center',
                    textTransform: 'capitalize',
                    background: repeatDays[day] ? 'var(--accent)' : 'var(--surface)',
                    color: repeatDays[day] ? 'white' : 'var(--ink-soft)',
                    border: `1px solid ${repeatDays[day] ? 'var(--accent)' : 'var(--hairline)'}`,
                    boxShadow: 'var(--shadow-card)'
                  }}
                >
                  {day === 'sat' ? 's' : day.slice(0, 1)}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-soft)' }}>Frequency:</span>
              <select
                value={repeatFreq}
                onChange={(e) => setRepeatFreq(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--hairline)',
                  background: 'var(--surface)',
                  color: 'var(--ink)',
                  fontSize: 11,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
