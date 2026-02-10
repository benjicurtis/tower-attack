const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.IO needs a long-lived Node server (not compatible with Vercel Serverless).
// If you host the static site separately (e.g. Vercel), set CORS_ORIGIN to that site URL.
const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
const io = new Server(server, {
  cors: {
    origin: corsOrigin ? corsOrigin.split(',').map(s => s.trim()).filter(Boolean) : '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files (disable implicit index.html)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Redirect root to lobby
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lobby.html'));
});

app.get('/game.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// Simple health check for hosting platforms.
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// Game rooms - each room has its own game state
const rooms = new Map();

// Room configuration
const MAX_PLAYERS_PER_ROOM = 10;
const EMPTY_ROOM_CLEANUP_MS = 30000;

function cancelRoomDeletion(room) {
  if (room.emptyTimeout) {
    clearTimeout(room.emptyTimeout);
    room.emptyTimeout = null;
  }
}

function scheduleRoomDeletion(room) {
  if (room.emptyTimeout) return;

  room.emptyTimeout = setTimeout(() => {
    // Room might have been deleted or repopulated.
    const current = rooms.get(room.id);
    if (!current) return;
    if (current.players.size > 0) {
      cancelRoomDeletion(current);
      return;
    }

    if (current.npcInterval) clearInterval(current.npcInterval);
    if (current.kothInterval) clearInterval(current.kothInterval);
    rooms.delete(current.id);
    broadcastRoomsList();
  }, EMPTY_ROOM_CLEANUP_MS);
}

// World configuration
const WORLD_SIZE = 20;
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

function normalizeHexColor(raw) {
  const s = String(raw || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return ('#' + s).toUpperCase();
  return null;
}

// Classic stomp: no badge system
const BADGES = [];

// Supported game modes
const GAME_MODES = {
  freeplay: 'freeplay',
  classicStomp: 'classic-stomp',
  kingOfHill: 'king-of-the-hill',
  infection: 'infection'
};

const INFECTION_COLOR = '#FF5F1F';

function getRandomElement(items) {
  if (!items || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function sendRoomBackToLobby(room, { message, delayMs = 3500, announceInChat = false } = {}) {
  if (!room) return;
  if (room.gameMode === GAME_MODES.freeplay) return; // Free Build never forces lobby return
  if (room.returningToLobby) return;

  room.returningToLobby = true;

  const safeDelayMs = Math.max(0, Math.min(15000, Number(delayMs || 0)));
  const safeMessage = String(message || 'Match ended. Returning to lobby...').substring(0, 200);

  if (announceInChat && safeMessage) {
    io.to(room.id).emit('chatMessage', {
      id: uuidv4(),
      type: 'system',
      text: safeMessage,
      timestamp: Date.now()
    });
  }

  io.to(room.id).emit('returnToLobby', {
    roomId: room.id,
    gameMode: room.gameMode,
    message: safeMessage,
    delayMs: safeDelayMs
  });
}

function ensureInfectionState(room) {
  if (!room) return;
  if (!room.infection) {
    room.infection = {
      startedAt: null
    };
  }
}

function checkInfectionEnd(room) {
  if (!room || room.gameMode !== GAME_MODES.infection) return;
  if (room.returningToLobby) return;
  if (room.players.size < 2) return;

  const players = Array.from(room.players.values());
  const allInfected = players.every(p => !!p.isInfected);
  if (!allInfected) return;

  sendRoomBackToLobby(room, {
    message: '🦠 Everyone is infected! Returning to lobby...',
    delayMs: 4000,
    announceInChat: true
  });
}

function infectPlayer(room, targetPlayer, sourcePlayer = null) {
  if (!room || !targetPlayer) return;
  if (room.gameMode !== GAME_MODES.infection) return;
  if (targetPlayer.isInfected) return;

  targetPlayer.isInfected = true;
  targetPlayer.infectedAt = Date.now();

  io.to(room.id).emit('playerUpdated', targetPlayer);

  const sourceName = sourcePlayer ? sourcePlayer.name : null;
  const text = sourceName
    ? `🦠 ${targetPlayer.name} was infected by ${sourceName}!`
    : `🦠 ${targetPlayer.name} is infected!`;

  const message = {
    id: uuidv4(),
    type: 'system',
    text,
    timestamp: Date.now()
  };

  room.chatHistory.push(message);
  if (room.chatHistory.length > 100) {
    room.chatHistory = room.chatHistory.slice(-100);
  }

  io.to(room.id).emit('chatMessage', message);

  checkInfectionEnd(room);
}

function ensureAtLeastOneInfected(room) {
  if (!room || room.gameMode !== GAME_MODES.infection) return;
  ensureInfectionState(room);

  const players = Array.from(room.players.values());
  if (players.length === 0) return;

  const anyInfected = players.some(p => !!p.isInfected);
  if (anyInfected) return;

  const chosen = getRandomElement(players);
  if (chosen) {
    room.infection.startedAt = room.infection.startedAt || Date.now();
    infectPlayer(room, chosen, null);
  }
}

// NPC definitions with unique personalities
const NPC_TYPES = [
  { 
    id: 'slime', 
    name: 'Goopy', 
    color: '#7CFC00', 
    secondaryColor: '#32CD32',
    type: 'slime',
    speed: 2000
  },
  { 
    id: 'robot', 
    name: 'Beep-Boop', 
    color: '#708090', 
    secondaryColor: '#FF4500',
    type: 'robot',
    speed: 1200
  },
  { 
    id: 'mushroom', 
    name: 'Shroomie', 
    color: '#FF6347', 
    secondaryColor: '#FFE4B5',
    type: 'mushroom',
    speed: 2500
  }
];

// Create a new game room
function createRoom(roomId, gameMode, hostName, options = {}) {
  const requestedMode = String(gameMode || '').trim().toLowerCase().replace(/[\\s_]+/g, '-');
  const mode =
    requestedMode === GAME_MODES.classicStomp ? GAME_MODES.classicStomp :
    requestedMode === GAME_MODES.kingOfHill ? GAME_MODES.kingOfHill :
    requestedMode === GAME_MODES.infection ? GAME_MODES.infection :
    GAME_MODES.freeplay;

  const classicStompMinutes = Math.max(1, Math.min(5, Number(options.classicStompMinutes || 3)));
  const classicStompDurationMs = classicStompMinutes * 60 * 1000;
  const kothMinutes = Math.max(1, Math.min(5, Number(options.kothMinutes || 3)));
  const kothDurationMs = kothMinutes * 60 * 1000;

  const room = {
    id: roomId,
    name: `${hostName}'s Room`,
    gameMode: mode,
    maxPlayers: MAX_PLAYERS_PER_ROOM,
    players: new Map(),
    blocks: new Map(),
    npcs: new Map(),
    chatHistory: [],
    createdAt: Date.now(),
    emptyTimeout: null,
    br: null,
    hostId: null,
    stomp: mode === GAME_MODES.classicStomp
      ? { durationMs: classicStompDurationMs, startedAt: null, endsAt: null, ended: false, winner: null }
      : null,
    koth: mode === GAME_MODES.kingOfHill
      ? { durationMs: kothDurationMs, startedAt: null, endsAt: null, ended: false, hill: { x: 10, z: 10, radius: 2 }, controllerId: null }
      : null,
    infection: mode === GAME_MODES.infection
      ? { startedAt: null }
      : null,
    kothInterval: null
  };
  
  initializeWorld(room);
  if (room.gameMode === GAME_MODES.classicStomp) {
    initializeNPCs(room);
    startNPCMovement(room);
  }
  
  rooms.set(roomId, room);
  // If nobody joins promptly, clean it up.
  scheduleRoomDeletion(room);
  return room;
}

// Get room info for lobby
function getRoomsListInfo() {
  const roomsList = [];
  rooms.forEach(room => {
    roomsList.push({
      id: room.id,
      name: room.name,
      gameMode: room.gameMode,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers
    });
  });
  return roomsList;
}

// Broadcast rooms list to all lobby clients
function broadcastRoomsList() {
  io.emit('roomsList', getRoomsListInfo());
}

// Initialize some default blocks for the floor
function initializeWorld(gameState) {
  // Create a floor pattern
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const key = `${x},0,${z}`;
      gameState.blocks.set(key, {
        x, y: 0, z,
        color: (x + z) % 2 === 0 ? '#8B7355' : '#A0522D',
        type: 'floor'
      });
    }
  }
  
  // Add some decorative blocks and platforms for climbing
  const decorations = [
    // Staircase structure
    { x: 5, y: 1, z: 5, color: '#4ECDC4' },
    { x: 5, y: 2, z: 6, color: '#4ECDC4' },
    { x: 5, y: 3, z: 7, color: '#4ECDC4' },
    { x: 5, y: 4, z: 8, color: '#4ECDC4' },
    
    // Tower
    { x: 14, y: 1, z: 14, color: '#FF6B6B' },
    { x: 14, y: 2, z: 14, color: '#FF6B6B' },
    { x: 14, y: 3, z: 14, color: '#FF6B6B' },
    { x: 14, y: 4, z: 14, color: '#FF6B6B' },
    { x: 14, y: 5, z: 14, color: '#FF6B6B' },
    
    // Climbing steps to tower
    { x: 13, y: 1, z: 14, color: '#FF8B8B' },
    { x: 12, y: 1, z: 14, color: '#FF8B8B' },
    { x: 13, y: 2, z: 14, color: '#FF8B8B' },
    { x: 13, y: 3, z: 14, color: '#FF8B8B' },
    { x: 13, y: 4, z: 14, color: '#FF8B8B' },
    
    // Platform area
    { x: 3, y: 1, z: 15, color: '#96CEB4' },
    { x: 4, y: 1, z: 15, color: '#96CEB4' },
    { x: 3, y: 1, z: 16, color: '#96CEB4' },
    { x: 4, y: 1, z: 16, color: '#96CEB4' },
    { x: 5, y: 1, z: 15, color: '#96CEB4' },
    { x: 5, y: 1, z: 16, color: '#96CEB4' },
    
    // Second level platform
    { x: 3, y: 2, z: 16, color: '#76AE94' },
    { x: 4, y: 2, z: 16, color: '#76AE94' },
    
    // Jump challenge area
    { x: 8, y: 1, z: 3, color: '#FFEAA7' },
    { x: 10, y: 2, z: 3, color: '#FFEAA7' },
    { x: 12, y: 3, z: 3, color: '#FFEAA7' },
  ];
  
  decorations.forEach(block => {
    const key = `${block.x},${block.y},${block.z}`;
    gameState.blocks.set(key, { ...block, type: 'block' });
  });
}

// Initialize NPCs
function initializeNPCs(gameState) {
  NPC_TYPES.forEach((npcType, index) => {
    const npc = {
      id: npcType.id,
      name: npcType.name,
      x: 8 + index * 2,
      y: 1,
      z: 10 + index,
      color: npcType.color,
      secondaryColor: npcType.secondaryColor,
      type: npcType.type,
      speed: npcType.speed,
      direction: Math.floor(Math.random() * 4),
      isAlive: true,
      respawnTime: 5000,
      animationFrame: 0
    };
    gameState.npcs.set(npc.id, npc);
  });
}

// Get ground level at position (top of highest block)
function getGroundLevel(x, z, gameState) {
  for (let y = 10; y >= 0; y--) {
    const key = `${x},${y},${z}`;
    if (gameState.blocks.has(key)) {
      return y + 1;
    }
  }
  return 1;
}

// Check if position is valid for movement (considering climbing)
function canMoveTo(fromX, fromY, fromZ, toX, toZ, gameState) {
  // Check bounds
  if (toX < 0 || toX >= WORLD_SIZE || toZ < 0 || toZ >= WORLD_SIZE) {
    return { canMove: false };
  }
  
  const targetGroundLevel = getGroundLevel(toX, toZ, gameState);
  const heightDiff = targetGroundLevel - fromY;
  
  // Can climb up 1 block, can fall any distance
  if (heightDiff <= 1) {
    return { canMove: true, newY: targetGroundLevel };
  }
  
  return { canMove: false };
}

// Move NPC with pathfinding
function moveNPC(npc, room) {
  if (!npc.isAlive) return;
  
  const directions = [
    { dx: 0, dz: 1 },  // South
    { dx: -1, dz: 0 }, // West
    { dx: 0, dz: -1 }, // North
    { dx: 1, dz: 0 }   // East
  ];
  
  // Try to move in current direction, or pick a new one
  let moved = false;
  let attempts = 0;
  
  while (!moved && attempts < 8) {
    const dir = directions[npc.direction];
    const newX = npc.x + dir.dx;
    const newZ = npc.z + dir.dz;
    
    const moveResult = canMoveTo(npc.x, npc.y, npc.z, newX, newZ, room);
    
    if (moveResult.canMove) {
      npc.x = newX;
      npc.z = newZ;
      npc.y = moveResult.newY;
      moved = true;
      
      // Occasionally change direction
      if (Math.random() < 0.2) {
        npc.direction = Math.floor(Math.random() * 4);
      }
    } else {
      // Change direction if blocked
      npc.direction = Math.floor(Math.random() * 4);
    }
    attempts++;
  }
  
  npc.animationFrame = (npc.animationFrame + 1) % 4;
  
  io.to(room.id).emit('npcMoved', npc);
}

// Respawn NPC
function respawnNPC(npcId, room) {
  const npc = room.npcs.get(npcId);
  if (npc) {
    npc.isAlive = true;
    npc.x = Math.floor(Math.random() * 14) + 3;
    npc.z = Math.floor(Math.random() * 14) + 3;
    npc.y = getGroundLevel(npc.x, npc.z, room) ?? 1;
    npc.direction = Math.floor(Math.random() * 4);
    io.to(room.id).emit('npcRespawned', npc);
  }
}

// Check for stomp collision
function checkStompCollision(player, room) {
  const stomps = [];
  
  room.npcs.forEach((npc) => {
    if (!npc.isAlive) return;
    
    // Check if player is on same X,Z and coming from above
    if (player.x === npc.x && player.z === npc.z && player.y >= npc.y) {
      const heightDiff = player.previousY - npc.y;
      stomps.push({ npc, heightDiff });
    }
  });
  
  return stomps;
}

// Classic stomp: just squash + respawn (no badges)
function processStomps(player, stomps, room) {
  // Award points only during an active Classic Stomp match
  if (room.gameMode === GAME_MODES.classicStomp && room.stomp && room.stomp.startedAt && !room.stomp.ended) {
    const now = Date.now();
    if (room.stomp.endsAt && now < room.stomp.endsAt) {
      player.score = Number(player.score || 0) + stomps.length;
      io.to(room.id).emit('classicStompScore', { playerId: player.id, score: player.score });
      io.to(room.id).emit('playerUpdated', player);
    }
  }

  stomps.forEach(({ npc }) => {
    npc.isAlive = false;
    io.to(room.id).emit('npcStomped', { npcId: npc.id, playerId: player.id, playerName: player.name });
    setTimeout(() => respawnNPC(npc.id, room), npc.respawnTime);
  });
}

function startClassicStompIfNeeded(room) {
  if (!room || room.gameMode !== GAME_MODES.classicStomp || !room.stomp) return;
  if (room.stomp.startedAt) return;

  room.stomp.startedAt = Date.now();
  room.stomp.endsAt = room.stomp.startedAt + room.stomp.durationMs;
  room.stomp.ended = false;
  room.stomp.winner = null;

  io.to(room.id).emit('classicStompState', {
    startedAt: room.stomp.startedAt,
    endsAt: room.stomp.endsAt,
    durationMs: room.stomp.durationMs
  });

  setTimeout(() => endClassicStomp(room.id), room.stomp.durationMs + 50);
}

function respawnPlayerInRoom(room, player) {
  player.x = Math.floor(Math.random() * 10) + 5;
  player.z = Math.floor(Math.random() * 10) + 5;
  player.y = getGroundLevel(player.x, player.z, room);
  player.previousY = player.y;
  player.direction = player.direction ?? 0;
}

function restartClassicStomp(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameMode !== GAME_MODES.classicStomp || !room.stomp) return;
  if (room.players.size === 0) return;

  // Reset players
  room.players.forEach(p => {
    p.score = 0;
    respawnPlayerInRoom(room, p);
    io.to(room.id).emit('playerMoved', p);
    io.to(room.id).emit('playerUpdated', p);
  });

  // Respawn all NPCs
  room.npcs.forEach(npc => {
    npc.isAlive = true;
    npc.x = Math.floor(Math.random() * 14) + 3;
    npc.z = Math.floor(Math.random() * 14) + 3;
    npc.y = getGroundLevel(npc.x, npc.z, room) ?? 1;
    io.to(room.id).emit('npcRespawned', npc);
  });

  // Restart timer
  room.stomp.startedAt = Date.now();
  room.stomp.endsAt = room.stomp.startedAt + room.stomp.durationMs;
  room.stomp.ended = false;
  room.stomp.winner = null;
  io.to(room.id).emit('classicStompState', {
    startedAt: room.stomp.startedAt,
    endsAt: room.stomp.endsAt,
    durationMs: room.stomp.durationMs
  });

  setTimeout(() => endClassicStomp(room.id), room.stomp.durationMs + 50);
}

function endClassicStomp(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameMode !== GAME_MODES.classicStomp || !room.stomp) return;
  if (room.stomp.ended) return;

  room.stomp.ended = true;

  // Determine winner by highest score
  const players = Array.from(room.players.values());
  let bestScore = -Infinity;
  let winners = [];
  for (const p of players) {
    const s = Number(p.score || 0);
    if (s > bestScore) {
      bestScore = s;
      winners = [p];
    } else if (s === bestScore) {
      winners.push(p);
    }
  }

  const winnerPayload = winners.length === 1
    ? { winnerId: winners[0].id, winnerName: winners[0].name, score: bestScore, tie: false }
    : { winnerId: null, winnerName: null, score: bestScore, tie: true, winners: winners.map(w => ({ id: w.id, name: w.name })) };

  room.stomp.winner = winnerPayload;

  io.to(room.id).emit('classicStompEnded', winnerPayload);
  io.to(room.id).emit('chatMessage', {
    id: uuidv4(),
    type: 'system',
    text: winnerPayload.tie
      ? `⏱️ Time! It's a tie at ${bestScore} points.`
      : `⏱️ Time! ${winnerPayload.winnerName} wins with ${bestScore} points!`,
    timestamp: Date.now()
  });

  // Match ended: return everyone to lobby (except Free Build).
  sendRoomBackToLobby(room, { message: 'Classic Stomp ended. Returning to lobby...', delayMs: 5000 });
}

function startKothIfNeeded(room) {
  if (!room || room.gameMode !== GAME_MODES.kingOfHill || !room.koth) return;
  if (room.koth.startedAt) return;

  room.koth.startedAt = Date.now();
  room.koth.endsAt = room.koth.startedAt + room.koth.durationMs;
  room.koth.ended = false;
  room.koth.controllerId = null;

  io.to(room.id).emit('kothState', {
    startedAt: room.koth.startedAt,
    endsAt: room.koth.endsAt,
    durationMs: room.koth.durationMs,
    hill: room.koth.hill,
    controllerId: room.koth.controllerId
  });

  if (!room.kothInterval) {
    room.kothInterval = setInterval(() => tickKoth(room.id), 1000);
  }
}

function restartKoth(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameMode !== GAME_MODES.kingOfHill || !room.koth) return;
  if (room.players.size === 0) return;

  // Reset players
  room.players.forEach(p => {
    p.score = 0;
    respawnPlayerInRoom(room, p);
    io.to(room.id).emit('playerMoved', p);
    io.to(room.id).emit('playerUpdated', p);
  });

  // Restart state/timer
  room.koth.startedAt = Date.now();
  room.koth.endsAt = room.koth.startedAt + room.koth.durationMs;
  room.koth.ended = false;
  room.koth.controllerId = null;
  io.to(room.id).emit('kothState', {
    startedAt: room.koth.startedAt,
    endsAt: room.koth.endsAt,
    durationMs: room.koth.durationMs,
    hill: room.koth.hill,
    controllerId: room.koth.controllerId
  });

  if (!room.kothInterval) {
    room.kothInterval = setInterval(() => tickKoth(room.id), 1000);
  }
}

function tickKoth(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameMode !== GAME_MODES.kingOfHill || !room.koth) return;
  if (!room.koth.startedAt || room.koth.ended) return;

  const now = Date.now();
  if (room.koth.endsAt && now >= room.koth.endsAt) {
    endKoth(roomId);
    return;
  }

  const hill = room.koth.hill;
  const onHill = [];
  room.players.forEach(p => {
    const dx = (p.x ?? 0) - hill.x;
    const dz = (p.z ?? 0) - hill.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= hill.radius) onHill.push(p);
  });

  let controllerId = null;
  let contested = false;
  if (onHill.length === 1) controllerId = onHill[0].id;
  else if (onHill.length > 1) contested = true;

  // Award points if uncontested
  if (controllerId) {
    const controller = room.players.get(controllerId);
    if (controller) {
      controller.score = Number(controller.score || 0) + 1;
      io.to(room.id).emit('kothScore', { playerId: controller.id, score: controller.score });
      io.to(room.id).emit('playerUpdated', controller);
    }
  }

  // Broadcast control changes or periodic state
  if (room.koth.controllerId !== controllerId) {
    room.koth.controllerId = controllerId;
    io.to(room.id).emit('kothControl', { controllerId, contested });
  }
}

function endKoth(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.gameMode !== GAME_MODES.kingOfHill || !room.koth) return;
  if (room.koth.ended) return;
  room.koth.ended = true;

  const players = Array.from(room.players.values());
  let bestScore = -Infinity;
  let winners = [];
  for (const p of players) {
    const s = Number(p.score || 0);
    if (s > bestScore) {
      bestScore = s;
      winners = [p];
    } else if (s === bestScore) {
      winners.push(p);
    }
  }

  const payload = winners.length === 1
    ? { winnerId: winners[0].id, winnerName: winners[0].name, score: bestScore, tie: false }
    : { winnerId: null, winnerName: null, score: bestScore, tie: true, winners: winners.map(w => ({ id: w.id, name: w.name })) };

  io.to(room.id).emit('kothEnded', payload);
  io.to(room.id).emit('chatMessage', {
    id: uuidv4(),
    type: 'system',
    text: payload.tie
      ? `⏱️ Time! KOTH tie at ${bestScore} points.`
      : `⏱️ Time! ${payload.winnerName} wins KOTH with ${bestScore} points!`,
    timestamp: Date.now()
  });

  if (room.kothInterval) {
    clearInterval(room.kothInterval);
    room.kothInterval = null;
  }

  // Match ended: return everyone to lobby (except Free Build).
  sendRoomBackToLobby(room, { message: 'King of the Hill ended. Returning to lobby...', delayMs: 5000 });
}

// (Battle Royale removed)

// Start NPC movement for a room
function startNPCMovement(room) {
  const interval = setInterval(() => {
    // Check if room still exists
    if (!rooms.has(room.id)) {
      clearInterval(interval);
      return;
    }
    
    room.npcs.forEach((npc) => {
      moveNPC(npc, room);
    });
  }, 500);
  
  room.npcInterval = interval;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  let currentRoom = null;
  
  // Send initial rooms list
  socket.emit('roomsList', getRoomsListInfo());
  
  // Request rooms list
  socket.on('requestRoomsList', () => {
    socket.emit('roomsList', getRoomsListInfo());
  });
  
  // Create room
  socket.on('createRoom', (data) => {
    const roomId = uuidv4();
    createRoom(
      roomId,
      (data && data.gameMode) || GAME_MODES.freeplay,
      data.playerName,
      { classicStompMinutes: data && data.classicStompMinutes, kothMinutes: data && data.kothMinutes }
    );
    
    broadcastRoomsList();
    
    socket.emit('roomJoined', {
      roomId: roomId,
      gameMode: rooms.get(roomId)?.gameMode || GAME_MODES.freeplay
    });
  });
  
  // Join existing room
  socket.on('joinRoom', (data) => {
    const room = rooms.get(data.roomId);
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.players.size >= room.maxPlayers) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    broadcastRoomsList();
    
    socket.emit('roomJoined', {
      roomId: data.roomId,
      gameMode: room.gameMode
    });
  });
  
  // Initialize player in room (called when game loads)
  socket.on('initGame', (data) => {
    const roomId = data && data.roomId;
    if (!roomId) {
      socket.emit('gameError', { message: 'Missing roomId. Please return to the lobby.' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('gameError', { message: 'Room no longer exists. Please return to the lobby.' });
      return;
    }

    if (room.returningToLobby) {
      socket.emit('gameError', { message: 'This match has ended. Please return to the lobby.' });
      return;
    }

    // Join the room now (game socket connection).
    cancelRoomDeletion(room);
    socket.join(roomId);
    currentRoom = room;

    // Create or reuse player for this socket in this room.
    let player = currentRoom.players.get(socket.id);
    if (!player) {
      const safeName = (data.playerName || '').trim().substring(0, 20) || `Player${Math.floor(Math.random() * 1000)}`;
      const safeColor = normalizeHexColor(data.playerColor) || COLORS[Math.floor(Math.random() * COLORS.length)];
      player = {
        id: socket.id,
        name: safeName,
        x: Math.floor(Math.random() * 10) + 5,
        y: 1,
        z: Math.floor(Math.random() * 10) + 5,
        previousY: 1,
        color: safeColor,
        direction: 0,
        badges: [],
        stompStats: { total: 0, lastStompTime: 0, recentStomps: [] },
        connectTime: Date.now(),

        lastAttackAt: 0,
        kills: undefined,

        // Classic Stomp
        score: (currentRoom.gameMode === GAME_MODES.classicStomp || currentRoom.gameMode === GAME_MODES.kingOfHill) ? 0 : undefined,

        // Push cooldown (all modes)
        lastPushAt: 0,

        // Infection
        isInfected: false,
        infectedAt: null
      };

      // Spawn onto valid ground
      respawnPlayerInRoom(currentRoom, player);

      currentRoom.players.set(socket.id, player);
      broadcastRoomsList();
    }

    // Classic Stomp: mark host + ensure score + start match timer
    if (currentRoom.gameMode === GAME_MODES.classicStomp) {
      if (!currentRoom.hostId) currentRoom.hostId = socket.id;
      if (player.score === undefined) player.score = 0;
      startClassicStompIfNeeded(currentRoom);
    }

    // King of the Hill: mark host + ensure score + start match timer
    if (currentRoom.gameMode === GAME_MODES.kingOfHill) {
      if (!currentRoom.hostId) currentRoom.hostId = socket.id;
      if (player.score === undefined) player.score = 0;
      startKothIfNeeded(currentRoom);
    }

    // Infection: ensure at least one infected (may be this joining player)
    if (currentRoom.gameMode === GAME_MODES.infection) {
      ensureAtLeastOneInfected(currentRoom);
      checkInfectionEnd(currentRoom);
    }

    // Send initial game state to new player
    socket.emit('init', {
      player,
      players: Array.from(currentRoom.players.values()),
      blocks: Array.from(currentRoom.blocks.values()),
      npcs: Array.from(currentRoom.npcs.values()),
      badges: BADGES,
      chatHistory: currentRoom.chatHistory.slice(-50),
      gameMode: currentRoom.gameMode,
      br: null,
      brWeapons: null,
      classicStomp: currentRoom.stomp,
      koth: currentRoom.koth
    });
    
    // Broadcast new player to others in room
    socket.to(currentRoom.id).emit('playerJoined', player);
    
    // Broadcast system message
    const joinMessage = {
      id: uuidv4(),
      type: 'system',
      text: `${player.name} joined the game`,
      timestamp: Date.now()
    };
    currentRoom.chatHistory.push(joinMessage);
    io.to(currentRoom.id).emit('chatMessage', joinMessage);
  });
  
  // Handle player movement with climbing
  socket.on('move', (data) => {
    if (!currentRoom) return;
    
    const player = currentRoom.players.get(socket.id);
    if (player) {
      const newX = Math.max(0, Math.min(WORLD_SIZE - 1, data.x));
      const newZ = Math.max(0, Math.min(WORLD_SIZE - 1, data.z));
      
      const moveResult = canMoveTo(player.x, player.y, player.z, newX, newZ, currentRoom);
      
      if (moveResult.canMove) {
        player.previousY = player.y;
        player.x = newX;
        player.z = newZ;
        player.y = moveResult.newY;
        player.direction = data.direction !== undefined ? data.direction : player.direction;
        
        // Classic Stomp only: check for NPC stomps
        if (currentRoom.gameMode === GAME_MODES.classicStomp) {
          const stomps = checkStompCollision(player, currentRoom);
          if (stomps.length > 0) {
            processStomps(player, stomps, currentRoom);
          }
        }
        
        io.to(currentRoom.id).emit('playerMoved', player);

        // Infection: spread on tile contact
        if (currentRoom.gameMode === GAME_MODES.infection) {
          ensureAtLeastOneInfected(currentRoom);

          const playersHere = Array.from(currentRoom.players.values()).filter(p =>
            p.id !== player.id &&
            p.x === player.x &&
            p.z === player.z &&
            p.y === player.y
          );

          if (player.isInfected) {
            playersHere.forEach(other => infectPlayer(currentRoom, other, player));
          } else {
            const infectedHere = playersHere.find(other => other.isInfected);
            if (infectedHere) infectPlayer(currentRoom, player, infectedHere);
          }
        }
      } else if (data.direction !== undefined) {
        // Allow rotation even if can't move
        player.direction = data.direction;
        io.to(currentRoom.id).emit('playerMoved', player);
      }
    }
  });

  // Push the player in front (2 tiles, 2s cooldown)
  socket.on('push', () => {
    if (!currentRoom) return;
    const attacker = currentRoom.players.get(socket.id);
    if (!attacker) return;

    const now = Date.now();
    if (now - (attacker.lastPushAt || 0) < 2000) return;
    attacker.lastPushAt = now;

    const dir = attacker.direction ?? 0;
    const dirs = [
      { dx: 0, dz: 1 },   // 0 south
      { dx: -1, dz: 0 },  // 1 west
      { dx: 0, dz: -1 },  // 2 north
      { dx: 1, dz: 0 }    // 3 east
    ];
    const { dx, dz } = dirs[dir] || dirs[0];

    // Find victim directly in front (adjacent tile)
    const targetX = attacker.x + dx;
    const targetZ = attacker.z + dz;
    const victim = Array.from(currentRoom.players.values()).find(p => p.id !== attacker.id && p.x === targetX && p.z === targetZ);
    if (!victim) return;

    // Don’t push if victim would go out of world immediately (still allow 1-tile push if possible)
    const isOccupied = (x, z, excludeId) => {
      for (const p of currentRoom.players.values()) {
        if (p.id !== excludeId && p.x === x && p.z === z) return true;
      }
      return false;
    };

    let moved = 0;
    let curX = victim.x;
    let curZ = victim.z;
    let curY = victim.y;

    // Step push up to 2 tiles
    for (let step = 1; step <= 2; step++) {
      const nx = curX + dx;
      const nz = curZ + dz;
      if (nx < 0 || nx >= WORLD_SIZE || nz < 0 || nz >= WORLD_SIZE) break;
      if (isOccupied(nx, nz, victim.id)) break;

      const res = canMoveTo(curX, curY, curZ, nx, nz, currentRoom);
      if (!res.canMove) break;

      victim.previousY = victim.y;
      curX = nx;
      curZ = nz;
      curY = res.newY;
      victim.x = curX;
      victim.z = curZ;
      victim.y = curY;
      moved++;
    }

    if (moved > 0) {
      io.to(currentRoom.id).emit('playerMoved', victim);
      io.to(currentRoom.id).emit('playerPushed', { attackerId: attacker.id, victimId: victim.id, tiles: moved });
    }
  });

  // Battle royale handled server-side (tile collapse + elimination)
  
  // Handle block placement
  socket.on('placeBlock', (data) => {
    if (!currentRoom) return;
    
    const player = currentRoom.players.get(socket.id);
    if (player) {
      const { x, y, z, color } = data;
      
      // Validate position
      if (x >= 0 && x < WORLD_SIZE && y >= 1 && y <= 10 && z >= 0 && z < WORLD_SIZE) {
        const key = `${x},${y},${z}`;
        
        // Don't place on floor or existing blocks
        if (!currentRoom.blocks.has(key)) {
          const block = { x, y, z, color: color || player.color, type: 'block', placedBy: player.id };
          currentRoom.blocks.set(key, block);
          io.to(currentRoom.id).emit('blockPlaced', block);
        }
      }
    }
  });
  
  // Handle block removal
  socket.on('removeBlock', (data) => {
    if (!currentRoom) return;
    
    const { x, y, z } = data;
    const key = `${x},${y},${z}`;
    const block = currentRoom.blocks.get(key);
    
    // Only remove non-floor blocks
    if (block && block.type !== 'floor') {
      currentRoom.blocks.delete(key);
      io.to(currentRoom.id).emit('blockRemoved', { x, y, z });
    }
  });
  
  // Handle chat messages
  socket.on('chat', (text) => {
    if (!currentRoom) return;
    
    const player = currentRoom.players.get(socket.id);
    if (player && text.trim()) {
      const message = {
        id: uuidv4(),
        type: 'player',
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        text: text.trim().substring(0, 500),
        timestamp: Date.now()
      };
      currentRoom.chatHistory.push(message);
      
      // Keep only last 100 messages
      if (currentRoom.chatHistory.length > 100) {
        currentRoom.chatHistory = currentRoom.chatHistory.slice(-100);
      }
      
      io.to(currentRoom.id).emit('chatMessage', message);
    }
  });
  
  // Handle name change
  socket.on('setName', (name) => {
    if (!currentRoom) return;
    
    const player = currentRoom.players.get(socket.id);
    if (player && name.trim()) {
      const oldName = player.name;
      player.name = name.trim().substring(0, 20);
      io.to(currentRoom.id).emit('playerUpdated', player);
      
      const message = {
        id: uuidv4(),
        type: 'system',
        text: `${oldName} is now known as ${player.name}`,
        timestamp: Date.now()
      };
      currentRoom.chatHistory.push(message);
      io.to(currentRoom.id).emit('chatMessage', message);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    if (currentRoom) {
      const player = currentRoom.players.get(socket.id);
      if (player) {
        const leaveMessage = {
          id: uuidv4(),
          type: 'system',
          text: `${player.name} left the game`,
          timestamp: Date.now()
        };
        currentRoom.chatHistory.push(leaveMessage);
        io.to(currentRoom.id).emit('chatMessage', leaveMessage);
        
        currentRoom.players.delete(socket.id);
        io.to(currentRoom.id).emit('playerLeft', socket.id);

        // Infection: if infected left and nobody infected remains, pick a new one
        if (currentRoom.gameMode === GAME_MODES.infection && currentRoom.players.size > 0) {
          ensureAtLeastOneInfected(currentRoom);
        }

        // Delete room if empty
        if (currentRoom.players.size === 0) {
          scheduleRoomDeletion(currentRoom);
        }
        
        broadcastRoomsList();
      }
    }
    console.log('Player disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
