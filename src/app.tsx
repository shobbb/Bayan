import { useCallback, useState } from 'react';
import { ConfigProvider } from '@/ui/context/ConfigContext';
import { HomeScreen } from '@/ui/screens/HomeScreen';
import { ReadingScreen } from '@/ui/screens/ReadingScreen';
import type { Round, RoundType } from '@/domain/types';

/**
 * In-app navigation state (REQ-P3): no URL-based routing, no reliance on
 * browser back. Hardware back button handling (Android) is deferred — it
 * needs @capacitor/app, which isn't part of the native plugin set built so
 * far (§2.0.1).
 */
type Screen =
  | { name: 'home' }
  | { name: 'reading'; round: Round | null; roundType: RoundType };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  const handleStartRound = useCallback((roundType: RoundType) => {
    setScreen({ name: 'reading', round: null, roundType });
  }, []);

  const handleReplayRound = useCallback((round: Round) => {
    setScreen({ name: 'reading', round, roundType: round.roundType });
  }, []);

  const handleFinishReading = useCallback(() => {
    setScreen({ name: 'home' }); // REQ-14: no auto-advance — completing any activity returns here
  }, []);

  return (
    <ConfigProvider>
      {screen.name === 'home' ? (
        <HomeScreen onStartRound={handleStartRound} onReplayRound={handleReplayRound} />
      ) : (
        <ReadingScreen
          segments={screen.round?.segments}
          titleAr={screen.round?.titleAr}
          titleEn={screen.round?.titleEn}
          onFinish={handleFinishReading}
        />
      )}
    </ConfigProvider>
  );
}
