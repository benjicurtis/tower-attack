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
  return {
    r: c.slice(1, 3),
    g: c.slice(3, 5),
    b: c.slice(5, 7)
  };
}

function bytesToColor(r, g, b) {
  return `#${r}${g}${b}`;
}

// Game mode definitions
const GAME_MODES = {
  'freeplay': {
    name: 'Free Build',
    icon: '🏗️',
    description: 'Build freely and explore. No NPCs.',
    tag: 'Casual'
  },
  'classic-stomp': {
    name: 'Classic Stomp',
    icon: '👟',
    description: 'NPCs enabled. Stomp them from above!',
    tag: 'Action'
  },
  'king-of-the-hill': {
    name: 'King of the Hill',
    icon: '👑',
    description: 'Hold the hill to earn points. Most points wins.',
    tag: 'Competitive'
  },
  'infection': {
    name: 'Infection',
    icon: '🦠',
    description: 'One player starts infected. Touch a carrier to spread it.',
    tag: 'Infection'
  }
};

// State
const state = {
  socket: null,
  playerName: '',
  playerColor: COLORS[0],
  selectedMode: null,
  classicStompMinutes: 3,
  kothMinutes: 3,
  rooms: []
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeColorPicker();
  initializeHexColorInputs();
  initializeGameModeCards();
  setupEventListeners();
  connectToServer();
  setPlayerColor(COLORS[0]);
  selectGameMode('freeplay');
});

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
  
  COLORS.forEach((color, index) => {
    const colorOption = document.createElement('div');
    colorOption.className = 'color-option';
    colorOption.style.backgroundColor = color;
    colorOption.dataset.color = color;

    colorOption.addEventListener('click', () => {
      setPlayerColor(color);
    });
    
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

    rEl.value = r;
    gEl.value = g;
    bEl.value = b;

    const rOk = isValidHexByte(r);
    const gOk = isValidHexByte(g);
    const bOk = isValidHexByte(b);

    rEl.classList.toggle('invalid', r.length > 0 && !rOk);
    gEl.classList.toggle('invalid', g.length > 0 && !gOk);
    bEl.classList.toggle('invalid', b.length > 0 && !bOk);

    if (rOk && gOk && bOk) {
      const color = bytesToColor(r, g, b);
      setPlayerColor(color);
      if (help) help.textContent = `Hex: ${color}`;
      if (preview) preview.style.backgroundColor = color;
    } else {
      if (help) help.textContent = 'Enter hex bytes (00–FF).';
      if (preview) preview.style.backgroundColor = state.playerColor;
    }
  }

  function focusNext(current) {
    const idx = all.indexOf(current);
    if (idx >= 0 && idx < all.length - 1) all[idx + 1].focus();
  }

  function focusPrev(current) {
    const idx = all.indexOf(current);
    if (idx > 0) all[idx - 1].focus();
  }

  all.forEach((el) => {
    el.addEventListener('input', () => {
      el.value = normalizeHexByte(el.value);
      if (el.value.length >= 2) focusNext(el);
      refreshFromInputs();
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !el.value) {
        focusPrev(el);
      }
    });

    el.addEventListener('blur', refreshFromInputs);
  });

  // Seed inputs from initial state.
  updateHexInputsFromColor(state.playerColor);
  if (preview) preview.style.backgroundColor = state.playerColor;
  if (help) help.textContent = `Hex: ${state.playerColor}`;
}

// Initialize game mode cards
function initializeGameModeCards() {
  const cards = document.querySelectorAll('.game-mode-card');
  
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      selectGameMode(mode);
    });
  });
}

// Select game mode
function selectGameMode(mode) {
  // Update selected state
  document.querySelectorAll('.game-mode-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  const selectedCard = document.querySelector(`[data-mode="${mode}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }
  
  state.selectedMode = mode;
  
  // Show selected mode panel
  const panel = document.getElementById('selected-mode-panel');
  const modeInfo = GAME_MODES[mode];
  
  document.getElementById('selected-mode-title').textContent = modeInfo.name;
  document.getElementById('selected-mode-description').textContent = modeInfo.description;

  // Mode-specific controls
  const controls = document.getElementById('selected-mode-controls');
  if (controls) controls.style.display = 'flex';
  const stompRow = document.getElementById('stomp-duration-row');
  if (stompRow) stompRow.style.display = mode === 'classic-stomp' ? 'flex' : 'none';
  const kothRow = document.getElementById('koth-duration-row');
  if (kothRow) kothRow.style.display = mode === 'king-of-the-hill' ? 'flex' : 'none';
  
  panel.style.display = 'block';
}

// Setup event listeners
function setupEventListeners() {
  // Create room button
  document.getElementById('create-room-btn').addEventListener('click', () => {
    createRoom();
  });
  
  // Quick join button
  document.getElementById('quick-join-btn').addEventListener('click', () => {
    quickJoinRoom();
  });
  
  // Cancel button
  document.getElementById('cancel-btn').addEventListener('click', () => {
    document.getElementById('selected-mode-panel').style.display = 'none';
    document.querySelectorAll('.game-mode-card').forEach(card => {
      card.classList.remove('selected');
    });
    state.selectedMode = null;
  });
  
  // Player name input
  const nameInput = document.getElementById('player-name');
  nameInput.addEventListener('input', (e) => {
    state.playerName = e.target.value.trim();
  });

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

  
  // Generate random name if empty
  if (!nameInput.value) {
    nameInput.value = `Player${Math.floor(Math.random() * 1000)}`;
    state.playerName = nameInput.value;
  }
}

// Connect to server
function connectToServer() {
  state.socket = io();
  
  // Listen for room updates
  state.socket.on('roomsList', (rooms) => {
    state.rooms = rooms;
    updateRoomsList();
    updatePlayerCounts();
  });
  
  // Listen for room joined event
  state.socket.on('roomJoined', (data) => {
    // Store room and player info in sessionStorage
    sessionStorage.setItem('roomId', data.roomId);
    sessionStorage.setItem('gameMode', data.gameMode);
    sessionStorage.setItem('playerName', state.playerName);
    sessionStorage.setItem('playerColor', state.playerColor);
    
    // Redirect to game
    window.location.href = '/game.html';
  });
  
  // Request initial rooms list
  state.socket.emit('requestRoomsList');
}

// Create room
function createRoom() {
  const selectedMode =
    state.selectedMode ||
    (document.querySelector('.game-mode-card.selected') && document.querySelector('.game-mode-card.selected').dataset.mode);

  if (!selectedMode) {
    alert('Please select a game mode!');
    return;
  }
  
  const playerName = state.playerName || document.getElementById('player-name').value.trim();
  
  if (!playerName) {
    alert('Please enter your name!');
    document.getElementById('player-name').focus();
    return;
  }
  
  // Emit create room event
  state.socket.emit('createRoom', {
    gameMode: selectedMode,
    playerName: playerName,
    playerColor: state.playerColor,
    classicStompMinutes: state.classicStompMinutes,
    kothMinutes: state.kothMinutes
  });
}

// Quick join room
function quickJoinRoom() {
  const selectedMode =
    state.selectedMode ||
    (document.querySelector('.game-mode-card.selected') && document.querySelector('.game-mode-card.selected').dataset.mode);

  if (!selectedMode) {
    alert('Please select a game mode!');
    return;
  }
  
  const playerName = state.playerName || document.getElementById('player-name').value.trim();
  
  if (!playerName) {
    alert('Please enter your name!');
    document.getElementById('player-name').focus();
    return;
  }
  
  // Find available room with selected mode
  const availableRoom = state.rooms.find(room => 
    room.gameMode === selectedMode && room.playerCount < room.maxPlayers
  );
  
  if (availableRoom) {
    joinRoom(availableRoom.id);
  } else {
    // Create new room if none available
    createRoom();
  }
}

// Join specific room
function joinRoom(roomId) {
  const playerName = state.playerName || document.getElementById('player-name').value.trim();
  
  if (!playerName) {
    alert('Please enter your name!');
    document.getElementById('player-name').focus();
    return;
  }
  
  state.socket.emit('joinRoom', {
    roomId: roomId,
    playerName: playerName,
    playerColor: state.playerColor
  });
}

// Update rooms list
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
    
    const modeInfo = GAME_MODES[room.gameMode];
    
    roomCard.innerHTML = `
      <div class="room-header">
        <div class="room-name">${modeInfo.icon} ${room.name}</div>
        <div class="room-mode">${modeInfo.name}</div>
      </div>
      <div class="room-players">👥 ${room.playerCount}/${room.maxPlayers} players</div>
      <button class="join-room-btn">Join Room</button>
    `;
    
    roomCard.querySelector('.join-room-btn').addEventListener('click', () => {
      joinRoom(room.id);
    });
    
    roomsList.appendChild(roomCard);
  });
}

// Update player counts on mode cards
function updatePlayerCounts() {
  const modeCounts = {};
  
  // Count players per mode
  state.rooms.forEach(room => {
    if (!modeCounts[room.gameMode]) {
      modeCounts[room.gameMode] = 0;
    }
    modeCounts[room.gameMode] += room.playerCount;
  });
  
  // Update UI
  document.querySelectorAll('.game-mode-card').forEach(card => {
    const mode = card.dataset.mode;
    const count = modeCounts[mode] || 0;
    const countElement = card.querySelector('.player-count');
    countElement.textContent = `${count} player${count !== 1 ? 's' : ''}`;
  });
}
