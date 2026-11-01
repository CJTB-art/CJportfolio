<script>
  import { onMount } from 'svelte'
  import '../../app.css'
  import '../../lib/ds/tokens.css'
  import { DemoStorage } from '../../lib/demo-storage.js'

  const questionBank = {
    GenEd: [
      {
        id: 'gened-reading-purpose', topic: 'Reading and language',
        prompt: 'A reader compares two accounts of the same event and notes how each author’s purpose shapes the details. Which skill is being practiced?',
        options: ['Identifying the author’s purpose', 'Memorizing dates', 'Finding a word’s syllables', 'Copying a passage'],
        answer: 0, explanation: 'Purpose helps explain which details an author chooses and how the account is presented.',
      },
      {
        id: 'gened-math-pattern', topic: 'Patterns and reasoning',
        prompt: 'A pattern begins 3, 7, 11, 15. Which number continues the same rule?',
        options: ['17', '18', '19', '20'],
        answer: 2, explanation: 'Each term increases by four, so the next term is 19.',
      },
    ],
    ProfEd: [
      {
        id: 'profed-formative', topic: 'Assessment for learning',
        prompt: 'During a lesson, a teacher checks a few responses and changes the next example to address a common misunderstanding. What kind of assessment is this?',
        options: ['Formative assessment', 'Placement assessment', 'Summative assessment', 'Aptitude testing'],
        answer: 0, explanation: 'Formative assessment gives the teacher information to adjust instruction while learning is underway.',
      },
      {
        id: 'profed-scaffolding', topic: 'Teaching strategies',
        prompt: 'A teacher models one example, solves the next with the class, then lets learners try a similar problem independently. Which support is gradually reduced?',
        options: ['Scaffolding', 'Summative grading', 'Peer ranking', 'Seatwork time'],
        answer: 0, explanation: 'Scaffolding provides temporary support that is reduced as learners become more independent.',
      },
    ],
    Major: [
      {
        id: 'major-distributive', topic: 'Algebraic reasoning',
        prompt: 'Which expression is equivalent to 3(x + 4)?',
        options: ['3x + 4', '3x + 12', 'x + 12', '7x'],
        answer: 1, explanation: 'The distributive property multiplies 3 by both terms: 3x + 12.',
      },
      {
        id: 'major-data', topic: 'Data and statistics',
        prompt: 'What is the median of 2, 4, 6, 9, 15?',
        options: ['4', '6', '7', '9'],
        answer: 1, explanation: 'The median is the middle value in an ordered set, which is 6.',
      },
    ],
  }

  const subjectDetails = [
    { id: 'GenEd', title: 'General Education', detail: 'Reading, language, mathematics, and broad academic ideas.', icon: 'A' },
    { id: 'ProfEd', title: 'Professional Education', detail: 'Assessment, teaching strategies, and classroom practice.', icon: 'P' },
    { id: 'Major', title: 'Major · Mathematics', detail: 'A small sample of mathematics reasoning practice.', icon: 'M' },
  ]
  const menu = [
    { id: 'home', label: 'Home', icon: '⌂' },
    { id: 'study', label: 'Study', icon: '▣' },
    { id: 'practice', label: 'Practice', icon: '◎' },
    { id: 'progress', label: 'Progress', icon: '▥' },
    { id: 'plan', label: 'Study plan', icon: '▦' },
    { id: 'community', label: 'Community', icon: '▤' },
  ]

  const dateKey = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const today = dateKey()
  const yday = dateKey(new Date(Date.now() - 86400000))

  let activePage = $state('home')
  let subject = $state('GenEd')
  let questionIndex = $state(0)
  let selectedAnswer = $state(-1)
  let submitted = $state(false)
  let answers = $state([])
  let dailyGoal = $state(10)
  let streak = $state(0)
  let lastStudyDate = $state('')
  let settings = $state({ theme: 'light', reduceMotion: false })
  let storageAvailable = $state(true)

  const activeDeck = $derived(questionBank[subject] ?? questionBank.GenEd)
  const question = $derived(activeDeck[questionIndex % activeDeck.length])
  const todayAnswers = $derived(answers.filter((entry) => entry.day === today).length)
  const goalProgress = $derived(Math.min(100, Math.round((todayAnswers / dailyGoal) * 100)))
  const recentAnswers = $derived([...answers].reverse().slice(0, 4))
  const activeSubjectDetails = $derived(subjectDetails.find((item) => item.id === subject) ?? subjectDetails[0])

  function save() {
    DemoStorage.set('learner-state', {
      subject, questionIndex, answers, dailyGoal, streak, lastStudyDate, settings,
    })
    storageAvailable = DemoStorage.available
  }

  function setPage(page) {
    activePage = page
    if (page === 'practice') submitted = false
  }

  function startSubject(subjectId) {
    subject = subjectId
    questionIndex = 0
    selectedAnswer = -1
    submitted = false
    activePage = 'practice'
    save()
  }

  function chooseAnswer(index) {
    if (!submitted) selectedAnswer = index
  }

  function submitAnswer() {
    if (submitted || selectedAnswer < 0) return
    const isCorrect = selectedAnswer === question.answer
    answers = [...answers, {
      id: `${question.id}-${Date.now()}`,
      questionId: question.id,
      subject,
      topic: question.topic,
      prompt: question.prompt,
      selected: question.options[selectedAnswer],
      correct: question.options[question.answer],
      isCorrect,
      day: today,
      answeredAt: new Date().toISOString(),
    }]
    if (lastStudyDate !== today) {
      streak = lastStudyDate === yday ? streak + 1 : 1
      lastStudyDate = today
    }
    submitted = true
    save()
  }

  function nextQuestion() {
    questionIndex = (questionIndex + 1) % activeDeck.length
    selectedAnswer = -1
    submitted = false
    save()
  }

  function setGoal(goal) {
    dailyGoal = goal
    save()
  }

  function setTheme(theme) {
    settings = { ...settings, theme }
    document.documentElement.dataset.theme = theme
    save()
  }

  function setReducedMotion(value) {
    settings = { ...settings, reduceMotion: value }
    save()
  }

  function resetDemo() {
    DemoStorage.clearAll()
    window.location.reload()
  }

  function answerClass(index) {
    if (!submitted) return selectedAnswer === index ? 'is-selected' : ''
    if (index === question.answer) return 'is-correct'
    if (index === selectedAnswer) return 'is-incorrect'
    return ''
  }

  function sendEscapeToParent(event) {
    if (event.key !== 'Escape' || window.parent === window) return
    event.preventDefault()
    window.parent.postMessage('portfolio-demo:escape', '*')
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('reset') === '1') {
      DemoStorage.clearAll()
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    } else {
      const saved = DemoStorage.get('learner-state', null)
      if (saved && typeof saved === 'object') {
        subject = questionBank[saved.subject] ? saved.subject : 'GenEd'
        questionIndex = Number.isInteger(saved.questionIndex) ? Math.max(0, saved.questionIndex) : 0
        answers = Array.isArray(saved.answers) ? saved.answers.filter((entry) => entry && typeof entry === 'object') : []
        dailyGoal = [5, 10, 15].includes(saved.dailyGoal) ? saved.dailyGoal : 10
        streak = Number.isInteger(saved.streak) && saved.streak > 0 ? saved.streak : 0
        lastStudyDate = typeof saved.lastStudyDate === 'string' ? saved.lastStudyDate : ''
        if (saved.settings && typeof saved.settings === 'object') {
          settings = {
            theme: saved.settings.theme === 'dark' ? 'dark' : 'light',
            reduceMotion: saved.settings.reduceMotion === true,
          }
        }
      }
    }
    document.documentElement.dataset.theme = settings.theme
    storageAvailable = DemoStorage.available
    if (window.parent !== window) {
      requestAnimationFrame(() => window.parent.postMessage('portfolio-demo:ready', '*'))
    }
    document.addEventListener('keydown', sendEscapeToParent)
    return () => document.removeEventListener('keydown', sendEscapeToParent)
  })
</script>

<svelte:head>
  <title>PASA · Study demo</title>
  <meta name="robots" content="noindex" />
  <meta name="description" content="A local PASA study demo with invented sample questions." />
</svelte:head>

<div class:reduce-motion={settings.reduceMotion} class="demo-app">
  <aside class="demo-sidebar" aria-label="Demo navigation">
    <a class="brand" href="/demo" onclick={(event) => { event.preventDefault(); setPage('home') }} aria-label="PASA demo home">
      <span class="brand-mark" aria-hidden="true">P</span><span>Pasa</span>
    </a>
    <div class="sidebar-label">YOUR STUDY SPACE</div>
    <nav aria-label="Study demo sections">
      {#each menu as item (item.id)}
        <button type="button" class:active={activePage === item.id} onclick={() => setPage(item.id)}>
          <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>
        </button>
      {/each}
    </nav>
    <div class="sidebar-bottom">
      <span class="streak-mark" aria-hidden="true">✦</span>
      <div><strong>{streak} day streak</strong><small>Practice on this device</small></div>
    </div>
  </aside>

  <main class="demo-main">
    <header class="topbar">
      <div class="crumb"><span>Study space</span><span aria-hidden="true">/</span><strong>{menu.find((item) => item.id === activePage)?.label ?? 'Home'}</strong></div>
      <div class="top-actions">
        <span class="demo-pill"><i aria-hidden="true"></i>Demo mode</span>
        <button class="icon-button" type="button" onclick={() => setPage('settings')} aria-label="Open demo settings">⚙</button>
      </div>
    </header>

    <div class="demo-banner" role="status">
      <span><i aria-hidden="true"></i>Demo mode. Saved only in your browser.</span>
      <button type="button" onclick={resetDemo}>Reset demo</button>
    </div>
    {#if !storageAvailable}
      <p class="storage-note" role="status">Browser storage is unavailable. Changes will last only until this page closes.</p>
    {/if}

    <section class="content" aria-live="polite">
      {#if activePage === 'home'}
        <div class="welcome-row">
          <div><p class="eyebrow">YOUR STUDY SPACE · LOCAL DEMO</p><h1>Kumusta, Learner</h1><p class="intro">Choose a subject, practice at your pace, and keep your activity on this device.</p></div>
          <div class="welcome-stamp" aria-label="A fresh start"><span>Start</span><strong>here</strong></div>
        </div>
        <div class="home-grid">
          <section class="card snapshot-card">
            <div class="card-heading"><div><p class="eyebrow">A SMALL DAILY RHYTHM</p><h2>Your practice snapshot</h2></div><span class="sparkle" aria-hidden="true">✧</span></div>
            <div class="snapshot-body">
              <div class="goal-ring" style={`--progress:${goalProgress}%`}><div><strong>{todayAnswers}</strong><small>today</small></div></div>
              <div><h3>{goalProgress >= 100 ? 'Daily goal reached' : 'Keep a steady rhythm'}</h3><p>{todayAnswers} of {dailyGoal} toward today’s goal</p><button class="text-action" type="button" onclick={() => setPage('settings')}>Adjust daily goal <span aria-hidden="true">→</span></button></div>
            </div>
          </section>
          <section class="card subject-card">
            <div class="card-heading"><div><p class="eyebrow">PICK UP WHERE YOU ARE</p><h2>Subjects</h2></div><span class="muted-label">Practice</span></div>
            <div class="subject-list">
              {#each subjectDetails as item (item.id)}
                <button class="subject-row" type="button" onclick={() => startSubject(item.id)}>
                  <span class="subject-icon" aria-hidden="true">{item.icon}</span><span class="subject-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span class="arrow" aria-hidden="true">→</span>
                </button>
              {/each}
            </div>
          </section>
          <section class="card recent-card">
            <div class="card-heading"><div><p class="eyebrow">KEPT ON THIS DEVICE</p><h2>Recent practice</h2></div><button class="text-action" type="button" onclick={() => setPage('progress')}>See progress <span aria-hidden="true">→</span></button></div>
            {#if recentAnswers.length}
              <ul class="recent-list">
                {#each recentAnswers as entry (entry.id)}
                  <li><span class:good={entry.isCorrect} class:needs-review={!entry.isCorrect} class="answer-mark" aria-hidden="true">{entry.isCorrect ? '✓' : '↺'}</span><span><strong>{entry.topic}</strong><small>{entry.subject} · {entry.isCorrect ? 'Correct' : 'Review again'}</small></span></li>
                {/each}
              </ul>
            {:else}
              <p class="empty-note">Your practice notes will appear here after you answer a sample.</p>
            {/if}
          </section>
        </div>
      {:else if activePage === 'study'}
        <div class="page-heading"><p class="eyebrow">STUDY · OFFLINE SAMPLE</p><h1>Build understanding, one idea at a time.</h1><p class="intro">Choose a subject to read a brief topic note, then try a sample item.</p></div>
        <div class="study-grid">
          {#each subjectDetails as item (item.id)}
            <button class="study-card card" type="button" onclick={() => startSubject(item.id)}><span class="subject-icon" aria-hidden="true">{item.icon}</span><h2>{item.title}</h2><p>{item.detail}</p><span class="text-action">Open a sample set <span aria-hidden="true">→</span></span></button>
          {/each}
        </div>
      {:else if activePage === 'practice'}
        <div class="page-heading practice-heading"><div><p class="eyebrow">PRACTICE · {activeSubjectDetails.title.toUpperCase()}</p><h1>{activeSubjectDetails.title}</h1><p class="intro">Topic: {question.topic}. Choose an answer to see a short explanation.</p></div><label class="subject-select">Subject<select bind:value={subject} onchange={() => { questionIndex = 0; selectedAnswer = -1; submitted = false; save() }}><option value="GenEd">General Education</option><option value="ProfEd">Professional Education</option><option value="Major">Major · Mathematics</option></select></label></div>
        <article class="question-card card" aria-labelledby="question-title">
          <div class="question-meta"><span>Sample practice</span><span>{question.topic}</span></div>
          <h2 id="question-title">{question.prompt}</h2>
          <div class="option-list" role="group" aria-label="Answer choices">
            {#each question.options as option, index (option)}
              <button type="button" class:chosen={selectedAnswer === index && !submitted} class:correct={submitted && index === question.answer} class:incorrect={submitted && index === selectedAnswer && index !== question.answer} class="option" aria-pressed={selectedAnswer === index} disabled={submitted} onclick={() => chooseAnswer(index)}><span class="option-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span>{option}</span>{#if submitted && index === question.answer}<span class="option-check" aria-label="Correct answer">✓</span>{/if}</button>
            {/each}
          </div>
          {#if submitted}
            <div class="answer-feedback" class:feedback-good={selectedAnswer === question.answer} class:feedback-review={selectedAnswer !== question.answer} role="status"><strong>{selectedAnswer === question.answer ? 'That’s right.' : 'Review this idea.'}</strong><span>{question.explanation}</span></div>
          {/if}
          <div class="question-footer"><p>Sample data · Activity is for practice, not a prediction of passing.</p>{#if submitted}<button class="primary-button" type="button" onclick={nextQuestion}>Next sample <span aria-hidden="true">→</span></button>{:else}<button class="primary-button" type="button" disabled={selectedAnswer < 0} onclick={submitAnswer}>Check answer <span aria-hidden="true">→</span></button>{/if}</div>
        </article>
      {:else if activePage === 'progress'}
        <div class="page-heading"><p class="eyebrow">PROGRESS · LOCAL ACTIVITY</p><h1>A record of your practice.</h1><p class="intro">This view reflects only answers saved in this browser.</p></div>
        <div class="progress-grid">
          <section class="card progress-highlight"><p class="eyebrow">TODAY’S GOAL</p><div class="goal-ring large" style={`--progress:${goalProgress}%`}><div><strong>{goalProgress}%</strong><small>complete</small></div></div><p>{todayAnswers} of {dailyGoal} toward today’s goal</p></section>
          <section class="card progress-detail"><div class="card-heading"><div><p class="eyebrow">SUBJECTS</p><h2>Practice activity</h2></div><span class="subject-icon" aria-hidden="true">✦</span></div>
            {#each subjectDetails as item (item.id)}
              {@const activity = answers.filter((entry) => entry.subject === item.id)}
              <div class="activity-row"><div><strong>{item.title}</strong><small>{activity.length ? `${activity.length} saved practice ${activity.length === 1 ? 'entry' : 'entries'}` : 'No saved activity yet'}</small></div><div class="activity-track"><span style={`width:${Math.min(100, activity.length * 20)}%`}></span></div></div>
            {/each}
          </section>
          <section class="card streak-card"><p class="eyebrow">STUDY RHYTHM</p><strong class="streak-count">{streak}</strong><span>day streak</span><p>Answer a sample on another day to keep the rhythm going.</p></section>
        </div>
      {:else if activePage === 'plan'}
        <div class="page-heading"><p class="eyebrow">STUDY PLAN · YOUR SETTINGS</p><h1>Make room for a little practice.</h1><p class="intro">Your daily goal is saved on this device and can be changed whenever you need.</p></div>
        <section class="card plan-card"><div><p class="eyebrow">A DAILY RHYTHM THAT FITS</p><h2>How many items would you like to aim for?</h2><p>Choose a gentle target. It is only a personal practice goal.</p></div><div class="goal-choices" role="group" aria-label="Daily practice goal">{#each [5, 10, 15] as amount}<button type="button" class:selected={dailyGoal === amount} aria-pressed={dailyGoal === amount} onclick={() => setGoal(amount)}>{amount}<small>per day</small></button>{/each}</div></section>
      {:else if activePage === 'settings'}
        <div class="page-heading"><p class="eyebrow">SETTINGS · THIS DEVICE</p><h1>Make the study space yours.</h1><p class="intro">These preferences stay in this browser as part of the local demo.</p></div>
        <section class="card settings-card"><div class="setting-row"><div><strong>Daily practice goal</strong><small>Choose a target that feels manageable.</small></div><div class="goal-choices compact" role="group" aria-label="Daily practice goal">{#each [5, 10, 15] as amount}<button type="button" class:selected={dailyGoal === amount} aria-pressed={dailyGoal === amount} onclick={() => setGoal(amount)}>{amount}</button>{/each}</div></div><div class="setting-row"><div><strong>Color theme</strong><small>Stored locally with your demo preferences.</small></div><div class="theme-choices"><button type="button" class:selected={settings.theme === 'light'} aria-pressed={settings.theme === 'light'} onclick={() => setTheme('light')}>Light</button><button type="button" class:selected={settings.theme === 'dark'} aria-pressed={settings.theme === 'dark'} onclick={() => setTheme('dark')}>Dark</button></div></div><label class="setting-row setting-toggle"><span><strong>Reduce motion</strong><small>Use simpler transitions in this demo.</small></span><input type="checkbox" checked={settings.reduceMotion} onchange={(event) => setReducedMotion(event.currentTarget.checked)} /></label></section>
      {:else}
        <div class="page-heading"><p class="eyebrow">COMMUNITY · DEMO MODE</p><h1>Your demo stays personal.</h1><p class="intro">Community and account features are disconnected here. No posts, sign-in, or remote services are part of this sample.</p></div>
        <section class="card community-card"><span class="community-icon" aria-hidden="true">✧</span><h2>Study together, at your own pace.</h2><p>This local preview keeps your answers and progress in this browser only.</p><button class="primary-button" type="button" onclick={() => setPage('practice')}>Try a sample <span aria-hidden="true">→</span></button></section>
      {/if}
    </section>
    <footer class="demo-footer"><span>Sample practice · No account connected</span><span>Invented demo content</span></footer>
  </main>

  <nav class="mobile-nav" aria-label="Main demo navigation">
    {#each menu.slice(0, 4) as item (item.id)}<button type="button" class:active={activePage === item.id} onclick={() => setPage(item.id)}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></button>{/each}
  </nav>
</div>

<style>
  :global(html) { min-width: 320px; background: #f4f0e7; }
  :global(body) { min-width: 320px; margin: 0; color: #252d2a; background: #f4f0e7; font-family: Inter, "Inter Tight", system-ui, sans-serif; }
  :global(html[data-theme="dark"]) { background: #172522; }
  :global(html[data-theme="dark"] body) { color: #edf2ec; background: #172522; }
  :global(button), :global(select), :global(a) { font: inherit; }
  :global(button:focus-visible), :global(a:focus-visible), :global(select:focus-visible), :global(input:focus-visible) { outline: 3px solid #7861ea; outline-offset: 3px; }
  .demo-app { --ink:#252d2a; --muted:#66716c; --surface:#fffdf8; --surface-soft:#ece9f8; --line:#d9d6e4; --purple:#6a50ec; --mint:#dcece2; min-height:100vh; display:grid; grid-template-columns:224px minmax(0,1fr); background:#f4f0e7; color:var(--ink); }
  :global(html[data-theme="dark"]) .demo-app { --ink:#edf2ec; --muted:#bbc5be; --surface:#202d29; --surface-soft:#293a34; --line:#405149; --mint:#34483c; background:#172522; }
  .demo-app.reduce-motion :global(*) { scroll-behavior:auto !important; animation-duration:.01ms !important; transition-duration:.01ms !important; }
  .demo-sidebar { position:sticky; top:0; height:100vh; display:flex; flex-direction:column; padding:20px 15px 16px; border-right:1px solid var(--line); background:var(--surface); }
  .brand { display:flex; align-items:center; gap:11px; margin:0 5px 35px; color:var(--ink); font-size:1.18rem; font-weight:750; text-decoration:none; }
  .brand-mark { display:grid; width:34px; height:34px; place-items:center; border-radius:11px 11px 11px 3px; color:#fff; background:linear-gradient(145deg,#f3aa45,#ed7a50 55%,#7561eb); font-family:Georgia,serif; font-size:1.35rem; }
  .sidebar-label,.eyebrow { margin:0; color:#806c59; font-size:.62rem; font-weight:750; letter-spacing:.13em; line-height:1.45; }
  .sidebar-label { margin:0 9px 10px; }
  .demo-sidebar nav { display:grid; gap:5px; }
  .demo-sidebar nav button { display:flex; align-items:center; gap:13px; min-height:42px; padding:0 12px; border:0; border-radius:12px; color:#53605c; background:transparent; text-align:left; cursor:pointer; }
  .demo-sidebar nav button > span:first-child { width:16px; color:#738079; font-size:1rem; text-align:center; }
  .demo-sidebar nav button:hover { background:#f4f1fb; }
  .demo-sidebar nav button.active { color:#5942d3; background:#e9e5fb; font-weight:700; }
  .sidebar-bottom { display:flex; align-items:center; gap:11px; margin-top:auto; padding:13px 8px 5px; border-top:1px solid var(--line); }
  .streak-mark { display:grid; width:32px; height:32px; place-items:center; border-radius:50%; color:#a46508; background:#fff0cb; }
  .sidebar-bottom strong,.sidebar-bottom small { display:block; }
  .sidebar-bottom strong { font-size:.76rem; }
  .sidebar-bottom small { margin-top:3px; color:var(--muted); font-size:.62rem; }
  .demo-main { min-width:0; display:flex; min-height:100vh; flex-direction:column; padding:0 clamp(18px,3vw,48px); }
  .topbar { display:flex; min-height:61px; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--line); }
  .crumb,.top-actions { display:flex; align-items:center; gap:11px; }
  .crumb { color:var(--muted); font-size:.76rem; }
  .crumb strong { color:var(--ink); font-weight:650; }
  .top-actions { gap:10px; }
  .demo-pill { display:inline-flex; align-items:center; gap:7px; padding:7px 11px; border:1px solid var(--line); border-radius:99px; color:#4c5d54; background:var(--surface); font-size:.68rem; font-weight:650; }
  .demo-pill i,.demo-banner i { width:7px; height:7px; border-radius:50%; background:#63a774; }
  .icon-button { width:34px; height:34px; border:1px solid var(--line); border-radius:50%; color:var(--ink); background:var(--surface); cursor:pointer; }
  .demo-banner { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:18px 0 24px; padding:10px 14px; border:1px solid #cfe1d2; border-radius:11px; color:#42574a; background:#eef7ef; font-size:.76rem; }
  .demo-banner span { display:flex; align-items:center; gap:9px; }
  .demo-banner button { padding:6px 10px; border:1px solid #b7d2bc; border-radius:8px; color:#395042; background:#fff; font-size:.68rem; font-weight:650; cursor:pointer; }
  .storage-note { margin:-12px 0 18px; padding:10px 12px; border:1px solid #ecd79c; border-radius:9px; color:#71581c; background:#fff5d8; font-size:.75rem; }
  .content { width:min(100%,1280px); margin:0 auto; flex:1; }
  .welcome-row { display:flex; align-items:center; justify-content:space-between; gap:24px; margin:4px 0 22px; }
  h1,h2,h3,p { margin-top:0; }
  h1 { margin-bottom:8px; font-family:Fraunces, Georgia,serif; font-size:clamp(2rem,4vw,3.5rem); font-weight:600; letter-spacing:-.035em; line-height:1.05; }
  h2 { margin-bottom:0; font-size:1.15rem; letter-spacing:-.02em; }
  h3 { margin:0 0 7px; font-size:.96rem; }
  .intro { max-width:570px; margin:0; color:var(--muted); font-size:.88rem; line-height:1.6; }
  .welcome-stamp { display:grid; width:84px; height:84px; flex:0 0 84px; place-content:center; border:2px dotted #b2a9dc; border-radius:50%; color:#5041bc; background:#f7f3e6; font-family:Fraunces,Georgia,serif; text-align:center; transform:rotate(7deg); }
  .welcome-stamp span,.welcome-stamp strong { display:block; font-size:.92rem; }
  .home-grid { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:16px; }
  .card { min-width:0; border:1px solid var(--line); border-radius:18px; background:var(--surface); box-shadow:0 8px 22px rgb(48 41 88 / 5%); }
  .snapshot-card,.subject-card,.recent-card { padding:20px; }
  .card-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
  .card-heading .eyebrow { margin-bottom:6px; }
  .sparkle { color:#7460e4; font-size:1.45rem; }
  .muted-label { color:var(--muted); font-size:.72rem; }
  .snapshot-body { display:flex; align-items:center; gap:17px; }
  .snapshot-body p { margin:0 0 8px; color:var(--muted); font-size:.78rem; }
  .goal-ring { --progress:0%; position:relative; display:grid; width:88px; height:88px; flex:0 0 88px; place-items:center; border-radius:50%; background:conic-gradient(#7662ec var(--progress),#e4e2ee 0); }
  .goal-ring::before { position:absolute; inset:7px; border-radius:50%; background:var(--surface); content:""; }
  .goal-ring > div { position:relative; display:grid; text-align:center; }
  .goal-ring strong { font-size:1.14rem; }
  .goal-ring small { color:var(--muted); font-size:.58rem; }
  .text-action { padding:0; border:0; color:#6250d8; background:transparent; font-size:.73rem; font-weight:700; text-decoration:none; cursor:pointer; }
  .text-action span { margin-left:4px; }
  .subject-list { display:grid; }
  .subject-row { display:flex; align-items:center; gap:12px; padding:12px 0; border:0; border-top:1px solid var(--line); color:var(--ink); background:transparent; text-align:left; cursor:pointer; }
  .subject-row:first-child { border-top:0; }
  .subject-icon { display:grid; width:38px; height:38px; flex:0 0 38px; place-items:center; border-radius:12px; color:#5d49d2; background:#eeebff; font-family:Fraunces,Georgia,serif; font-size:1.06rem; font-weight:700; }
  .subject-copy { display:grid; flex:1; gap:4px; }
  .subject-copy strong { font-size:.82rem; }
  .subject-copy small { color:var(--muted); font-size:.69rem; line-height:1.4; }
  .arrow { color:#6a56dd; }
  .recent-card { grid-column:1 / -1; }
  .recent-card .card-heading { margin-bottom:12px; }
  .recent-list { display:grid; margin:0; padding:0; list-style:none; }
  .recent-list li { display:flex; align-items:center; gap:10px; padding:10px 0; border-top:1px solid var(--line); }
  .recent-list li > span:last-child { display:grid; gap:3px; }
  .recent-list strong { font-size:.77rem; }
  .recent-list small { color:var(--muted); font-size:.68rem; }
  .answer-mark { display:grid; width:28px; height:28px; place-items:center; border-radius:50%; background:#ecf5ee; color:#4c955f; }
  .answer-mark.needs-review { color:#a16a16; background:#fff3d7; }
  .empty-note { margin:0; padding:13px 0 1px; color:var(--muted); font-size:.78rem; }
  .page-heading { margin:3px 0 22px; }
  .page-heading .eyebrow { margin-bottom:10px; }
  .study-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:15px; }
  .study-card { display:flex; min-height:205px; flex-direction:column; align-items:flex-start; padding:20px; color:var(--ink); text-align:left; cursor:pointer; }
  .study-card h2 { margin:14px 0 8px; }
  .study-card p { margin:0 0 20px; color:var(--muted); font-size:.78rem; line-height:1.5; }
  .study-card .text-action { margin-top:auto; }
  .practice-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; }
  .subject-select { display:grid; gap:6px; min-width:205px; color:var(--muted); font-size:.68rem; }
  .subject-select select { min-height:38px; padding:0 10px; border:1px solid var(--line); border-radius:9px; color:var(--ink); background:var(--surface); font-size:.76rem; }
  .question-card { max-width:850px; margin:0 auto; padding:clamp(18px,3vw,30px); }
  .question-meta { display:flex; flex-wrap:wrap; justify-content:space-between; gap:10px; margin-bottom:18px; color:#6250d8; font-size:.68rem; font-weight:700; }
  .question-card h2 { max-width:720px; margin-bottom:20px; font-family:Fraunces,Georgia,serif; font-size:clamp(1.35rem,2.8vw,2rem); line-height:1.28; }
  .option-list { display:grid; gap:9px; }
  .option { display:flex; align-items:center; gap:12px; min-height:53px; padding:9px 13px; border:1px solid var(--line); border-radius:11px; color:var(--ink); background:var(--surface); text-align:left; cursor:pointer; }
  .option:hover:not(:disabled),.option.chosen { border-color:#9586ec; background:#f4f1ff; }
  .option:disabled { cursor:default; opacity:1; }
  .option-letter { display:grid; width:28px; height:28px; flex:0 0 28px; place-items:center; border:1px solid var(--line); border-radius:50%; color:var(--muted); font-size:.68rem; }
  .option > span:nth-child(2) { flex:1; font-size:.82rem; }
  .option.is-correct,.option.correct { border-color:#8bc09a; background:#eff8f0; }
  .option.is-incorrect,.option.incorrect { border-color:#dda18d; background:#fff1eb; }
  .option-check { color:#3f8a54; font-weight:800; }
  .answer-feedback { display:grid; gap:5px; margin-top:15px; padding:13px 15px; border:1px solid #c4ddc9; border-radius:10px; color:#355a3e; background:#eff8f0; font-size:.78rem; line-height:1.5; }
  .feedback-review { border-color:#e6d29e; color:#70551c; background:#fff7e0; }
  .question-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:18px; padding-top:14px; border-top:1px solid var(--line); }
  .question-footer p { max-width:450px; margin:0; color:var(--muted); font-size:.67rem; line-height:1.5; }
  .primary-button { display:inline-flex; align-items:center; justify-content:center; gap:9px; min-height:40px; padding:0 15px; border:0; border-radius:10px; color:#fff; background:linear-gradient(100deg,#8064f4,#624de2); font-size:.75rem; font-weight:700; cursor:pointer; }
  .primary-button:disabled { cursor:not-allowed; opacity:.45; }
  .progress-grid { display:grid; grid-template-columns:.7fr 1.3fr; gap:15px; }
  .progress-highlight,.progress-detail,.streak-card { padding:21px; }
  .progress-highlight { display:flex; min-height:238px; flex-direction:column; align-items:center; justify-content:center; }
  .progress-highlight > p:last-child { margin:12px 0 0; color:var(--muted); font-size:.76rem; }
  .goal-ring.large { width:122px; height:122px; flex-basis:122px; margin-top:9px; }
  .goal-ring.large::before { inset:9px; }
  .goal-ring.large strong { font-size:1.4rem; }
  .activity-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 0; border-top:1px solid var(--line); }
  .activity-row > div:first-child { display:grid; gap:4px; }
  .activity-row strong { font-size:.77rem; }
  .activity-row small { color:var(--muted); font-size:.66rem; }
  .activity-track { width:min(34%,150px); height:7px; overflow:hidden; border-radius:9px; background:#e9e6f1; }
  .activity-track span { display:block; height:100%; border-radius:inherit; background:#7763e9; }
  .streak-card { grid-column:1 / -1; display:grid; grid-template-columns:auto auto 1fr; align-items:center; gap:0 12px; }
  .streak-card .eyebrow { grid-column:1 / -1; margin-bottom:8px; }
  .streak-count { color:#6650dc; font-family:Fraunces,Georgia,serif; font-size:2.6rem; }
  .streak-card > span { color:var(--muted); font-size:.78rem; }
  .streak-card p { justify-self:end; margin:0; color:var(--muted); font-size:.73rem; }
  .plan-card { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:24px; }
  .plan-card h2 { margin:8px 0; font-family:Fraunces,Georgia,serif; font-size:1.55rem; }
  .plan-card p:last-child { margin:0; color:var(--muted); font-size:.78rem; }
  .goal-choices,.theme-choices { display:flex; gap:8px; }
  .goal-choices button,.theme-choices button { min-width:66px; min-height:58px; border:1px solid var(--line); border-radius:10px; color:var(--ink); background:var(--surface); font-size:.85rem; cursor:pointer; }
  .goal-choices button.selected,.theme-choices button.selected { border-color:#8d7de8; color:#5b47d1; background:#f2efff; }
  .goal-choices small { display:block; margin-top:3px; color:var(--muted); font-size:.57rem; }
  .settings-card { padding:4px 21px; }
  .setting-row { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:76px; border-bottom:1px solid var(--line); }
  .setting-row:last-child { border-bottom:0; }
  .setting-row span:first-child { display:grid; gap:5px; }
  .setting-row strong { font-size:.8rem; }
  .setting-row small { color:var(--muted); font-size:.68rem; }
  .goal-choices.compact button { min-width:42px; min-height:35px; }
  .theme-choices button { min-width:62px; min-height:34px; font-size:.68rem; }
  .setting-toggle input { width:18px; height:18px; accent-color:#6e56e8; }
  .community-card { max-width:560px; padding:28px; }
  .community-icon { display:grid; width:42px; height:42px; place-items:center; border-radius:13px; color:#674fe0; background:#f0edff; font-size:1.4rem; }
  .community-card h2 { margin:16px 0 9px; font-family:Fraunces,Georgia,serif; font-size:1.6rem; }
  .community-card p { color:var(--muted); font-size:.82rem; line-height:1.5; }
  .demo-footer { display:flex; justify-content:space-between; gap:12px; padding:20px 0 14px; color:var(--muted); font-size:.63rem; }
  .mobile-nav { display:none; }
  @media (max-width: 980px) {
    .demo-app { grid-template-columns:200px minmax(0,1fr); }
    .home-grid { grid-template-columns:1fr; }
    .recent-card { grid-column:auto; }
    .progress-grid { grid-template-columns:1fr; }
    .streak-card { grid-column:auto; }
  }
  @media (max-width: 700px) {
    .demo-app { display:block; min-height:100vh; padding-bottom:66px; }
    .demo-sidebar { display:none; }
    .demo-main { min-height:100vh; padding:0 16px; }
    .topbar { min-height:54px; }
    .crumb { gap:7px; font-size:.68rem; }
    .demo-banner { align-items:flex-start; margin:12px 0 20px; padding:9px 10px; font-size:.69rem; }
    .demo-banner button { flex:0 0 auto; }
    .welcome-row { align-items:flex-start; gap:10px; }
    .welcome-stamp { width:64px; height:64px; flex-basis:64px; }
    .welcome-stamp span,.welcome-stamp strong { font-size:.78rem; }
    h1 { font-size:2.25rem; }
    .intro { font-size:.79rem; }
    .snapshot-card,.subject-card,.recent-card { padding:16px; }
    .card-heading { margin-bottom:13px; }
    .snapshot-body { align-items:flex-start; gap:12px; }
    .goal-ring { width:74px; height:74px; flex-basis:74px; }
    .subject-copy small { font-size:.65rem; }
    .study-grid { grid-template-columns:1fr; }
    .study-card { min-height:164px; }
    .practice-heading { display:grid; align-items:start; }
    .subject-select { min-width:0; }
    .question-card { padding:16px; }
    .question-meta { font-size:.62rem; }
    .option { min-height:49px; padding:8px; }
    .option > span:nth-child(2) { font-size:.75rem; }
    .question-footer { align-items:flex-start; flex-direction:column; }
    .question-footer .primary-button { align-self:stretch; }
    .plan-card { align-items:flex-start; flex-direction:column; padding:18px; }
    .goal-choices { width:100%; }
    .goal-choices button { flex:1; }
    .settings-card { padding:2px 13px; }
    .setting-row { gap:8px; }
    .setting-row strong { font-size:.72rem; }
    .setting-row small { max-width:190px; font-size:.62rem; }
    .demo-footer { padding-bottom:8px; font-size:.58rem; }
    .mobile-nav { position:fixed; z-index:5; right:0; bottom:0; left:0; display:grid; grid-template-columns:repeat(4,1fr); padding:6px 4px max(7px,env(safe-area-inset-bottom)); border-top:1px solid var(--line); background:var(--surface); }
    .mobile-nav button { display:grid; justify-items:center; gap:3px; padding:3px 0; border:0; color:var(--muted); background:transparent; cursor:pointer; }
    .mobile-nav button.active { color:#604cdb; }
    .mobile-nav button span { font-size:1.05rem; }
    .mobile-nav small { font-size:.57rem; }
  }
</style>
