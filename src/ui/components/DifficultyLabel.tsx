import './DifficultyLabel.css';

export interface DifficultyStep {
  readonly level: number;
  readonly label: string;
}

/**
 * The five steps, in order. A registry rather than a switch (REQ-E2): adding a
 * step or renaming one is an edit here and nowhere else, and the view below
 * only ever looks the level up.
 *
 * The colour lives in CSS, keyed by the same number, so the palette stays in
 * tokens.css with every other colour in the app rather than being half here.
 */
export const DIFFICULTY_STEPS: readonly DifficultyStep[] = [
  { level: 1, label: 'Very easy' },
  { level: 2, label: 'Easy' },
  { level: 3, label: 'Medium' },
  { level: 4, label: 'Hard' },
  { level: 5, label: 'Very hard' },
];

export function difficultyStep(level: number | null): DifficultyStep | null {
  if (level === null) return null;
  return DIFFICULTY_STEPS.find((step) => step.level === level) ?? null;
}

/**
 * How hard this article is, as a word.
 *
 * Colour-coded but never colour-carried: the step is written out, so it reads
 * the same to someone who cannot separate the hues — which a green-to-red ramp
 * specifically has to answer for. Renders nothing at all when the level is
 * unknown, rather than inventing a middle.
 */
export function DifficultyLabel({ level }: { level: number | null }) {
  const step = difficultyStep(level);
  if (!step) return null;

  return (
    <span className={`difficulty difficulty--${step.level}`}>{step.label}</span>
  );
}
