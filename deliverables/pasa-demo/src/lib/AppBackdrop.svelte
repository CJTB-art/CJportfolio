<script>
  // One shared library backdrop for every learner and public page (never admin: the layout skips it there).
  // Dark and light each get their own photo, shown edge to edge. Hidden from assistive technology.
  import dark from './assets/login-hero.webp';
  import light from './assets/app-backdrop-light.webp';
  // Pages with white text straight on the photo (login, welcome) keep the night photo in both themes.
  let { night = false, split = false } = $props();
</script>

<div class="bd" class:night class:split aria-hidden="true">
  <img class="bd-photo bd-dark" src={dark} alt="" draggable="false" decoding="async" fetchpriority="low" />
  <img class="bd-photo bd-light" src={light} alt="" draggable="false" decoding="async" loading="lazy" />
</div>

<style>
  .bd {
    position: fixed;
    z-index: -1;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    contain: strict;
    transform: translateZ(0);
    background: var(--color-bg);
  }
  /* Full bleed. Focal point sits on the aisle and reading lamp, so portrait phones crop to the best part, not the dark shelf. */
  .bd-photo {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 66% 56%;
    filter: var(--photo-filter, none);
  }
  /* Login: the photo owns only the brand side and dissolves into the solid form panel (the panel draws the fade). */
  .bd.split { --form-w: clamp(21rem, 44vw, 48rem); --fade: clamp(5rem, 12vw, 12rem); }
  .bd.split .bd-photo { inset: 0 auto 0 0; width: calc(100vw - var(--form-w) + var(--fade)); object-position: 60% 56%; }
  .bd.split::after { background: linear-gradient(0deg, rgb(4 4 28 / .55) 0%, transparent 48%); }
  @media (max-aspect-ratio: 1/1) {
    .bd.split { --fade: clamp(2.5rem, 7dvh, 4.5rem); }
    .bd.split .bd-photo { inset: 0 0 auto 0; width: 100%; height: calc(clamp(5.5rem, 14dvh, 7rem) + var(--fade)); object-position: 62% 62%; }
    .bd.split::after { background: linear-gradient(180deg, rgb(4 4 28 / .35), transparent 70%); }
  }
  .bd-light { display: none; }
  :global(:root[data-theme='light']) .bd:not(.night) .bd-dark { display: none; }
  :global(:root[data-theme='light']) .bd:not(.night) .bd-light { display: block; filter: none; }

  /* Only a whisper of overlay: a soft edge vignette plus a faint floor under the top bar / bottom nav. The photo stays fully visible. */
  .bd::after {
    position: absolute;
    inset: 0;
    content: '';
    background:
      linear-gradient(color-mix(in srgb, var(--color-bg) 20%, transparent), color-mix(in srgb, var(--color-bg) 20%, transparent)),
      radial-gradient(120% 90% at 62% 52%, transparent 55%, color-mix(in srgb, var(--color-bg) 38%, transparent) 100%),
      linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 18%, transparent) 0%, transparent 22%, transparent 78%, color-mix(in srgb, var(--color-bg) 26%, transparent) 100%);
  }
  :global(:root[data-theme='light']) .bd:not(.night)::after {
    background:
      linear-gradient(color-mix(in srgb, var(--color-bg) 54%, transparent), color-mix(in srgb, var(--color-bg) 54%, transparent)),
      radial-gradient(120% 90% at 62% 52%, transparent 58%, color-mix(in srgb, var(--color-bg) 36%, transparent) 100%),
      linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 14%, transparent) 0%, transparent 20%, transparent 80%, color-mix(in srgb, var(--color-bg) 20%, transparent) 100%);
  }

  :global {
    /* A quiet halo keeps small muted labels legible where the photo shows through. */
    :root[data-theme='light'] .text-mute,
    :root[data-theme='light'] .tp-sub,
    :root[data-theme='light'] .tp-lbl,
    :root[data-theme='light'] .eyebrow,
    :root[data-theme='light'] .pr-lbl,
    :root[data-theme='light'] .pr-grp,
    :root[data-theme='light'] .pr-unit,
    :root[data-theme='light'] .pr-fact dt,
    :root[data-theme='light'] .pr-note,
    :root[data-theme='light'] .sub-legend,
    :root[data-theme='light'] .today-line,
    :root[data-theme='light'] .delta,
    :root[data-theme='light'] .sec-btn,
    :root[data-theme='light'] .focus,
    :root[data-theme='light'] .ch-badge {
      text-shadow: 0 0 5px color-mix(in srgb, var(--color-bg) 90%, transparent), 0 0 2px color-mix(in srgb, var(--color-bg) 90%, transparent);
    }
    :root[data-theme='light'] .text-mute,
    :root[data-theme='light'] .tp-sub,
    :root[data-theme='light'] .pr-lbl,
    :root[data-theme='light'] .pr-grp,
    :root[data-theme='light'] .pr-unit,
    :root[data-theme='light'] .pr-fact dt,
    :root[data-theme='light'] .pr-note,
    :root[data-theme='light'] .ch-badge {
      color: color-mix(in srgb, var(--color-mute) 78%, var(--color-ink));
    }
    :root[data-theme='light'] .focus, :root[data-theme='light'] .ch-badge {
      border-color: color-mix(in srgb, var(--color-mute) 55%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-mute) 55%, transparent);
      background: color-mix(in srgb, var(--color-bg) 55%, transparent);
    }
    :root[data-theme='light'] .nav-list, :root[data-theme='light'] .tp-list, :root[data-theme='light'] .tp-panel { background-image: none; }
  }

  @media (prefers-reduced-data: reduce), print { .bd { display: none; } }
</style>
