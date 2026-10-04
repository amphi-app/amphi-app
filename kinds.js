/*
  kinds.js — deciding whether a ZEUS entry is a course, an exam, an event
  or a day off, and the English for the French words ZEUS uses.

  ZEUS knows each entry's real type, but never puts it in the exported file,
  so all we have is the title. These rules were written against real ZEUS
  titles (see tests/kinds.test.js). They will occasionally be wrong; when a
  title is misfiled, add it to the tests and adjust the words below.
*/

/** Lowercase with accents removed, so "Férié", "FERIE" and "férié" all
 *  become "ferie" and can be matched by one simple rule. */
function plain(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const DAY_OFF_WORDS = /\b(vacances?|feri(e|es)?|conges?)\b/;
const EXAM_WORDS = /\b(exams?|examens?|partiels?|controles?|rattrapages?|qcm|soutenances?|epreuves?)\b/;
// No "atelier" here: "Atelier SQL" is a weekly lab, and one-off
// "Atelier - ..." workshops are already caught by the appears-once rule.
const EVENT_WORDS = /\b(week|days?|semaine|journee|forum|conferences?|hackathon|presentation|challenge|reunion|welcome|accueil|visites?)\b/;

/**
 * "course", "exam", "event" or "dayoff".
 * `timesInFile` is how often this exact title appears in your timetable:
 * real courses repeat every week, so a title that appears only once
 * (like "JOURNÉE EPI'ACK") is treated as an event.
 */
function kindOf(title, timesInFile) {
  const text = plain(title);
  if (DAY_OFF_WORDS.test(text)) return "dayoff";
  if (EXAM_WORDS.test(text)) return "exam";
  if (EVENT_WORDS.test(text) || timesInFile === 1) return "event";
  return "course";
}

// ---------------------------------------------------------------------------
// Glossary: the French words in ZEUS titles, in English
// ---------------------------------------------------------------------------
// Each entry: the word as it appears in ZEUS, its English, and a rule that
// finds it in a plain (lowercase, no accents) title. `plural` gives both
// words when the title uses the plural. `cards: false` keeps an entry in the
// Home list only (the card already says it another way, like the group chip).
// `inTitle` builds the pair from what matched, for words with a number.
const GLOSSARY = [
  // Phrases come first, so their words aren't also translated one by one
  // ("Contrôle de cours" is a class test, not "Test · Class").
  { term: "Contrôle de cours de maths", english: "Maths class test", rule: /\bcontroles? de cours de maths?\b/ },
  { term: "Contrôle de cours", english: "Class test", rule: /\bcontroles? de cours\b/ },
  { term: "Contrôle continu", english: "Continuous assessment", rule: /\bcontroles? continus?\b/ },
  { term: "cf répartition sur Moodle", english: "see Moodle for which room you're in", rule: /\bcf\.? repartition sur moodle\b/ },
  { term: "Mi-semestre", english: "Mid-semester", rule: /\bmi[- ]semestres?\b/ },
  { term: "Systèmes d'information", english: "Information systems", rule: /\bsystemes? d.information\b/ },
  { term: "Forum stage", english: "Internship fair", rule: /\bforum stages?\b/ },
  { term: "Examen", english: "Exam", plural: ["Examens", "Exams"], rule: /\bexamens?\b/ },
  { term: "Partiel", english: "Midterm exam", plural: ["Partiels", "Midterm exams"], rule: /\bpartiels?\b/ },
  { term: "Contrôle", english: "Test", rule: /\bcontroles?\b/ },
  { term: "Épreuve", english: "Exam", rule: /\bepreuves?\b/ },
  { term: "QCM", english: "Multiple-choice quiz", rule: /\bqcm\b/ },
  { term: "Rattrapage", english: "Resit", plural: ["Rattrapages", "Resits"], rule: /\brattrapages?\b/ },
  { term: "Soutenance", english: "Project defence (you present your project)",
    plural: ["Soutenances", "Project defences"], rule: /\bsoutenances?\b/ },
  { term: "Férié", english: "Public holiday", rule: /\bferie(s)?\b/ },
  { term: "Vacances", english: "Holidays", rule: /\bvacances\b/ },
  { term: "Congé", english: "Day off", rule: /\bconges?\b/ },
  { term: "Cours", english: "Class", rule: /\bcours\b/ },
  { term: "CM", english: "Lecture", rule: /\bcm\b/ },
  { term: "TD", english: "Tutorial (exercises in a small group)", rule: /\btd\b/ },
  { term: "TP", english: "Lab (hands-on practice)", rule: /\btp\b/ },
  { term: "Tutorat", english: "Tutoring", rule: /\btutorat\b/ },
  { term: "Atelier", english: "Workshop", rule: /\bateliers?\b/ },
  { term: "Mineure", english: "Minor (elective track)", plural: ["Mineures", "Minors (elective tracks)"], rule: /\bmineures?\b/ },
  { term: "FLE", english: "French as a foreign language", rule: /\bfle\b/ },
  { term: "Initiation", english: "Introduction", rule: /\binitiation\b/ },
  { term: "Stage", english: "Internship", rule: /\bstages?\b/ },
  { term: "Soirée", english: "Evening event", rule: /\bsoirees?\b/ },
  { term: "Journée", english: "Day", rule: /\bjournees?\b/ },
  { term: "Semaine", english: "Week", rule: /\bsemaines?\b/ },
  { term: "Rentrée", english: "Start of term", rule: /\brentree\b/ },
  { term: "Réunion", english: "Meeting", rule: /\breunions?\b/ },
  { term: "Accueil", english: "Welcome", rule: /\baccueil\b/ },
  { term: "Délégués", english: "Class representatives", rule: /\bdelegues?\b/ },
  { term: "Répartition", english: "Allocation (which room or group you're in)", rule: /\brepartitions?\b/ },
  { term: "FISA", english: "Apprenticeship (work-study) track", rule: /\bfisa\b/ },
  { term: "Conférence", english: "Talk", rule: /\bconferences?\b/ },
  // Subjects (look-alikes such as "Compilation" are left out)
  { term: "Réseaux", english: "Networks", rule: /\breseaux?\b/ },
  { term: "Algorithmique", english: "Algorithms", rule: /\balgorithmique\b/ },
  { term: "Programmation", english: "Programming", rule: /\bprogrammation\b/ },
  { term: "Mathématiques", english: "Mathematics", rule: /\bmathematiques\b/ },
  { term: "Probabilités", english: "Probability", rule: /\bprobabilites?\b/ },
  { term: "Statistiques", english: "Statistics", rule: /\bstatistiques?\b/ },
  { term: "Analyse", english: "Analysis (in maths: calculus)", rule: /\banalyse\b/ },
  { term: "Base de données", english: "Databases", rule: /\bbases? de donnees\b/ },
  { term: "Systèmes", english: "Systems", rule: /\bsystemes?\b/ },
  { term: "Sécurité", english: "Security", rule: /\bsecurite\b/ },
  { term: "Logique", english: "Logic", rule: /\blogique\b/ },
  { term: "Électronique", english: "Electronics", rule: /\belectronique\b/ },
  { term: "Physique", english: "Physics", rule: /\bphysique\b/ },
  { term: "Anglais", english: "English", rule: /\banglais\b/ },
  { term: "Droit", english: "Law", rule: /\bdroit\b/ },
  { term: "Gestion", english: "Management", rule: /\bgestion\b/ },
  { term: "Entrepreneuriat", english: "Entrepreneurship", rule: /\bentrepreneuriat\b/ },
  { term: "SUP", english: "1st-year students", rule: /\bsup\b/ },
  { term: "SPE", english: "2nd-year students", rule: /\bspe\b/ },
  { term: "S1, S2…", english: "Semester 1, 2…", rule: /\bs(\d{1,2})\b/,
    inTitle: (match) => ({ term: `S${match[1]}`, english: `Semester ${match[1]}` }) },
  { term: "GR1, GR2…", english: "Group 1, 2…", rule: /\bgr\s?\d+\b/, cards: false },
  { term: "Amphi", english: "Lecture hall", rule: /\bamphi\b/, cards: false },
  { term: "Salle machine", english: "Computer room", rule: /\bsalles? machines?\b/, cards: false },
  { term: "Salle", english: "Room", rule: /\bsalles?\b/, cards: false },
];

/** The glossary words found in a title, in the order of the glossary:
 *  "RATTRAPAGES S3" gives Rattrapages = Resits and S3 = Semester 3. */
function glossaryFor(title) {
  let text = plain(title || "");
  const found = [];
  for (const entry of GLOSSARY) {
    if (entry.cards === false) continue;
    const match = text.match(entry.rule);
    if (!match) continue;
    // Blank out what matched, so "forum stage" isn't also read as "stage".
    text = text.replace(entry.rule, " ");
    if (entry.inTitle) found.push(entry.inTitle(match));
    else if (entry.plural && match[0].endsWith("s")) found.push({ term: entry.plural[0], english: entry.plural[1] });
    else found.push({ term: entry.term, english: entry.english });
  }
  return found;
}

// Lets Node (the tests) load this file too; browsers skip this block.
if (typeof module !== "undefined") {
  module.exports = { kindOf, glossaryFor, GLOSSARY };
}
