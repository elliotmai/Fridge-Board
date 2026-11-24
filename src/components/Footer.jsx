import { FEEDBACK_URL } from '@/config/app';

/**
 * Persistent, understated footer link to the shared bug-report / feature-request
 * page. Included on every screen. Sits above the safe-area inset on mobile.
 */
export function Footer() {
  return (
    <footer className="flex flex-none items-center justify-center border-t border-line py-2 pb-safe font-sans">
      <a
        href={FEEDBACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center px-2 text-xs font-semibold text-muted hover:text-ink"
      >
        Report a bug or request a feature
      </a>
    </footer>
  );
}
