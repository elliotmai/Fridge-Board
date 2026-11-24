import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 0;

/**
 * App-wide toast/snackbar system. Call `toast(message, { type, duration, action })`.
 * `action` is `{ label, onClick }` and renders a button (e.g. Undo) in the toast.
 * A `duration` of 0 keeps the toast until it is dismissed programmatically
 * (returns an id; pass it to `dismiss(id)`).
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, { type = 'info', duration = 3200, action } = {}) => {
      const id = ++nextId;
      // One undo-able toast at a time keeps the bottom of a wall screen tidy.
      setToasts((list) => [...(action ? list.filter((t) => !t.action) : list), { id, message, type, action }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss, clear: () => setToasts([]) }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4 pb-safe">
        {toasts.map((t) =>
          t.action ? (
            <div key={t.id} role="status" className="animate-toast-in pointer-events-auto flex max-w-[calc(100%-2rem)] items-center gap-4 rounded-sm bg-ink py-2 pl-5 pr-2 font-sans text-[15px] text-paper shadow-[var(--shadow-float)]">
              <span className="truncate">{t.message}</span>
              <button
                onClick={() => { t.action.onClick(); dismiss(t.id); }}
                className="h-11 rounded-xs px-4 font-bold text-honey underline-offset-4 hover:underline"
              >
                {t.action.label}
              </button>
            </div>
          ) : (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={[
                'animate-toast-in pointer-events-auto max-w-sm rounded-sm bg-ink py-3 pl-4 pr-5 text-left font-sans text-[15px] font-semibold text-paper shadow-[var(--shadow-float)]',
                // A coloured edge says what kind; the text stays high-contrast.
                t.type === 'error'
                  ? 'border-l-4 border-late'
                  : t.type === 'success'
                    ? 'border-l-4 border-ok'
                    : t.type === 'warning'
                      ? 'border-l-4 border-honey'
                      : '',
              ].join(' ')}
            >
              {t.message}
            </button>
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
