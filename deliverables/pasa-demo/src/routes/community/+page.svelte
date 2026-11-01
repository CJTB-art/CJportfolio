<script>
  import { untrack, tick, onMount } from 'svelte';
  import { page } from '$app/state';
  import TwoPanel from '../../lib/TwoPanel.svelte';
  import { Button, Chip, EmptyState, Segmented, Skeleton } from '../../lib/ui/index.js';
  import { subjectIcon } from '../../lib/subjects.js';
  import {
    cm, SPACES, TYPES, TOPICS, LIMITS, REPORT_REASONS, byId, visible, helpers, unreadReplies, canPost, screen, similarPosts,
    createPost, addReply, toggleVote, voted, markHelpful, acceptReply, flagIncorrect, flaggedByMe, isDisputed, reportPost, reportedByMe, markMineSeen, deleteMine, openReports,
    ago, initials, hue, ME, startCommunitySync
  } from '../../lib/community.svelte.js';
  import { Search, Plus, ChevronUp, Bookmark, Flag, Share2, ThumbsUp, Check, Pin, Link2, MessageSquare, X, Send, Clock, ShieldAlert, Trash2, CircleCheck, CircleAlert } from '@lucide/svelte';

  const NAME = { GenEd: 'General Education', ProfEd: 'Professional Education', Major: 'Major' };
  const TONE = { Question: 'accent', Discussion: 'quiet', Resource: 'ok', Win: 'warn' };
  
  let view = $state(0);
  let space = $state('ProfEd');
  let filter = $state('latest');
  let q = $state('');
  let sel = $state('');
  let composing = $state(false);
  let reporting = $state(false);
  let reply = $state('');
  let note = $state('');
  let saved = $state(new Set());
  let shownFlagged = $state(new Set()); // disputed replies the reader chose to open

  onMount(() => {
    if (import.meta.env.DEV && page.url.searchParams.get('demo') === '1') return;
    return startCommunitySync();
  });

  // ---------- list ----------
  const list = $derived.by(() => {
    const term = q.trim().toLowerCase(), wk = Date.now() - 7 * 86400000;
    let l = cm.posts.filter((p) => visible(p) && p.space === space && (!term || (p.title + p.body + p.topic).toLowerCase().includes(term)));
    if (filter === 'mine') l = l.filter((p) => p.mine);
    if (filter === 'unanswered') l = l.filter((p) => p.type === 'Question' && !p.answered);
    if (filter === 'top') l = l.filter((p) => p.at > wk).sort((a, b) => b.votes - a.votes);
    else l = l.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at);
    return l;
  });
  const post = $derived(sel ? byId(sel) : null);
  const crew = $derived(helpers());
  const fresh = $derived(cm.posts.filter((p) => visible(p) && Date.now() - p.at < 86400000).length);
  const unread = $derived(unreadReplies());
  const filters = $derived([
    { id: 'latest', label: 'Latest' },
    { id: 'top', label: 'Top', title: 'Top this week' },
    { id: 'unanswered', label: 'Unanswered' },
    { id: 'mine', label: 'Mine', badge: unread || '' }
  ]);
  const spaceUnread = (s) => cm.posts.filter((p) => p.mine && p.space === s && p.replies.filter((r) => r.by !== ME.name).length > p.seenReplies).length;

  // Open a post from a shared link (?post=CM-0002), else the first in the list.
  $effect(() => {
    const id = page.url.searchParams.get('post'), p = id && byId(id);
    if (p && visible(p)) untrack(() => { space = p.space; sel = p.id; });
  });
  $effect(() => { if (!composing && !(sel && list.some((p) => p.id === sel)) && list.length) sel = list[0].id; });
  $effect(() => { if (post) untrack(() => markMineSeen(post.id)); });
  $effect(() => { post?.id; reporting = false; reply = ''; note = ''; });

  function pick(p) { sel = p.id; composing = false; view = 1; }
  function say(m) { note = m; setTimeout(() => note === m && (note = ''), 2600); }

  // ---------- composer ----------
  let type = $state('Question'), topic = $state(''), title = $state(''), body = $state(''), err = $state('');
  const topics = $derived(TOPICS[space]);
  $effect(() => { if (!topics.includes(topic)) topic = topics[0]; });
  const flags = $derived(screen(title + ' ' + body));
  const dups = $derived(similarPosts(title, space));
  const valid = $derived(title.trim().length >= 5 && body.trim().length >= 5);
  function openComposer() { composing = true; view = 1; err = ''; }
  let posting = false;
  async function publish() {
    if (!valid || posting) { if (!valid) err = 'Add a short title and a few details.'; return; }
    posting = true; const r = await createPost({ space, topic, type, title, body }); posting = false;
    if (r.error) { err = r.error; return; }
    title = ''; body = ''; err = ''; composing = false; filter = 'latest'; sel = r.post.id; view = 1;
    // The effect that clears `note` when the selected post changes runs first; show the toast after it.
    tick().then(() => say(r.held?.length ? 'Sent for approval. We will publish it once an admin has checked it.' : 'Posted!'));
  }

  // ---------- thread ----------
  async function sendReply() {
    const r = await addReply(post.id, reply);
    if (r.error) say(r.error); else reply = '';
  }
  async function share() {
    const url = `${location.origin}/community?post=${post.code || post.id}`;
    try { await navigator.clipboard.writeText(url); say('Link copied'); } catch { say(url); }
  }
  async function report(reason) { reporting = false; say((await reportPost(post.id, reason)) ? 'Thanks. An admin will take a look.' : 'You already reported this.'); }
  function showAnyway(id) { shownFlagged = new Set(shownFlagged).add(id); }
  function flag(rid) { say(flagIncorrect(post.id, rid) ? 'Thanks. Other students will see this might be wrong.' : 'You already flagged this.'); }
  function save() { const n = new Set(saved); n.has(post.id) ? n.delete(post.id) : n.add(post.id); saved = n; }
  async function remove() { const id = post.id; sel = ''; const e = await deleteMine(id); if (e) say(e); }
  const field = 'w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-mute';
</script>

<svelte:head><title>Pasa · Community</title></svelte:head>

<TwoPanel title="Community" art="icon-community" pill={fresh ? `${fresh} new` : ''} tabs={['Discussions', composing ? 'New post' : 'Thread']} bind:view stack cols="1.1fr 1fr">
  {#snippet left()}
    <section class="tp-card fill" style="overflow: hidden">
      <div class="ck shrink-0" role="tablist" aria-label="Space">
        {#each SPACES as s}
          {@const I = subjectIcon(NAME[s])}
          <button type="button" role="tab" aria-selected={space === s} onclick={() => (space = s)} class="ck-btn {space === s ? 'on' : ''}">
            <I size={16} /> <span>{s}</span>
            {#if spaceUnread(s)}<i class="size-2 shrink-0 rounded-full bg-red-500" aria-label="New replies"></i>{/if}
          </button>
        {/each}
      </div>

      <div class="flex shrink-0 gap-2">
        <label class="community-search neu-inset flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-mute focus-within:text-ink">
          <Search size={16} />
          <input type="search" bind:value={q} placeholder="Search discussions..." aria-label="Search discussions" class="community-search-input no-neu min-h-10 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-mute" />
        </label>
        <button type="button" onclick={openComposer} class="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-white shadow-[var(--shadow-brand)]"><Plus size={16} /> <span class="max-sm:hidden">New post</span><span class="sm:hidden">New</span></button>
      </div>

      <Segmented fit class="shrink-0" label="Filter" options={filters} value={filter} onpick={(id) => (filter = id)} />

      <ul class="tp-list rows" aria-label="Discussions">
        {#each list as p (p.id)}
          {@const on = sel === p.id && !composing}
          <li>
            <button type="button" onclick={() => pick(p)} aria-current={on ? 'true' : undefined}
              class="flex w-full items-start gap-3 rounded-xl p-3 text-left transition-[background-color,box-shadow] {on ? 'neu-inset' : 'hover:bg-brand-soft/25'}">
              <span class="flex w-10 shrink-0 flex-col items-center rounded-lg py-1 text-xs font-semibold {voted(p) ? 'bg-brand-soft text-brand-text' : 'text-mute'}"><ChevronUp size={14} />{p.votes}</span>
              <span class="min-w-0 flex-1">
                <span class="flex items-start gap-2">
                  <span class="min-w-0 flex-1 text-sm font-semibold leading-snug">{p.title}</span>
                  {#if p.status === 'Pending'}<Chip tone="warn" class="shrink-0"><Clock size={12} /> Pending</Chip>
                  {:else if p.answered}<Chip tone="ok" class="shrink-0">Answered</Chip>
                  {:else}<Chip tone={TONE[p.type]} class="shrink-0">{p.type}</Chip>{/if}
                </span>
                <span class="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-mute">
                  <span>{p.space}</span><span>·</span><span>{p.topic}</span><span>·</span><span>{p.replies.length} repl{p.replies.length === 1 ? 'y' : 'ies'}</span><span>·</span><span>{ago(p.at)}</span>
                </span>
                {#if p.pinned || p.link}
                  <span class="mt-1.5 flex flex-wrap gap-2 text-xs text-brand-text">
                    {#if p.pinned}<span class="flex items-center gap-1"><Pin size={12} /> Pinned by admin</span>{/if}
                    {#if p.link}<span class="flex items-center gap-1"><Link2 size={12} /> Linked: {p.link}</span>{/if}
                  </span>
                {/if}
              </span>
            </button>
          </li>
        {:else}
          {#if !cm.loaded}
            <li class="px-2 py-2"><Skeleton variant="row" count={5} /></li>
          {:else}
            <li class="grid min-h-0 flex-1 place-items-center"><EmptyState bare
              scene="scene-no-data"
              title={q ? 'No discussions match' : filter === 'mine' ? 'You have not posted yet' : 'Nothing here yet'}
              text={q ? 'Try a different word.' : filter === 'mine' ? 'Your posts will show up here.' : 'Start the first discussion!'}
            /></li>
          {/if}
        {/each}
      </ul>
    </section>
  {/snippet}

  {#snippet right()}
    {#if composing}
      <section class="tp-card fill" style="overflow: hidden">
        <div class="flex shrink-0 items-center gap-2"><h2 class="tp-title flex-1">New post in {space}</h2><button type="button" aria-label="Cancel" onclick={() => { composing = false; view = 0; }} class="grid size-9 place-content-center rounded-lg text-mute hover:text-ink"><X size={18} /></button></div>
        <div class="tp-list form tp-fade">
          <div>
            <p class="tp-lbl mb-2">Type</p>
            <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Post type">{#each TYPES as t}<Chip selected={type === t} onclick={() => (type = t)}>{t}</Chip>{/each}</div>
          </div>
          <div>
            <label class="tp-lbl mb-2 block" for="cm-topic">Topic</label>
            <select id="cm-topic" bind:value={topic} class="{field} appearance-none">{#each topics as t}<option>{t}</option>{/each}</select>
          </div>
          <div>
            <label class="tp-lbl mb-2 flex justify-between" for="cm-title"><span>Title</span><span class="text-xs font-normal text-mute">{title.length}/{LIMITS.title}</span></label>
            <input id="cm-title" class={field} maxlength={LIMITS.title} bind:value={title} placeholder={type === 'Question' ? 'What do you want to ask?' : 'Short summary'} />
          </div>
          {#if dups.length}
            <div class="neu-inset rounded-xl p-3">
              <p class="tp-lbl">Already asked?</p>
              <ul class="mt-2 flex flex-col gap-1.5">{#each dups as d (d.id)}<li><button type="button" class="text-left text-sm text-brand-text underline-offset-2 hover:underline" onclick={() => pick(d)}>{d.title}</button></li>{/each}</ul>
            </div>
          {/if}
          <div>
            <label class="tp-lbl mb-2 flex justify-between" for="cm-body"><span>Details</span><span class="text-xs font-normal text-mute">{body.length}/{LIMITS.body}</span></label>
            <textarea id="cm-body" rows="5" class="{field} min-h-28 resize-y" maxlength={LIMITS.body} bind:value={body} placeholder="Share what you know or what you are stuck on. Mention a question ID like LET-0014 to link it."></textarea>
          </div>
          {#if flags.length}
            <p class="neu-inset flex items-start gap-2 rounded-xl p-3 text-sm" role="status"><ShieldAlert size={16} class="mt-0.5 shrink-0 text-warn" /><span>{flags[0]}. This post will wait for admin approval before others can see it.</span></p>
          {/if}
          {#if err}<p role="alert" class="text-sm text-red-500">{err}</p>{/if}
          {#if !canPost()}<p class="text-sm text-red-500">You have reached {LIMITS.hourlyPosts} posts this hour.</p>{/if}
        </div>
        <button type="button" class="tp-cta" disabled={!valid || !canPost()} style={valid && canPost() ? '' : 'opacity:.5'} onclick={publish}><Send size={16} /> {flags.length ? 'Send for approval' : 'Post'}</button>
      </section>

    {:else if post}
      <section class="tp-card fill" style="overflow: hidden">
        <div class="tp-list form tp-fade">
          <div class="flex flex-wrap items-center gap-2">
            <Chip tone={TONE[post.type]}>{post.type}</Chip><Chip tone="quiet">{post.space}</Chip>
            {#if post.pinned}<Chip tone="accent"><Pin size={12} /> Pinned</Chip>{/if}
            {#if post.link}<Chip tone="quiet"><Link2 size={12} /> {post.link}</Chip>{/if}
          </div>
          <h2 class="text-xl font-semibold leading-snug tracking-tight">{post.title}</h2>
          <div class="flex items-center gap-2 text-sm">
            <span class="grid size-9 shrink-0 place-content-center rounded-full text-xs font-semibold text-white" style="background:{hue(post.by)}">{initials(post.by)}</span>
            <span class="font-medium">{post.by}</span>
            {#if crew.has(post.by)}<Chip>Helper</Chip>{/if}
            <span class="text-mute">{ago(post.at)}</span>
          </div>
          {#if post.status === 'Pending'}
            <p class="neu-inset flex items-start gap-2 rounded-xl p-3 text-sm" role="status"><Clock size={16} class="mt-0.5 shrink-0 text-warn" /><span>Waiting for admin approval{post.note ? ` (${post.note.toLowerCase()})` : ''}. Only you can see this for now.</span></p>
          {/if}
          <p class="whitespace-pre-line text-sm leading-relaxed">{post.body}</p>

          <div class="@container/act neu-inset flex w-full flex-nowrap items-center gap-0.5 rounded-xl p-1">
            <button type="button" aria-pressed={voted(post)} onclick={() => toggleVote(post.id)} class="opt flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-semibold transition-colors {voted(post) ? 'bg-brand text-white shadow-[var(--shadow-brand)]' : 'text-brand-text hover:bg-brand-soft/40'}"><ChevronUp size={16} /> {post.votes}</button>
            <button type="button" onclick={save} aria-pressed={saved.has(post.id)} aria-label={saved.has(post.id) ? 'Saved' : 'Save'} class="opt flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm text-mute transition-colors hover:text-ink"><Bookmark size={16} class="shrink-0" fill={saved.has(post.id) ? 'currentColor' : 'none'} /> <span class="truncate @max-[17rem]/act:hidden">{saved.has(post.id) ? 'Saved' : 'Save'}</span></button>
            {#if post.mine}
              <button type="button" onclick={remove} aria-label="Delete" class="opt flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm text-mute transition-colors hover:text-red-500"><Trash2 size={16} class="shrink-0" /> <span class="truncate @max-[17rem]/act:hidden">Delete</span></button>
            {:else}
              <button type="button" disabled={reportedByMe(post)} onclick={() => (reporting = !reporting)} aria-expanded={reporting} aria-label={reportedByMe(post) ? 'Reported' : 'Report'} class="opt flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm text-mute transition-colors hover:text-ink disabled:opacity-60"><Flag size={16} class="shrink-0" /> <span class="truncate @max-[17rem]/act:hidden">{reportedByMe(post) ? 'Reported' : 'Report'}</span></button>
            {/if}
            <button type="button" onclick={share} aria-label="Share" class="opt flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm text-mute transition-colors hover:text-ink"><Share2 size={16} class="shrink-0" /> <span class="truncate @max-[17rem]/act:hidden">Share</span></button>
          </div>

          {#if reporting}
            <div class="neu-inset rounded-xl p-3" role="group" aria-label="Report reason">
              <p class="tp-lbl mb-2">Why are you reporting this?</p>
              <div class="flex flex-wrap gap-2">{#each REPORT_REASONS as r}<Chip onclick={() => report(r)} tone="quiet">{r}</Chip>{/each}</div>
            </div>
          {/if}
          {#if note}<p role="status" class="text-sm text-brand-text">{note}</p>{/if}

          <h3 class="tp-lbl mt-2 flex items-center gap-2 border-t border-line pt-4 text-base"><MessageSquare size={16} class="text-brand-text" /> Replies <span class="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-text">{post.replies.length}</span></h3>
          <ul class="flex flex-col gap-1">
            {#each [...post.replies].sort((a, b) => Number(!!b.accepted) - Number(!!a.accepted)) as r (r.id)}
              <li class="flex gap-2.5 rounded-xl p-3 {r.accepted ? 'bg-emerald-500/10' : ''}">
                <span class="grid size-8 shrink-0 place-content-center rounded-full text-xs font-semibold text-white" style="background:{hue(r.by)}">{initials(r.by)}</span>
                <div class="min-w-0 flex-1">
                  <p class="flex flex-wrap items-center gap-x-2 text-xs"><b class="text-sm font-semibold">{r.by}</b>{#if crew.has(r.by)}<Chip class="!py-0">Helper</Chip>{/if}<span class="text-mute">{ago(r.at)}</span></p>
                  {#if isDisputed(r) && !shownFlagged.has(r.id)}
                    <p class="mt-0.5 text-sm text-mute">Several people flagged this as incorrect.</p>
                    <Button variant="ghost" class="!min-h-8 !px-1 !py-1 text-xs" onclick={() => showAnyway(r.id)}>Show anyway</Button>
                  {:else}
                    {#if isDisputed(r)}<p class="mt-0.5 text-xs text-mute">Several people flagged this as incorrect.</p>{/if}
                    <p class="mt-0.5 text-sm leading-relaxed">{r.body}</p>
                    <div class="mt-1 flex flex-wrap items-center gap-2">
                      <button type="button" disabled={r.marked.includes(ME.id) || r.mine} onclick={() => markHelpful(post.id, r.id)} class="flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs text-mute hover:text-brand-text disabled:opacity-70"><ThumbsUp size={14} fill={r.marked.includes(ME.id) ? 'currentColor' : 'none'} /> Helpful{r.helpful ? ` · ${r.helpful}` : ''}</button>
                      {#if !r.mine}<button type="button" disabled={flaggedByMe(r)} onclick={() => flag(r.id)} aria-label={flaggedByMe(r) ? 'Flagged as incorrect' : 'Flag as incorrect'} class="flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs text-mute hover:text-ink disabled:opacity-70"><CircleAlert size={14} /> {flaggedByMe(r) ? 'Flagged' : 'Flag as incorrect'}</button>{/if}
                      {#if r.accepted}<Chip tone="ok"><Check size={12} /> Accepted</Chip>
                      {:else if post.mine && !r.mine}<button type="button" onclick={() => acceptReply(post.id, r.id)} class="flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-semibold text-brand-text"><CircleCheck size={14} /> Accept answer</button>{/if}
                    </div>
                  {/if}
                </div>
              </li>
            {:else}<li class="grid"><EmptyState bare scene="scene-no-data" title="No replies yet" text="Be the first to help." /></li>{/each}
          </ul>
        </div>

        {#if post.status === 'Published'}
          <form class="flex shrink-0 gap-2 border-t border-line pt-3" onsubmit={(e) => { e.preventDefault(); sendReply(); }}>
            <label class="neu-inset flex min-w-0 flex-1 items-center rounded-xl px-3">
              <input bind:value={reply} maxlength={LIMITS.reply} placeholder="Write a helpful reply..." aria-label="Write a reply" class="min-h-10 w-full bg-transparent text-sm text-ink outline-none placeholder:text-mute" />
            </label>
            <button type="submit" disabled={!reply.trim()} class="min-h-10 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-[var(--shadow-brand)] disabled:opacity-50">Reply</button>
          </form>
        {/if}
      </section>
    {:else if !cm.loaded}
      <section class="tp-card fill grid place-content-center gap-4 p-6" role="status" aria-busy="true" aria-label="Loading discussion">
        <Skeleton variant="line" class="w-2/3" /><Skeleton variant="line" count={3} />
      </section>
    {:else}
      <section class="tp-card fill grid place-content-center text-center"><p class="tp-sub">Pick a discussion to read it.</p></section>
    {/if}
  {/snippet}
</TwoPanel>

<style>
  :global(.route-root:not(.is-admin) .community-search:focus-within) { outline: 2px solid var(--color-teal); outline-offset: 1px; }
  :global(.route-root:not(.is-admin) .community-search-input:focus-visible) { outline: none; }
</style>
