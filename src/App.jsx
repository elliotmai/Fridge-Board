import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { NetworkStatus } from '@/components/NetworkStatus';
import { WhatsNew } from '@/components/WhatsNew';
import { Hive } from '@/hive/Hive';

/**
 * Hive is the home screen; Fridge Board is one of its apps. On the fridge
 * tablet it still opens straight to the board (Hive settings → Open to).
 */
export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Hive />
        <NetworkStatus />
        <WhatsNew />
      </ToastProvider>
    </ThemeProvider>
  );
}
