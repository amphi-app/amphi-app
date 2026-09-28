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
