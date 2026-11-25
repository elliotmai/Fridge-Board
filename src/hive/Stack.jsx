import { useRef } from 'react';
import { appLook } from '@/config/catalog';
import { Widget, WIDGETS } from './widgets';

/**
 * A widget stack: one widget showing, the rest under it. Swipe up or down to
 * turn it (on the home screen the swipe is read by Home, so it can't fight a
 * drag; elsewhere pass `swipe`), or tap the rail of dots on its side.
 *
 * `dir` is how it last turned (1 up, -1 down) so the new face slides in from
 * that side. The face is a fresh element each turn, so the slide is a plain
 * CSS animation on transform.
 */
export function StackView({ widgets, index, dir, size, data, now, custom, onOpen, onTurn, still, swipe }) {
  const i = Math.max(0, Math.min(widgets.length - 1, index));
  const w = widgets[i];
  const face = useRef(null);
  const press = useRef(null);
  const onDown = (e) => {
    if (!swipe || e.target.closest('.w-scroll, .w-scroll-x, .w-act, input')) return;
    press.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId };
  };
  const onMove = (e) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dy = e.clientY - p.y;
    if (Math.abs(dy) > 6 && face.current) face.current.style.transform = `translate3d(0, ${dy * 0.45}px, 0)`;
  };
  const onUp = (e) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    if (face.current) face.current.style.transform = '';
    const dy = e.clientY - p.y, v = dy / Math.max(1, e.timeStamp - p.t);
    if (dy < -32 || v < -0.4) onTurn(1);
    else if (dy > 32 || v > 0.4) onTurn(-1);
  };
  return (
    <div className="stack" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { press.current = null; if (face.current) face.current.style.transform = ''; }}>
      <div className="stack-face" ref={face}>
        <div key={w} className={`stack-card ${dir > 0 ? 'enter-up' : dir < 0 ? 'enter-down' : ''}`}>
          <Widget w={w} size={size} data={data} now={now} color={appLook(WIDGETS[w].app, custom).color} onOpen={onOpen} still={still} />
        </div>
      </div>
      {widgets.length > 1 && (
        <button className="stack-rail w-act" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onTurn(1); }}
          aria-label={`${WIDGETS[w].label}, ${i + 1} of ${widgets.length} in this stack. Show the next one`}>
          {widgets.map((x, j) => <i key={x} className={j === i ? 'on' : ''} />)}
        </button>
      )}
    </div>
  );
}
