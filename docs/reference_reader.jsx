import React, { useState } from "react";

/* ============================================================
   ARTICLE DATA — the only part that changes between sets.
   Each entry is [arabic, english_or_null, isNew_boolean?, forms?]
   - null english        = punctuation, rendered with no leading space
   - isNew = true        = vocabulary outside the existing deck
                           (must NOT share a root with an existing card)
   - forms (verbs)       = "ماضٍ / مضارع(هو)"
   - forms (nouns)       = "مفرد / جمع"
   - forms omitted       = particles, pronouns, adverbials

   TOPIC CLUSTER: travel (سفر وسياحة)
   Narrow reading — travel vocabulary recurs across all three articles
   so each new word gets repeated encounters, not a single exposure.
   Topics graded down from real Al Jazeera سياحة وسفر coverage.
   ============================================================ */
const ARTICLES = [
  {
    title: "حِوَارٌ مَعَ بَاحِثَةٍ فِي الذَّكَاءِ الِاصْطِنَاعِيِّ",
    titleEn: "An Interview with an AI Researcher",
    segments: [
      ["س:", null],
      ["دَكْتُورَة", "Doctor", true, "دُكْتُور / دَكَاتِرَة"],
      [" ", null],
      ["هُدَى", "Huda"],
      ["،", null],
      [" ", null],
      ["أَنْتِ", "you"],
      [" ", null],
      ["بَاحِثَةٌ", "a researcher", true, "بَاحِث / بَاحِثُون"],
      [" ", null],
      ["فِي", "in"],
      [" ", null],
      ["مَجَالِ", "the field of", false, "مَجَال / مَجَالَات"],
      [" ", null],
      ["الذَّكَاءِ", "intelligence", true, "ذَكِيّ / أَذْكِيَاء"],
      [" ", null],
      ["الِاصْطِنَاعِيِّ", "artificial", true, "صَنَعَ / يَصْنَعُ / اِصْطِنَاع"],
      [".", null],
      [" ", null],
      ["مَا", "what"],
      [" ", null],
      ["الَّذِي", "—"],
      [" ", null],
      ["دَفَعَكِ", "drew you", true, "دَفَعَ / يَدْفَعُ / دَفْع"],
      [" ", null],
      ["إِلَى", "to"],
      [" ", null],
      ["هَذَا", "this"],
      [" ", null],
      ["الِاتِّجَاهِ", "direction", false, "اِتَّجَهَ / يَتَّجِهُ / اِتِّجَاه"],
      ["؟", null],
      ["¶", null],

      ["ج:", null],
      ["فِي", "in"],
      [" ", null],
      ["الْبِدَايَةِ", "the beginning", false, "بَدَأَ / يَبْدَأُ / بِدَايَة"],
      [" ", null],
      ["كُنْتُ", "I was", false, "كَانَ / يَكُونُ"],
      [" ", null],
      ["أَدْرُسُ", "studying", false, "دَرَسَ / يَدْرُسُ / دِرَاسَة"],
      [" ", null],
      ["اللُّغَاتِ", "languages", false, "لُغَة / لُغَات"],
      ["،", null],
      [" ", null],
      ["وَ", "and"],
      ["لَمْ", "did not"],
      [" ", null],
      ["أَتَوَقَّعْ", "expect", false, "تَوَقَّعَ / يَتَوَقَّعُ / تَوَقُّع"],
      [" ", null],
      ["أَنْ", "to"],
      [" ", null],
      ["أَعْمَلَ", "work", false, "عَمِلَ / يَعْمَلُ / عَمَل"],
      [" ", null],
      ["فِي", "in"],
      [" ", null],
      ["التِّقْنِيَةِ", "technology", true, "تِقْنِيَة / تِقْنِيَات"],
      [" ", null],
      ["أَبَدًا", "at all"],
      [".", null],
      [" ", null],
      ["ثُمَّ", "then"],
      [" ", null],
      ["قَرَأْتُ", "I read", false, "قَرَأَ / يَقْرَأُ / قِرَاءَة"],
      [" ", null],
      ["بَحْثًا", "a study", false, "بَحَثَ / يَبْحَثُ / بَحْث"],
      [" ", null],
      ["أَجْرَاهُ", "conducted by", false, "أَجْرَى / يُجْرِي / إِجْرَاء"],
      [" ", null],
      ["فَرِيقٌ", "a team", false, "فَرِيق / فِرَق"],
      [" ", null],
      ["أَلْمَانِيٌّ", "German", true, "أَلْمَانِيّ / أَلْمَان"],
      [" ", null],
      ["عَنْ", "about"],
      [" ", null],
      ["التَّرْجَمَةِ", "translation", true, "تَرْجَمَ / يُتَرْجِمُ / تَرْجَمَة"],
      [" ", null],
      ["الْآلِيَّةِ", "machine", true, "آلَة / آلَات"],
      ["،", null],
      [" ", null],
      ["وَ", "and"],
      ["تَغَيَّرَ", "changed", false, "تَغَيَّرَ / يَتَغَيَّرُ / تَغَيُّر"],
      [" ", null],
      ["كُلُّ", "everything"],
      [" ", null],
      ["شَيْءٍ", "—"],
      [".", null],
      ["¶", null],

      ["س:", null],
      ["وَ", "and"],
      ["هَلْ", "did"],
      [" ", null],
      ["تَرَدَّدْتِ", "you hesitate", false, "تَرَدَّدَ / يَتَرَدَّدُ / تَرَدُّد"],
      [" ", null],
      ["قَبْلَ", "before"],
      [" ", null],
      ["تَغْيِيرِ", "changing", false, "غَيَّرَ / يُغَيِّرُ / تَغْيِير"],
      [" ", null],
      ["مَجَالِكِ", "your field", false, "مَجَال / مَجَالَات"],
      ["؟", null],
      ["¶", null],

      ["ج:", null],
      ["كَثِيرًا", "a great deal"],
      [".", null],
      [" ", null],
      ["كَانَ", "there was", false, "كَانَ / يَكُونُ"],
      [" ", null],
      ["عِنْدِي", "I had"],
      [" ", null],
      ["تَرَدُّدٌ", "hesitation", false, "تَرَدَّدَ / يَتَرَدَّدُ / تَرَدُّد"],
      [" ", null],
      ["كَبِيرٌ", "great"],
      ["،", null],
      [" ", null],
      ["لِأَنَّ", "because"],
      [" ", null],
      ["الْمَسْؤُولَ", "the head", false, "مَسْؤُول / مَسْؤُولُون"],
      [" ", null],
      ["عَنْ", "of"],
      [" ", null],
      ["قِسْمِي", "my department", false, "قِسْم / أَقْسَام"],
      [" ", null],
      ["قَالَ", "said", false, "قَالَ / يَقُولُ / قَوْل"],
      [" ", null],
      ["لِي", "to me"],
      [" ", null],
      ["إِنَّ", "that"],
      [" ", null],
      ["الْأَمْرَ", "the matter"],
      [" ", null],
      ["صَعْبٌ", "is difficult", false, "صَعْب / صَعْبَة"],
      [".", null],
      [" ", null],
      ["وَ", "and"],
      ["لَكِنَّهُ", "he"],
      [" ", null],
      ["كَانَ", "was", false, "كَانَ / يَكُونُ"],
      [" ", null],
      ["مُحِقًّا", "right", false, "حَقّ / حُقُوق"],
      [" ", null],
      ["بِالضَّبْطِ", "exactly"],
      [":", null],
      [" ", null],
      ["السَّنَةُ", "the year", false, "سَنَة / سِنِينَ"],
      [" ", null],
      ["الْأُولَى", "first", false, "أَوَّل / أُولَى"],
      [" ", null],
      ["كَانَتْ", "was", false, "كَانَ / يَكُونُ"],
      [" ", null],
      ["مُتْعِبَةً", "exhausting", false, "تَعِبَ / يَتْعَبُ / تَعَب"],
      [" ", null],
      ["جِدًّا", "very"],
      [".", null],
      ["¶", null],

      ["س:", null],
      ["كَيْفَ", "how"],
      [" ", null],
      ["تَصِفِينَ", "would you describe", true, "وَصَفَ / يَصِفُ / وَصْف"],
      [" ", null],
      ["عَمَلَكِ", "your work", false, "عَمِلَ / يَعْمَلُ / عَمَل"],
      [" ", null],
      ["لِشَخْصٍ", "to someone", false, "شَخْص / أَشْخَاص"],
      [" ", null],
      ["لَا", "who does not"],
      [" ", null],
      ["يَعْرِفُ", "know", false, "عَرَفَ / يَعْرِفُ / مَعْرِفَة"],
      [" ", null],
      ["شَيْئًا", "anything"],
      [" ", null],
      ["عَنِ", "about"],
      [" ", null],
      ["التِّقْنِيَةِ", "technology", false, "تِقْنِيَة / تِقْنِيَات"],
      ["؟", null],
      ["¶", null],

      ["ج:", null],
      ["أَقُولُ", "I say", false, "قَالَ / يَقُولُ / قَوْل"],
      [" ", null],
      ["إِنَّنَا", "that we"],
      [" ", null],
      ["نُعَلِّمُ", "teach", false, "عَلَّمَ / يُعَلِّمُ / تَعْلِيم"],
      [" ", null],
      ["الْآلَةَ", "the machine", false, "آلَة / آلَات"],
      [" ", null],
      ["أَنْ", "to"],
      [" ", null],
      ["تُلَاحِظَ", "notice", false, "لَاحَظَ / يُلَاحِظُ / مُلَاحَظَة"],
      [" ", null],
      ["أَنْمَاطًا", "patterns", true, "نَمَط / أَنْمَاط"],
      [" ", null],
      ["فِي", "in"],
      [" ", null],
      ["كَمِّيَّةٍ", "a quantity", true, "كَمّ / كَمِّيَّات"],
      [" ", null],
      ["ضَخْمَةٍ", "huge", false, "ضَخْم / ضَخْمَة"],
      [" ", null],
      ["مِنَ", "of"],
      [" ", null],
      ["الْبَيَانَاتِ", "data", false, "بَيَان / بَيَانَات"],
      [".", null],
      [" ", null],
      ["هِيَ", "it"],
      [" ", null],
      ["لَا", "does not"],
      [" ", null],
      ["تَفْهَمُ", "understand", false, "فَهِمَ / يَفْهَمُ / فَهْم"],
      [" ", null],
      ["بِالْمَعْنَى", "in the sense", false, "عَنَى / يَعْنِي / مَعْنًى"],
      [" ", null],
      ["الَّذِي", "which"],
      [" ", null],
      ["نَفْهَمُ", "we understand", false, "فَهِمَ / يَفْهَمُ / فَهْم"],
      [" ", null],
      ["بِهِ", "by"],
      [" ", null],
      ["نَحْنُ", "ourselves"],
      ["،", null],
      [" ", null],
      ["وَ", "and"],
      ["هَذَا", "this"],
      [" ", null],
      ["الْجَانِبُ", "aspect", false, "جَانِب / جَوَانِب"],
      [" ", null],
      ["مُهِمٌّ", "is important", false, "مُهِمّ / مُهِمَّة"],
      [" ", null],
      ["جِدًّا", "very"],
      [".", null],
      ["¶", null],

      ["س:", null],
      ["هَلْ", "are"],
      [" ", null],
      ["أَنْتِ", "you"],
      [" ", null],
      ["قَلِقَةٌ", "worried", false, "قَلِقَ / يَقْلَقُ / قَلَق"],
      [" ", null],
      ["عَلَى", "about"],
      [" ", null],
      ["الْوَظَائِفِ", "jobs", false, "وَظِيفَة / وَظَائِف"],
      ["؟", null],
      [" ", null],
      ["كَثِيرُونَ", "many"],
      [" ", null],
      ["يَتَسَاءَلُونَ", "are wondering", false, "تَسَاءَلَ / يَتَسَاءَلُ / تَسَاؤُل"],
      [" ", null],
      ["عَنْ", "about"],
      [" ", null],
      ["ذَلِكَ", "that"],
      [".", null],
      ["¶", null],

      ["ج:", null],
      ["أَنَا", "I"],
      [" ", null],
      ["قَلِقَةٌ", "am worried", false, "قَلِقَ / يَقْلَقُ / قَلَق"],
      ["،", null],
      [" ", null],
      ["نَعَمْ", "yes"],
      ["،", null],
      [" ", null],
      ["وَ", "but"],
      ["لَكِنْ", "—"],
      [" ", null],
      ["لَيْسَ", "not"],
      [" ", null],
      ["بِالطَّرِيقَةِ", "in the way", false, "طَرِيق / طُرُق"],
      [" ", null],
      ["الَّتِي", "which"],
      [" ", null],
      ["يَتَوَقَّعُهَا", "people expect", false, "تَوَقَّعَ / يَتَوَقَّعُ / تَوَقُّع"],
      [" ", null],
      ["النَّاسُ", "—"],
      [".", null],
      [" ", null],
      ["الْمُشْكِلَةُ", "the problem", false, "مُشْكِلَة / مَشَاكِل"],
      [" ", null],
      ["لَيْسَتْ", "is not"],
      [" ", null],
      ["نَوْعًا", "a kind", false, "نَوْع / أَنْوَاع"],
      [" ", null],
      ["وَاحِدًا", "single"],
      ["،", null],
      [" ", null],
      ["بَلْ", "but"],
      [" ", null],
      ["أَنْوَاعٌ", "kinds", false, "نَوْع / أَنْوَاع"],
      [" ", null],
      ["كَثِيرَةٌ", "many"],
      [":", null],
      [" ", null],
      ["الْقَرَارَاتُ", "the decisions", false, "قَرَّرَ / يُقَرِّرُ / قَرَار"],
      [" ", null],
      ["الْإِدَارِيَّةُ", "administrative", false, "أَدَارَ / يُدِيرُ / إِدَارَة"],
      ["،", null],
      [" ", null],
      ["وَ", "and"],
      ["مَنْ", "who"],
      [" ", null],
      ["يَتَحَمَّلُ", "bears", false, "تَحَمَّلَ / يَتَحَمَّلُ / تَحَمُّل"],
      [" ", null],
      ["الْمَسْؤُولِيَّةَ", "responsibility", false, "مَسْؤُول / مَسْؤُولِيَّات"],
      [" ", null],
      ["حِينَ", "when"],
      [" ", null],
      ["يَحْدُثُ", "occurs", false, "حَدَثَ / يَحْدُثُ / حُدُوث"],
      [" ", null],
      ["خَطَأٌ", "an error", false, "خَطَأ / أَخْطَاء"],
      [".", null],
      ["¶", null],

      ["س:", null],
      ["سُؤَالٌ", "a question", false, "سُؤَال / أَسْئِلَة"],
      [" ", null],
      ["أَخِيرٌ", "final", false, "أَخِير / أَخِيرَة"],
      [":", null],
      [" ", null],
      ["مَا", "what"],
      [" ", null],
      ["نَصِيحَتُكِ", "is your advice", false, "نَصَحَ / يَنْصَحُ / نَصِيحَة"],
      [" ", null],
      ["لِلطُّلَّابِ", "for students", false, "طَالِب / طُلَّاب"],
      ["؟", null],
      ["¶", null],

      ["ج:", null],
      ["أَنْصَحُهُمْ", "I advise them", false, "نَصَحَ / يَنْصَحُ / نَصِيحَة"],
      [" ", null],
      ["بِتَحْدِيدِ", "to determine", false, "حَدَّدَ / يُحَدِّدُ / تَحْدِيد"],
      [" ", null],
      ["سُؤَالٍ", "a question", false, "سُؤَال / أَسْئِلَة"],
      [" ", null],
      ["يَهْتَمُّونَ", "they care", false, "اِهْتَمَّ / يَهْتَمُّ / اِهْتِمَام"],
      [" ", null],
      ["بِهِ", "about"],
      [" ", null],
      ["حَقًّا", "genuinely"],
      ["،", null],
      [" ", null],
      ["ثُمَّ", "then"],
      [" ", null],
      ["تَعَلُّمِ", "learning", false, "تَعَلَّمَ / يَتَعَلَّمُ / تَعَلُّم"],
      [" ", null],
      ["الْأَدَوَاتِ", "the tools", true, "أَدَاة / أَدَوَات"],
      [" ", null],
      ["الَّتِي", "which"],
      [" ", null],
      ["تُسَاعِدُهُمْ", "help them", false, "سَاعَدَ / يُسَاعِدُ / مُسَاعَدَة"],
      [" ", null],
      ["عَلَى", "in"],
      [" ", null],
      ["الْإِجَابَةِ", "answering", false, "أَجَابَ / يُجِيبُ / إِجَابَة"],
      ["،", null],
      [" ", null],
      ["لَا", "not"],
      [" ", null],
      ["الْعَكْسَ", "the reverse", true, "عَكَسَ / يَعْكِسُ / عَكْس"],
      [".", null],
      [" ", null],
      ["فَ", "for"],
      ["الْأَدَاةُ", "the tool", false, "أَدَاة / أَدَوَات"],
      [" ", null],
      ["عَلَى", "at"],
      [" ", null],
      ["الْأَقَلِّ", "the least"],
      [" ", null],
      ["تَتَغَيَّرُ", "changes", false, "تَغَيَّرَ / يَتَغَيَّرُ / تَغَيُّر"],
      [" ", null],
      ["كُلَّ", "every"],
      [" ", null],
      ["سَنَةٍ", "year", false, "سَنَة / سِنِينَ"],
      ["،", null],
      [" ", null],
      ["أَمَّا", "as for"],
      [" ", null],
      ["السُّؤَالُ", "the question", false, "سُؤَال / أَسْئِلَة"],
      [" ", null],
      ["الْجَيِّدُ", "good"],
      [" ", null],
      ["فَ", "it"],
      ["يَبْقَى", "remains", false, "بَقِيَ / يَبْقَى / بَقَاء"],
      [".", null],
    ],
  },
];
/* ============================================================
   END ARTICLE DATA
   ============================================================ */

export default function ArabicReader() {
  const [active, setActive] = useState(0);
  const [tapped, setTapped] = useState(null);
  const [revealAll, setRevealAll] = useState(false);
  const [seen, setSeen] = useState({});
  const [tracked, setTracked] = useState({});
  const [showList, setShowList] = useState(false);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get("tracked-words", false);
        if (result && result.value) setTracked(JSON.parse(result.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const persistTracked = async (next) => {
    setTracked(next);
    try {
      await window.storage.set("tracked-words", JSON.stringify(next), false);
    } catch (e) {
      console.error("Failed to save tracked words", e);
    }
  };

  const toggleTrack = (word) => {
    const key = word.ar;
    const next = { ...tracked };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = { ar: word.ar, en: word.en, forms: word.forms || null };
    }
    persistTracked(next);
  };

  const [copyStatus, setCopyStatus] = useState("");
  const copyTrackedList = async () => {
    const items = Object.values(tracked);
    if (items.length === 0) return;
    const text = items.map((w) => `${w.ar} — ${w.en}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied!");
    } catch (e) {
      setCopyStatus("copy failed — select manually");
    }
    setTimeout(() => setCopyStatus(""), 2000);
  };

  const story = ARTICLES[active];
  const trackedCount = Object.keys(tracked).length;

  const handleTap = (seg, idx) => {
    if (seg[1] === null) return;
    setTapped({ ar: seg[0], en: seg[1], isNew: !!seg[2], forms: seg[3] || null });
    setSeen((s) => ({ ...s, [`${active}-${idx}`]: true }));
  };

  const switchTo = (i) => {
    setActive(i);
    setTapped(null);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#EDE4CF",
        fontFamily: "'Lora', Georgia, serif",
        color: "#2B2118",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0 0 110px",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Lora:ital@0;1&display=swap"
        rel="stylesheet"
      />

      <div style={{ width: "100%", maxWidth: 640, padding: "24px 24px 6px" }}>
        <p
          style={{
            textAlign: "center",
            margin: "0 0 14px",
            fontSize: "0.7rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#8A7757",
          }}
        >
          travel cluster · {active + 1} of {ARTICLES.length}
        </p>

        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 18 }}>
          {ARTICLES.map((a, i) => (
            <button
              key={i}
              onClick={() => switchTo(i)}
              style={{
                flex: 1,
                border: "1px solid",
                background: i === active ? "#1F5E5B" : "transparent",
                color: i === active ? "#EDE4CF" : "#6B5B44",
                borderColor: i === active ? "#1F5E5B" : "#B08D4F",
                borderRadius: 4,
                padding: "7px 4px",
                fontSize: "0.72rem",
                cursor: "pointer",
                fontFamily: "'Lora', serif",
                lineHeight: 1.3,
              }}
            >
              {a.titleEn}
            </button>
          ))}
        </div>

        <svg width="100%" height="24" viewBox="0 0 640 24" style={{ display: "block" }}>
          <line x1="0" y1="12" x2="278" y2="12" stroke="#B08D4F" strokeWidth="1.5" />
          <line x1="362" y1="12" x2="640" y2="12" stroke="#B08D4F" strokeWidth="1.5" />
          <g transform="translate(320,12)">
            <circle r="10" fill="none" stroke="#B08D4F" strokeWidth="1.5" />
            <circle r="4.5" fill="#1F5E5B" />
          </g>
        </svg>

        <h1
          style={{
            fontFamily: "'Amiri', serif",
            fontWeight: 700,
            fontSize: "2.1rem",
            textAlign: "center",
            margin: "12px 0 4px",
            direction: "rtl",
          }}
        >
          {story.title}
        </h1>
        <p
          style={{
            textAlign: "center",
            margin: 0,
            fontStyle: "italic",
            color: "#6B5B44",
            fontSize: "0.9rem",
          }}
        >
          {story.titleEn}
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
            marginTop: 16,
            fontSize: "0.76rem",
            color: "#6B5B44",
          }}
        >
          <span>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#1F5E5B",
                marginInlineEnd: 6,
              }}
            />
            new vocabulary
          </span>
          <button
            onClick={() => setRevealAll((r) => !r)}
            style={{
              border: "1px solid #B08D4F",
              background: revealAll ? "#B08D4F" : "transparent",
              color: revealAll ? "#EDE4CF" : "#6B5B44",
              borderRadius: 4,
              padding: "3px 10px",
              fontSize: "0.76rem",
              cursor: "pointer",
              fontFamily: "'Lora', serif",
            }}
          >
            {revealAll ? "hide all" : "reveal all"}
          </button>
          <button
            onClick={() => setShowList((s) => !s)}
            style={{
              border: "1px solid #1F5E5B",
              background: showList ? "#1F5E5B" : "transparent",
              color: showList ? "#EDE4CF" : "#1F5E5B",
              borderRadius: 4,
              padding: "3px 10px",
              fontSize: "0.76rem",
              cursor: "pointer",
              fontFamily: "'Lora', serif",
            }}
          >
            my list {trackedCount > 0 ? `(${trackedCount})` : ""}
          </button>
        </div>
      </div>

      {showList && (
        <div
          style={{
            maxWidth: 640,
            width: "100%",
            padding: "0 24px 24px",
          }}
        >
          <div
            style={{
              border: "1px solid #B08D4F",
              borderRadius: 6,
              padding: "14px 16px",
              background: "rgba(255,255,255,0.35)",
            }}
          >
            {trackedCount === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "#8A7757", fontStyle: "italic", margin: 0 }}>
                Nothing tracked yet — tap a word, then tap "track" in the panel below.
              </p>
            ) : (
              <>
                <button
                  onClick={copyTrackedList}
                  style={{
                    display: "block",
                    width: "100%",
                    marginBottom: 10,
                    border: "1px solid #1F5E5B",
                    background: "#1F5E5B",
                    color: "#EDE4CF",
                    borderRadius: 4,
                    padding: "7px 10px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    fontFamily: "'Lora', serif",
                  }}
                >
                  {copyStatus || `copy tracked list (${trackedCount})`}
                </button>
                {Object.values(tracked).map((w, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom:
                        i < trackedCount - 1 ? "1px solid rgba(176,141,79,0.3)" : "none",
                    }}
                  >
                    <div>
                      <span dir="rtl" style={{ fontFamily: "'Amiri', serif", fontSize: "1.15rem" }}>
                        {w.ar}
                      </span>
                      <span style={{ fontSize: "0.85rem", color: "#6B5B44", marginInlineStart: 10 }}>
                        {w.en}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleTrack(w)}
                      style={{
                        border: "none",
                        background: "none",
                        color: "#B08D4F",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <div
        dir="rtl"
        style={{
          maxWidth: 640,
          width: "100%",
          padding: "22px 28px 40px",
          fontFamily: "'Amiri', serif",
          fontSize: "1.85rem",
          lineHeight: 2.45,
          textAlign: "justify",
        }}
      >
        {story.segments.map((seg, idx) => {
          const [ar, en, isNew] = seg;
          if (ar === "¶") {
            return <br key={idx} />;
          }
          if (en === null) {
            return (
              <span key={idx} style={{ marginInlineEnd: 2, fontWeight: ar.endsWith(":") ? 700 : 400, color: ar.endsWith(":") ? "#1F5E5B" : "inherit" }}>
                {ar}
              </span>
            );
          }
          const isTapped = seen[`${active}-${idx}`] || revealAll;
          return (
            <span key={idx} style={{ display: "inline-block" }}>
              <button
                onClick={() => handleTap(seg, idx)}
                style={{
                  background: isTapped
                    ? isNew
                      ? "rgba(31,94,91,0.15)"
                      : "rgba(176,141,79,0.18)"
                    : "transparent",
                  border: "none",
                  borderBottom: isNew ? "2px dotted #1F5E5B" : "1.5px dotted #B08D4F",
                  color: "#2B2118",
                  font: "inherit",
                  cursor: "pointer",
                  padding: "0 1px",
                  marginInlineEnd: 6,
                  borderRadius: 3,
                }}
              >
                {ar}
              </button>
            </span>
          );
        })}
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#2B2118",
          color: "#EDE4CF",
          padding: "13px 24px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 640, width: "100%", display: "flex", flexDirection: "column", gap: 4 }}>
          {tapped ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span
                  dir="rtl"
                  style={{ fontFamily: "'Amiri', serif", fontSize: "1.3rem", color: "#D8C9A3" }}
                >
                  {tapped.ar}
                </span>
                <span style={{ fontSize: "1rem" }}>{tapped.en}</span>
                {tapped.isNew && (
                  <span style={{ fontSize: "0.72rem", color: "#7FB8B4" }}>
                    new word
                  </span>
                )}
                <button
                  onClick={() => toggleTrack(tapped)}
                  style={{
                    marginInlineStart: "auto",
                    border: "1px solid #B08D4F",
                    background: tracked[tapped.ar] ? "#B08D4F" : "transparent",
                    color: tracked[tapped.ar] ? "#2B2118" : "#B08D4F",
                    borderRadius: 4,
                    padding: "2px 9px",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    fontFamily: "'Lora', serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tracked[tapped.ar] ? "✓ tracked" : "+ track"}
                </button>
              </div>
              {tapped.forms && (
                <div
                  dir="rtl"
                  style={{
                    fontSize: "0.95rem",
                    fontFamily: "'Amiri', serif",
                    color: "#B08D4F",
                    borderTop: "1px solid #4A3F30",
                    paddingTop: 4,
                  }}
                >
                  {tapped.forms}
                </div>
              )}
            </>
          ) : (
            <span style={{ fontSize: "0.9rem", color: "#9A8A6C", fontStyle: "italic" }}>
              tap a word to see its translation
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
