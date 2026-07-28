import type { Segment } from '@/domain/types';
import { PARAGRAPH_BREAK } from '@/domain/types';

/**
 * Hand-transcribed excerpt from the reference implementation's first
 * article (docs/reference_reader.jsx), used to prove RTL rendering and tap
 * logging on-device before the real generation flow is wired to a round
 * (§8, build order step 5: "against hardcoded segments"). Not representative
 * of the generation pipeline — segments here are transcribed, not LLM output.
 */
export const DEMO_TITLE_AR = 'حِوَارٌ مَعَ بَاحِثَةٍ فِي الذَّكَاءِ الِاصْطِنَاعِيِّ';
export const DEMO_TITLE_EN = 'An Interview with an AI Researcher';

export const DEMO_SEGMENTS: Segment[] = [
  { text: 'س:', gloss: null, forms: null },
  { text: 'دَكْتُورَة', gloss: 'Doctor', forms: 'دُكْتُور / دَكَاتِرَة' },
  { text: 'هُدَى', gloss: 'Huda', forms: null },
  { text: '،', gloss: null, forms: null },
  { text: 'أَنْتِ', gloss: 'you', forms: null },
  { text: 'بَاحِثَةٌ', gloss: 'a researcher', forms: 'بَاحِث / بَاحِثُون' },
  { text: 'فِي', gloss: 'in', forms: null },
  { text: 'مَجَالِ', gloss: 'the field of', forms: 'مَجَال / مَجَالَات' },
  { text: 'الذَّكَاءِ', gloss: 'intelligence', forms: 'ذَكِيّ / أَذْكِيَاء' },
  { text: 'الِاصْطِنَاعِيِّ', gloss: 'artificial', forms: 'صَنَعَ / يَصْنَعُ / اِصْطِنَاع' },
  { text: '.', gloss: null, forms: null },
  { text: 'مَا', gloss: 'what', forms: null },
  { text: 'الَّذِي', gloss: '—', forms: null },
  { text: 'دَفَعَكِ', gloss: 'drew you', forms: 'دَفَعَ / يَدْفَعُ / دَفْع' },
  { text: 'إِلَى', gloss: 'to', forms: null },
  { text: 'هَذَا', gloss: 'this', forms: null },
  { text: 'الِاتِّجَاهِ', gloss: 'direction', forms: 'اِتَّجَهَ / يَتَّجِهُ / اِتِّجَاه' },
  { text: '؟', gloss: null, forms: null },
  { text: PARAGRAPH_BREAK, gloss: null, forms: null },
  { text: 'ج:', gloss: null, forms: null },
  { text: 'فِي', gloss: 'in', forms: null },
  { text: 'الْبِدَايَةِ', gloss: 'the beginning', forms: 'بَدَأَ / يَبْدَأُ / بِدَايَة' },
  { text: 'كُنْتُ', gloss: 'I was', forms: 'كَانَ / يَكُونُ' },
  { text: 'أَدْرُسُ', gloss: 'studying', forms: 'دَرَسَ / يَدْرُسُ / دِرَاسَة' },
  { text: 'اللُّغَاتِ', gloss: 'languages', forms: 'لُغَة / لُغَات' },
  { text: '،', gloss: null, forms: null },
  { text: 'وَ', gloss: 'and', forms: null },
  { text: 'لَمْ', gloss: 'did not', forms: null },
  { text: 'أَتَوَقَّعْ', gloss: 'expect', forms: 'تَوَقَّعَ / يَتَوَقَّعُ / تَوَقُّع' },
  { text: 'أَنْ', gloss: 'to', forms: null },
  { text: 'أَعْمَلَ', gloss: 'work', forms: 'عَمِلَ / يَعْمَلُ / عَمَل' },
  { text: 'فِي', gloss: 'in', forms: null },
  { text: 'التِّقْنِيَةِ', gloss: 'technology', forms: 'تِقْنِيَة / تِقْنِيَات' },
  { text: 'أَبَدًا', gloss: 'at all', forms: null },
  { text: '.', gloss: null, forms: null },
  { text: 'ثُمَّ', gloss: 'then', forms: null },
  { text: 'قَرَأْتُ', gloss: 'I read', forms: 'قَرَأَ / يَقْرَأُ / قِرَاءَة' },
  { text: 'بَحْثًا', gloss: 'a study', forms: 'بَحَثَ / يَبْحَثُ / بَحْث' },
  { text: 'أَجْرَاهُ', gloss: 'conducted by', forms: 'أَجْرَى / يُجْرِي / إِجْرَاء' },
  { text: 'فَرِيقٌ', gloss: 'a team', forms: 'فَرِيق / فِرَق' },
  { text: 'أَلْمَانِيٌّ', gloss: 'German', forms: 'أَلْمَانِيّ / أَلْمَان' },
  { text: 'عَنْ', gloss: 'about', forms: null },
  { text: 'التَّرْجَمَةِ', gloss: 'translation', forms: 'تَرْجَمَ / يُتَرْجِمُ / تَرْجَمَة' },
  { text: 'الْآلِيَّةِ', gloss: 'machine', forms: 'آلَة / آلَات' },
  { text: '،', gloss: null, forms: null },
  { text: 'وَ', gloss: 'and', forms: null },
  { text: 'تَغَيَّرَ', gloss: 'changed', forms: 'تَغَيَّرَ / يَتَغَيَّرُ / تَغَيُّر' },
  { text: 'كُلُّ', gloss: 'everything', forms: null },
  { text: 'شَيْءٍ', gloss: '—', forms: null },
  { text: '.', gloss: null, forms: null },
];
