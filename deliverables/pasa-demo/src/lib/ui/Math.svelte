<script>
  // <MathText text={q.q} /> formats recognized plain math and delimited formulas without changing source text.
  // no rich formatting stays a bare string. Math runs become MathML inside a sideways-scrolling
  // .mth box. `plain` writes the delimiter-free text form (use it for one-line rows).
  // Imported as MathText on purpose: a binding called Math would hide the JS Math global.
  import { hasDisplayMath, hasMath, hasRichText, toHtml, toPlain } from '../mathRender.js';
  import { autoMathifyNotes } from '../mathNotation.js';

  let { text = '', plain = false, keepMathPhrases = false } = $props();
  const s = $derived(String(text ?? ''));
  const formatted = $derived(autoMathifyNotes(s));
  const rich = $derived(!plain && (keepMathPhrases || formatted !== s || hasRichText(formatted)));
</script>

<script module>
  // One copy listener for the whole page (not one per equation). It only acts when the selection
  // contains a math box: that box is replaced by its plain text and the rest of the selection is
  // copied as it is, so selecting a few words next to an equation no longer copies the whole line.
  if (typeof document !== 'undefined' && !globalThis.__pasaMathCopy) {
    globalThis.__pasaMathCopy = true;
    document.addEventListener('copy', (e) => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return;
      const box = document.createElement('div');
      for (let i = 0; i < sel.rangeCount; i++) box.appendChild(sel.getRangeAt(i).cloneContents());
      box.querySelectorAll('br').forEach((n) => n.replaceWith(document.createTextNode('\n')));
      const hits = box.querySelectorAll('.mth, .mth-raw');
      if (!hits.length) return;
      hits.forEach((n) => {
        const value = n.getAttribute('data-plain') ?? n.textContent ?? '';
        const display = n.classList.contains('mth-display');
        n.replaceWith(document.createTextNode((display ? '\n' : '') + value + (display ? '\n' : '')));
      });
      e.clipboardData.setData('text/plain', box.textContent ?? '');
      e.preventDefault();
    });
  }
</script>


{#if plain}{toPlain(formatted)}{:else if rich}
  {#if hasMath(formatted)}<span class="q-rich" class:q-rich-block={hasDisplayMath(formatted)} role="math" aria-label={toPlain(formatted)}>{@html toHtml(formatted, { keepMathPhrases })}</span>
  {:else}<span class="q-rich">{@html toHtml(formatted, { keepMathPhrases })}</span>{/if}
{:else}{s}{/if}

<style>
  /* One equation = one box that scrolls sideways on its own. It never widens the row or page,
     and a tap on it still reaches the button around it (only a drag scrolls). `position: relative`
     lifts it above the transparent 44px hit area every button gets (app.css ::after), which would
     otherwise take the touch and stop the drag from scrolling the equation. */
  :global(.mth) {
    position: relative; z-index: 1; display: inline-block; max-width: 100%; min-width: 0; overflow-x: auto; overflow-y: hidden; vertical-align: middle;
    line-height: 1.2; scrollbar-width: none; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch;
  }
  :global(.mth-display) { display: block; width: fit-content; max-width: 100%; margin: .4em auto; text-align: center; }
  :global(.mth)::-webkit-scrollbar { display: none; }
  :global(.mth math) { font-size: 1em; }
  :global(.mth mtd) { padding: 0.05em 0.3em; }
  :global(.mth-raw) { font-family: ui-monospace, monospace; font-size: 0.9em; overflow-wrap: anywhere; }
  :global(.q-rich) { white-space: pre-wrap; overflow-wrap: anywhere; }
  .q-rich-block { display: block; }
  :global(.q-rich u) { text-decoration-thickness: .08em; text-underline-offset: .12em; }
</style>
