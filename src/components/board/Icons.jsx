const s = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Tick = () => (<svg viewBox="0 0 24 24" {...s} stroke="var(--on)" strokeWidth="3.2"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const DoneCircle = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2.6"><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="none" opacity=".18" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>);
export const Chevron = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2.2"><path d="M6 9l6 6 6-6" /></svg>);
export const Right = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>);
export const Left = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2.2"><path d="M15 6l-6 6 6 6" /></svg>);
export const Play = () => (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z" /></svg>);
export const Plus = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>);
export const Close = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const Timer = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 2M9.5 2.5h5" /></svg>);
export const Plane = () => (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z" /></svg>);
export const Warn = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2.2"><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5v.01" /></svg>);
export const Snow = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" /></svg>);
export const Bed = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" /><circle cx="7" cy="11" r="1.6" /></svg>);
export const Car = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2"><path d="M5 16h14v-4l-2-5H7l-2 5v4z" /><path d="M5 12h14" /><circle cx="8" cy="17" r="1.5" /><circle cx="16" cy="17" r="1.5" /></svg>);
export const Train = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2"><rect x="6" y="3" width="12" height="13" rx="3" /><path d="M6 10h12M9 20l-1.5 2M15 20l1.5 2M9 16l-1 4h8l-1-4" /></svg>);
export const Pin = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2"><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></svg>);
export const Sliders = () => (<svg viewBox="0 0 24 24" {...s} strokeWidth="2"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>);

export const WX = {
  sun: () => (<svg viewBox="0 0 24 24" {...s} stroke="var(--warn)" strokeWidth="2"><circle cx="12" cy="12" r="4.2" fill="var(--warn)" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>),
  cloud: () => (<svg viewBox="0 0 24 24"><path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.5 3.5 0 0 0 7 18.5z" fill="var(--muted)" /></svg>),
  partly: () => (<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="4" fill="var(--warn)" /><path d="M8.5 19.5h9a3.6 3.6 0 0 0 .3-7.2 5 5 0 0 0-9.6 1.1 3.1 3.1 0 0 0 .3 6.1z" fill="var(--muted)" /></svg>),
  rain: () => (<svg viewBox="0 0 24 24" fill="none"><path d="M7 15h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.2A3.5 3.5 0 0 0 7 15z" fill="var(--muted)" /><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="var(--ahead)" strokeWidth="2" strokeLinecap="round" /></svg>),
};
