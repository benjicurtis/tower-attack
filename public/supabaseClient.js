// Thin Supabase wrapper for Tower Attack.
// Provides: TowerAttack.getPlayerId(), TowerAttack.getSupabase()
(function () {
  'use strict';

  /** Current player ID that rotates every 2 seconds. */
  let _currentPlayerId = crypto.randomUUID();

  /** Update the URL with the current UUID. */
  function updateURL() {
    const url = new URL(window.location.href);
    url.searchParams.set('uuid', _currentPlayerId);
    window.history.replaceState({}, '', url.toString());
  }

  // Set initial UUID in URL
  updateURL();

  /** Auto-rotate UUID every 2 seconds. */
  setInterval(() => {
    _currentPlayerId = crypto.randomUUID();
    updateURL();
    console.log('[UUID] Generated new player ID:', _currentPlayerId);
  }, 2000);

  /** Get the current rotating player ID. */
  function getPlayerId() {
    return _currentPlayerId;
  }

  /** Singleton Supabase client. Returns null if not configured. */
  let _client = null;
  function getSupabase() {
    if (_client) return _client;
    const url = (window.SUPABASE_URL || '').trim();
    const key = (window.SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return null;
    const { createClient } = supabase;
    _client = createClient(url, key, {
      realtime: { params: { eventsPerSecond: 20 } }
    });
    return _client;
  }

  window.TowerAttack = { getPlayerId, getSupabase };
})();
