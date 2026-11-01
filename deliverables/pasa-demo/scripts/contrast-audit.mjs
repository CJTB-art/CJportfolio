// Contrast audit for the principal text and action pairs documented in REDESIGN_NOTES.md.
// WCAG 2.2 relative luminance for sRGB; text pairs are required to reach 4.5:1.
const luminance = (hex) => {
  const rgb = hex.replace('#', '').match(/.{2}/g).map((v) => parseInt(v, 16) / 255);
  const linear = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const ratio = (foreground, background) => {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

const checks = [
  ['light ink / canvas', '#14302D', '#F6EBD9'],
  ['light muted text / canvas', '#4F6561', '#F6EBD9'],
  ['light brand text / canvas', '#B5352A', '#F6EBD9'],
  ['white action text / tomato', '#FFFFFF', '#D04030'],
  ['ink text / marigold tag', '#14302D', '#F5B82E'],
  ['light teal text / canvas', '#14504B', '#F6EBD9'],
  ['dark ink / canvas', '#F6EBD9', '#16231F'],
  ['dark muted text / canvas', '#B9C7BE', '#16231F'],
  ['dark brand text / paper card', '#FF9585', '#1D2E29'],
  ['dark teal text / paper card', '#55A58F', '#1D2E29'],
  ['cream navigation text / chalk rail', '#F6EBD9', '#1F4D3A'],
  ['stage ink / paper stage', '#30251F', '#F4E3C7'],
  ['stage muted text / paper stage', '#68564B', '#F4E3C7'],
  ['stage brand text / paper stage', '#A92E27', '#F4E3C7'],
  ['auth placeholder / paper input', '#79675B', '#FFFDF7']
].map(([pair, fg, bg]) => ({ pair, fg, bg, ratio: ratio(fg, bg) }));

console.table(checks.map((item) => ({ ...item, ratio: item.ratio.toFixed(2), pass: item.ratio >= 4.5 })));
const failures = checks.filter((item) => item.ratio < 4.5);
console.log(`contrast_pairs=${checks.length} failures=${failures.length}`);
if (failures.length) process.exitCode = 1;
