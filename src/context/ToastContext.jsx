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
            <div key={t.id} role="status" className="animate-toast-in pointer-events-auto flex max-w-[calc(100%-2rem)] items-center gap-4 rounded-full bg-neutral-900 py-2 pl-5 pr-2 text-[15px] text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900">
              <span className="truncate">{t.message}</span>
              <button
                onClick={() => { t.action.onClick(); dismiss(t.id); }}
                className="h-10 rounded-full bg-white/15 px-4 font-semibold dark:bg-black/10"
              >
                {t.action.label}
              </button>
            </div>
          ) : (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={[
                'animate-toast-in pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-lg backdrop-blur',
                t.type === 'error'
                  ? 'bg-red-600/90 text-white'
                  : t.type === 'success'
                    ? 'bg-emerald-600/90 text-white'
                    : t.type === 'warning'
                      ? 'bg-amber-500/90 text-black'
                      : 'bg-neutral-800/90 text-white dark:bg-neutral-200/90 dark:text-black',
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
