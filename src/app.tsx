import { useCallback, useState } from 'react';
import { ConfigProvider, useConfig } from '@/ui/context/ConfigContext';
import { HomeScreen } from '@/ui/screens/HomeScreen';
import { ReadingScreen } from '@/ui/screens/ReadingScreen';
import { StatsScreen } from '@/ui/screens/StatsScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { DrillScreen } from '@/ui/screens/DrillScreen';
import { LibraryScreen } from '@/ui/screens/LibraryScreen';
import { ArticleMedia } from '@/ui/components/ArticleMedia';
import { createRound, finishRound } from '@/services/rounds/roundService';
import { generateBatch, startDrillSession } from '@/services/batch/batchService';
import { openArticle, finishArticle } from '@/services/articles/articleService';
import type { Article } from '@/domain/articles/types';
import type { ResolvedSegment } from '@/domain/articles/segment';
import type { QueueEntry } from '@/domain/drills/session';
import { describeFailure, type Failure } from '@/ui/failure';
import type { Round, RoundType, Word } from '@/domain/types';

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
  | { name: 'library' }
  | { name: 'reading'; round: Round }
  | {
      name: 'article';
      article: Article;
      segments: ResolvedSegment[];
      flaggedIndices: number[];
    }
  | {
      name: 'drill';
      queue: QueueEntry[];
      corpus: Word[];
      sentences: Readonly<Record<string, string>>;
    };

function AppScreens() {
  const config = useConfig();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [generating, setGenerating] = useState<RoundType | null>(null);
  const [busy, setBusy] = useState<'batch' | 'study' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Bumped after anything that writes to the corpus, so Home re-reads its
  // status strip instead of showing figures from when it first mounted.
  const [refreshToken, setRefreshToken] = useState(0);
  const [openingArticle, setOpeningArticle] = useState<string | null>(null);

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
      setFailure({
        message: 'That round is history only — its text was not stored.',
        detail: null,
        settingsWillHelp: false,
      });
      return;
    }
    setFailure(null);
    setScreen({ name: 'reading', round });
  }, []);

  const handleFinishReading = useCallback(
    (round: Round, notKnownIndices: number[]) => {
      void finishRound(round, notKnownIndices).then(() => setRefreshToken((n) => n + 1));
      setScreen({ name: 'home' }); // REQ-14: completing any activity returns here
    },
    [],
  );

  // Clearing the advisory on navigation matters: it names a precondition the
  // user has just gone off to fix, so leaving it up makes a successful fix look
  // like a failed one.
  // REQ-20: batch generation runs only from this action, never on a schedule.
  const handleGenerateBatch = useCallback(() => {
    setFailure(null);
    setBusy('batch');
    generateBatch(config)
      .then((result) => {
        const warning = result.oversized ? ' Batch is past the recommended size.' : '';
        const gaps = result.missingSentences > 0
          ? ` ${result.missingSentences} card(s) have no example sentence.`
          : '';
        setNotice(`Batch ready: ${result.batch.wordIds.length} cards.${warning}${gaps}`);
        setRefreshToken((n) => n + 1);
      })
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setBusy(null));
  }, [config]);

  const handleStudyBatch = useCallback(() => {
    setFailure(null);
    setBusy('study');
    startDrillSession()
      .then((session) => {
        if (session.queue.length === 0) {
          setNotice('Nothing to drill yet — generate a batch first.');
          return;
        }
        setScreen({
          name: 'drill',
          queue: session.queue,
          corpus: session.corpus,
          sentences: session.batch?.exampleSentences ?? {},
        });
      })
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setBusy(null));
  }, []);

  // Articles are third-party reading material, not generated rounds: they never
  // reach the selector. What they do share is the corpus — finishing one writes
  // Words through the same ingestion a round uses.
  const handleOpenArticle = useCallback((id: string) => {
    setFailure(null);
    setOpeningArticle(id);
    openArticle(id)
      .then(({ article, segments, flaggedIndices }) =>
        setScreen({ name: 'article', article, segments, flaggedIndices }),
      )
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setOpeningArticle(null));
  }, []);

  const handleFinishArticle = useCallback(
    (article: Article, segments: ResolvedSegment[], notKnownIndices: number[]) => {
      void finishArticle(article, segments, notKnownIndices).then(() =>
        setRefreshToken((n) => n + 1),
      );
      setScreen({ name: 'home' }); // REQ-14
    },
    [],
  );

  const handleBackHome = useCallback(() => {
    setFailure(null);
    setNotice(null);
    // Returning from a drill or a round means the corpus likely moved.
    setRefreshToken((n) => n + 1);
    setScreen({ name: 'home' });
  }, []);

  const handleOpenSettings = useCallback(() => {
    setFailure(null);
    setScreen({ name: 'settings' });
  }, []);

  if (screen.name === 'stats') {
    return <StatsScreen onBack={handleBackHome} onReplayRound={handleReplayRound} />;
  }

  if (screen.name === 'library') {
    return (
      <LibraryScreen
        onBack={handleBackHome}
        onOpenArticle={handleOpenArticle}
        opening={openingArticle}
      />
    );
  }

  if (screen.name === 'article') {
    const { article, segments, flaggedIndices } = screen;
    return (
      <ReadingScreen
        segments={segments}
        titleAr={article.titleAr}
        titleEn={article.titleEn ?? ''}
        initialNotKnown={flaggedIndices}
        media={
          <ArticleMedia
            imageUrl={article.imageUrl}
            videoUrl={article.videoUrl}
            title={article.titleEn ?? article.titleAr}
          />
        }
        attribution={{ label: 'Al Jazeera Learning Arabic — read the original', url: article.sourceUrl }}
        onFinish={(notKnownIndices) => handleFinishArticle(article, segments, notKnownIndices)}
      />
    );
  }

  if (screen.name === 'settings') {
    return <SettingsScreen onBack={handleBackHome} />;
  }

  if (screen.name === 'drill') {
    return (
      <DrillScreen
        queue={screen.queue}
        corpus={screen.corpus}
        sentences={screen.sentences}
        onExit={handleBackHome}
      />
    );
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
      onOpenLibrary={() => setScreen({ name: 'library' })}
      onOpenSettings={handleOpenSettings}
      generating={generating}
      busy={busy}
      notice={notice}
      onGenerateBatch={handleGenerateBatch}
      onStudyBatch={handleStudyBatch}
      refreshToken={refreshToken}
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
