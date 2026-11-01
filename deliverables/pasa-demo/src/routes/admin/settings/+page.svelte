<script>
  import { goto } from '$app/navigation';
  import Topbar from '../../../lib/admin/Topbar.svelte';
  import Toggle from '../../../lib/admin/Toggle.svelte';
  import { say } from '../../../lib/admin/toast.svelte.js';
  import { MAX_CHOICES } from '../../../lib/admin/questions.js';
  import { ask, prompt } from '../../../lib/admin/dialog.svelte.js';
  import { db, counts, BLOOM, DIFFS, saveSettings, loadSettings, defaultSettings, wipe, exportAll, importAll, exportQuestions, DEFAULT_SETTINGS, STAFF, can, actor } from '../../../lib/admin/store.svelte.js';
  import { loadAttention, bloomCounts, fetchAllFiltered } from '../../../lib/admin/questions.svelte.js';
  import { Settings, User, TriangleAlert, ChevronDown, Bell, Database, Plug, Shield, BarChart3, Check, Download, Upload, Link, Clock } from '@lucide/svelte';

  const NAV = [['gen', 'General', Settings], ['roles', 'Roles & access', User], ['rules', 'Question rules', Shield], ['bloom', 'Bloom’s levels', BarChart3], ['notify', 'Notifications', Bell], ['int', 'Integrations', Plug], ['data', 'Data & backup', Database]];
  let tab = $state('gen');
  let s = $state(structuredClone($state.snapshot(db.settings)));
  const dirty = $derived(JSON.stringify($state.snapshot(s)) !== JSON.stringify($state.snapshot(db.settings)));
  let attn = $state({ n: 0, rows: [] }), blooms = $state({});
  const dangerItems = $derived([
    ['Delete all questions', 'Removes every question and its flags.', async () => (await wipe('questions')) || (await wipe('flags'))],
    ['Clear all flags', 'Removes every flag, open or resolved.', () => wipe('flags')],
    ['Delete all lessons', 'Removes every lesson from every subject.', () => wipe('lessons')],
    ['Clear audit log', 'Removes the activity history.', () => wipe('audit')],
    ['Restore default settings', 'Puts every setting back to its original value.', async () => { const e = await defaultSettings(); s = structuredClone($state.snapshot(db.settings)); return e; }]
  ].filter(([title]) => title !== 'Clear audit log' || actor().role === 'Owner'));
  $effect(() => { if (tab === 'rules') loadAttention().then((r) => (attn = r)); if (tab === 'bloom') bloomCounts(BLOOM).then((r) => (blooms = r)); });
  let fileEl = $state();

  function diff(a, b, pre = '') { return Object.keys(a).flatMap((k) => (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? diff(a[k], b?.[k] ?? {}, pre + k + '.') : JSON.stringify(a[k]) !== JSON.stringify(b?.[k]) ? [pre + k] : [])); }
  async function save() { // the database is the real check
    if (!can('settings.change')) return say('You do not have permission'); if (!s.siteName.trim()) return say('Site name cannot be empty'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.supportEmail)) return say('Enter a valid support email'); const next = structuredClone($state.snapshot(s)), changed = diff(next, $state.snapshot(db.settings)); Object.assign(db.settings, next); const e = await saveSettings(changed); if (e) { await loadSettings(); s = structuredClone($state.snapshot(db.settings)); return say(e); } say('Settings saved'); }
  function discard() { s = structuredClone($state.snapshot(db.settings)); say('Changes discarded'); }
  const days = $derived(s.examDate ? Math.ceil((new Date(s.examDate) - new Date()) / 864e5) : null);
  const lvlCount = (b) => blooms[b] ?? 0;
  const ROLES = [['Create and edit questions', 'on', 'on', 'off', 'off'], ['Publish questions', 'on', 'off', 'off', 'off'], ['Delete questions', 'on', 'editorDelete', 'off', 'off'], ['Manage users', 'on', 'editorUsers', 'off', 'off'], ['Moderate community', 'on', 'off', 'on', 'off'], ['Report a question', 'on', 'on', 'on', 'learnerFlag'], ['Change settings', 'on', 'off', 'off', 'off']];
  const on = (v) => v === 'on';

  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (!(await ask({ title: 'Restore from backup?', msg: `This merges ${f.name} into your data: questions with the same id are overwritten, other questions are kept, and settings are replaced.`, ok: 'Restore', danger: true }))) return;
    try { const r = await importAll(await f.text(), (n, N) => say(`Restored ${n} of ${N}`)); s = structuredClone($state.snapshot(db.settings)); say(`Backup restored.${r?.downgraded ? ` ${r.downgraded} Published question${r.downgraded > 1 ? 's' : ''} restored as Draft (submit them for review again).` : ''} Lessons, community and feedback are not restored.`); } catch (err) { say(err.message); }
  }
  async function danger(kind, label, fn) {
    const t = await prompt({ title: `${label}?`, msg: 'This cannot be undone. Type DELETE to confirm.', ok: label, placeholder: 'DELETE' });
    if (t === 'DELETE') { const e = await fn(); say(e || 'Done'); } else if (t !== null) say('Confirmation did not match');
  }
  function test(k) { const v = s.apiKeys[k]?.trim(); if (!v) return say('Enter a value first'); if (k === 'supabaseUrl' && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v)) return say('Expected https://<project>.supabase.co'); say('Format looks valid'); }
  const FIELD = { Easy: 'Easy', Medium: 'Medium', Hard: 'Hard' };
</script>

<Topbar title="Settings" exportLabel="Backup" onexport={exportAll} />
<main class="a-body two">
  <nav class="a-card inner" aria-label="Settings sections">
    {#each NAV as [id, label, Ic]}<button class="no-neu" class:on={tab === id} onclick={() => (tab = id)}><Ic size={17} strokeWidth={1.7} /> {label}</button>{/each}
    <button class="no-neu" onclick={() => goto('/admin/audit')}><Clock size={17} strokeWidth={1.7} /> Audit log</button>
    <button class="no-neu danger" class:on={tab === 'danger'} onclick={() => (tab = 'danger')}><TriangleAlert size={17} strokeWidth={1.7} /> Danger zone</button>
    <div class="side-note"><b>{counts.questions.toLocaleString()}</b> questions · <b>{counts.users}</b> users<br /><small>Saved in Supabase</small></div>
  </nav>

  <div class="pane">
    <div class="scroll">
      {#if tab === 'gen'}
        <h2>General</h2>
        <div class="grid">
          <section class="sc"><h3>Site identity</h3><p class="d">Shown in emails and the learner app.</p>
            <label class="a-lbl" for="sn">Site name</label><input id="sn" class="a-fi no-neu" bind:value={s.siteName} />
            <label class="a-lbl m" for="se">Support email</label><input id="se" class="a-fi no-neu" type="email" bind:value={s.supportEmail} />
</section>
          <section class="sc"><h3>Exam date</h3><p class="d">Only use a date confirmed in an official PRC notice.</p>
            <label class="a-lbl" for="ed">Verified PRC exam date (optional)</label><input id="ed" class="a-fi no-neu" type="date" bind:value={s.examDate} />
            <div class="big"><b>{days === null ? '—' : days < 0 ? 'Passed' : days}</b><span>{days === null ? 'No date set' : days < 0 ? 'The date has passed' : days === 1 ? 'day to go' : 'days to go'}</span></div></section>
          <section class="sc"><h3>Access</h3><p class="d">Who can reach the learner app.</p>
            <div class="row"><div><b>Maintenance mode</b><p>Learners see a “back soon” page.</p></div><Toggle bind:on={s.maintenance} label="Maintenance mode" /></div>
            <div class="row"><div><b>Allow new sign-ups</b><p>Turn off to close registration.</p></div><Toggle bind:on={s.signups} label="Allow sign-ups" /></div>
            <div class="row"><div><b>Public question bank</b><p>Applies once the learner bank is connected to admin questions.</p></div><Toggle bind:on={s.publicBank} label="Public bank" /></div></section>
          <section class="sc"><h3>Display</h3><p class="d">How admin lists look on this device.</p>
            <span class="a-lbl">Rows per page</span><div class="seg" role="radiogroup" aria-label="Rows per page">{#each [10, 25, 50, 100] as n}<button class="no-neu" role="radio" aria-checked={s.pageSize === n} class:on={s.pageSize === n} onclick={() => (s.pageSize = n)}>{n}</button>{/each}</div>
            <span class="a-lbl m">Row density</span><div class="seg" role="radiogroup" aria-label="Row density">{#each ['Comfortable', 'Compact'] as n}<button class="no-neu" role="radio" aria-checked={s.density === n} class:on={s.density === n} onclick={() => (s.density = n)}>{n}</button>{/each}</div></section>
          <section class="sc wide"><h3>Session & security</h3><p class="d">Protect admin accounts.</p>
            <div class="two2"><div><label class="a-lbl" for="ss">Sign out after inactivity <small>(Coming soon)</small></label><select id="ss" class="a-fi no-neu" disabled bind:value={s.session}>{#each [15, 30, 60, 240] as m}<option value={m}>{m < 60 ? m + ' minutes' : m / 60 + (m === 60 ? ' hour' : ' hours')}</option>{/each}</select></div>
              <div class="row flat"><div><b>Two-factor sign-in</b><p>Require a code for admins. Coming soon.</p></div><Toggle bind:on={s.twoFactor} disabled label="Two-factor" /></div></div></section>
        </div>

      {:else if tab === 'roles'}
        <h2>Roles & access</h2>
        <div class="grid">
          <section class="sc wide"><h3>Permissions</h3><p class="d">What each role can do. Owner and Admin always have full access.</p>
            <div class="mx"><div class="mh"><span>Permission</span><span>Admin</span><span>Moderator</span><span>Editor</span><span>Learner</span></div>
              {#each ROLES as [t, a, e, m, l]}
                <div class="mr"><span>{t}</span><span><i class="ck"><Check size={12} strokeWidth={3} /></i></span>
                  <span>{#if on(m)}<i class="ck"><Check size={12} strokeWidth={3} /></i>{:else}<i class="no">—</i>{/if}</span>
                  <span>{#if on(e)}<i class="ck"><Check size={12} strokeWidth={3} /></i>{:else if e === 'off'}<i class="no">—</i>{:else}<Toggle bind:on={s.roles[e]} label="Editor: {t}" />{/if}</span>
                  <span>{#if on(l)}<i class="ck"><Check size={12} strokeWidth={3} /></i>{:else if l === 'off'}<i class="no">—</i>{:else}<Toggle bind:on={s.roles[l]} label="Learner: {t}" />{/if}</span></div>
              {/each}</div></section>
          <section class="sc"><h3>Staff</h3><p class="d">{db.users.filter((u) => STAFF.includes(u.role)).length} people with admin roles.</p>
            {#each db.users.filter((u) => STAFF.includes(u.role)) as u}<div class="li"><b>{u.name}</b><small>{u.role}</small></div>{/each}
            <button class="a-btn no-neu" style="margin-top:12px" onclick={() => goto('/admin/users')}>Manage users</button></section>
          <section class="sc"><h3>Review workflow</h3><p class="d">Who approves content.</p>
            <div class="row"><div><b>Editors submit for review</b><p>Editors cannot publish. They submit questions for review, and an Owner or Admin approves and publishes them.</p></div><Toggle bind:on={s.rules.review} label="Review workflow" /></div></section>
        </div>

      {:else if tab === 'rules'}
        <h2>Question rules</h2>
        <div class="grid">
          <section class="sc"><h3>Required to publish</h3><p class="d">Enforced when you press Publish.</p>
            {#each [['rationale', 'Require rationale', 'A rationale must be written.'], ['bloom', 'Require Bloom’s level', 'Pick a level for each question.'], ['tos', 'Require TOS area', 'Pick a TOS area for each question.'], ['dupes', 'Block duplicates', 'Stop questions with the same text.']] as [k, t, d]}
              <div class="row"><div><b>{t}</b><p>{d}</p></div><Toggle bind:on={s.rules[k]} label={t} /></div>{/each}</section>
          <section class="sc"><h3>Defaults for new questions</h3><p class="d">Pre-filled in the editor.</p>
            <span class="a-lbl">Default difficulty</span><div class="seg" role="radiogroup" aria-label="Default difficulty">{#each DIFFS as n}<button class="no-neu" role="radio" aria-checked={s.defaultDiff === n} class:on={s.defaultDiff === n} onclick={() => (s.defaultDiff = n)}>{n}</button>{/each}</div>
            <span class="a-lbl m">Choices per question</span><div class="step"><button class="no-neu" aria-label="Fewer" onclick={() => s.choices > 2 && s.choices--}>−</button><span>{s.choices}</span><button class="no-neu" aria-label="More" onclick={() => s.choices < MAX_CHOICES && s.choices++}>+</button></div>
            <span class="a-lbl m">Minimum filled choices to publish</span><div class="step"><button class="no-neu" aria-label="Fewer" onclick={() => s.rules.minChoices > 2 && s.rules.minChoices--}>−</button><span>{s.rules.minChoices}</span><button class="no-neu" aria-label="More" onclick={() => s.rules.minChoices < s.choices && s.rules.minChoices++}>+</button></div></section>
          <section class="sc wide"><h3>Rule check</h3><p class="d">Published questions that break the current rules.</p>
            <div class="big"><b>{attn.n}</b><span>of {counts.published.toLocaleString()} published question{counts.published === 1 ? '' : 's'} need attention</span></div>
            {#each attn.rows as q}<div class="li"><a class="a-link" href="/admin/questions/{q.id}">{q.code}</a><small>Rationale is required</small></div>{/each}
            {#if attn.n > 4}<p class="a-help">and {attn.n - 4} more</p>{/if}</section>
        </div>

      {:else if tab === 'bloom'}
        <h2>Bloom’s levels</h2>
        <div class="grid three">
          {#each BLOOM as b}
            <section class="sc" class:offc={!s.levels[b]}><div class="row flat"><div><h3>{b}</h3><p class="d" style="margin:0">{lvlCount(b)} question{lvlCount(b) === 1 ? '' : 's'}</p></div><Toggle bind:on={s.levels[b]} label={b} /></div>
              <div class="trk" role="img" aria-label="{b}: {lvlCount(b)}"><i style="width:{counts.questions ? (lvlCount(b) / counts.questions) * 100 : 0}%"></i></div>
              <p class="a-help">{s.levels[b] ? `“${b}” can be chosen for questions.` : `“${b}” is blocked from publishing.`}</p></section>
          {/each}
        </div>

      {:else if tab === 'notify'}
        <h2>Notifications</h2>
        <div class="grid">
          <section class="sc"><h3>Alerts</h3><p class="d">Sent to admins by email.</p>
            {#each [['flagEmail', 'New flag reported', 'When a learner reports a question.'], ['review', 'Question sent to review', 'When an editor requests approval.'], ['newUser', 'New user signs up', 'Each new learner account.']] as [k, t, d]}<div class="row"><div><b>{t}</b><p>{d}</p></div><Toggle bind:on={s.notify[k]} label={t} /></div>{/each}</section>
          <section class="sc"><h3>Weekly digest</h3><p class="d">A summary of activity.</p>
            <div class="row"><div><b>Send weekly digest</b><p>Questions, flags and sign-ups.</p></div><Toggle bind:on={s.notify.digest} label="Weekly digest" /></div>
            <label class="a-lbl m" for="dd">Send on</label><select id="dd" class="a-fi no-neu" disabled={!s.notify.digest} bind:value={s.digestDay}>{#each ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as d}<option>{d}</option>{/each}</select>
            <p class="a-help">Email sending is not connected yet.</p>
            <p class="a-help">Emails go to {s.supportEmail}. Sending starts once the email integration is connected.</p></section>
        </div>

      {:else if tab === 'int'}
        <h2>Integrations</h2>
        <div class="grid">
          {#each [['cloudflare', 'Cloudflare Pages', 'Hosting and deploys for the app.'], ['supabase', 'Supabase', 'Database and sign-in for the backend phase.', 'supabaseUrl', 'https://your-project.supabase.co'], ['analytics', 'Analytics', 'Anonymous usage statistics.', 'analyticsId', 'Measurement ID'], ['email', 'Email provider', 'Digests and alert emails.'], ['ai', 'AI assistant', 'Study Buddy answers for learners.']] as [k, t, d, f, ph]}
            <section class="sc"><div class="row flat"><div><h3>{t}</h3><p class="d" style="margin:0">{d}</p></div><span class="a-pill {s.integrations[k] ? 'p-grn' : 'p-gray'}">{s.integrations[k] ? 'Connected' : 'Off'}</span></div>
              {#if f}<label class="a-lbl m" for="i{k}">{ph.startsWith('http') ? 'Project URL' : 'ID'}</label><div class="inl"><input id="i{k}" class="a-fi no-neu" placeholder={ph} bind:value={s.apiKeys[f]} /><button class="a-btn no-neu" onclick={() => test(f)}><Link size={13} /> Format check</button></div>{/if}
              <button class="a-btn no-neu {s.integrations[k] ? 'dng' : ''}" style="margin-top:14px" disabled onclick={() => { s.integrations[k] = !s.integrations[k]; }}>Not available yet</button></section>
          {/each}
        </div>

      {:else if tab === 'data'}
        <h2>Data & backup</h2>
        <div class="grid">
          <section class="sc"><h3>Backup</h3><p class="d">Everything in the admin as one JSON file.</p>
            <div class="acts"><button class="a-prim no-neu" onclick={() => exportAll()}><Download size={14} style="transform:scaleY(-1)" /> Download backup</button>
              <button class="a-btn no-neu" onclick={() => fileEl.click()}><Upload size={14} /> Restore backup</button><input bind:this={fileEl} type="file" accept="application/json,.json" hidden onchange={onFile} /></div></section>
          <section class="sc"><h3>Export</h3><p class="d">Spreadsheet-friendly files.</p>
            <div class="acts"><button class="a-btn no-neu" onclick={async () => { try { exportQuestions(await fetchAllFiltered(true)); say('Questions exported'); } catch (e) { say(e.message); } }}>Questions CSV</button></div></section>
          <section class="sc wide"><h3>Stored data</h3><p class="d">Stored in your Supabase project.</p>
            <div class="mx"><div class="mh c4"><span>Item</span><span>Count</span></div>
              {#each [['Questions', counts.questions], ['Flags', db.flags.length], ['Users', db.users.length], ['Lessons', db.lessons.length], ['Audit entries', db.audit.length]] as [n, c]}<div class="mr c4"><span>{n}</span><span>{c.toLocaleString()}</span></div>{/each}</div></section>
        </div>

      {:else}
        <h2 class="rd">Danger zone</h2>
        <div class="grid">
          {#each dangerItems as [t, d, fn]}
            <section class="sc dz"><div><h3>{t}</h3><p class="d" style="margin:0">{d}</p></div><button class="a-btn dng no-neu" onclick={() => danger(t, t, fn)}>{t.split(' ')[0]}</button></section>
          {/each}
        </div>
      {/if}
    </div>

    {#if dirty}
      <div class="bar" role="status"><span><i></i>You have unsaved changes</span><div><button class="a-btn no-neu" onclick={discard}>Discard</button><button class="a-prim no-neu" onclick={save}>Save changes</button></div></div>
    {/if}
  </div>
</main>

<style>
  .two { flex-direction: row; align-items: stretch; }
  .inner { flex: none; width: 194px; padding: 8px 0; display: flex; flex-direction: column; overflow-y: auto; }
  .pane { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; background: var(--a-card); border: 1px solid var(--a-line); border-radius: var(--admin-radius-card); overflow: hidden; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 18px 18px; }
  .inner button { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; height: 34px; margin: 1px 0; padding: 0 14px; border: 0; background: none; font: var(--admin-font-body) 'Inter', system-ui, sans-serif; color: var(--a-ink); cursor: pointer; text-align: left; flex: none; }
  .inner button:hover { background: color-mix(in srgb, var(--color-brand) 6%, var(--color-surface)); } .inner button.on { background: var(--a-brand-bg); color: var(--a-brand); font-weight: 500; }
  .inner button.on::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--a-brand); }
  .inner .danger { color: var(--color-red); margin-top: 14px; }
  .side-note { margin: auto 12px 8px; padding: 10px 11px; border-radius: 10px; background: var(--color-bg); color: var(--a-mute); line-height: 1.5; font-size: 11px; } .side-note b { color: var(--a-ink); } .side-note small { color: var(--a-faint); font-size: 10px; }
  h2 { margin: 0; padding: 14px 0 12px; font-size: var(--admin-font-section); line-height: 1.3; font-weight: 600; color: var(--color-ink); } h2.rd { color: var(--color-red); }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: stretch; } .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sc { display: flex; flex-direction: column; padding: 16px; border: 1px solid var(--a-line); border-radius: var(--admin-radius-card); background: var(--color-surface); min-width: 0; } .sc.wide { grid-column: 1 / -1; } .sc.offc { background: color-mix(in srgb, var(--color-brand) 3%, var(--color-surface)); opacity: .8; }
  .sc h3 { margin: 0; font-size: var(--admin-font-card); line-height: 1.35; font-weight: 600; color: var(--color-ink); } .d { margin: 4px 0 12px; color: var(--a-mute); font-size: var(--admin-font-caption); }
  .a-lbl.m { margin-top: 14px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--a-line2); } .row:first-of-type { border-top: 0; } .row.flat { border: 0; padding: 0; }
  .row b { font-size: var(--admin-font-body); font-weight: 600; color: var(--color-ink); } .row p { margin: 3px 0 0; font-size: var(--admin-font-caption); line-height: 1.45; color: var(--a-mute); }
  .two2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: end; }
  .seg { display: inline-flex; flex-wrap: wrap; gap: 6px; } .seg button { height: 30px; padding: 0 13px; border: 1px solid var(--a-line); border-radius: 99px; background: var(--color-surface); font: var(--admin-font-caption) 'Inter', system-ui, sans-serif; color: var(--a-ink); cursor: pointer; } .seg button:hover { border-color: color-mix(in srgb, var(--color-brand) 25%, var(--color-surface)); } .seg button.on { background: var(--a-brand); border-color: var(--a-brand); color: var(--color-on-brand); font-weight: 500; }
  .step { display: inline-flex; width: max-content; border: 1px solid var(--a-line); border-radius: 8px; overflow: hidden; } .step button, .step span { display: grid; place-content: center; width: 40px; height: 36px; border: 0; background: var(--color-surface); font: 14px 'Inter', system-ui, sans-serif; color: var(--a-brand); cursor: pointer; } .step span { width: 60px; color: var(--a-ink); font-size: 13px; border-inline: 1px solid var(--a-line); cursor: default; }
  .big { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: var(--color-bg); } .big b { font-size: 24px; font-weight: 600; color: var(--color-ink); } .big span { color: var(--a-mute); font-size: 11px; }
  .li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--a-line2); } .li b { font-weight: 500; } .li small { color: var(--a-mute); }
  .mx { border: 1px solid var(--a-line); border-radius: 10px; overflow: hidden; } .mh, .mr { display: grid; grid-template-columns: 1fr repeat(4, 80px); align-items: center; padding: 0 14px; min-height: 38px; } .mh.c4, .mr.c4 { grid-template-columns: 1fr 100px; }
  .mh { background: color-mix(in srgb, var(--color-brand) 4%, var(--color-surface)); font-size: 10px; font-weight: 600; letter-spacing: .06em; color: var(--color-ink); text-transform: uppercase; } .mr { border-top: 1px solid var(--a-line2); font-size: 11.5px; } .mh span:not(:first-child), .mr span:not(:first-child) { display: flex; justify-content: center; }
  .ck { display: grid; place-content: center; width: 20px; height: 20px; border-radius: 50%; background: var(--color-green); color: var(--color-on-brand); } .no { font-style: normal; color: color-mix(in srgb, var(--color-mute) 60%, var(--color-surface)); }
  .trk { height: 8px; margin-top: 14px; border-radius: 99px; background: color-mix(in srgb, var(--color-mute) 12%, var(--color-surface)); overflow: hidden; } .trk i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--color-brand), var(--color-brand-text)); }
  .inl { display: flex; gap: 10px; } .inl .a-fi { flex: 1; min-width: 0; }
  .acts { display: flex; flex-wrap: wrap; gap: 10px; } .dz { flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; border-color: color-mix(in srgb, var(--color-red) 25%, var(--color-surface)); } .dz .a-btn { flex: none; }
  .bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 22px; border-top: 1px solid var(--a-line); background: color-mix(in srgb, var(--color-warn) 6%, var(--color-surface)); box-shadow: 0 -6px 18px color-mix(in srgb, var(--color-shadow) 6%, transparent); } .bar span { display: flex; align-items: center; gap: 9px; font-weight: 500; } .bar span i { width: 8px; height: 8px; border-radius: 50%; background: var(--color-warn); } .bar div { display: flex; gap: 10px; }
  @media (max-width: 1100px) { .grid.three { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 900px) { .two { flex-direction: column; } .inner { width: 100%; flex-direction: row; overflow-x: auto; padding: 4px; } .inner button { width: auto; white-space: nowrap; padding: 0 14px; } .inner .danger { margin-top: 2px; } .side-note { display: none; } .grid, .grid.three { grid-template-columns: 1fr; } .two2 { grid-template-columns: 1fr; } .scroll { padding: 0 14px 20px; } .dz { flex-direction: column; align-items: stretch; } }
</style>
