<script>import { toast } from './toast.svelte.js';</script>
{#if toast.msg}<div class="a-toast" role="status">{toast.msg}</div>{/if}
