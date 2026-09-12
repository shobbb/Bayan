import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ConfigProvider, useConfig } from '@/ui/context/ConfigContext';
import { HomeScreen } from '@/ui/screens/HomeScreen';
import { ReadingScreen } from '@/ui/screens/ReadingScreen';
import { StatsScreen } from '@/ui/screens/StatsScreen';
import { SettingsScreen } from '@/ui/screens/SettingsScreen';
import { DrillScreen } from '@/ui/screens/DrillScreen';
import { LibraryScreen } from '@/ui/screens/LibraryScreen';
import { ArticleMedia } from '@/ui/components/ArticleMedia';
import { BottomNav, type NavTab } from '@/ui/components/BottomNav';
import { createRound, finishRound } from '@/services/rounds/roundService';
import { generateBatch, startDrillSession, studyOptions } from '@/services/batch/batchService';
import type { StudySourceId } from '@/domain/drills/studySources';
import { openArticle, finishArticle } from '@/services/articles/articleService';
import { backUpNow, getLastBackupAt } from '@/services/sync/backupService';
import { warmPlatformPlugins } from '@/services/platform/storage';
import { enrichArticle } from '@/services/articles/enrichGlosses';
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
  // The destinations, which are exactly the bottom-nav tabs. Anything with a
  // payload below is an activity: reached from a destination, and not a tab.
  | { name: NavTab }
  | { name: 'reading'; round: Round }
  | {
      name: 'article';
      article: Article;
      segments: ResolvedSegment[];
      flaggedIndices: number[];
      untranslated: number;
    }
  | {
      name: 'drill';
      queue: QueueEntry[];
      corpus: readonly Word[];
      sentences: Readonly<Record<string, string>>;
    };

function AppScreens() {
  const config = useConfig();
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [generating, setGenerating] = useState<RoundType | null>(null);
  const [busy, setBusy] = useState<'batch' | 'study' | 'sync' | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Bumped after anything that writes to the corpus, so Home re-reads its
  // status strip instead of showing figures from when it first mounted.
  const [refreshToken, setRefreshToken] = useState(0);
  const [openingArticle, setOpeningArticle] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  // The study choice: which sources are on offer, and whether it is open.
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyChoices, setStudyChoices] = useState<
    Awaited<ReturnType<typeof studyOptions>> | null
  >(null);
  // Kept apart from the Home advisory above. Enrichment is run from the reader,
  // and raising its outcome into state only Home renders is how a failed
  // translation came to look like a control that does nothing.
  const [enrichFailure, setEnrichFailure] = useState<Failure | null>(null);
  const [enrichNotice, setEnrichNotice] = useState<string | null>(null);

  // Fetches the code-split Capacitor plugin chunks now, while this page is
  // known to match what the server is serving. See warmPlatformPlugins.
  useEffect(() => {
    void warmPlatformPlugins();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getLastBackupAt().then((at) => {
      if (!cancelled) setLastBackupAt(at);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

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
        // Words met and flagged but never translated cannot be cards (REQ-23),
        // and staying silent about them makes a short batch look like a bug.
        const blocked = result.untranslated > 0
          ? ` ${result.untranslated} more are waiting on a translation.`
          : '';
        setNotice(
          `Batch ready: ${result.batch.wordIds.length} cards.${warning}${gaps}${blocked}`,
        );
        setRefreshToken((n) => n + 1);
      })
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setBusy(null));
  }, [config]);

  // Studying starts with a choice of what to study, so the primary action opens
  // that choice. The counts are read fresh each time it opens: they move with
  // every reading and every answered card, and a stale one would be choosing
  // between two numbers that are no longer true.
  const handleStudyBatch = useCallback(() => {
    setFailure(null);
    setNotice(null);
    setStudyOpen((open) => !open);
    setStudyChoices(null);
    setBusy('study');
    studyOptions(config)
      .then(setStudyChoices)
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setBusy(null));
  }, [config]);

  const handleChooseStudy = useCallback(
    (sourceId: StudySourceId) => {
      setFailure(null);
      setBusy('study');
      startDrillSession(sourceId, config)
        .then((session) => {
          if (session.queue.length === 0) {
            setNotice('Nothing to drill there yet.');
            return;
          }
          setStudyOpen(false);
          setScreen({
            name: 'drill',
            queue: session.queue,
            corpus: session.corpus,
            sentences: session.batch?.exampleSentences ?? {},
          });
        })
        .catch((error: unknown) => setFailure(describeFailure(error)))
        .finally(() => setBusy(null));
    },
    [config],
  );

  // The whole corpus as one blob (§13). Not automatic: writing over the only
  // backup is not something to do on a timer, and REQ-15 rules out background
  // work the learner did not ask for.
  const handleSyncNow = useCallback(() => {
    setFailure(null);
    setNotice(null);
    setBusy('sync');
    backUpNow(config.categories)
      .then((result) => {
        setNotice(`Backed up ${result.words} words and ${result.rounds} rounds.`);
        setRefreshToken((n) => n + 1);
      })
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setBusy(null));
  }, [config]);

  // Articles are third-party reading material, not generated rounds: they never
  // reach the selector. What they do share is the corpus — finishing one writes
  // Words through the same ingestion a round uses.
  const handleOpenArticle = useCallback((id: string) => {
    setFailure(null);
    setEnrichFailure(null);
    setEnrichNotice(null);
    setOpeningArticle(id);
    openArticle(id)
      .then(({ article, segments, flaggedIndices, untranslated }) =>
        setScreen({ name: 'article', article, segments, flaggedIndices, untranslated }),
      )
      .catch((error: unknown) => setFailure(describeFailure(error)))
      .finally(() => setOpeningArticle(null));
  }, []);

  // REQ-A10: asked for, never automatic — it is a model call on the reader's
  // own key, and REQ-15 rules out spending it unprompted.
  const handleEnrich = useCallback(() => {
    if (screen.name !== 'article') return;
    const { article, segments, flaggedIndices } = screen;
    setEnrichFailure(null);
    setEnrichNotice(null);
    setEnriching(true);
    enrichArticle(article, segments, config)
      .then(({ result, segments: filled }) => {
        setScreen({
          name: 'article',
          article,
          segments: filled,
          flaggedIndices,
          untranslated: result.requested - result.filled,
        });
        setEnrichNotice(`Translated ${result.filled} of ${result.requested} words.`);
      })
      .catch((error: unknown) => setEnrichFailure(describeFailure(error)))
      .finally(() => setEnriching(false));
  }, [screen, config]);

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

  const handleNavigate = useCallback((tab: NavTab) => {
    setFailure(null);
    setNotice(null);
    setStudyOpen(false);
    // Anything that writes to the corpus may have happened since these screens
    // last read it, so they re-read on every arrival.
    setRefreshToken((n) => n + 1);
    setScreen({ name: tab });
  }, []);

  const handleOpenSettings = useCallback(() => {
    setFailure(null);
    setScreen({ name: 'settings' });
  }, []);

  // The four destinations share the bar; reading and drilling do not (§5.1).
  const withNav = (tab: NavTab, view: ReactNode) => (
    <>
      {view}
      <BottomNav active={tab} onNavigate={handleNavigate} />
    </>
  );

  if (screen.name === 'stats') {
    return withNav('stats', <StatsScreen onReplayRound={handleReplayRound} />);
  }

  if (screen.name === 'library') {
    return withNav(
      'library',
      <LibraryScreen onOpenArticle={handleOpenArticle} opening={openingArticle} />,
    );
  }

  if (screen.name === 'article') {
    const { article, segments, flaggedIndices } = screen;
    return (
      <ReadingScreen
        segments={segments}
        titleAr={article.titleAr}
        initialNotKnown={flaggedIndices}
        onExit={{ label: 'Articles', run: () => setScreen({ name: 'library' }) }}
        enrich={{
          count: screen.untranslated,
          busy: enriching,
          run: handleEnrich,
          failure: enrichFailure,
          notice: enrichNotice,
          onOpenSettings: handleOpenSettings,
        }}
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
    return withNav('settings', <SettingsScreen />);
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
        onExit={{ label: 'Home', run: handleBackHome }}
        onFinish={(notKnownIndices) => handleFinishReading(round, notKnownIndices)}
      />
    );
  }

  return withNav(
    'home',
    <HomeScreen
      onStartRound={handleStartRound}
      onReplayRound={handleReplayRound}
      onOpenSettings={handleOpenSettings}
      generating={generating}
      busy={busy}
      notice={notice}
      onGenerateBatch={handleGenerateBatch}
      onStudyBatch={handleStudyBatch}
      studyOptions={studyChoices}
      studyOpen={studyOpen}
      onChooseStudy={handleChooseStudy}
      onSyncNow={handleSyncNow}
      lastBackupAt={lastBackupAt}
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
