// Pure baseline planning math, shared by the store adapter and Node smoke tests.
import { MIN_PER_QUESTION } from './logic.js';

export function planBaselineSections(candidates, mode = 'quick', cap = 30) {
  const wanted = mode === 'full' ? 2 : 1;
  const max = Math.max(0, Math.floor(Number(cap) || 0));
  const planned = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({
      candidate,
      index,
      n: Math.min(wanted, Math.max(0, Math.floor(Number(candidate?.available) || 0))),
      weight: Math.max(0, Number(candidate?.section?.w ?? candidate?.weight) || 0)
    }))
    .filter((row) => row.n > 0);

  let count = planned.reduce((sum, row) => sum + row.n, 0);
  const dropOrder = [...planned].sort((a, b) => a.weight - b.weight || a.index - b.index);
  const dropped = new Set();
  for (const row of dropOrder) {
    if (count <= max) break;
    dropped.add(row.index);
    count -= row.n;
  }

  const sections = planned
    .filter((row) => !dropped.has(row.index))
    .map(({ candidate, n }) => ({
      category: candidate.category,
      subjectKey: candidate.subjectKey,
      section: candidate.section,
      n
    }));
  return {
    sections,
    count,
    minutes: Math.max(1, Math.round(count * MIN_PER_QUESTION))
  };
}
