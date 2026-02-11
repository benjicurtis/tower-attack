// Thin Supabase wrapper for Tower Attack.
// Provides: TowerAttack.getPlayerId(), TowerAttack.getSupabase()
(function () {
  'use strict';

  /** Generate a new random UUID on every page load. */
  function getPlayerId() {
    return crypto.randomUUID();
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
