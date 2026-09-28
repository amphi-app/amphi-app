/*
  kinds.js — deciding whether a ZEUS entry is a course, an exam, an event
  or a day off.

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

// Lets Node (the tests) load this file too; browsers skip this block.
if (typeof module !== "undefined") {
  module.exports = { kindOf };
}
