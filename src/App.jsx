import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { NetworkStatus } from '@/components/NetworkStatus';
import { WhatsNew } from '@/components/WhatsNew';
import { KitchenTimerAlarm } from '@/components/KitchenTimerAlarm';
import { KitchenTimersProvider } from '@/context/KitchenTimers';
import { Hive } from '@/hive/Hive';

/**
 * Hive is the home screen; Fridge Board is one of its apps. On the fridge
 * tablet it still opens straight to the board (Hive settings → Open to).
 */
export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <KitchenTimersProvider>
          <Hive />
          <KitchenTimerAlarm />
        </KitchenTimersProvider>
        <NetworkStatus />
        <WhatsNew />
      </ToastProvider>
    </ThemeProvider>
  );
}
