const SB_URL = 'https://plgymomwkwldzkavhmrz.supabase.co';
const SB_KEY = 'sb_publishable_zCQvFSq18qkosIGu9HbYEA_aJLF5OG_';

let _token = null;

function sbFetch(method, path, body) {
  const headers = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  return fetch(`${SB_URL}/${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  }).then(async r => {
    const text = await r.text();
    if (r.status >= 400) {
      let msg = text;
      try { const j = JSON.parse(text); msg = j.message || j.error || j.msg || msg; } catch {}
      throw new Error(msg);
    }
    try { return JSON.parse(text); } catch { return text; }
  });
}

const sbAuth = {
  signInWithPassword: ({ email, password }) =>
    sbFetch('POST', 'auth/v1/token?grant_type=password', { email, password })
      .then(data => {
        if (data.access_token) {
          _token = data.access_token;
          const s = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, user: data.user };
          try { localStorage.setItem('sb-session', JSON.stringify(s)); } catch {}
        }
        return { data, error: null };
      }).catch(err => ({ data: null, error: err })),

  signOut: () => {
    _token = null;
    try { localStorage.removeItem('sb-session'); } catch {}
    return Promise.resolve({ error: null });
  },

  getSession: () => {
    try {
      const saved = localStorage.getItem('sb-session');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now())) {
          _token = s.access_token;
          return Promise.resolve({ data: { session: s }, error: null });
        }
      }
    } catch {}
    return Promise.resolve({ data: { session: null }, error: null });
  },

  updateUser: (updates) =>
    sbFetch('PUT', 'auth/v1/user', updates)
      .then(data => {
        try {
          const s = JSON.parse(localStorage.getItem('sb-session'));
          if (s) { s.user = data; localStorage.setItem('sb-session', JSON.stringify(s)); }
        } catch {}
        return { data, error: null };
      }).catch(err => ({ data: null, error: err }))
};

sbAuth.getSession();

function sbMfaEnroll() {
  return sbFetch('POST', 'auth/v1/mfa/totp/enroll', {})
    .then(d => ({ data: d, error: null })).catch(err => ({ data: null, error: err }));
}

function sbMfaChallenge(factorId) {
  return sbFetch('POST', 'auth/v1/mfa/challenge', { factor_id: factorId })
    .then(d => ({ data: d, error: null })).catch(err => ({ data: null, error: err }));
}

function sbMfaVerify(factorId, challengeId, code) {
  return sbFetch('POST', 'auth/v1/mfa/verify', { factor_id: factorId, challenge_id: challengeId, code })
    .then(d => {
      if (d.access_token) {
        _token = d.access_token;
        const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at, user: d.user };
        try { localStorage.setItem('sb-session', JSON.stringify(s)); } catch {}
      }
      return { data: d, error: null };
    }).catch(err => ({ data: null, error: err }));
}

function sbMfaUnenroll(factorId) {
  return sbFetch('DELETE', `auth/v1/mfa/factors/${factorId}`)
    .then(d => ({ data: d, error: null })).catch(err => ({ data: null, error: err }));
}

function sbMfaListFactors() {
  return sbFetch('GET', 'auth/v1/mfa/factors')
    .then(d => ({ data: d, error: null })).catch(err => ({ data: null, error: err }));
}
