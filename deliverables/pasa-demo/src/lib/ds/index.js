// Pasa design system (flat). Import from here so the tokens always load with the components:
//   import { Button, Card, Chip, toast } from '$lib/ds';
// Mount <Toast /> once in the root layout, then call toast.success('Saved') from anywhere.
// The legacy primitives in src/lib/ui share the app's paper tokens through app.css.
import './tokens.css';

export { default as Button } from './Button.svelte';
export { default as Chip } from './Chip.svelte';
export { default as Card } from './Card.svelte';
export { default as SectionLabel } from './SectionLabel.svelte';
export { default as Input } from './Input.svelte';
export { default as Badge } from './Badge.svelte';
export { default as ProgressBar } from './ProgressBar.svelte';
export { default as ListRow } from './ListRow.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as Toggle } from './Toggle.svelte';
export { default as Toast } from './Toast.svelte';
export { toast } from './toast.svelte.js';
export { default as PageHeader } from './PageHeader.svelte';
export { default as StickyActionBar } from './StickyActionBar.svelte';
