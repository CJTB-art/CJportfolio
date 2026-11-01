// Filipino greeting by local hour, e.g. 'Magandang gabi, future teacher.'
export function greeting(date = new Date()) {
  const h = date.getHours();
  const part = h >= 5 && h < 11 ? 'umaga' : h >= 11 && h < 13 ? 'tanghali' : h >= 13 && h < 18 ? 'hapon' : 'gabi';
  return `Magandang ${part}, future teacher.`;
}
