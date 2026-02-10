// Thin Supabase wrapper for Tower Attack.
// Provides: TowerAttack.getPlayerId(), TowerAttack.getSupabase()
(function () {
  'use strict';

  const PLAYER_ID_KEY = 'tower_attack_player_id';

  /** Get or create a stable browser-local player ID (UUID). */
  function getPlayerId() {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
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
