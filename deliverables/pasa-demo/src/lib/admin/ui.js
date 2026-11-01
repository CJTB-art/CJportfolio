export const initials = (n) => n.split(' ').filter((w) => w.toLowerCase() !== 'dela').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const PAL = ['#6d5be0', '#3f6fd9', '#c2407a', '#2f9e8f', '#7a63b8', '#d9822b', '#4a5a9a'];
export const color = (n) => PAL[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % PAL.length];
