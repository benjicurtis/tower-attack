// =============================================
// TOWER ATTACK – GAME CLIENT
// Supabase Realtime · Host-Client Architecture
// =============================================

// ── Constants ───────────────────────────────────────────────────────
const CONFIG = {
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,
  BLOCK_HEIGHT: 20,
  WORLD_SIZE: 20,
  COLORS: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
};

const INFECTION = {
  COLOR: '#FF5F1F',
  PARTICLE_RGB: { r: 255, g: 40, b: 40 }
};

const FALL_ANIMATION_MS = 600;
const FALL_RESPAWN_MS = 2000;
const FALL_MODES = ['classic-stomp', 'king-of-the-hill', 'infection'];

const MAX_PLAYERS = 10;

const NPC_TYPES = [
  { id: 'slime', name: 'Goopy', color: '#7CFC00', secondaryColor: '#32CD32', type: 'slime', speed: 2000 },
  { id: 'robot', name: 'Beep-Boop', color: '#708090', secondaryColor: '#FF4500', type: 'robot', speed: 1200 },
  { id: 'mushroom', name: 'Shroomie', color: '#FF6347', secondaryColor: '#FFE4B5', type: 'mushroom', speed: 2500 }
];

const DECORATIONS = [
  { x: 5, y: 1, z: 5, color: '#4ECDC4' }, { x: 5, y: 2, z: 6, color: '#4ECDC4' },
  { x: 5, y: 3, z: 7, color: '#4ECDC4' }, { x: 5, y: 4, z: 8, color: '#4ECDC4' },
  { x: 14, y: 1, z: 14, color: '#FF6B6B' }, { x: 14, y: 2, z: 14, color: '#FF6B6B' },
  { x: 14, y: 3, z: 14, color: '#FF6B6B' }, { x: 14, y: 4, z: 14, color: '#FF6B6B' },
  { x: 14, y: 5, z: 14, color: '#FF6B6B' },
  { x: 13, y: 1, z: 14, color: '#FF8B8B' }, { x: 12, y: 1, z: 14, color: '#FF8B8B' },
  { x: 13, y: 2, z: 14, color: '#FF8B8B' }, { x: 13, y: 3, z: 14, color: '#FF8B8B' },
  { x: 13, y: 4, z: 14, color: '#FF8B8B' },
  { x: 3, y: 1, z: 15, color: '#96CEB4' }, { x: 4, y: 1, z: 15, color: '#96CEB4' },
  { x: 3, y: 1, z: 16, color: '#96CEB4' }, { x: 4, y: 1, z: 16, color: '#96CEB4' },
  { x: 5, y: 1, z: 15, color: '#96CEB4' }, { x: 5, y: 1, z: 16, color: '#96CEB4' },
  { x: 3, y: 2, z: 16, color: '#76AE94' }, { x: 4, y: 2, z: 16, color: '#76AE94' },
  { x: 8, y: 1, z: 3, color: '#FFEAA7' }, { x: 10, y: 2, z: 3, color: '#FFEAA7' },
  { x: 12, y: 3, z: 3, color: '#FFEAA7' }
];

const MODE_NAMES = {
  'freeplay': 'Free Build', 'classic-stomp': 'Classic Stomp',
  'king-of-the-hill': 'King of the Hill', 'infection': 'Infection'
};

// ── Game State ──────────────────────────────────────────────────────
const state = {
  // Identity
  playerId: null,

  // Supabase channels
  roomChannel: null,
  directoryChannel: null,

  // Player
  player: null,
  players: new Map(),

  // World
  blocks: new Map(),
  npcs: new Map(),
  chatHistory: [],

  // Rendering
  selectedColor: 0,
  keys: {},
  camera: { x: 0, y: 0 },
  lastMoveTime: 0,
  moveDelay: 150,
  notifications: [],
  stompEffects: [],
  infectionParticles: [],
  badges: [],
  earnedBadges: [],

  // Game mode
  gameMode: 'freeplay',
  classicStomp: null,
  koth: null,
  kothControl: { controllerId: null, contested: false },
  returningToLobby: false,

  // Host election
  isHost: false,
  hostId: null,
  lastHostHeartbeatAt: 0,
  hostClaims: [],
  electionInProgress: false,
  electionTimeout: null,

  // Host-only intervals
  npcInterval: null,
  kothInterval: null,
  heartbeatInterval: null,
  heartbeatMonitorInterval: null,
  directoryUpdateInterval: null,

  // Room info
  roomId: null,
  roomName: '',

  // Sync
  stateReceived: false,
  stateRequestRetries: 0,
  stateRequestTimeout: null,

  // Throttle
  lastMoveBroadcast: 0,
  moveBroadcastDelay: 50
};

const infectionEmitAt = new Map();

// ── Canvas Setup ────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const container = document.getElementById('game-container');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  render();
}
window.addEventListener('resize', resizeCanvas);

// ── World Initialisation (ported from server.js) ────────────────────
function initializeWorld() {
  state.blocks.clear();
  for (let x = 0; x < CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z < CONFIG.WORLD_SIZE; z++) {
      const key = `${x},0,${z}`;
      state.blocks.set(key, {
        x, y: 0, z,
        color: (x + z) % 2 === 0 ? '#8B7355' : '#A0522D',
        type: 'floor'
      });
    }
  }
  DECORATIONS.forEach(block => {
    const key = `${block.x},${block.y},${block.z}`;
    state.blocks.set(key, { ...block, type: 'block' });
  });
}

function initializeNPCs() {
  state.npcs.clear();
  NPC_TYPES.forEach((npcType, index) => {
    state.npcs.set(npcType.id, {
      id: npcType.id, name: npcType.name,
      x: 8 + index * 2, y: 1, z: 10 + index,
      color: npcType.color, secondaryColor: npcType.secondaryColor,
      type: npcType.type, speed: npcType.speed,
      direction: Math.floor(Math.random() * 4),
      isAlive: true, respawnTime: 5000, animationFrame: 0
    });
  });
}

// ── Physics ─────────────────────────────────────────────────────────
function getGroundLevel(x, z) {
  for (let y = 10; y >= 0; y--) {
    if (state.blocks.has(`${x},${y},${z}`)) return y + 1;
  }
  return 1;
}

function canMoveTo(fromX, fromY, fromZ, toX, toZ) {
  if (toX < 0 || toX >= CONFIG.WORLD_SIZE || toZ < 0 || toZ >= CONFIG.WORLD_SIZE) return { canMove: false };
  const targetGroundLevel = getGroundLevel(toX, toZ);
  if (targetGroundLevel - fromY <= 1) return { canMove: true, newY: targetGroundLevel };
  return { canMove: false };
}

function respawnPlayerPosition(player) {
  player.x = Math.floor(Math.random() * 10) + 5;
  player.z = Math.floor(Math.random() * 10) + 5;
  player.y = getGroundLevel(player.x, player.z);
  player.previousY = player.y;
  player.direction = player.direction ?? 0;
}

// ── Fall Off Edge ───────────────────────────────────────────────────
function canFallOffEdge() {
  return FALL_MODES.includes(state.gameMode);
}

function triggerPlayerFall(player, fallDirection) {
  if (player.isFalling || player.isRespawning) return;
  player.isFalling = true;
  player.fallStartedAt = Date.now();
  player.fallDirection = fallDirection !== undefined ? fallDirection : player.direction;
  broadcastEvent('playerFell', {
    playerId: player.id,
    x: player.x, y: player.y, z: player.z,
    fallDirection: player.fallDirection
  });
}

function updateFallStates() {
  const now = Date.now();
  state.players.forEach(player => {
    if (player.isFalling) {
      if (now - player.fallStartedAt >= FALL_ANIMATION_MS) {
        player.isFalling = false;
        player.isRespawning = true;
        player.respawnAt = now + FALL_RESPAWN_MS;
      }
    } else if (player.isRespawning && now >= player.respawnAt) {
      player.isRespawning = false;
      if (player.id === state.playerId) {
        respawnPlayerPosition(player);
        player.spawnAnimStart = now;
        throttledBroadcastMove();
      }
    }
  });
}

// ── NPC Simulation (host only) ──────────────────────────────────────
function moveNPC(npc) {
  if (!npc.isAlive) return;
  const dirs = [{ dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }];
  let moved = false, attempts = 0;
  while (!moved && attempts < 8) {
    const d = dirs[npc.direction];
    const nx = npc.x + d.dx, nz = npc.z + d.dz;
    const res = canMoveTo(npc.x, npc.y, npc.z, nx, nz);
    if (res.canMove) {
      npc.x = nx; npc.z = nz; npc.y = res.newY;
      moved = true;
      if (Math.random() < 0.2) npc.direction = Math.floor(Math.random() * 4);
    } else {
      npc.direction = Math.floor(Math.random() * 4);
    }
    attempts++;
  }
  npc.animationFrame = (npc.animationFrame + 1) % 4;
}

function startNPCMovement() {
  stopNPCMovement();
  state.npcInterval = setInterval(() => {
    state.npcs.forEach(npc => moveNPC(npc));
    broadcastEvent('npcState', { npcs: Array.from(state.npcs.values()), t: Date.now() });
  }, 500);
}

function stopNPCMovement() {
  if (state.npcInterval) { clearInterval(state.npcInterval); state.npcInterval = null; }
}

function respawnNPC(npcId) {
  const npc = state.npcs.get(npcId);
  if (!npc) return;
  npc.isAlive = true;
  npc.x = Math.floor(Math.random() * 14) + 3;
  npc.z = Math.floor(Math.random() * 14) + 3;
  npc.y = getGroundLevel(npc.x, npc.z);
  npc.direction = Math.floor(Math.random() * 4);
  broadcastEvent('npcRespawned', { npc: { ...npc } });
}

function checkStompCollision(player) {
  const stomps = [];
  state.npcs.forEach(npc => {
    if (!npc.isAlive) return;
    if (player.x === npc.x && player.z === npc.z && player.y >= npc.y) {
      stomps.push({ npc, heightDiff: (player.previousY || player.y) - npc.y });
    }
  });
  return stomps;
}

function processStomps(player, stomps) {
  if (state.gameMode === 'classic-stomp' && state.classicStomp && state.classicStomp.startedAt && !state.classicStomp.ended) {
    const now = Date.now();
    if (state.classicStomp.endsAt && now < state.classicStomp.endsAt) {
      player.score = (player.score || 0) + stomps.length;
      broadcastEvent('scoreUpdate', { playerId: player.id, score: player.score });
    }
  }
  stomps.forEach(({ npc }) => {
    npc.isAlive = false;
    broadcastEvent('npcStomped', { npcId: npc.id, playerId: player.id, playerName: player.name });
    setTimeout(() => respawnNPC(npc.id), npc.respawnTime);
  });
}

// ── Classic Stomp Logic (host only) ─────────────────────────────────
function startClassicStompIfNeeded() {
  if (state.gameMode !== 'classic-stomp' || !state.classicStomp) return;
  if (state.classicStomp.startedAt) return;
  state.classicStomp.startedAt = Date.now();
  state.classicStomp.endsAt = state.classicStomp.startedAt + state.classicStomp.durationMs;
  state.classicStomp.ended = false;
  state.classicStomp.winner = null;
  broadcastEvent('modeState', { type: 'classicStompState', payload: { ...state.classicStomp } });
  setTimeout(() => endClassicStomp(), state.classicStomp.durationMs + 50);
}

function endClassicStomp() {
  if (state.gameMode !== 'classic-stomp' || !state.classicStomp || state.classicStomp.ended) return;
  state.classicStomp.ended = true;
  const players = Array.from(state.players.values());
  let bestScore = -Infinity, winners = [];
  for (const p of players) {
    const s = Number(p.score || 0);
    if (s > bestScore) { bestScore = s; winners = [p]; }
    else if (s === bestScore) winners.push(p);
  }
  const payload = winners.length === 1
    ? { winnerId: winners[0].id, winnerName: winners[0].name, score: bestScore, tie: false }
    : { winnerId: null, winnerName: null, score: bestScore, tie: true, winners: winners.map(w => ({ id: w.id, name: w.name })) };
  broadcastEvent('modeState', { type: 'classicStompEnded', payload });
  const text = payload.tie ? `Time! Tie at ${bestScore} points.` : `Time! ${payload.winnerName} wins with ${bestScore} points!`;
  broadcastSystemChat(text);
  sendRoomBackToLobby('Classic Stomp ended. Returning to lobby...', 5000);
}

// ── King of the Hill Logic (host only) ──────────────────────────────
function startKothIfNeeded() {
  if (state.gameMode !== 'king-of-the-hill' || !state.koth) return;
  if (state.koth.startedAt) return;
  state.koth.startedAt = Date.now();
  state.koth.endsAt = state.koth.startedAt + state.koth.durationMs;
  state.koth.ended = false;
  state.koth.controllerId = null;
  broadcastEvent('modeState', { type: 'kothState', payload: { ...state.koth } });
  if (!state.kothInterval) {
    state.kothInterval = setInterval(() => tickKoth(), 1000);
  }
}

function tickKoth() {
  if (state.gameMode !== 'king-of-the-hill' || !state.koth || !state.koth.startedAt || state.koth.ended) return;
  if (state.koth.endsAt && Date.now() >= state.koth.endsAt) { endKoth(); return; }
  const hill = state.koth.hill;
  const onHill = [];
  state.players.forEach(p => {
    if (p.isFalling || p.isRespawning) return;
    const dx = (p.x ?? 0) - hill.x, dz = (p.z ?? 0) - hill.z;
    if (Math.sqrt(dx * dx + dz * dz) <= hill.radius) onHill.push(p);
  });
  let controllerId = null, contested = false;
  if (onHill.length === 1) controllerId = onHill[0].id;
  else if (onHill.length > 1) contested = true;
  if (controllerId) {
    const controller = state.players.get(controllerId);
    if (controller) {
      controller.score = (controller.score || 0) + 1;
      broadcastEvent('scoreUpdate', { playerId: controller.id, score: controller.score });
    }
  }
  if (state.koth.controllerId !== controllerId) {
    state.koth.controllerId = controllerId;
    broadcastEvent('modeState', { type: 'kothControl', payload: { controllerId, contested } });
  }
}

function endKoth() {
  if (state.gameMode !== 'king-of-the-hill' || !state.koth || state.koth.ended) return;
  state.koth.ended = true;
  if (state.kothInterval) { clearInterval(state.kothInterval); state.kothInterval = null; }
  const players = Array.from(state.players.values());
  let bestScore = -Infinity, winners = [];
  for (const p of players) {
    const s = Number(p.score || 0);
    if (s > bestScore) { bestScore = s; winners = [p]; }
    else if (s === bestScore) winners.push(p);
  }
  const payload = winners.length === 1
    ? { winnerId: winners[0].id, winnerName: winners[0].name, score: bestScore, tie: false }
    : { winnerId: null, winnerName: null, score: bestScore, tie: true, winners: winners.map(w => ({ id: w.id, name: w.name })) };
  broadcastEvent('modeState', { type: 'kothEnded', payload });
  const text = payload.tie ? `Time! KOTH tie at ${bestScore} points.` : `Time! ${payload.winnerName} wins KOTH with ${bestScore} points!`;
  broadcastSystemChat(text);
  sendRoomBackToLobby('King of the Hill ended. Returning to lobby...', 5000);
}

// ── Infection Logic (host only) ─────────────────────────────────────
function ensureAtLeastOneInfected() {
  if (state.gameMode !== 'infection') return;
  const players = Array.from(state.players.values());
  if (players.length === 0) return;
  if (players.some(p => !!p.isInfected)) return;
  const chosen = players[Math.floor(Math.random() * players.length)];
  if (chosen) infectPlayer(chosen, null);
}

function infectPlayer(target, source) {
  if (!target || target.isInfected) return;
  target.isInfected = true;
  target.infectedAt = Date.now();
  broadcastEvent('infectionSpread', { targetId: target.id, targetName: target.name, sourceId: source ? source.id : null, sourceName: source ? source.name : null });
  const text = source ? `${target.name} was infected by ${source.name}!` : `${target.name} is infected!`;
  broadcastSystemChat(text);
  checkInfectionEnd();
}

function checkInfectionEnd() {
  if (state.gameMode !== 'infection' || state.returningToLobby) return;
  const players = Array.from(state.players.values());
  if (players.length < 2) return;
  if (!players.every(p => !!p.isInfected)) return;
  broadcastSystemChat('Everyone is infected! Returning to lobby...');
  sendRoomBackToLobby('Everyone is infected! Returning to lobby...', 4000);
}

function handleLocalInfectionSpread(movingPlayer) {
  if (state.gameMode !== 'infection' || !state.isHost) return;
  if (movingPlayer.isFalling || movingPlayer.isRespawning) return;
  ensureAtLeastOneInfected();
  const others = Array.from(state.players.values()).filter(p =>
    p.id !== movingPlayer.id && p.x === movingPlayer.x && p.z === movingPlayer.z && p.y === movingPlayer.y
    && !p.isFalling && !p.isRespawning
  );
  if (movingPlayer.isInfected) {
    others.forEach(o => infectPlayer(o, movingPlayer));
  } else {
    const inf = others.find(o => o.isInfected);
    if (inf) infectPlayer(movingPlayer, inf);
  }
}

// ── Return to lobby helper ──────────────────────────────────────────
function sendRoomBackToLobby(message, delayMs) {
  if (state.gameMode === 'freeplay' || state.returningToLobby) return;
  state.returningToLobby = true;
  broadcastEvent('returnToLobby', { message, delayMs });
  queueReturnToLobby({ message, delayMs });
}

function queueReturnToLobby(payload) {
  if (state.returningToLobby && !payload) return;
  state.returningToLobby = true;
  const message = (payload && payload.message) ? String(payload.message) : 'Match ended. Returning to lobby...';
  const delayMs = (payload && Number.isFinite(Number(payload.delayMs))) ? Number(payload.delayMs) : 2500;
  try { addChatMessage({ type: 'system', text: message, timestamp: Date.now() }); } catch (_) { /* ignore */ }
  setTimeout(() => {
    sessionStorage.removeItem('roomId');
    sessionStorage.removeItem('gameMode');
    window.location.href = '/';
  }, Math.max(0, delayMs));
}

// ── Host Election ───────────────────────────────────────────────────
function startElection() {
  if (state.electionInProgress) return;
  state.electionInProgress = true;
  state.hostClaims = [];
  const claim = { candidateId: state.playerId, ts: Date.now() };
  state.hostClaims.push(claim);
  broadcastEvent('hostClaim', claim);
  if (state.electionTimeout) clearTimeout(state.electionTimeout);
  state.electionTimeout = setTimeout(() => resolveElection(), 600);
}

function handleHostClaim(claim) {
  if (!state.electionInProgress) {
    // Someone else started an election — join it
    state.electionInProgress = true;
    state.hostClaims = [];
    const myClaim = { candidateId: state.playerId, ts: Date.now() };
    state.hostClaims.push(myClaim);
    broadcastEvent('hostClaim', myClaim);
    if (state.electionTimeout) clearTimeout(state.electionTimeout);
    state.electionTimeout = setTimeout(() => resolveElection(), 600);
  }
  state.hostClaims.push(claim);
}

function resolveElection() {
  state.electionInProgress = false;
  if (state.hostClaims.length === 0) return;
  state.hostClaims.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a.candidateId < b.candidateId ? -1 : 1;
  });
  const winner = state.hostClaims[0];
  state.hostId = winner.candidateId;
  state.lastHostHeartbeatAt = Date.now();
  if (winner.candidateId === state.playerId) {
    becomeHost();
  } else {
    relinquishHost();
    // Request state from new host
    requestStateFromHost();
  }
}

function becomeHost() {
  if (state.isHost) return;
  state.isHost = true;
  state.hostId = state.playerId;
  console.log('[Host] This client is now the room host.');

  // If we don't have world state yet, initialize it
  if (state.blocks.size === 0) {
    initializeWorld();
    if (state.gameMode === 'classic-stomp') initializeNPCs();
  }

  // Start host duties
  startHeartbeat();
  if (state.gameMode === 'classic-stomp') {
    if (state.npcs.size === 0) initializeNPCs();
    startNPCMovement();
    startClassicStompIfNeeded();
  }
  if (state.gameMode === 'king-of-the-hill') {
    startKothIfNeeded();
  }
  if (state.gameMode === 'infection') {
    ensureAtLeastOneInfected();
  }

  // Advertise on directory
  advertiseRoom();

  // Show host controls
  if (typeof updatePlayersButton === 'function') updatePlayersButton();
}

function relinquishHost() {
  if (!state.isHost) return;
  state.isHost = false;
  console.log('[Host] Relinquishing host role.');
  stopHeartbeat();
  stopNPCMovement();
  if (state.kothInterval) { clearInterval(state.kothInterval); state.kothInterval = null; }
  stopDirectoryAdvertise();

  // Hide host controls
  if (typeof updatePlayersButton === 'function') updatePlayersButton();
}

function startHeartbeat() {
  stopHeartbeat();
  state.heartbeatInterval = setInterval(() => {
    broadcastEvent('hostHeartbeat', { hostId: state.playerId, t: Date.now() });
  }, 1000);
  // Send one immediately
  broadcastEvent('hostHeartbeat', { hostId: state.playerId, t: Date.now() });
}

function stopHeartbeat() {
  if (state.heartbeatInterval) { clearInterval(state.heartbeatInterval); state.heartbeatInterval = null; }
}

function startHeartbeatMonitor() {
  if (state.heartbeatMonitorInterval) return;
  state.heartbeatMonitorInterval = setInterval(() => {
    if (state.isHost) return; // Host doesn't monitor itself
    if (!state.hostId) return;
    if (Date.now() - state.lastHostHeartbeatAt > 3500) {
      console.log('[Election] Host heartbeat stale, starting election.');
      state.hostId = null;
      startElection();
    }
  }, 1000);
}

// ── State Sync ──────────────────────────────────────────────────────
function requestStateFromHost() {
  if (state.stateReceived) return;
  state.stateRequestRetries = 0;
  doStateRequest();
}

function doStateRequest() {
  if (state.stateReceived) return;
  broadcastEvent('stateRequest', { requesterId: state.playerId });
  state.stateRequestRetries++;
  if (state.stateRequestTimeout) clearTimeout(state.stateRequestTimeout);
  state.stateRequestTimeout = setTimeout(() => {
    if (state.stateReceived) return;
    if (state.stateRequestRetries < 5) {
      console.log('[Sync] State not received, retrying...');
      doStateRequest();
    } else {
      console.log('[Sync] No state received after retries. Initializing fresh world.');
      initializeWorld();
      if (state.gameMode === 'classic-stomp') initializeNPCs();
      state.stateReceived = true;
    }
  }, 2000);
}

function buildStateSnapshot() {
  return {
    blocks: Array.from(state.blocks.values()),
    npcs: Array.from(state.npcs.values()),
    chatHistory: state.chatHistory.slice(-50),
    gameMode: state.gameMode,
    stomp: state.classicStomp,
    koth: state.koth,
    players: Array.from(state.players.values()).map(p => ({
      id: p.id, name: p.name, color: p.color,
      x: p.x, y: p.y, z: p.z, direction: p.direction,
      score: p.score, isInfected: p.isInfected, infectedAt: p.infectedAt
    }))
  };
}

function applyStateSnapshot(snapshot) {
  if (!snapshot) return;
  // Blocks
  state.blocks.clear();
  if (snapshot.blocks) {
    snapshot.blocks.forEach(b => {
      state.blocks.set(`${b.x},${b.y},${b.z}`, b);
    });
  }
  // NPCs
  if (snapshot.npcs) {
    state.npcs.clear();
    snapshot.npcs.forEach(npc => state.npcs.set(npc.id, npc));
  }
  // Chat
  if (snapshot.chatHistory) {
    snapshot.chatHistory.forEach(msg => addChatMessage(msg));
  }
  // Mode state
  if (snapshot.stomp) state.classicStomp = snapshot.stomp;
  if (snapshot.koth) state.koth = snapshot.koth;
  // Player positions from snapshot
  if (snapshot.players) {
    snapshot.players.forEach(p => {
      if (p.id === state.playerId) {
        // Don't overwrite own position
        const existing = state.players.get(p.id);
        if (existing) {
          existing.score = p.score;
          existing.isInfected = p.isInfected;
          existing.infectedAt = p.infectedAt;
        }
      } else {
        state.players.set(p.id, p);
      }
    });
  }
  state.stateReceived = true;
  if (state.stateRequestTimeout) { clearTimeout(state.stateRequestTimeout); state.stateRequestTimeout = null; }
}

// ── Directory Advertising (host only) ───────────────────────────────
function advertiseRoom() {
  stopDirectoryAdvertise();
  const sb = TowerAttack.getSupabase();
  if (!sb) return;

  state.directoryChannel = sb.channel('rooms:directory', {
    config: { presence: { key: state.roomId } }
  });

  state.directoryChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await updateDirectoryPresence();
    }
  });

  // Refresh periodically
  state.directoryUpdateInterval = setInterval(() => updateDirectoryPresence(), 3000);
}

async function updateDirectoryPresence() {
  if (!state.directoryChannel || !state.isHost) return;
  try {
    await state.directoryChannel.track({
      roomId: state.roomId,
      roomName: state.roomName,
      gameMode: state.gameMode,
      playerCount: state.players.size,
      maxPlayers: MAX_PLAYERS,
      createdAt: Date.now()
    });
  } catch (e) {
    console.warn('[Directory] Failed to update presence:', e);
  }
}

function stopDirectoryAdvertise() {
  if (state.directoryUpdateInterval) { clearInterval(state.directoryUpdateInterval); state.directoryUpdateInterval = null; }
  if (state.directoryChannel) {
    try { state.directoryChannel.untrack(); } catch (_) { /* ignore */ }
    try { TowerAttack.getSupabase()?.removeChannel(state.directoryChannel); } catch (_) { /* ignore */ }
    state.directoryChannel = null;
  }
}

// ── Broadcast Helper ────────────────────────────────────────────────
function broadcastEvent(event, payload) {
  if (!state.roomChannel) return;
  state.roomChannel.send({ type: 'broadcast', event, payload });
}

function broadcastSystemChat(text) {
  const msg = { id: crypto.randomUUID(), type: 'system', text, timestamp: Date.now() };
  state.chatHistory.push(msg);
  if (state.chatHistory.length > 100) state.chatHistory = state.chatHistory.slice(-100);
  addChatMessage(msg);
  broadcastEvent('chatMessage', msg);
}

// ── Connect to Room ─────────────────────────────────────────────────
function connectToRoom() {
  const sb = TowerAttack.getSupabase();
  if (!sb) {
    showOfflineOverlay('Supabase not configured.\n\nSet SUPABASE_URL and SUPABASE_ANON_KEY in public/config.js.');
    return;
  }

  state.playerId = TowerAttack.getPlayerId();
  state.roomId = sessionStorage.getItem('roomId');
  state.gameMode = sessionStorage.getItem('gameMode') || 'freeplay';
  const playerName = sessionStorage.getItem('playerName') || `Player${Math.floor(Math.random() * 1000)}`;
  const playerColor = sessionStorage.getItem('playerColor') || CONFIG.COLORS[0];
  state.roomName = `${playerName}'s Room`;

  if (!state.roomId) { window.location.href = '/'; return; }

  // Set up mode-specific state
  const stompMin = Math.max(1, Math.min(5, parseInt(sessionStorage.getItem('classicStompMinutes') || '3', 10) || 3));
  const kothMin = Math.max(1, Math.min(5, parseInt(sessionStorage.getItem('kothMinutes') || '3', 10) || 3));
  if (state.gameMode === 'classic-stomp') {
    state.classicStomp = { durationMs: stompMin * 60000, startedAt: null, endsAt: null, ended: false, winner: null };
  }
  if (state.gameMode === 'king-of-the-hill') {
    state.koth = { durationMs: kothMin * 60000, startedAt: null, endsAt: null, ended: false, hill: { x: 10, z: 10, radius: 2 }, controllerId: null };
  }

  // Create local player
  state.player = {
    id: state.playerId,
    name: playerName,
    color: playerColor,
    x: Math.floor(Math.random() * 10) + 5,
    y: 1,
    z: Math.floor(Math.random() * 10) + 5,
    previousY: 1,
    direction: 0,
    badges: [],
    score: (state.gameMode === 'classic-stomp' || state.gameMode === 'king-of-the-hill') ? 0 : undefined,
    isInfected: false,
    infectedAt: null,
    lastPushAt: 0
  };
  state.players.set(state.playerId, state.player);
  nameInput.placeholder = playerName;

  // Update game mode info
  const gameModeInfo = document.getElementById('game-mode-info');
  if (gameModeInfo) gameModeInfo.textContent = `Mode: ${MODE_NAMES[state.gameMode] || state.gameMode}`;

  // Hide irrelevant HUDs
  if (state.gameMode !== 'classic-stomp') {
    const hud = document.getElementById('classic-stomp-hud');
    if (hud) hud.style.display = 'none';
  }
  if (state.gameMode !== 'king-of-the-hill') {
    const hud = document.getElementById('koth-hud');
    if (hud) hud.style.display = 'none';
  }

  // Create room channel
  state.roomChannel = sb.channel(`room:${state.roomId}`, {
    config: {
      broadcast: { self: false, ack: false },
      presence: { key: state.playerId }
    }
  });

  // ── Presence handlers ──
  state.roomChannel.on('presence', { event: 'sync' }, () => {
    const presenceState = state.roomChannel.presenceState();
    const presentIds = new Set();
    for (const [key, entries] of Object.entries(presenceState)) {
      if (entries && entries.length > 0) {
        const e = entries[0];
        const pid = e.playerId || key;
        presentIds.add(pid);
        if (pid !== state.playerId && !state.players.has(pid)) {
          // New player from presence - add with minimal info
          state.players.set(pid, {
            id: pid, name: e.name || 'Player', color: e.color || '#FFFFFF',
            x: 10, y: 1, z: 10, direction: 0, score: 0,
            isInfected: false, infectedAt: null, badges: [], lastPushAt: 0
          });
        }
        // Update name/color from presence
        const existing = state.players.get(pid);
        if (existing && pid !== state.playerId) {
          existing.name = e.name || existing.name;
          existing.color = e.color || existing.color;
        }
      }
    }
    // Remove players no longer in presence (never remove local player)
    for (const [pid] of state.players) {
      if (pid === state.playerId) continue;
      if (!presentIds.has(pid)) {
        const gone = state.players.get(pid);
        state.players.delete(pid);
        if (gone) addChatMessage({ type: 'system', text: `${gone.name} left the game`, timestamp: Date.now() });
        // If the host left, trigger election
        if (pid === state.hostId) {
          state.hostId = null;
          state.lastHostHeartbeatAt = 0;
          setTimeout(() => startElection(), 300);
        }
      }
    }
    // Update directory if host
    if (state.isHost) updateDirectoryPresence();
  });

  // ── Broadcast handlers ──

  state.roomChannel.on('broadcast', { event: 'playerMove' }, ({ payload }) => {
    if (!payload || payload.playerId === state.playerId) return;
    const p = state.players.get(payload.playerId);
    if (p) {
      // If player was falling/respawning, they've respawned – show spawn animation
      if (p.isFalling || p.isRespawning) {
        p.isFalling = false;
        p.isRespawning = false;
        p.spawnAnimStart = Date.now();
      }
      p.previousY = p.y;
      p.x = payload.x; p.y = payload.y; p.z = payload.z;
      p.direction = payload.direction;
      if (payload.score !== undefined) p.score = payload.score;
      if (payload.isInfected !== undefined) p.isInfected = payload.isInfected;

      // Host: check stomp collisions for remote players too
      if (state.isHost && state.gameMode === 'classic-stomp') {
        const stomps = checkStompCollision(p);
        if (stomps.length > 0) processStomps(p, stomps);
      }

      // Host: infection spread for remote players too
      if (state.isHost) handleLocalInfectionSpread(p);
    }
  });

  state.roomChannel.on('broadcast', { event: 'blockPlaced' }, ({ payload }) => {
    if (!payload) return;
    const key = `${payload.x},${payload.y},${payload.z}`;
    if (!state.blocks.has(key)) {
      state.blocks.set(key, { x: payload.x, y: payload.y, z: payload.z, color: payload.color, type: 'block', placedBy: payload.placedBy });
    }
  });

  state.roomChannel.on('broadcast', { event: 'blockRemoved' }, ({ payload }) => {
    if (!payload) return;
    const key = `${payload.x},${payload.y},${payload.z}`;
    const block = state.blocks.get(key);
    if (block && block.type !== 'floor') state.blocks.delete(key);
  });

  state.roomChannel.on('broadcast', { event: 'chatMessage' }, ({ payload }) => {
    if (!payload) return;
    state.chatHistory.push(payload);
    if (state.chatHistory.length > 100) state.chatHistory = state.chatHistory.slice(-100);
    addChatMessage(payload);
  });

  state.roomChannel.on('broadcast', { event: 'hostHeartbeat' }, ({ payload }) => {
    if (!payload) return;
    state.hostId = payload.hostId;
    state.lastHostHeartbeatAt = Date.now();
    if (state.electionInProgress) {
      // Election resolved by existing host
      state.electionInProgress = false;
      if (state.electionTimeout) { clearTimeout(state.electionTimeout); state.electionTimeout = null; }
    }
    if (payload.hostId !== state.playerId && state.isHost) {
      // Another host exists - relinquish
      relinquishHost();
    }
  });

  state.roomChannel.on('broadcast', { event: 'hostClaim' }, ({ payload }) => {
    if (!payload || payload.candidateId === state.playerId) return;
    handleHostClaim(payload);
  });

  state.roomChannel.on('broadcast', { event: 'stateRequest' }, ({ payload }) => {
    if (!payload || !state.isHost) return;
    // Host responds with state snapshot
    broadcastEvent('stateSnapshot', { to: payload.requesterId, snapshot: buildStateSnapshot() });
  });

  state.roomChannel.on('broadcast', { event: 'stateSnapshot' }, ({ payload }) => {
    if (!payload) return;
    // Only accept if addressed to us (or broadcast to all)
    if (payload.to && payload.to !== state.playerId) return;
    if (!state.stateReceived) {
      console.log('[Sync] Received state snapshot.');
      applyStateSnapshot(payload.snapshot);
    }
  });

  state.roomChannel.on('broadcast', { event: 'npcState' }, ({ payload }) => {
    if (!payload || state.isHost) return;
    if (payload.npcs) {
      payload.npcs.forEach(npc => state.npcs.set(npc.id, npc));
    }
  });

  state.roomChannel.on('broadcast', { event: 'npcStomped' }, ({ payload }) => {
    if (!payload) return;
    const npc = state.npcs.get(payload.npcId);
    if (npc) {
      npc.isAlive = false;
      state.stompEffects.push({ x: npc.x, y: npc.y, z: npc.z, startTime: Date.now(), duration: 1000 });
    }
  });

  state.roomChannel.on('broadcast', { event: 'npcRespawned' }, ({ payload }) => {
    if (!payload || !payload.npc) return;
    state.npcs.set(payload.npc.id, payload.npc);
  });

  state.roomChannel.on('broadcast', { event: 'scoreUpdate' }, ({ payload }) => {
    if (!payload) return;
    const p = state.players.get(payload.playerId);
    if (p) p.score = payload.score;
    if (payload.playerId === state.playerId && state.player) state.player.score = payload.score;
  });

  state.roomChannel.on('broadcast', { event: 'modeState' }, ({ payload }) => {
    if (!payload) return;
    switch (payload.type) {
      case 'classicStompState':
        state.classicStomp = payload.payload;
        break;
      case 'classicStompEnded':
        if (state.gameMode === 'classic-stomp') {
          const ep = payload.payload;
          if (ep.tie) addChatMessage({ type: 'system', text: `Time! Tie at ${ep.score} points.`, timestamp: Date.now() });
          else addChatMessage({ type: 'system', text: `Time! ${ep.winnerName} wins with ${ep.score} points!`, timestamp: Date.now() });
        }
        break;
      case 'kothState':
        state.koth = payload.payload;
        state.kothControl = { controllerId: payload.payload ? payload.payload.controllerId : null, contested: false };
        break;
      case 'kothControl':
        if (payload.payload) state.kothControl = { controllerId: payload.payload.controllerId || null, contested: !!payload.payload.contested };
        break;
      case 'kothEnded':
        if (state.gameMode === 'king-of-the-hill') {
          const kp = payload.payload;
          if (kp.tie) addChatMessage({ type: 'system', text: `Time! KOTH tie at ${kp.score} points.`, timestamp: Date.now() });
          else addChatMessage({ type: 'system', text: `Time! ${kp.winnerName} wins KOTH with ${kp.score} points!`, timestamp: Date.now() });
        }
        break;
    }
  });

  state.roomChannel.on('broadcast', { event: 'returnToLobby' }, ({ payload }) => {
    if (state.gameMode === 'freeplay') return;
    queueReturnToLobby(payload);
  });

  state.roomChannel.on('broadcast', { event: 'playerPushed' }, ({ payload }) => {
    if (!payload) return;
    const victim = state.players.get(payload.victimId);
    if (victim) {
      victim.previousY = victim.y;
      victim.x = payload.newX;
      victim.y = payload.newY;
      victim.z = payload.newZ;
    }
  });

  state.roomChannel.on('broadcast', { event: 'playerFell' }, ({ payload }) => {
    if (!payload) return;
    const player = state.players.get(payload.playerId);
    if (player && !player.isFalling && !player.isRespawning) {
      if (payload.x !== undefined) { player.x = payload.x; player.y = payload.y; player.z = payload.z; }
      player.isFalling = true;
      player.fallStartedAt = Date.now();
      player.fallDirection = payload.fallDirection !== undefined ? payload.fallDirection : player.direction;
    }
  });

  state.roomChannel.on('broadcast', { event: 'infectionSpread' }, ({ payload }) => {
    if (!payload) return;
    const target = state.players.get(payload.targetId);
    if (target) {
      target.isInfected = true;
      target.infectedAt = Date.now();
    }
  });

  state.roomChannel.on('broadcast', { event: 'playerKicked' }, ({ payload }) => {
    if (!payload) return;
    if (payload.kickedId === state.playerId) {
      // We got kicked — leave the room
      alert('You have been kicked from the game by the host.');
      if (state.roomChannel) { try { state.roomChannel.untrack(); } catch (_) { /* ignore */ } }
      sessionStorage.removeItem('roomId');
      sessionStorage.removeItem('gameMode');
      window.location.href = '/';
      return;
    }
    // Someone else was kicked — remove them from local player map
    const kicked = state.players.get(payload.kickedId);
    if (kicked) {
      state.players.delete(payload.kickedId);
      addChatMessage({ type: 'system', text: `${kicked.name} was kicked by the host`, timestamp: Date.now() });
    }
  });

  state.roomChannel.on('broadcast', { event: 'playerNameChange' }, ({ payload }) => {
    if (!payload || payload.playerId === state.playerId) return;
    const p = state.players.get(payload.playerId);
    if (p) p.name = payload.newName;
  });

  // ── Subscribe ──
  state.roomChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[Room] Subscribed to room channel.');
      // Track own presence
      await state.roomChannel.track({
        playerId: state.playerId,
        name: state.player.name,
        color: state.player.color
      });

      // Spawn onto valid ground
      respawnPlayerPosition(state.player);

      // Announce join
      addChatMessage({ type: 'system', text: `${state.player.name} joined the game`, timestamp: Date.now() });
      broadcastEvent('chatMessage', { id: crypto.randomUUID(), type: 'system', text: `${state.player.name} joined the game`, timestamp: Date.now() });

      // Wait briefly for a host heartbeat; if none, become host
      setTimeout(() => {
        if (!state.hostId || Date.now() - state.lastHostHeartbeatAt > 2000) {
          console.log('[Election] No host detected, starting election.');
          startElection();
        } else {
          // Host exists, request state
          requestStateFromHost();
        }
      }, 1500);

      // Start heartbeat monitor
      startHeartbeatMonitor();
    } else if (status === 'CHANNEL_ERROR') {
      showOfflineOverlay('Failed to connect to the room. Check your Supabase configuration.');
    }
  });
}

// ── Movement ────────────────────────────────────────────────────────
function handleMovement() {
  if (!state.player || !state.roomChannel) return;
  if (state.player.isFalling || state.player.isRespawning) return;
  const now = Date.now();
  if (now - state.lastMoveTime < state.moveDelay) return;

  let moved = false;
  let newX = state.player.x, newZ = state.player.z;
  let newDirection = state.player.direction;

  if (state.keys['KeyW'] || state.keys['ArrowUp']) { newZ--; newDirection = 2; moved = true; }
  else if (state.keys['KeyS'] || state.keys['ArrowDown']) { newZ++; newDirection = 0; moved = true; }
  else if (state.keys['KeyA'] || state.keys['ArrowLeft']) { newX--; newDirection = 1; moved = true; }
  else if (state.keys['KeyD'] || state.keys['ArrowRight']) { newX++; newDirection = 3; moved = true; }

  // Rotation only
  if (state.keys['KeyQ']) {
    newDirection = (state.player.direction + 3) % 4;
    state.player.direction = newDirection;
    state.lastMoveTime = now;
    throttledBroadcastMove();
    return;
  }
  if (state.keys['KeyE']) {
    newDirection = (state.player.direction + 1) % 4;
    state.player.direction = newDirection;
    state.lastMoveTime = now;
    throttledBroadcastMove();
    return;
  }

  if (moved) {
    // Check if player walks off the edge in supported game modes
    if (canFallOffEdge() && (newX < 0 || newX >= CONFIG.WORLD_SIZE || newZ < 0 || newZ >= CONFIG.WORLD_SIZE)) {
      state.player.direction = newDirection;
      triggerPlayerFall(state.player);
      state.lastMoveTime = now;
      return;
    }
    newX = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, newX));
    newZ = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, newZ));
    const moveResult = canMoveTo(state.player.x, state.player.y, state.player.z, newX, newZ);

    if (moveResult.canMove) {
      state.player.previousY = state.player.y;
      state.player.x = newX;
      state.player.z = newZ;
      state.player.y = moveResult.newY;
      state.player.direction = newDirection;

      // Host: check stomp collisions
      if (state.isHost && state.gameMode === 'classic-stomp') {
        const stomps = checkStompCollision(state.player);
        if (stomps.length > 0) processStomps(state.player, stomps);
      }

      // Host: infection spread
      if (state.isHost) handleLocalInfectionSpread(state.player);

      throttledBroadcastMove();
    } else if (newDirection !== state.player.direction) {
      state.player.direction = newDirection;
      throttledBroadcastMove();
    }
    state.lastMoveTime = now;
  }
}

function throttledBroadcastMove() {
  const now = Date.now();
  if (now - state.lastMoveBroadcast < state.moveBroadcastDelay) return;
  state.lastMoveBroadcast = now;
  broadcastEvent('playerMove', {
    playerId: state.playerId,
    x: state.player.x, y: state.player.y, z: state.player.z,
    direction: state.player.direction,
    previousY: state.player.previousY,
    score: state.player.score,
    isInfected: state.player.isInfected
  });
}

// ── Block Placement / Removal ───────────────────────────────────────
function placeBlock() {
  if (!state.player || state.player.isFalling || state.player.isRespawning) return;
  const { x, y, z, direction } = state.player;
  let targetX = x, targetZ = z;
  switch (direction) {
    case 0: targetZ++; break; case 1: targetX--; break;
    case 2: targetZ--; break; case 3: targetX++; break;
  }
  targetX = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetX));
  targetZ = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetZ));
  let targetY = 1;
  for (let checkY = 10; checkY >= 1; checkY--) {
    if (state.blocks.has(`${targetX},${checkY},${targetZ}`)) { targetY = checkY + 1; break; }
  }
  if (targetY <= 10) {
    const key = `${targetX},${targetY},${targetZ}`;
    if (!state.blocks.has(key)) {
      const block = { x: targetX, y: targetY, z: targetZ, color: CONFIG.COLORS[state.selectedColor], type: 'block', placedBy: state.playerId };
      state.blocks.set(key, block);
      broadcastEvent('blockPlaced', block);
    }
  }
}

function removeBlock() {
  if (!state.player || state.player.isFalling || state.player.isRespawning) return;
  const { x, z, direction } = state.player;
  let targetX = x, targetZ = z;
  switch (direction) {
    case 0: targetZ++; break; case 1: targetX--; break;
    case 2: targetZ--; break; case 3: targetX++; break;
  }
  targetX = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetX));
  targetZ = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetZ));
  for (let y = 10; y >= 1; y--) {
    const key = `${targetX},${y},${targetZ}`;
    const block = state.blocks.get(key);
    if (block && block.type !== 'floor') {
      state.blocks.delete(key);
      broadcastEvent('blockRemoved', { x: targetX, y, z: targetZ });
      break;
    }
  }
}

// ── Push ────────────────────────────────────────────────────────────
function performPush() {
  if (!state.player || state.player.isFalling || state.player.isRespawning) return;
  const now = Date.now();
  if (now - (state.player.lastPushAt || 0) < 2000) return;
  state.player.lastPushAt = now;

  const dir = state.player.direction ?? 0;
  const dirs = [{ dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }];
  const { dx, dz } = dirs[dir] || dirs[0];
  const targetX = state.player.x + dx, targetZ = state.player.z + dz;
  const victim = Array.from(state.players.values()).find(p =>
    p.id !== state.playerId && p.x === targetX && p.z === targetZ
  );
  if (!victim) return;

  let movedTiles = 0, curX = victim.x, curZ = victim.z, curY = victim.y;
  let pushedOffEdge = false;
  for (let step = 1; step <= 2; step++) {
    const nx = curX + dx, nz = curZ + dz;
    if (nx < 0 || nx >= CONFIG.WORLD_SIZE || nz < 0 || nz >= CONFIG.WORLD_SIZE) {
      if (canFallOffEdge()) pushedOffEdge = true;
      break;
    }
    const occupied = Array.from(state.players.values()).some(p => p.id !== victim.id && p.x === nx && p.z === nz);
    if (occupied) break;
    const res = canMoveTo(curX, curY, curZ, nx, nz);
    if (!res.canMove) break;
    curX = nx; curZ = nz; curY = res.newY;
    movedTiles++;
  }

  if (movedTiles > 0) {
    victim.previousY = victim.y;
    victim.x = curX; victim.z = curZ; victim.y = curY;
    broadcastEvent('playerPushed', {
      attackerId: state.playerId, victimId: victim.id,
      newX: curX, newY: curY, newZ: curZ, tiles: movedTiles
    });
  }
  if (pushedOffEdge) {
    triggerPlayerFall(victim, dir);
  }
}

// ── Input ───────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  state.keys[e.code] = true;
  if (e.code >= 'Digit1' && e.code <= 'Digit8') state.selectedColor = parseInt(e.code.replace('Digit', '')) - 1;
  if (e.code === 'Space') { e.preventDefault(); placeBlock(); }
  if (e.code === 'KeyX') removeBlock();
  if (e.code === 'KeyP') performPush();
});
document.addEventListener('keyup', (e) => { state.keys[e.code] = false; });

// ── Chat ────────────────────────────────────────────────────────────
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const nameInput = document.getElementById('name-input');
const nameBtn = document.getElementById('name-btn');

function addChatMessage(message) {
  const div = document.createElement('div');
  div.className = `chat-message ${message.type}`;
  if (message.type === 'system') {
    div.innerHTML = `<div class="message-text">${escapeHtml(message.text)}</div>`;
  } else if (message.type === 'badge') {
    div.className = 'chat-message badge-message';
    div.innerHTML = `<div class="message-text badge-text">${escapeHtml(message.text)}</div>`;
  } else {
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `
      <div class="player-name" style="color: ${message.playerColor}">${escapeHtml(message.playerName)}</div>
      <div class="message-text">${escapeHtml(message.text)}</div>
      <div class="timestamp">${time}</div>
    `;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (text && state.roomChannel) {
    const msg = {
      id: crypto.randomUUID(), type: 'player',
      playerId: state.playerId, playerName: state.player.name,
      playerColor: state.player.color,
      text: text.substring(0, 500), timestamp: Date.now()
    };
    state.chatHistory.push(msg);
    if (state.chatHistory.length > 100) state.chatHistory = state.chatHistory.slice(-100);
    addChatMessage(msg);
    broadcastEvent('chatMessage', msg);
    chatInput.value = '';
  }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

nameBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (name && state.player) {
    const oldName = state.player.name;
    state.player.name = name.substring(0, 20);
    nameInput.placeholder = state.player.name;
    nameInput.value = '';
    broadcastEvent('playerNameChange', { playerId: state.playerId, oldName, newName: state.player.name });
    broadcastSystemChat(`${oldName} is now known as ${state.player.name}`);
    // Update presence
    if (state.roomChannel) {
      state.roomChannel.track({ playerId: state.playerId, name: state.player.name, color: state.player.color });
    }
  }
});
nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const name = nameInput.value.trim();
    if (name && state.player) {
      const oldName = state.player.name;
      state.player.name = name.substring(0, 20);
      nameInput.placeholder = state.player.name;
      nameInput.value = '';
      broadcastEvent('playerNameChange', { playerId: state.playerId, oldName, newName: state.player.name });
      broadcastSystemChat(`${oldName} is now known as ${state.player.name}`);
      if (state.roomChannel) {
        state.roomChannel.track({ playerId: state.playerId, name: state.player.name, color: state.player.color });
      }
    }
  }
});

// ── UI ──────────────────────────────────────────────────────────────
function updateUI() {
  document.getElementById('player-count').textContent = `Players: ${state.players.size}`;
  if (state.player) {
    document.getElementById('position-info').textContent = `Position: (${state.player.x}, ${state.player.z}) Height: ${state.player.y}`;
  }
  updateClassicStompHud();
  updateKothHud();
  // Keep players button visibility in sync with host status
  if (typeof updatePlayersButton === 'function') updatePlayersButton();
  // Refresh player list if the panel is open (throttled to once per second)
  if (typeof updatePlayersList === 'function') {
    const _now = Date.now();
    if (!updateUI._lastPanelRefresh || _now - updateUI._lastPanelRefresh > 1000) {
      updateUI._lastPanelRefresh = _now;
      const _panel = document.getElementById('players-panel');
      if (_panel && _panel.style.display !== 'none') updatePlayersList();
    }
  }
}

function updateClassicStompHud() {
  const hud = document.getElementById('classic-stomp-hud');
  if (!hud) return;
  if (state.gameMode !== 'classic-stomp' || !state.player || !state.classicStomp || !state.classicStomp.endsAt) {
    hud.style.display = 'none'; return;
  }
  const score = Number(state.player.score || 0);
  const msLeft = Math.max(0, state.classicStomp.endsAt - Date.now());
  const totalSeconds = Math.ceil(msLeft / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  hud.textContent = `Score: ${score} | Time: ${mm}:${ss}`;
  hud.style.display = 'block';
}

function updateKothHud() {
  const hud = document.getElementById('koth-hud');
  if (!hud) return;
  if (state.gameMode !== 'king-of-the-hill' || !state.player || !state.koth || !state.koth.endsAt) {
    hud.style.display = 'none'; return;
  }
  const score = Number(state.player.score || 0);
  const msLeft = Math.max(0, state.koth.endsAt - Date.now());
  const totalSeconds = Math.ceil(msLeft / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  let hillText = 'Open';
  if (state.kothControl && state.kothControl.contested) hillText = 'Contested';
  else if (state.kothControl && state.kothControl.controllerId) {
    const controller = state.players.get(state.kothControl.controllerId);
    hillText = controller ? controller.name : 'Held';
  }
  hud.textContent = `Score: ${score} | Time: ${mm}:${ss} | Hill: ${hillText}`;
  hud.style.display = 'block';
}

// ── Rendering (unchanged) ───────────────────────────────────────────
function toIso(x, y, z) {
  return { x: (x - z) * (CONFIG.TILE_WIDTH / 2), y: (x + z) * (CONFIG.TILE_HEIGHT / 2) - y * CONFIG.BLOCK_HEIGHT };
}
function toWorld(screenX, screenY) {
  const x = (screenX / (CONFIG.TILE_WIDTH / 2) + screenY / (CONFIG.TILE_HEIGHT / 2)) / 2;
  const z = (screenY / (CONFIG.TILE_HEIGHT / 2) - screenX / (CONFIG.TILE_WIDTH / 2)) / 2;
  return { x: Math.floor(x), z: Math.floor(z) };
}
function getPlayerDisplayColor(player) {
  if (!player) return '#ffffff';
  return player.isInfected ? INFECTION.COLOR : player.color;
}

function drawBlock(x, y, z, color) {
  const iso = toIso(x, y, z);
  const screenX = iso.x + state.camera.x + canvas.width / 2;
  const screenY = iso.y + state.camera.y + canvas.height / 2;
  const w = CONFIG.TILE_WIDTH / 2, h = CONFIG.TILE_HEIGHT / 2, blockH = CONFIG.BLOCK_HEIGHT;
  const darkColor = shadeColor(color, -30), lightColor = shadeColor(color, 20);
  ctx.beginPath(); ctx.moveTo(screenX, screenY - blockH); ctx.lineTo(screenX + w, screenY + h - blockH);
  ctx.lineTo(screenX, screenY + h * 2 - blockH); ctx.lineTo(screenX - w, screenY + h - blockH); ctx.closePath();
  ctx.fillStyle = lightColor; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(screenX - w, screenY + h - blockH); ctx.lineTo(screenX, screenY + h * 2 - blockH);
  ctx.lineTo(screenX, screenY + h * 2); ctx.lineTo(screenX - w, screenY + h); ctx.closePath();
  ctx.fillStyle = darkColor; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(screenX + w, screenY + h - blockH); ctx.lineTo(screenX, screenY + h * 2 - blockH);
  ctx.lineTo(screenX, screenY + h * 2); ctx.lineTo(screenX + w, screenY + h); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.stroke();
}

function drawPlayerAvatar(x, y, player, elevated) {
  const bodyWidth = 24, bodyHeight = 32, playerColor = getPlayerDisplayColor(player);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + bodyHeight + 5, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.fillStyle = playerColor; roundRect(ctx, x - bodyWidth / 2, y, bodyWidth, bodyHeight, 8); ctx.fill();
  ctx.strokeStyle = shadeColor(playerColor, -40); ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#FFE4C4'; ctx.beginPath(); ctx.arc(x, y + 10, 10, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#DEB887'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#333'; const eyeOffset = getEyeOffset(player.direction); ctx.beginPath();
  ctx.arc(x - 3 + eyeOffset.x, y + 8, 2, 0, Math.PI * 2); ctx.arc(x + 3 + eyeOffset.x, y + 8, 2, 0, Math.PI * 2); ctx.fill();
  if (elevated && player.y > 1) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(`\u2191${player.y - 1}`, x, y + bodyHeight + 20); }
  if (player.badges && player.badges.length > 0) { ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.arc(x + 15, y - 5, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#000'; ctx.font = 'bold 10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(player.badges.length, x + 15, y - 1); }
  ctx.font = 'bold 12px Segoe UI'; ctx.textAlign = 'center'; const nameWidth = ctx.measureText(player.name).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; roundRect(ctx, x - nameWidth / 2, y - 22, nameWidth, 18, 4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(player.name, x, y - 8);
}

function drawNPC(x, y, npc) {
  if (!npc.isAlive) return;
  const bounce = Math.sin(Date.now() / 200 + npc.animationFrame) * 3;
  const drawY = y + bounce;
  switch (npc.type) {
    case 'ghost': drawGhost(x, drawY, npc); break;
    case 'slime': drawSlime(x, drawY, npc); break;
    case 'robot': drawRobot(x, drawY, npc); break;
    case 'mushroom': drawMushroom(x, drawY, npc); break;
    default: drawGenericNPC(x, drawY, npc);
  }
  ctx.font = 'bold 11px Segoe UI'; ctx.textAlign = 'center'; const nameWidth = ctx.measureText(npc.name).width + 8;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(ctx, x - nameWidth / 2, y - 35, nameWidth, 16, 4); ctx.fill();
  ctx.fillStyle = npc.color; ctx.fillText(npc.name, x, y - 23);
}

function drawGhost(x, y, npc) {
  ctx.fillStyle = npc.color; ctx.beginPath(); ctx.arc(x, y + 5, 15, Math.PI, 0, false); ctx.lineTo(x + 15, y + 25);
  for (let i = 0; i < 5; i++) { ctx.lineTo(x + 15 - i * 7.5, y + 25 + (i % 2 === 0 ? 5 : 0)); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(x - 5, y + 5, 4, 5, 0, 0, Math.PI * 2); ctx.ellipse(x + 5, y + 5, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 6, y + 3, 2, 0, Math.PI * 2); ctx.arc(x + 4, y + 3, 2, 0, Math.PI * 2); ctx.fill();
}

function drawSlime(x, y, npc) {
  const squish = Math.sin(Date.now() / 150) * 2;
  ctx.fillStyle = npc.color; ctx.beginPath(); ctx.ellipse(x, y + 15, 18 + squish, 12 - squish / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = npc.secondaryColor; ctx.beginPath(); ctx.ellipse(x - 5, y + 10, 6, 4, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x - 6, y + 12, 3, 0, Math.PI * 2); ctx.arc(x + 6, y + 12, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y + 18, 4, 0, Math.PI); ctx.stroke();
}

function drawRobot(x, y, npc) {
  ctx.fillStyle = npc.color; roundRect(ctx, x - 12, y, 24, 28, 4); ctx.fill(); ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = npc.color; roundRect(ctx, x - 10, y - 15, 20, 18, 3); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 25); ctx.stroke();
  ctx.fillStyle = npc.secondaryColor; ctx.beginPath(); ctx.arc(x, y - 25, 4, 0, Math.PI * 2); ctx.fill();
  const blink = Math.sin(Date.now() / 100) > 0.8;
  ctx.fillStyle = blink ? '#FF0000' : npc.secondaryColor; ctx.beginPath(); ctx.arc(x - 5, y - 6, 3, 0, Math.PI * 2); ctx.arc(x + 5, y - 6, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#333'; roundRect(ctx, x - 8, y + 5, 16, 10, 2); ctx.fill();
  ['#FF0000', '#00FF00', '#0000FF'].forEach((color, i) => { ctx.fillStyle = Math.sin(Date.now() / 200 + i) > 0 ? color : '#333'; ctx.beginPath(); ctx.arc(x - 5 + i * 5, y + 10, 2, 0, Math.PI * 2); ctx.fill(); });
}

function drawMushroom(x, y, npc) {
  ctx.fillStyle = npc.secondaryColor; roundRect(ctx, x - 8, y + 10, 16, 18, 4); ctx.fill();
  ctx.fillStyle = npc.color; ctx.beginPath(); ctx.ellipse(x, y + 8, 20, 14, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 8, y + 2, 4, 0, Math.PI * 2); ctx.arc(x + 6, y - 2, 3, 0, Math.PI * 2); ctx.arc(x + 2, y + 5, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x - 4, y + 18, 2, 0, Math.PI * 2); ctx.arc(x + 4, y + 18, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,150,150,0.5)'; ctx.beginPath(); ctx.ellipse(x - 8, y + 20, 3, 2, 0, 0, Math.PI * 2); ctx.ellipse(x + 8, y + 20, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
}

function drawGenericNPC(x, y, npc) {
  ctx.fillStyle = npc.color; ctx.beginPath(); ctx.arc(x, y + 15, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x - 5, y + 12, 3, 0, Math.PI * 2); ctx.arc(x + 5, y + 12, 3, 0, Math.PI * 2); ctx.fill();
}

function drawStompEffect(effect) {
  const progress = (Date.now() - effect.startTime) / effect.duration;
  if (progress >= 1) return false;
  const iso = toIso(effect.x, effect.y, effect.z);
  const screenX = iso.x + state.camera.x + canvas.width / 2, screenY = iso.y + state.camera.y + canvas.height / 2;
  ctx.strokeStyle = `rgba(255, 215, 0, ${1 - progress})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(screenX, screenY, 20 + progress * 40, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + progress * 2, dist = 20 + progress * 50;
    ctx.fillStyle = `rgba(255, 215, 0, ${1 - progress})`; ctx.font = `${20 - progress * 10}px Segoe UI`;
    ctx.fillText('\u2605', screenX + Math.cos(angle) * dist - 8, screenY + Math.sin(angle) * dist - progress * 30 + 8);
  }
  return true;
}

function getEyeOffset(direction) {
  switch (direction) { case 0: return { x: 0, y: 2 }; case 1: return { x: -2, y: 0 }; case 2: return { x: 0, y: -2 }; case 3: return { x: 2, y: 0 }; default: return { x: 0, y: 0 }; }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius); ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius); ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16), amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function render() {
  ctx.fillStyle = '#0f0f23'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid(); drawKothHill();
  const renderList = [];
  state.blocks.forEach((block) => { renderList.push({ type: 'block', x: block.x, y: block.y, z: block.z, color: block.color, sortKey: block.x + block.z + block.y * 0.1 }); });
  state.players.forEach((player) => { if (!player.isRespawning) renderList.push({ type: 'player', x: player.x, y: player.y, z: player.z, player, sortKey: player.x + player.z + player.y * 0.1 + 0.05 }); });
  state.npcs.forEach((npc) => { if (npc.isAlive) renderList.push({ type: 'npc', x: npc.x, y: npc.y, z: npc.z, npc, sortKey: npc.x + npc.z + npc.y * 0.1 + 0.03 }); });
  renderList.sort((a, b) => a.sortKey - b.sortKey);
  renderList.forEach(obj => {
    if (obj.type === 'block') drawBlock(obj.x, obj.y, obj.z, obj.color);
    else if (obj.type === 'player') drawPlayerIndicator(obj.x, obj.y, obj.z, obj.player);
    else if (obj.type === 'npc') drawNPCIndicator(obj.x, obj.y, obj.z, obj.npc);
  });
  spawnInfectionParticles(); drawInfectionParticles();
  state.stompEffects = state.stompEffects.filter(effect => drawStompEffect(effect));
  drawColorPalette(); drawBadgeDisplay();
  if (state.player) drawSelectionIndicator();
  drawNotifications();
}

function drawKothHill() {
  if (state.gameMode !== 'king-of-the-hill' || !state.koth || !state.koth.hill) return;
  const { x, z, radius } = state.koth.hill;
  const iso = toIso(x, 0, z), screenX = iso.x + state.camera.x + canvas.width / 2, screenY = iso.y + state.camera.y + canvas.height / 2;
  const w = CONFIG.TILE_WIDTH / 2, h = CONFIG.TILE_HEIGHT / 2;
  const glow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 60 + radius * 10);
  glow.addColorStop(0, 'rgba(255, 217, 61, 0.20)'); glow.addColorStop(1, 'rgba(255, 217, 61, 0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(screenX, screenY + h, 70 + radius * 10, 35 + radius * 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 217, 61, 0.9)'; ctx.lineWidth = 3; ctx.beginPath();
  ctx.moveTo(screenX, screenY); ctx.lineTo(screenX + w, screenY + h); ctx.lineTo(screenX, screenY + h * 2); ctx.lineTo(screenX - w, screenY + h); ctx.closePath(); ctx.stroke();
  ctx.font = '24px Segoe UI'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText('\u{1F451}', screenX, screenY - 10);
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let x = 0; x <= CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z <= CONFIG.WORLD_SIZE; z++) {
      const iso = toIso(x, 0, z), screenX = iso.x + state.camera.x + canvas.width / 2, screenY = iso.y + state.camera.y + canvas.height / 2;
      if (x < CONFIG.WORLD_SIZE) { const ni = toIso(x + 1, 0, z); ctx.beginPath(); ctx.moveTo(screenX, screenY); ctx.lineTo(ni.x + state.camera.x + canvas.width / 2, ni.y + state.camera.y + canvas.height / 2); ctx.stroke(); }
      if (z < CONFIG.WORLD_SIZE) { const ni = toIso(x, 0, z + 1); ctx.beginPath(); ctx.moveTo(screenX, screenY); ctx.lineTo(ni.x + state.camera.x + canvas.width / 2, ni.y + state.camera.y + canvas.height / 2); ctx.stroke(); }
    }
  }
}

function drawPlayerIndicator(x, y, z, player) {
  const iso = toIso(x, y, z), screenX = iso.x + state.camera.x + canvas.width / 2, screenY = iso.y + state.camera.y + canvas.height / 2;
  const playerColor = getPlayerDisplayColor(player);

  // ── Fall animation: slide off edge + tumble into void ──
  if (player.isFalling) {
    const progress = Math.min(1, (Date.now() - player.fallStartedAt) / FALL_ANIMATION_MS);
    // Compute isometric slide direction based on fallDirection
    const dir = player.fallDirection ?? player.direction ?? 0;
    const dirVecs = [{ dx: 0, dz: 1 }, { dx: -1, dz: 0 }, { dx: 0, dz: -1 }, { dx: 1, dz: 0 }];
    const { dx, dz } = dirVecs[dir];
    const slideX = (dx - dz) * (CONFIG.TILE_WIDTH / 2) * progress * 1.5;
    const slideY = (dx + dz) * (CONFIG.TILE_HEIGHT / 2) * progress * 1.5;
    // Gravity: accelerating downward drop
    const gravityDrop = progress * progress * 140;
    const scale = 1 - progress * 0.7;
    const alpha = Math.max(0, 1 - progress * 1.2);
    const rotation = progress * Math.PI * 2.5;
    const drawX = screenX + slideX;
    const drawY = screenY + slideY + gravityDrop;
    // Draw fading shadow at original position (where they fell from)
    ctx.save();
    ctx.globalAlpha = (1 - progress) * 0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(screenX, screenY + 20, 15 * (1 - progress), 7 * (1 - progress), 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Draw the tumbling character sliding off and falling
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(drawX, drawY - 10);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-drawX, -(drawY - 10));
    drawPlayerAvatar(drawX, drawY - 30, player, false);
    ctx.restore();
    // Swirl ring at the edge where they fell
    ctx.save();
    const ringAlpha = Math.max(0, (1 - progress * 1.5)) * 0.5;
    ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(screenX, screenY + 20, 15 + progress * 20, 8 + progress * 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // ── Spawn animation: pop in from small + fade in ──
  if (player.spawnAnimStart) {
    const progress = Math.min(1, (Date.now() - player.spawnAnimStart) / 400);
    if (progress >= 1) {
      player.spawnAnimStart = null;
    } else {
      const scale = 0.3 + progress * 0.7;
      const alpha = progress;
      const pivotX = screenX, pivotY = screenY - 10;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pivotX, pivotY);
      ctx.scale(scale, scale);
      ctx.translate(-pivotX, -pivotY);
      const g = ctx.createRadialGradient(screenX, screenY + 20, 0, screenX, screenY + 20, 30);
      g.addColorStop(0, playerColor + '40'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(screenX, screenY + 20, 30, 15, 0, 0, Math.PI * 2); ctx.fill();
      drawPlayerAvatar(screenX, screenY - 30, player, true);
      ctx.restore();
      // Spawn sparkle ring
      ctx.save();
      const sparkleAlpha = (1 - progress) * 0.6;
      ctx.strokeStyle = `rgba(255, 255, 100, ${sparkleAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(screenX, screenY + 20, 10 + progress * 30, 5 + progress * 15, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
  }

  // ── Normal rendering ──
  const gradient = ctx.createRadialGradient(screenX, screenY + 20, 0, screenX, screenY + 20, 30);
  gradient.addColorStop(0, playerColor + '40'); gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(screenX, screenY + 20, 30, 15, 0, 0, Math.PI * 2); ctx.fill();
  drawPlayerAvatar(screenX, screenY - 30, player, true);
}

function spawnInfectionParticles() {
  const anyInfected = Array.from(state.players.values()).some(p => p && p.isInfected);
  if (!anyInfected) { if (infectionEmitAt.size > 0 && Math.random() < 0.01) infectionEmitAt.clear(); return; }
  const now = Date.now();
  state.players.forEach((player) => {
    if (!player || !player.isInfected || player.isFalling || player.isRespawning) return;
    const last = infectionEmitAt.get(player.id) || 0;
    if (now - last < 45) return;
    infectionEmitAt.set(player.id, now);
    const iso = toIso(player.x, player.y, player.z);
    const baseX = iso.x + state.camera.x + canvas.width / 2, baseY = iso.y + state.camera.y + canvas.height / 2 - 45;
    for (let i = 0; i < 2; i++) {
      const angle = Math.random() * Math.PI * 2, spread = 10 + Math.random() * 10;
      state.infectionParticles.push({ x: baseX + Math.cos(angle) * spread, y: baseY + Math.sin(angle) * (spread * 0.6), vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.9, radius: 2 + Math.random() * 3, bornAt: now, lifeMs: 700 + Math.random() * 500 });
    }
  });
  if (state.infectionParticles.length > 700) state.infectionParticles.splice(0, state.infectionParticles.length - 700);
}

function drawInfectionParticles() {
  if (!state.infectionParticles || state.infectionParticles.length === 0) return;
  const now = Date.now(), next = [];
  for (const p of state.infectionParticles) {
    const age = now - p.bornAt; if (age >= p.lifeMs) continue;
    const t = age / p.lifeMs, alpha = Math.max(0, (1 - t) * 0.85);
    p.x += p.vx; p.y += p.vy; p.vy -= 0.006;
    ctx.fillStyle = `rgba(${INFECTION.PARTICLE_RGB.r}, ${INFECTION.PARTICLE_RGB.g}, ${INFECTION.PARTICLE_RGB.b}, ${alpha})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius * (1 - t * 0.35), 0, Math.PI * 2); ctx.fill();
    next.push(p);
  }
  state.infectionParticles = next;
}

function drawNPCIndicator(x, y, z, npc) {
  const iso = toIso(x, y, z), screenX = iso.x + state.camera.x + canvas.width / 2, screenY = iso.y + state.camera.y + canvas.height / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(screenX, screenY + 25, 15, 8, 0, 0, Math.PI * 2); ctx.fill();
  drawNPC(screenX, screenY - 15, npc);
}

function drawSelectionIndicator() {
  if (!state.player || state.player.isFalling || state.player.isRespawning) return;
  const { x, y, z, direction } = state.player;
  let targetX = x, targetZ = z;
  switch (direction) { case 0: targetZ++; break; case 1: targetX--; break; case 2: targetZ--; break; case 3: targetX++; break; }
  targetX = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetX));
  targetZ = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetZ));
  let targetY = 1;
  for (let checkY = 10; checkY >= 1; checkY--) { if (state.blocks.has(`${targetX},${checkY},${targetZ}`)) { targetY = checkY + 1; break; } }
  const iso = toIso(targetX, targetY, targetZ), screenX = iso.x + state.camera.x + canvas.width / 2, screenY = iso.y + state.camera.y + canvas.height / 2;
  const w = CONFIG.TILE_WIDTH / 2, h = CONFIG.TILE_HEIGHT / 2;
  ctx.strokeStyle = CONFIG.COLORS[state.selectedColor]; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(screenX, screenY - CONFIG.BLOCK_HEIGHT); ctx.lineTo(screenX + w, screenY + h - CONFIG.BLOCK_HEIGHT);
  ctx.lineTo(screenX, screenY + h * 2 - CONFIG.BLOCK_HEIGHT); ctx.lineTo(screenX - w, screenY + h - CONFIG.BLOCK_HEIGHT); ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);
}

function drawColorPalette() {
  const paletteWidth = CONFIG.COLORS.length * 36;
  const startX = canvas.width - paletteWidth - 160, startY = 20;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; roundRect(ctx, startX - 10, startY - 10, CONFIG.COLORS.length * 36 + 10, 50, 10); ctx.fill();
  CONFIG.COLORS.forEach((color, i) => {
    const x = startX + i * 36, y = startY;
    if (i === state.selectedColor) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; roundRect(ctx, x - 2, y - 2, 32, 32, 8); ctx.stroke(); }
    ctx.fillStyle = color; roundRect(ctx, x, y, 28, 28, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 10px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText(i + 1, x + 14, y + 18);
  });
}

function drawBadgeDisplay() {
  if (!state.player || !state.player.badges || state.player.badges.length === 0) return;
  const startX = 20, startY = 100;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; roundRect(ctx, startX - 10, startY - 10, 180, 30 + state.player.badges.length * 25, 10); ctx.fill();
  ctx.fillStyle = '#FFD700'; ctx.font = 'bold 14px Segoe UI'; ctx.textAlign = 'left'; ctx.fillText('Badges', startX, startY + 10);
  state.player.badges.forEach((badgeId, i) => {
    const badge = state.badges.find(b => b.id === badgeId);
    if (badge) {
      const y = startY + 30 + i * 25;
      const rarityColors = { common: '#9CA3AF', rare: '#3B82F6', epic: '#8B5CF6', legendary: '#F59E0B' };
      ctx.fillStyle = rarityColors[badge.rarity] || '#fff'; ctx.font = '16px Segoe UI'; ctx.fillText(badge.icon, startX, y);
      ctx.fillStyle = '#fff'; ctx.font = '12px Segoe UI'; ctx.fillText(badge.name, startX + 25, y);
    }
  });
}

function drawNotifications() {
  const now = Date.now();
  state.notifications = state.notifications.filter(n => now - n.time < 4000);
  state.notifications.forEach((notification, i) => {
    const age = now - notification.time, alpha = Math.min(1, (4000 - age) / 1000);
    const y = canvas.height / 2 - 100 + i * 80, slideIn = Math.min(1, age / 300), x = canvas.width / 2 + (1 - slideIn) * 200;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * alpha})`; roundRect(ctx, x - 150, y - 30, 300, 70, 15); ctx.fill();
    const rarityColors = { common: '#9CA3AF', rare: '#3B82F6', epic: '#8B5CF6', legendary: '#F59E0B' };
    ctx.strokeStyle = rarityColors[notification.badge.rarity] || '#FFD700'; ctx.lineWidth = 3; ctx.stroke();
    ctx.font = '36px Segoe UI'; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; ctx.fillText(notification.badge.icon, x - 100, y + 10);
    ctx.font = 'bold 18px Segoe UI'; ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`; ctx.fillText('Badge Earned!', x + 20, y - 5);
    ctx.font = '14px Segoe UI'; ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; ctx.fillText(notification.badge.name, x + 20, y + 15);
    ctx.font = '11px Segoe UI'; ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`; ctx.fillText(notification.badge.description, x + 20, y + 32);
  });
}

function updateCamera() {
  if (!state.player) return;
  const iso = toIso(state.player.x, state.player.y, state.player.z);
  state.camera.x += (-iso.x - state.camera.x) * 0.1;
  state.camera.y += (-iso.y - state.camera.y) * 0.1;
}

// ── Offline overlay ─────────────────────────────────────────────────
function showOfflineOverlay(message) {
  if (document.getElementById('server-offline-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'server-offline-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(10,10,20,0.92);color:#fff;padding:24px;font:14px/1.5 Segoe UI,system-ui,sans-serif';
  const card = document.createElement('div');
  card.style.cssText = 'max-width:720px;width:100%;border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:18px 18px 14px;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px)';
  const title = document.createElement('div'); title.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:10px;'; title.textContent = 'Configuration required';
  const body = document.createElement('pre'); body.style.cssText = 'white-space:pre-wrap;margin:0 0 14px;color:rgba(255,255,255,0.92)'; body.textContent = String(message || '');
  const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end';
  const back = document.createElement('button'); back.textContent = 'Back to lobby';
  back.style.cssText = 'padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.10);color:#fff;cursor:pointer';
  back.addEventListener('click', () => { window.location.href = '/'; });
  btnRow.appendChild(back); card.appendChild(title); card.appendChild(body); card.appendChild(btnRow);
  overlay.appendChild(card); document.body.appendChild(overlay);
}

// ── Game Loop ───────────────────────────────────────────────────────
function gameLoop() {
  updateFallStates();
  handleMovement();
  updateCamera();
  render();
  updateUI();
  requestAnimationFrame(gameLoop);
}

// ── Kick Player (host only) ─────────────────────────────────────────
function kickPlayer(playerId) {
  if (!state.isHost || playerId === state.playerId) return;
  const target = state.players.get(playerId);
  if (!target) return;
  if (!confirm(`Kick ${target.name} from the game?`)) return;
  broadcastEvent('playerKicked', { kickedId: playerId, kickedName: target.name });
  broadcastSystemChat(`${target.name} was kicked by the host`);
  state.players.delete(playerId);
  updatePlayersList();
  if (state.isHost) updateDirectoryPresence();
}

// ── Players Panel UI ────────────────────────────────────────────────
const playersBtn = document.getElementById('players-btn');
const playersPanel = document.getElementById('players-panel');
const playersPanelClose = document.getElementById('players-panel-close');
const playersList = document.getElementById('players-list');

function togglePlayersPanel() {
  const isVisible = playersPanel.style.display !== 'none';
  playersPanel.style.display = isVisible ? 'none' : 'flex';
  if (!isVisible) updatePlayersList();
}

if (playersBtn) playersBtn.addEventListener('click', togglePlayersPanel);
if (playersPanelClose) playersPanelClose.addEventListener('click', () => { playersPanel.style.display = 'none'; });

function updatePlayersList() {
  if (!playersList || playersPanel.style.display === 'none') return;
  playersList.innerHTML = '';
  const sortedPlayers = Array.from(state.players.values()).sort((a, b) => {
    if (a.id === state.hostId) return -1;
    if (b.id === state.hostId) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  sortedPlayers.forEach(p => {
    const item = document.createElement('div');
    item.className = 'player-list-item';
    const info = document.createElement('div');
    info.className = 'player-list-item-info';
    const colorDot = document.createElement('span');
    colorDot.className = 'player-list-color';
    colorDot.style.background = getPlayerDisplayColor(p);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'player-list-name';
    nameSpan.textContent = p.name || 'Player';
    info.appendChild(colorDot);
    info.appendChild(nameSpan);
    if (p.id === state.hostId) {
      const tag = document.createElement('span');
      tag.className = 'player-list-tag host';
      tag.textContent = 'HOST';
      info.appendChild(tag);
    }
    if (p.id === state.playerId) {
      const tag = document.createElement('span');
      tag.className = 'player-list-tag you';
      tag.textContent = 'YOU';
      info.appendChild(tag);
    }
    item.appendChild(info);
    // Host can kick anyone except themselves
    if (state.isHost && p.id !== state.playerId) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'kick-btn';
      kickBtn.textContent = 'Kick';
      kickBtn.addEventListener('click', () => kickPlayer(p.id));
      item.appendChild(kickBtn);
    }
    playersList.appendChild(item);
  });
}

function updatePlayersButton() {
  if (playersBtn) {
    playersBtn.style.display = state.isHost ? 'block' : 'none';
    // If no longer host, close the panel
    if (!state.isHost && playersPanel) playersPanel.style.display = 'none';
  }
}

// ── Leave room ──────────────────────────────────────────────────────
const leaveRoomBtn = document.getElementById('leave-room-btn');
if (leaveRoomBtn) {
  leaveRoomBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the game?')) {
      if (state.isHost) relinquishHost();
      if (state.roomChannel) { state.roomChannel.untrack(); }
      window.location.href = '/';
    }
  });
}

// ── Init ────────────────────────────────────────────────────────────
resizeCanvas();
connectToRoom();
gameLoop();
