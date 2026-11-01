// Current General Education and Professional Education areas from PRC Resolution No. 11 s. 2025,
// Annex A. Question rows use the sub-topic as `topic`. General Education has one topic per area;
// Professional Education areas contain their published sub-topics.
export const LEGACY_GENED_SECTIONS = [
  'Intellectual Competencies',
  'Personal and Civic Responsibilities',
  'Practical Skills Development'
];

// The 2022 General Education TOS groups the current question-bank topics under these three areas.
// Keep this crosswalk shared by Practice and readiness so the displayed hierarchy stays wired to progress.
export const GENED_TOS_GROUPS = [
  { id: 'A', name: 'Intellectual Competencies', weight: 40, topics: ['Purposive Communication in English', 'Malayuning Komunikasyon sa Wikang Filipino', 'Science and Technology', 'Mathematics'] },
  { id: 'B', name: 'Personal and Civic Responsibilities', weight: 30, topics: ['Readings in Philippine History and Society', 'The Life and Works of Rizal', 'Ethics'] },
  { id: 'C', name: 'Practical Skills Development', weight: 30, topics: ['The Contemporary World', 'Art Appreciation', 'Understanding the Self'] }
];

export function genEdReviewGroup(topic) {
  const t = norm(topic);
  return GENED_TOS_GROUPS.find((group) => norm(group.name) === t || group.topics.some((name) => norm(name) === t)) ?? null;
}

export const SECTIONS = {
  'General Education': [
    { id: '1', name: 'Purposive Communication in English', w: 10, topics: ['Purposive Communication in English'] },
    { id: '2', name: 'Malayuning Komunikasyon sa Wikang Filipino', w: 10, topics: ['Malayuning Komunikasyon sa Wikang Filipino'] },
    { id: '3', name: 'Readings in Philippine History and Society', w: 10, topics: ['Readings in Philippine History and Society'] },
    { id: '4', name: 'The Life and Works of Rizal', w: 10, topics: ['The Life and Works of Rizal'] },
    { id: '5', name: 'The Contemporary World', w: 10, topics: ['The Contemporary World'] },
    { id: '6', name: 'Art Appreciation', w: 10, topics: ['Art Appreciation'] },
    { id: '7', name: 'Science and Technology', w: 10, topics: ['Science and Technology'] },
    { id: '8', name: 'Mathematics', w: 10, topics: ['Mathematics'] },
    { id: '9', name: 'Ethics', w: 10, topics: ['Ethics'] },
    { id: '10', name: 'Understanding the Self', w: 10, topics: ['Understanding the Self'] }
  ],
  'Professional Education': [
    { id: 'A', name: 'Teaching Profession', w: 15, topics: ['Foundations of the teaching-learning process', 'The Professional Teacher'] },
    { id: 'B', name: 'The Teacher and the School Curriculum, Methods and Strategies of Teaching, Educational Technology for Teaching', w: 30, legacyNames: ['Curriculum, Methods and Educational Technology'], topics: ['The Teacher and the School Curriculum', 'Methods and Strategies of Teaching', 'Educational Technology'] },
    { id: 'C', name: 'The Child and Adolescent Learners and Learning Principles', w: 20, legacyNames: ['Child and Adolescent Learners'], topics: ['Headstart for Toddlers, Child and Adolescent'] },
    { id: 'D', name: 'Assessment of Learning', w: 15, topics: ['Validating theoretical knowledge in the actual assessment of learning'] },
    { id: 'E', name: 'Field Study and Teaching Internship', w: 20, topics: ['Documentation of Experiential Learning', 'Action Research'] }
  ]
};

const norm = (s) => String(s ?? '').trim().toLowerCase();

// The section a topic name belongs to. Accepts a sub-topic or the section name itself. null when unknown.
export function sectionOf(category, topic) {
  const t = norm(topic);
  return (SECTIONS[category] ?? []).find((s) => norm(s.name) === t || s.legacyNames?.some((x) => norm(x) === t) || s.topics.some((x) => norm(x) === t)) ?? null;
}

// Lesson progress can live at a TOS parent level while practice readiness is scored per child topic.
// Return the valid review-content keys for one readiness section without changing either stored key.
export function reviewNamesForSection(category, topic) {
  if (category === 'General Education') {
    const group = genEdReviewGroup(topic);
    return group ? [group.name] : [topic];
  }
  const section = sectionOf(category, topic);
  return section ? [section.name, ...(section.legacyNames ?? [])] : [topic];
}

// True when `topic` is a section name (a whole section, not one sub-topic).
export const isSection = (category, topic) => (SECTIONS[category] ?? []).some((s) => norm(s.name) === norm(topic) || s.legacyNames?.some((x) => norm(x) === norm(topic)));
