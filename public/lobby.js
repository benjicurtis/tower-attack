// =============================================
// TOWER ATTACK – LOBBY (Supabase Realtime)
// =============================================

// Game configuration
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

function normalizeHexByte(raw) {
  return String(raw || '')
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase()
    .slice(0, 2);
}

function isValidHexByte(v) {
  return /^[0-9A-F]{2}$/.test(v);
}

function normalizeHexColor(raw) {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return ('#' + s).toUpperCase();
  return null;
}

function colorToBytes(color) {
  const c = normalizeHexColor(color);
  if (!c) return null;
  return { r: c.slice(1, 3), g: c.slice(3, 5), b: c.slice(5, 7) };
}

function bytesToColor(r, g, b) {
  return `#${r}${g}${b}`;
}

// Game mode definitions
const GAME_MODES = {
  'freeplay': { name: 'Free Build', icon: '\u{1F3D7}\uFE0F', description: 'Build freely and explore. No NPCs.', tag: 'Casual' },
  'classic-stomp': { name: 'Classic Stomp', icon: '\u{1F45F}', description: 'NPCs enabled. Stomp them from above!', tag: 'Action' },
  'king-of-the-hill': { name: 'King of the Hill', icon: '\u{1F451}', description: 'Hold the hill to earn points. Most points wins.', tag: 'Competitive' },
  'infection': { name: 'Infection', icon: '\u{1F9A0}', description: 'One player starts infected. Touch a carrier to spread it.', tag: 'Infection' }
};

// State
const state = {
  directoryChannel: null,
  playerName: '',
  playerColor: COLORS[0],
  selectedMode: null,
  classicStompMinutes: 3,
  kothMinutes: 3,
  rooms: []
};

// ── Initialise ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initializeColorPicker();
  initializeHexColorInputs();
  initializeGameModeCards();
  setupEventListeners();
  connectToDirectory();
  setPlayerColor(COLORS[0]);
  selectGameMode('freeplay');
});

// ── Color helpers ───────────────────────────────────────────────────

function updatePaletteSelectionFromColor(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;
  document.querySelectorAll('.color-option').forEach((opt) => {
    const optColor = normalizeHexColor(opt.dataset.color);
    if (optColor === normalized) opt.classList.add('selected');
    else opt.classList.remove('selected');
  });
}

function updateHexInputsFromColor(color) {
  const bytes = colorToBytes(color);
  if (!bytes) return;
  const rEl = document.getElementById('hex-r');
  const gEl = document.getElementById('hex-g');
  const bEl = document.getElementById('hex-b');
  const preview = document.getElementById('hex-color-preview');
  if (rEl) rEl.value = bytes.r;
  if (gEl) gEl.value = bytes.g;
  if (bEl) bEl.value = bytes.b;
  if (preview) preview.style.backgroundColor = bytesToColor(bytes.r, bytes.g, bytes.b);
}

function setPlayerColor(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;
  state.playerColor = normalized;
  updatePaletteSelectionFromColor(normalized);
  updateHexInputsFromColor(normalized);
}

// Initialize color picker
function initializeColorPicker() {
  const colorPicker = document.getElementById('color-picker');
  COLORS.forEach((color) => {
    const colorOption = document.createElement('div');
    colorOption.className = 'color-option';
    colorOption.style.backgroundColor = color;
    colorOption.dataset.color = color;
    colorOption.addEventListener('click', () => { setPlayerColor(color); });
    colorPicker.appendChild(colorOption);
  });
}

function initializeHexColorInputs() {
  const rEl = document.getElementById('hex-r');
  const gEl = document.getElementById('hex-g');
  const bEl = document.getElementById('hex-b');
  const help = document.getElementById('hex-color-help');
  const preview = document.getElementById('hex-color-preview');
  if (!rEl || !gEl || !bEl) return;

  const all = [rEl, gEl, bEl];

  function refreshFromInputs() {
    const r = normalizeHexByte(rEl.value);
    const g = normalizeHexByte(gEl.value);
    const b = normalizeHexByte(bEl.value);
    rEl.value = r; gEl.value = g; bEl.value = b;
    const rOk = isValidHexByte(r), gOk = isValidHexByte(g), bOk = isValidHexByte(b);
    rEl.classList.toggle('invalid', r.length > 0 && !rOk);
    gEl.classList.toggle('invalid', g.length > 0 && !gOk);
    bEl.classList.toggle('invalid', b.length > 0 && !bOk);
    if (rOk && gOk && bOk) {
      const color = bytesToColor(r, g, b);
      setPlayerColor(color);
      if (help) help.textContent = `Hex: ${color}`;
      if (preview) preview.style.backgroundColor = color;
    } else {
      if (help) help.textContent = 'Enter hex bytes (00\u2013FF).';
      if (preview) preview.style.backgroundColor = state.playerColor;
    }
  }

  function focusNext(current) { const i = all.indexOf(current); if (i >= 0 && i < all.length - 1) all[i + 1].focus(); }
  function focusPrev(current) { const i = all.indexOf(current); if (i > 0) all[i - 1].focus(); }

  all.forEach((el) => {
    el.addEventListener('input', () => { el.value = normalizeHexByte(el.value); if (el.value.length >= 2) focusNext(el); refreshFromInputs(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !el.value) focusPrev(el); });
    el.addEventListener('blur', refreshFromInputs);
  });
  updateHexInputsFromColor(state.playerColor);
  if (preview) preview.style.backgroundColor = state.playerColor;
  if (help) help.textContent = `Hex: ${state.playerColor}`;
}

// ── Game mode cards ─────────────────────────────────────────────────

function initializeGameModeCards() {
  document.querySelectorAll('.game-mode-card').forEach(card => {
    card.addEventListener('click', () => { selectGameMode(card.dataset.mode); });
  });
}

function selectGameMode(mode) {
  document.querySelectorAll('.game-mode-card').forEach(card => card.classList.remove('selected'));
  const selectedCard = document.querySelector(`[data-mode="${mode}"]`);
  if (selectedCard) selectedCard.classList.add('selected');
  state.selectedMode = mode;

  const panel = document.getElementById('selected-mode-panel');
  const modeInfo = GAME_MODES[mode];
  document.getElementById('selected-mode-title').textContent = modeInfo.name;
  document.getElementById('selected-mode-description').textContent = modeInfo.description;

  const controls = document.getElementById('selected-mode-controls');
  if (controls) controls.style.display = 'flex';
  const stompRow = document.getElementById('stomp-duration-row');
  if (stompRow) stompRow.style.display = mode === 'classic-stomp' ? 'flex' : 'none';
  const kothRow = document.getElementById('koth-duration-row');
  if (kothRow) kothRow.style.display = mode === 'king-of-the-hill' ? 'flex' : 'none';

  panel.style.display = 'block';
}

// ── Event listeners ─────────────────────────────────────────────────

function setupEventListeners() {
  document.getElementById('create-room-btn').addEventListener('click', () => createRoom());
  document.getElementById('quick-join-btn').addEventListener('click', () => quickJoinRoom());
  document.getElementById('cancel-btn').addEventListener('click', () => {
    document.getElementById('selected-mode-panel').style.display = 'none';
    document.querySelectorAll('.game-mode-card').forEach(card => card.classList.remove('selected'));
    state.selectedMode = null;
  });

  const nameInput = document.getElementById('player-name');
  nameInput.addEventListener('input', (e) => { state.playerName = e.target.value.trim(); });

  const stompDurationSelect = document.getElementById('stomp-duration-select');
  if (stompDurationSelect) {
    stompDurationSelect.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!Number.isNaN(v)) state.classicStompMinutes = Math.max(1, Math.min(5, v));
    });
  }
  const kothDurationSelect = document.getElementById('koth-duration-select');
  if (kothDurationSelect) {
    kothDurationSelect.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!Number.isNaN(v)) state.kothMinutes = Math.max(1, Math.min(5, v));
    });
  }

  if (!nameInput.value) {
    nameInput.value = `Player${Math.floor(Math.random() * 1000)}`;
    state.playerName = nameInput.value;
  }
}

// ── Supabase directory channel ──────────────────────────────────────

function connectToDirectory() {
  const sb = TowerAttack.getSupabase();
  if (!sb) {
    showOfflineNotice('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in public/config.js.');
    return;
  }

  state.directoryChannel = sb.channel('rooms:directory');

  state.directoryChannel
    .on('presence', { event: 'sync' }, () => {
      const presenceState = state.directoryChannel.presenceState();
      state.rooms = [];
      for (const [, entries] of Object.entries(presenceState)) {
        if (entries && entries.length > 0) {
          const r = entries[0];
          if (r && r.roomId) {
            state.rooms.push({
              id: r.roomId,
              name: r.roomName || 'Room',
              gameMode: r.gameMode || 'freeplay',
              playerCount: r.playerCount || 0,
              maxPlayers: r.maxPlayers || 10
            });
          }
        }
      }
      updateRoomsList();
      updatePlayerCounts();
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        showOfflineNotice('Failed to connect to the room directory. Check your Supabase configuration.');
      }
    });
}

// ── Create / Join / Quick Join ──────────────────────────────────────

function createRoom() {
  const selectedMode =
    state.selectedMode ||
    (document.querySelector('.game-mode-card.selected') && document.querySelector('.game-mode-card.selected').dataset.mode);

  if (!selectedMode) { alert('Please select a game mode!'); return; }

  const playerName = state.playerName || document.getElementById('player-name').value.trim();
  if (!playerName) { alert('Please enter your name!'); document.getElementById('player-name').focus(); return; }

  const roomId = crypto.randomUUID();
  sessionStorage.setItem('roomId', roomId);
  sessionStorage.setItem('gameMode', selectedMode);
  sessionStorage.setItem('playerName', playerName);
  sessionStorage.setItem('playerColor', state.playerColor);
  sessionStorage.setItem('classicStompMinutes', String(state.classicStompMinutes));
  sessionStorage.setItem('kothMinutes', String(state.kothMinutes));

  window.location.href = 'game.html';
}

function quickJoinRoom() {
  const selectedMode =
    state.selectedMode ||
    (document.querySelector('.game-mode-card.selected') && document.querySelector('.game-mode-card.selected').dataset.mode);

  if (!selectedMode) { alert('Please select a game mode!'); return; }

  const playerName = state.playerName || document.getElementById('player-name').value.trim();
  if (!playerName) { alert('Please enter your name!'); document.getElementById('player-name').focus(); return; }

  const availableRoom = state.rooms.find(room =>
    room.gameMode === selectedMode && room.playerCount < room.maxPlayers
  );

  if (availableRoom) {
    joinRoom(availableRoom.id);
  } else {
    createRoom();
  }
}

function joinRoom(roomId) {
  const playerName = state.playerName || document.getElementById('player-name').value.trim();
  if (!playerName) { alert('Please enter your name!'); document.getElementById('player-name').focus(); return; }

  // Look up the game mode from the rooms list so the joiner knows the mode.
  const existingRoom = state.rooms.find(r => r.id === roomId);
  const gameMode = existingRoom ? existingRoom.gameMode : (sessionStorage.getItem('gameMode') || 'freeplay');

  sessionStorage.setItem('roomId', roomId);
  sessionStorage.setItem('gameMode', gameMode);
  sessionStorage.setItem('playerName', playerName);
  sessionStorage.setItem('playerColor', state.playerColor);

  window.location.href = 'game.html';
}

// ── Rooms list UI ───────────────────────────────────────────────────

function updateRoomsList() {
  const roomsList = document.getElementById('rooms-list');

  if (state.rooms.length === 0) {
    roomsList.innerHTML = '<div class="no-rooms">No active rooms. Create one by selecting a game mode!</div>';
    return;
  }

  roomsList.innerHTML = '';

  state.rooms.forEach(room => {
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    const modeInfo = GAME_MODES[room.gameMode] || GAME_MODES['freeplay'];

    roomCard.innerHTML = `
      <div class="room-header">
        <div class="room-name">${modeInfo.icon} ${escapeHtml(room.name)}</div>
        <div class="room-mode">${modeInfo.name}</div>
      </div>
      <div class="room-players">\u{1F465} ${room.playerCount}/${room.maxPlayers} players</div>
      <button class="join-room-btn">Join Room</button>
    `;

    roomCard.querySelector('.join-room-btn').addEventListener('click', () => joinRoom(room.id));
    roomsList.appendChild(roomCard);
  });
}

function updatePlayerCounts() {
  const modeCounts = {};
  state.rooms.forEach(room => {
    if (!modeCounts[room.gameMode]) modeCounts[room.gameMode] = 0;
    modeCounts[room.gameMode] += room.playerCount;
  });
  document.querySelectorAll('.game-mode-card').forEach(card => {
    const mode = card.dataset.mode;
    const count = modeCounts[mode] || 0;
    const countElement = card.querySelector('.player-count');
    countElement.textContent = `${count} player${count !== 1 ? 's' : ''}`;
  });
}

// ── Utilities ───────────────────────────────────────────────────────

function showOfflineNotice(message) {
  if (document.getElementById('server-offline-notice')) return;
  const notice = document.createElement('div');
  notice.id = 'server-offline-notice';
  notice.style.cssText = [
    'position: sticky', 'top: 0', 'z-index: 9999', 'padding: 12px 14px',
    'margin: 0 0 12px 0', 'border: 1px solid rgba(255,255,255,0.12)',
    'border-radius: 12px', 'background: rgba(0,0,0,0.65)',
    'backdrop-filter: blur(6px)', 'color: #fff',
    'font: 14px/1.4 Segoe UI, system-ui, -apple-system, sans-serif'
  ].join(';');
  notice.textContent = message;
  const container = document.getElementById('lobby-container');
  if (container) container.prepend(notice);
  const roomsList = document.getElementById('rooms-list');
  if (roomsList) roomsList.innerHTML = `<div class="no-rooms">${escapeHtml(message)}</div>`;
  const createBtn = document.getElementById('create-room-btn');
  const quickBtn = document.getElementById('quick-join-btn');
  if (createBtn) createBtn.disabled = true;
  if (quickBtn) quickBtn.disabled = true;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}
