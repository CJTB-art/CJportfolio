<script>
  // Drop-in replacement for the lucide subject (Major / Specialization) icon: same `size` and `class` props, drawn with the Pasa art.
  import Art from './Art.svelte';
  let { size = 16, class: cls = '' } = $props();
  // Line icons read small at their nominal size; the artwork needs a little more room to stay legible.
  const px = $derived(Math.round(size * 1.6));
</script>

<Art name="icon-major" size={px} decorative class="subject-glyph {cls}" />

<style>
  :global(.subject-glyph) { flex: none; width: var(--art-size); max-width: none; height: auto; }
</style>
