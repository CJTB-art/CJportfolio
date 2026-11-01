// Single source of truth for subject-category icons. Import from here, never pick icons per page.
import SubjectGenEd from './ui/SubjectGenEd.svelte';
import SubjectProfEd from './ui/SubjectProfEd.svelte';
import SubjectMajor from './ui/SubjectMajor.svelte';

export const SUBJECT_ICONS = {
  general: SubjectGenEd,    // General Education
  professional: SubjectProfEd, // Professional Education
  major: SubjectMajor      // Major / Specialization
};

// Accepts any label used in the app: 'Major', 'Major · English', 'Major / Specialization', etc.
export function subjectIcon(name = '') {
  const n = name.toLowerCase();
  if (n.startsWith('general')) return SUBJECT_ICONS.general;
  if (n.startsWith('professional')) return SUBJECT_ICONS.professional;
  return SUBJECT_ICONS.major;
}

// Compact labels for phones, so three subject tabs fit on one row without scrolling.
export function shortName(name = '') {
  const n = name.toLowerCase();
  if (n.startsWith('general')) return 'GenEd';
  if (n.startsWith('professional')) return 'ProfEd';
  if (n.startsWith('major')) return 'Major';
  return name;
}
