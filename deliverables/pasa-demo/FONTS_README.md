# Pasa fonts (drop-in)
Copy `src/lib/assets/fonts/*.woff2` into the project at the same path.

- fraunces-latin.woff2   : Fraunces variable, latin, axes wght 100-900, opsz, SOFT, WONK (121 KB). Use font-variation-settings: "SOFT" 100, "WONK" 1, "opsz" 72.
- bricolage-latin.woff2  : Bricolage Grotesque variable, latin, wght 200-800 (41 KB).

@font-face (use these exact family names; the codebase should alias them to --font-display / --font-accent):

@font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 100 900; font-display: swap;
  src: url('./lib/assets/fonts/fraunces-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
@font-face { font-family: 'Bricolage Grotesque'; font-style: normal; font-weight: 200 800; font-display: swap;
  src: url('./lib/assets/fonts/bricolage-latin.woff2') format('woff2');
  unicode-range: same as above; }

Both are SIL Open Font License 1.1 (license files included). Source: @fontsource-variable packages.
