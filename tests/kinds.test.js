const test = require("node:test");
const assert = require("node:assert/strict");
const { kindOf } = require("../kinds.js");

// Real ZEUS titles. A recurring title is checked with 10 appearances,
// a one-off with 1, matching what the app counts in your timetable.
const cases = {
  dayoff: ["Vacances", "VACANCES", "Férié", "FERIE", "férié toussaint", "Férie", "VACANCES/STAGE"],
  exam: [
    "EXAMEN 5 SPE", "Controle de cours de maths", "RATTRAPAGES S4", "Rattrapages S2,S1",
    "EXAM THL", "Examens S3", "QCM", "Soutenances", "Epreuve de synthèse",
  ],
  event: [
    "Erasmus Days", "Kaggle Week", "Challenge Week", "forum stage", "Hackathon rentrée 2026",
    "Présentation Programme Ambassadeur (obligatoire)", "Accueil Exchange", "Conférence",
    "Visite de Polytechnique",
  ],
  course: [
    "Algorithmique", "Probabilités discrètes", "Initiation à la crypto", "MINEURES",
    "GR1 - French for Fall 26 S1", "Tutorat Fall 26 S1", "Pentest",
    "Conception sur Microcontrôleur Avancée",
    "Ateliers d'Expression Ecrite & Orale (ATEXE, ATEXO)", "Atelier SQL", "atelier JAVA",
  ],
};

for (const [kind, titles] of Object.entries(cases)) {
  for (const title of titles) {
    test(`"${title}" is ${kind}`, () => assert.equal(kindOf(title, 10), kind));
  }
}

test("a title that appears only once is an event (e.g. EPI'ACK)", () => {
  assert.equal(kindOf("JOURNÉE EPI'ACK", 1), "event");
  assert.equal(kindOf("EPI'ACK", 1), "event");
  assert.equal(kindOf("Atelier - Théâtre - Partie 1 : Améliorer sa fluidité à l'oral", 1), "event");
});

test("exams and days off win over the appears-once rule", () => {
  assert.equal(kindOf("EXAMEN 5 SPE", 1), "exam");
  assert.equal(kindOf("férié lundi de pâques", 1), "dayoff");
});

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------
const { glossaryFor, GLOSSARY } = require("../kinds.js");
const pairs = (title) => glossaryFor(title).map((word) => `${word.term} = ${word.english}`);

test("glossary: real ZEUS titles get their French words in English", () => {
  assert.deepEqual(pairs("RATTRAPAGES S3"), ["Rattrapages = Resits", "S3 = Semester 3"]);
  assert.deepEqual(pairs("EXAMEN 7 SPE"), ["Examen = Exam", "SPE = 2nd-year students"]);
  assert.deepEqual(pairs("FERIE"), ["Férié = Public holiday"]);
  assert.deepEqual(pairs("FLE (exchange)"), ["FLE = French as a foreign language"]);
  assert.deepEqual(pairs("MINEURES"), ["Mineures = Minors (elective tracks)"]);
  assert.deepEqual(pairs("Tutorat Fall 26 S1"), ["Tutorat = Tutoring", "S1 = Semester 1"]);
  assert.deepEqual(pairs("atelier JAVA"), ["Atelier = Workshop"]);
  assert.deepEqual(pairs("Réseaux"), ["Réseaux = Networks"]);
});

test("glossary: a phrase is read once, not also word by word", () => {
  assert.deepEqual(pairs("forum stage"), ["Forum stage = Internship fair"]);
  assert.deepEqual(pairs("Stage de fin d'études"), ["Stage = Internship"]);
});

test("glossary: English titles and words inside other words get nothing", () => {
  assert.deepEqual(pairs("Kaggle Week"), []);
  assert.deepEqual(pairs("Compilation"), []);
  assert.deepEqual(pairs("Supervised learning"), []); // "sup" only as a word
  assert.deepEqual(pairs("Spectral methods"), []);
  assert.deepEqual(pairs(""), []);
});

test("glossary: the group code stays in its chip, not the English line", () => {
  assert.deepEqual(pairs("GR1 - French for Fall 26 S1"), ["S1 = Semester 1"]);
});

test("glossary: every entry has a word, its English and a rule", () => {
  for (const entry of GLOSSARY) {
    assert.ok(entry.term && entry.english && entry.rule instanceof RegExp, entry.term);
  }
  assert.equal(new Set(GLOSSARY.map((entry) => entry.term)).size, GLOSSARY.length);
});

test("glossary: phrases are translated as a whole, not word by word", () => {
  assert.deepEqual(pairs("Contrôle de cours de maths (cf répartition sur Moodle)"),
    ["Contrôle de cours de maths = Maths class test", "cf répartition sur Moodle = see Moodle for which room you're in"]);
  assert.deepEqual(pairs("Controle de cours de maths"), ["Contrôle de cours de maths = Maths class test"]);
  assert.deepEqual(pairs("Contrôle continu"), ["Contrôle continu = Continuous assessment"]);
  assert.ok(pairs("Politiques de Sécurité et de Management des Systèmes d'Information")
    .includes("Systèmes d'information = Information systems"));
  assert.ok(!pairs("Analyse Systèmes").includes("Analyse = Calculus"), "Analyse only means calculus in maths");
  assert.ok(pairs("Réunion délégués mi semestre S5 FISA").includes("Délégués = Class representatives"));
});
