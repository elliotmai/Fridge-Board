import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { NetworkStatus } from '@/components/NetworkStatus';
import { WhatsNew } from '@/components/WhatsNew';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Board } from '@/components/board/Board';
import { Footer } from '@/components/Footer';
import { useIsPhone } from '@/hooks/useMedia';

/**
 * On the fridge the board fills one landscape screen and every panel scrolls on
 * its own, so pull-to-refresh and the footer only appear on phones. On the
 * fridge, the feedback link lives in Board settings.
 */
function Shell() {
  const phone = useIsPhone();
  if (!phone) return <Board />;
  return (
    <>
      <PullToRefresh><Board /></PullToRefresh>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Shell />
        <NetworkStatus />
        <WhatsNew />
      </ToastProvider>
    </ThemeProvider>
  );
}
