import { useCallback, useState } from 'react';
import { ConfigProvider, useConfig } from '@/ui/context/ConfigContext';
import { HomeScreen } from '@/ui/screens/HomeScreen';
import { ReadingScreen } from '@/ui/screens/ReadingScreen';
import { StatsScreen } from '@/ui/screens/StatsScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { createRound, finishRound, MissingApiKeyError } from '@/services/rounds/roundService';
import { LlmValidationError } from '@/services/llm/generate';
import type { Round, RoundType } from '@/domain/types';

/**
 * In-app navigation state (REQ-P3): no URL-based routing, no reliance on
 * browser back. Hardware back button handling (Android) is deferred — it
 * needs @capacitor/app, which isn't part of the native plugin set built so
 * far (§2.0.1).
 */
type Screen =
  | { name: 'home' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'reading'; round: Round };

function describeFailure(error: unknown): string {
  if (error instanceof MissingApiKeyError) return error.message;
  // REQ-17: a schema failure surfaces as a user-facing error with the raw
  // response available for inspection — it is attached to the thrown error.
  if (error instanceof LlmValidationError) {
    return 'The model returned a response that did not match the expected shape. Try again.';
  }
  return error instanceof Error ? error.message : 'Round generation failed.';
}

function AppScreens() {
  const config = useConfig();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [generating, setGenerating] = useState<RoundType | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const handleStartRound = useCallback(
    (roundType: RoundType) => {
      setFailure(null);
      setGenerating(roundType);
      createRound(roundType, config)
        .then((round) => setScreen({ name: 'reading', round }))
        .catch((error: unknown) => setFailure(describeFailure(error)))
        .finally(() => setGenerating(null));
    },
    [config],
  );

  // REQ-I6: history-only rounds carry no segments and are not re-readable.
  const handleReplayRound = useCallback((round: Round) => {
    if (round.segments.length === 0) {
      setFailure('That round is history only — its text was not stored.');
      return;
    }
    setFailure(null);
    setScreen({ name: 'reading', round });
  }, []);

  const handleFinishReading = useCallback(
    (round: Round, notKnownIndices: number[]) => {
      void finishRound(round, notKnownIndices);
      setScreen({ name: 'home' }); // REQ-14: completing any activity returns here
    },
    [],
  );

  const handleBackHome = useCallback(() => setScreen({ name: 'home' }), []);

  if (screen.name === 'stats') {
    return <StatsScreen onBack={handleBackHome} onReplayRound={handleReplayRound} />;
  }

  if (screen.name === 'settings') {
    return <SettingsScreen onBack={handleBackHome} />;
  }

  if (screen.name === 'reading') {
    const { round } = screen;
    return (
      <ReadingScreen
        segments={round.segments}
        titleAr={round.titleAr}
        titleEn={round.titleEn}
        onFinish={(notKnownIndices) => handleFinishReading(round, notKnownIndices)}
      />
    );
  }

  return (
    <HomeScreen
      onStartRound={handleStartRound}
      onReplayRound={handleReplayRound}
      onOpenStats={() => setScreen({ name: 'stats' })}
      onOpenSettings={() => setScreen({ name: 'settings' })}
      generating={generating}
      failure={failure}
    />
  );
}

export function App() {
  return (
    <ConfigProvider>
      <AppScreens />
    </ConfigProvider>
  );
}
