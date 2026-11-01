import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { supabase } from './supabase.js';

const OLD_SESSION = 'pasa:ui-session';

export const auth = $state({
  ready: false, // true after local session restore; the profile refreshes in the background
  signedIn: false,
  uid: '',
  email: '',
  profile: null, // { id, name, role, status, plan, exam, pct, lastSeenAt, resetAt } | null
  missing: false // true only when the profile row is confirmed gone (deleted account), never on a network error
});

let started = false;
let channel = null;
let channelUid = '';
let timer = null;
let onFocus = null;
let profileInFlight = null;
let profileInFlightUid = '';
let profileLoadedUid = '';
let profileLoadedAt = 0;
let profileAttemptUid = '';
let profileAttemptAt = 0;
const PROFILE_TTL = 60_000;
const PROFILE_RETRY = 15_000;

function friendly(error) {
  const m = String(error?.message ?? error ?? '');
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox.';
  if (/user already registered/i.test(m)) return 'That email already has an account. Try signing in.';
  if (/sign-ups are closed|database error saving new user/i.test(m)) return 'Sign-ups are closed right now.';
  if (/rate limit/i.test(m) || error?.status === 429) return 'Too many tries. Please wait a minute.';
  return 'Something went wrong. Please try again.';
}

function mapProfile(r) {
  return {
    id: r.id,
    name: r.name ?? '',
    role: r.role,
    status: r.status,
    plan: r.plan,
    exam: r.exam,
    examLevel: r.exam_level ?? '',
    major: r.major ?? '',
    leaderboardOptOut: !!r.leaderboard_opt_out,
    avatarUrl: r.avatar_url ?? '',
    pct: r.pct,
    lastSeenAt: r.last_seen_at ?? null,
    resetAt: r.reset_at ?? null
  };
}

export async function loadProfile(force = false) {
  if (!browser || !supabase || !auth.uid) return;
  const uid = auth.uid;
  const now = Date.now();
  if (!force && profileLoadedUid === uid && now - profileLoadedAt < PROFILE_TTL) return;
  if (profileInFlight && profileInFlightUid === uid) return profileInFlight;
  if (!force && profileAttemptUid === uid && now - profileAttemptAt < PROFILE_RETRY) return;
  profileAttemptUid = uid;
  profileAttemptAt = now;

  const request = (async () => {
    try {
      const { data, error } = await supabase.from('profiles')
        .select('id,name,role,status,plan,exam,pct,last_seen_at,reset_at,exam_level,major,leaderboard_opt_out,avatar_url')
        .eq('id', uid).single();
      if (uid !== auth.uid) return; // user changed while loading
      if (error) {
        // PGRST116 = no row: the account was deleted. Any other error: keep the previous profile.
        if (error.code === 'PGRST116') {
          auth.profile = null;
          auth.missing = true;
          profileLoadedUid = uid;
          profileLoadedAt = Date.now();
        }
        return;
      }
      auth.profile = mapProfile(data);
      auth.missing = false;
      profileLoadedUid = uid;
      profileLoadedAt = Date.now();
      startLive(uid);
    } catch {
      // An auth/profile network hiccup should not block the app shell.
    }
  })();
  profileInFlightUid = uid;
  profileInFlight = request;
  try {
    await request;
  } finally {
    if (profileInFlight === request) { profileInFlight = null; profileInFlightUid = ''; }
  }
}

function startLive(uid) {
  if (channel && channelUid === uid) return;
  stopLive();
  channelUid = uid;
  channel = supabase
    .channel(`profile-${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          auth.profile = null;
          auth.missing = true;
        } else if (payload.new && payload.new.id === auth.uid) {
          auth.profile = { ...(auth.profile ?? {}), ...mapProfile(payload.new) };
          profileLoadedUid = uid;
          profileLoadedAt = Date.now();
        }
      }
    )
    .subscribe();
  timer = setInterval(() => { if (document.visibilityState === 'visible') loadProfile(); }, 300_000); // realtime pushes changes; this is only a safety net
  onFocus = () => loadProfile();
  window.addEventListener('focus', onFocus);
}

function stopLive() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  channelUid = '';
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (onFocus) {
    window.removeEventListener('focus', onFocus);
    onFocus = null;
  }
}

async function apply(session, event) {
  if (session?.user) {
    const changed = auth.uid !== session.user.id;
    if (changed) { auth.profile = null; auth.missing = false; }
    auth.uid = session.user.id;
    auth.email = String(session.user.email ?? '').toLowerCase();
    auth.signedIn = true;
    if (changed || !auth.profile) await loadProfile(changed);
  } else {
    stopLive();
    auth.uid = '';
    auth.email = '';
    auth.signedIn = false;
    auth.profile = null;
    auth.missing = false;
    profileLoadedUid = '';
    profileLoadedAt = 0;
    profileAttemptUid = '';
    profileAttemptAt = 0;
  }
  if (event === 'PASSWORD_RECOVERY') goto('/reset-password');
}

export async function loadSession() {
  if (!browser || !supabase) return;
  try {
    localStorage.removeItem(OLD_SESSION);
  } catch {
    /* ignore */
  }
  if (started) return;
  started = true;
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (session?.user) {
    auth.uid = session.user.id;
    auth.email = String(session.user.email ?? '').toLowerCase();
    auth.signedIn = true;
    void loadProfile();
  }
  auth.ready = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return; // already handled by getSession above
    setTimeout(() => apply(session, event), 0);
  });
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password
  });
  return { error: error ? friendly(error) : null };
}

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email: String(email).trim().toLowerCase(),
    options: { emailRedirectTo: location.origin + '/', shouldCreateUser: false }
  });
  return { error: error ? friendly(error) : null };
}

export async function signUp(email, password, name = '') {
  const { data, error } = await supabase.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: { data: { name }, emailRedirectTo: location.origin + '/login' }
  });
  return { error: error ? friendly(error) : null, needsConfirm: !error && !data.session };
}

async function signInWithProvider(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.origin + '/' }
  });
  return { error: error ? friendly(error) : null };
}

export const signInGoogle = () => signInWithProvider('google');
export const signInFacebook = () => signInWithProvider('facebook');

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
    redirectTo: location.origin + '/reset-password'
  });
  return { error: error ? friendly(error) : null };
}

export async function updatePassword(newPw) {
  const { error } = await supabase.auth.updateUser({ password: newPw });
  return { error: error ? friendly(error) : null };
}

export async function signOut() {
  stopLive();
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore: local state is cleared below anyway */
  }
  auth.uid = '';
  auth.email = '';
  auth.signedIn = false;
  auth.profile = null;
  auth.missing = false;
}

const SELF_COLUMNS = ['name', 'exam', 'pct', 'last_seen_at', 'avatar_url'];

export async function touchSelf(patch) {
  if (!browser || !supabase || !auth.uid) return 'Not signed in.';
  const uid = auth.uid;
  const row = {};
  for (const k of SELF_COLUMNS) if (patch && k in patch) row[k] = patch[k];
  if (!Object.keys(row).length) return null;
  try {
    const { error } = await supabase.from('profiles').update(row).eq('id', uid);
    if (uid !== auth.uid) return 'Account changed before the profile could be saved.';
    if (error) return error.message || 'The profile could not be saved.';
    if (auth.profile?.id === uid) {
      auth.profile = {
        ...auth.profile,
        ...(row.name !== undefined ? { name: row.name } : {}),
        ...(row.exam !== undefined ? { exam: row.exam } : {}),
        ...(row.exam_level !== undefined ? { examLevel: row.exam_level ?? '' } : {}),
        ...(row.major !== undefined ? { major: row.major ?? '' } : {}),
        ...(row.avatar_url !== undefined ? { avatarUrl: row.avatar_url ?? '' } : {})
      };
    }
    return null;
  } catch (error) {
    return error?.message || 'The profile could not be saved.';
  }
}
