/**
 * Every config value Settings can edit, as data (§13: "everything in
 * config/algorithm.ts and config/models.ts is editable here").
 *
 * A registry rather than hand-written JSX per field, for the same reason the
 * round types and drill modes are registries (REQ-E2): the view maps over this
 * list and never branches on which value it is rendering. Adding a config value
 * means adding a descriptor, and configFields.test.ts fails if a value is added
 * to the defaults without one — which is what keeps §13's "everything" true
 * over time rather than only on the day it was written.
 *
 * `help` restates what each value controls, mirroring the comments the config
 * modules carry for the same reason (REQ-C3). It is the only copy the learner
 * ever sees, so it says what moving the number does, not what it is named.
 */
import type { ConfigPath } from '@/config/overrides';
import type { QueryKind } from '@/config/models';
import type { RoundType } from '@/domain/types';

export interface NumberFieldSpec {
  kind: 'number';
  /** Smallest sensible value; the input clamps rather than rejecting. */
  min: number;
  max: number;
  step: number;
}

export interface TextFieldSpec {
  kind: 'text';
  placeholder: string;
}

export interface BooleanFieldSpec {
  kind: 'boolean';
}

export type ConfigFieldSpec = NumberFieldSpec | TextFieldSpec | BooleanFieldSpec;

export interface ConfigField {
  /** Stable identity for React keys and tests; the path joined by dots. */
  id: string;
  path: ConfigPath;
  label: string;
  help: string;
  spec: ConfigFieldSpec;
}

export interface ConfigFieldGroup {
  id: string;
  title: string;
  /** One line on what the group as a whole governs. */
  blurb: string;
  fields: ConfigField[];
}

function num(
  path: ConfigPath,
  label: string,
  help: string,
  bounds: Omit<NumberFieldSpec, 'kind'>,
): ConfigField {
  return { id: path.join('.'), path, label, help, spec: { kind: 'number', ...bounds } };
}

function text(path: ConfigPath, label: string, help: string, placeholder: string): ConfigField {
  return { id: path.join('.'), path, label, help, spec: { kind: 'text', placeholder } };
}

function bool(path: ConfigPath, label: string, help: string): ConfigField {
  return { id: path.join('.'), path, label, help, spec: { kind: 'boolean' } };
}

/** Model identifiers change often, so routes take free text rather than a fixed list. */
const QUERY_KINDS: ReadonlyArray<{ kind: QueryKind; label: string; help: string }> = [
  {
    kind: 'roundGeneration',
    label: 'Round generation',
    help: 'Writes the reading passage, its glosses, and its diacritics. Vowelling quality is the binding constraint on the whole method (REQ-C2), so this is the first route to escalate if output quality drops.',
  },
  {
    kind: 'sentenceGeneration',
    label: 'Sentence generation',
    help: 'Writes one example sentence per card, batched into a single call.',
  },
  {
    kind: 'wordGlossing',
    label: 'Word glossing',
    help: 'Translates words met in published articles that the publisher did not gloss. Batched, and only for the article being read.',
  },
  {
    kind: 'distractorGeneration',
    label: 'Distractor generation',
    help: 'Writes the wrong answers for multiple choice.',
  },
  {
    kind: 'diacritization',
    label: 'Diacritization',
    help: 'Re-vowels existing text. Unused until a round is imported unvowelled.',
  },
];

const ROUND_TYPES: ReadonlyArray<{ type: RoundType; label: string }> = [
  { type: 'explore', label: 'Explore' },
  { type: 'reinforcement', label: 'Reinforcement' },
  { type: 'pureReinforcement', label: 'Pure reinforcement' },
  { type: 'backlog', label: 'Backlog clearing' },
];

export const CONFIG_FIELD_GROUPS: readonly ConfigFieldGroup[] = [
  {
    id: 'models',
    title: 'Models',
    blurb:
      'One route per query kind, so cost and quality are traded off independently rather than one model app-wide. maxTokens is a ceiling, not a reservation — a generous one costs nothing on a short response and is the difference between working and not on a long one.',
    fields: QUERY_KINDS.flatMap(({ kind, label, help }) => [
      text(['models', kind, 'model'], `${label} — model`, help, 'claude-haiku-4-5'),
      num(['models', kind, 'maxTokens'], `${label} — max tokens`, 'Output ceiling. Too low and the response is cut off mid-JSON, which surfaces as a failed generation.', { min: 256, max: 64000, step: 256 }),
      num(['models', kind, 'temperature'], `${label} — temperature`, 'Higher is more varied, lower is more predictable.', { min: 0, max: 1, step: 0.1 }),
    ]),
  },
  {
    id: 'bandit',
    title: 'Category selection',
    blurb:
      'Which topic and format the next round is drawn from. The bandit is rewarded by difficulty, not success (REQ-30) — a category that produces flags is worth returning to.',
    fields: [
      num(
        ['algorithm', 'bandit', 'explorationConstant'],
        'Exploration constant',
        'Higher covers new categories faster; lower keeps returning to the ones already known to be hard.',
        { min: 0, max: 3, step: 0.05 },
      ),
    ],
  },
  {
    id: 'wordDraw',
    title: 'Word draw',
    blurb: 'Which vocabulary the next round is built around, once its category is chosen.',
    fields: [
      num(['algorithm', 'wordDraw', 'missRateWeight'], 'Miss-rate weight', 'How strongly words you have flagged before are pulled back in.', { min: 0, max: 3, step: 0.05 }),
      num(['algorithm', 'wordDraw', 'underSampledWeight'], 'Under-sampled weight', 'How strongly words seen only a few times are favoured, so new vocabulary keeps circulating.', { min: 0, max: 3, step: 0.05 }),
      num(['algorithm', 'wordDraw', 'stalenessWeight'], 'Staleness weight', 'How strongly long-unseen words are pulled back, so early vocabulary does not silently leave rotation (REQ-34).', { min: 0, max: 3, step: 0.05 }),
      num(['algorithm', 'wordDraw', 'sampleSize'], 'Words per round', 'How many target words each round is built around.', { min: 1, max: 60, step: 1 }),
    ],
  },
  {
    id: 'batch',
    title: 'Batch',
    blurb: 'How many cards a study batch holds, and which words it may draw from.',
    fields: [
      num(['algorithm', 'batch', 'defaultSize'], 'Batch size', 'Cards per generated batch. Retention degrades above the measured ceiling (REQ-21).', { min: 5, max: 200, step: 5 }),
      num(['algorithm', 'batch', 'warnAboveSize'], 'Warn above', 'Batch size at which generation flags fatigue. Does not block anything.', { min: 5, max: 200, step: 5 }),
      num(['algorithm', 'batch', 'markedWithinDays'], 'Marked within (days)', 'Build the batch only from words flagged “didn’t know” this recently — 7 drills the last week. 0 uses the whole corpus. Words flagged before the app recorded flag times are never in a window, since their date is unknown.', { min: 0, max: 365, step: 1 }),
    ],
  },
  {
    id: 'grading',
    title: 'Grading',
    blurb: 'How forgiving written answers are.',
    fields: [
      num(['algorithm', 'grading', 'maxLevenshteinDistance'], 'Typo tolerance', 'Edit distance still accepted as a typo rather than a miss (REQ-26). 0 requires an exact match.', { min: 0, max: 5, step: 1 }),
    ],
  },
  {
    id: 'drill',
    title: 'Study sessions',
    blurb: 'How a study session is paced.',
    fields: [
      num(['algorithm', 'drill', 'roundSize'], 'Cards per round', 'How many cards between checkpoints. Everything answered is saved as you go, so a checkpoint is a place to stop rather than a place to be scored.', { min: 3, max: 50, step: 1 }),
      num(['algorithm', 'drill', 'markedWithinDays'], 'Marked recently means', 'How far back the “Marked recently” study option reaches, in days. 7 is this week. Separate from the batch setting above: this narrows what a session studies, not what a new batch is built from.', { min: 1, max: 365, step: 1 }),
    ],
  },
  {
    id: 'generation',
    title: 'Round generation',
    blurb: 'Length and vocabulary mix of a generated round.',
    fields: [
      num(['generation', 'targetWordCount', 'min'], 'Minimum words', 'Shortest round the model is asked for.', { min: 20, max: 400, step: 10 }),
      num(['generation', 'targetWordCount', 'max'], 'Maximum words', 'Longest round the model is asked for. Raising this needs a matching rise in the round-generation token ceiling above.', { min: 20, max: 400, step: 10 }),
      num(['generation', 'maxValidationRetries'], 'Validation retries', 'Extra attempts when a response fails its schema. Each one is a full generation.', { min: 0, max: 3, step: 1 }),
      bool(['generation', 'requireFullDiacritics'], 'Require full diacritics', 'Whether the prompt insists on tashkeel on every word.'),
      ...ROUND_TYPES.map(({ type, label }) =>
        num(
          ['generation', 'newWordDensity', type],
          `${label} — new-word density`,
          'Share of the round that may be vocabulary you have not seen. 0 means reinforcement only.',
          { min: 0, max: 1, step: 0.01 },
        ),
      ),
    ],
  },
];

export const CONFIG_FIELDS: readonly ConfigField[] = CONFIG_FIELD_GROUPS.flatMap(
  (group) => group.fields,
);
