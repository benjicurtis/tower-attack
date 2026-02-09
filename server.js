const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const gameState = {
  players: new Map(),
  blocks: new Map(),
  npcs: new Map(),
  chatHistory: []
};

// World configuration
const WORLD_SIZE = 20;
const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

// Fun badges for stomping NPCs
const BADGES = [
  { id: 'first_stomp', name: 'First Blood', icon: '🎯', description: 'Stomped your first NPC!', rarity: 'common' },
  { id: 'ghost_buster', name: 'Ghost Buster', icon: '👻', description: 'Stomped Blinky the Ghost!', rarity: 'rare' },
  { id: 'slime_slayer', name: 'Slime Slayer', icon: '🟢', description: 'Squished Goopy the Slime!', rarity: 'common' },
  { id: 'robot_wrecker', name: 'Robot Wrecker', icon: '🤖', description: 'Deactivated Beep-Boop!', rarity: 'epic' },
  { id: 'mushroom_masher', name: 'Mushroom Masher', icon: '🍄', description: 'Flattened Shroomie!', rarity: 'rare' },
  { id: 'combo_king', name: 'Combo King', icon: '👑', description: 'Stomped 3 NPCs in 10 seconds!', rarity: 'legendary' },
  { id: 'sky_diver', name: 'Sky Diver', icon: '🪂', description: 'Stomped from 3+ blocks high!', rarity: 'epic' },
  { id: 'serial_stomper', name: 'Serial Stomper', icon: '👟', description: 'Stomped 10 NPCs total!', rarity: 'legendary' },
  { id: 'speed_demon', name: 'Speed Demon', icon: '⚡', description: 'Stomped an NPC within 5 seconds of spawning!', rarity: 'rare' },
  { id: 'perfectionist', name: 'Perfectionist', icon: '💎', description: 'Collected all NPC-specific badges!', rarity: 'legendary' }
];

// NPC definitions with unique personalities
const NPC_TYPES = [
  { 
    id: 'ghost', 
    name: 'Blinky', 
    color: '#E8E8E8', 
    secondaryColor: '#B0B0B0',
    type: 'ghost',
    speed: 1500,
    badge: 'ghost_buster'
  },
  { 
    id: 'slime', 
    name: 'Goopy', 
    color: '#7CFC00', 
    secondaryColor: '#32CD32',
    type: 'slime',
    speed: 2000,
    badge: 'slime_slayer'
  },
  { 
    id: 'robot', 
    name: 'Beep-Boop', 
    color: '#708090', 
    secondaryColor: '#FF4500',
    type: 'robot',
    speed: 1200,
    badge: 'robot_wrecker'
  },
  { 
    id: 'mushroom', 
    name: 'Shroomie', 
    color: '#FF6347', 
    secondaryColor: '#FFE4B5',
    type: 'mushroom',
    speed: 2500,
    badge: 'mushroom_masher'
  }
];

// Initialize some default blocks for the floor
function initializeWorld() {
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
function initializeNPCs() {
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
      badge: npcType.badge,
      direction: Math.floor(Math.random() * 4),
      isAlive: true,
      respawnTime: 5000,
      animationFrame: 0
    };
    gameState.npcs.set(npc.id, npc);
  });
}

// Get ground level at position (top of highest block)
function getGroundLevel(x, z) {
  for (let y = 10; y >= 0; y--) {
    const key = `${x},${y},${z}`;
    if (gameState.blocks.has(key)) {
      return y + 1;
    }
  }
  return 1;
}

// Check if position is valid for movement (considering climbing)
function canMoveTo(fromX, fromY, fromZ, toX, toZ) {
  // Check bounds
  if (toX < 0 || toX >= WORLD_SIZE || toZ < 0 || toZ >= WORLD_SIZE) {
    return { canMove: false };
  }
  
  const targetGroundLevel = getGroundLevel(toX, toZ);
  const heightDiff = targetGroundLevel - fromY;
  
  // Can climb up 1 block, can fall any distance
  if (heightDiff <= 1) {
    return { canMove: true, newY: targetGroundLevel };
  }
  
  return { canMove: false };
}

// Move NPC with pathfinding
function moveNPC(npc) {
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
    
    const moveResult = canMoveTo(npc.x, npc.y, npc.z, newX, newZ);
    
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
  
  io.emit('npcMoved', npc);
}

// Respawn NPC
function respawnNPC(npcId) {
  const npc = gameState.npcs.get(npcId);
  if (npc) {
    npc.isAlive = true;
    npc.x = Math.floor(Math.random() * 14) + 3;
    npc.z = Math.floor(Math.random() * 14) + 3;
    npc.y = getGroundLevel(npc.x, npc.z);
    npc.direction = Math.floor(Math.random() * 4);
    io.emit('npcRespawned', npc);
  }
}

// Check for stomp collision
function checkStompCollision(player) {
  const stomps = [];
  
  gameState.npcs.forEach((npc) => {
    if (!npc.isAlive) return;
    
    // Check if player is on same X,Z and coming from above
    if (player.x === npc.x && player.z === npc.z && player.y >= npc.y) {
      const heightDiff = player.previousY - npc.y;
      stomps.push({ npc, heightDiff });
    }
  });
  
  return stomps;
}

// Award badge to player
function awardBadge(player, badgeId) {
  if (!player.badges) player.badges = [];
  if (!player.stompStats) player.stompStats = { total: 0, lastStompTime: 0, recentStomps: [] };
  
  // Check if already has badge
  if (player.badges.includes(badgeId)) return null;
  
  const badge = BADGES.find(b => b.id === badgeId);
  if (badge) {
    player.badges.push(badgeId);
    return badge;
  }
  return null;
}

// Process stomp and award badges
function processStomps(player, stomps) {
  const now = Date.now();
  const awardedBadges = [];
  
  stomps.forEach(({ npc, heightDiff }) => {
    // Kill the NPC
    npc.isAlive = false;
    io.emit('npcStomped', { npcId: npc.id, playerId: player.id, playerName: player.name });
    
    // Schedule respawn
    setTimeout(() => respawnNPC(npc.id), npc.respawnTime);
    
    // Update stomp stats
    player.stompStats.total++;
    player.stompStats.recentStomps.push(now);
    player.stompStats.lastStompTime = now;
    
    // Clean old recent stomps (keep last 10 seconds)
    player.stompStats.recentStomps = player.stompStats.recentStomps.filter(t => now - t < 10000);
    
    // Award first stomp badge
    if (player.stompStats.total === 1) {
      const badge = awardBadge(player, 'first_stomp');
      if (badge) awardedBadges.push(badge);
    }
    
    // Award NPC-specific badge
    const npcBadge = awardBadge(player, npc.badge);
    if (npcBadge) awardedBadges.push(npcBadge);
    
    // Award sky diver badge (stomped from 3+ blocks)
    if (heightDiff >= 3) {
      const badge = awardBadge(player, 'sky_diver');
      if (badge) awardedBadges.push(badge);
    }
    
    // Award speed demon (stomped within 5 seconds of connecting)
    if (player.connectTime && now - player.connectTime < 5000) {
      const badge = awardBadge(player, 'speed_demon');
      if (badge) awardedBadges.push(badge);
    }
    
    // Award combo king (3 stomps in 10 seconds)
    if (player.stompStats.recentStomps.length >= 3) {
      const badge = awardBadge(player, 'combo_king');
      if (badge) awardedBadges.push(badge);
    }
    
    // Award serial stomper (10 total stomps)
    if (player.stompStats.total >= 10) {
      const badge = awardBadge(player, 'serial_stomper');
      if (badge) awardedBadges.push(badge);
    }
    
    // Check for perfectionist (all NPC badges)
    const npcBadges = ['ghost_buster', 'slime_slayer', 'robot_wrecker', 'mushroom_masher'];
    if (npcBadges.every(b => player.badges.includes(b))) {
      const badge = awardBadge(player, 'perfectionist');
      if (badge) awardedBadges.push(badge);
    }
  });
  
  return awardedBadges;
}

initializeWorld();
initializeNPCs();

// NPC movement loop
setInterval(() => {
  gameState.npcs.forEach((npc) => {
    moveNPC(npc);
  });
}, 500);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Create new player
  const player = {
    id: socket.id,
    name: `Player${Math.floor(Math.random() * 1000)}`,
    x: Math.floor(Math.random() * 10) + 5,
    y: 1,
    z: Math.floor(Math.random() * 10) + 5,
    previousY: 1,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    direction: 0,
    badges: [],
    stompStats: { total: 0, lastStompTime: 0, recentStomps: [] },
    connectTime: Date.now()
  };
  
  // Adjust Y to ground level
  player.y = getGroundLevel(player.x, player.z);
  player.previousY = player.y;
  
  gameState.players.set(socket.id, player);
  
  // Send initial game state to new player
  socket.emit('init', {
    player,
    players: Array.from(gameState.players.values()),
    blocks: Array.from(gameState.blocks.values()),
    npcs: Array.from(gameState.npcs.values()),
    badges: BADGES,
    chatHistory: gameState.chatHistory.slice(-50)
  });
  
  // Broadcast new player to others
  socket.broadcast.emit('playerJoined', player);
  
  // Broadcast system message
  const joinMessage = {
    id: uuidv4(),
    type: 'system',
    text: `${player.name} joined the game`,
    timestamp: Date.now()
  };
  gameState.chatHistory.push(joinMessage);
  io.emit('chatMessage', joinMessage);
  
  // Handle player movement with climbing
  socket.on('move', (data) => {
    const player = gameState.players.get(socket.id);
    if (player) {
      const newX = Math.max(0, Math.min(WORLD_SIZE - 1, data.x));
      const newZ = Math.max(0, Math.min(WORLD_SIZE - 1, data.z));
      
      const moveResult = canMoveTo(player.x, player.y, player.z, newX, newZ);
      
      if (moveResult.canMove) {
        player.previousY = player.y;
        player.x = newX;
        player.z = newZ;
        player.y = moveResult.newY;
        player.direction = data.direction !== undefined ? data.direction : player.direction;
        
        // Check for NPC stomps
        const stomps = checkStompCollision(player);
        if (stomps.length > 0) {
          const awardedBadges = processStomps(player, stomps);
          
          // Notify about badges
          awardedBadges.forEach(badge => {
            socket.emit('badgeEarned', badge);
            
            // Announce in chat
            const badgeMessage = {
              id: uuidv4(),
              type: 'badge',
              text: `${player.name} earned the "${badge.name}" badge! ${badge.icon}`,
              badge: badge,
              timestamp: Date.now()
            };
            gameState.chatHistory.push(badgeMessage);
            io.emit('chatMessage', badgeMessage);
          });
        }
        
        io.emit('playerMoved', player);
      } else if (data.direction !== undefined) {
        // Allow rotation even if can't move
        player.direction = data.direction;
        io.emit('playerMoved', player);
      }
    }
  });
  
  // Handle block placement
  socket.on('placeBlock', (data) => {
    const player = gameState.players.get(socket.id);
    if (player) {
      const { x, y, z, color } = data;
      
      // Validate position
      if (x >= 0 && x < WORLD_SIZE && y >= 1 && y <= 10 && z >= 0 && z < WORLD_SIZE) {
        const key = `${x},${y},${z}`;
        
        // Don't place on floor or existing blocks
        if (!gameState.blocks.has(key)) {
          const block = { x, y, z, color: color || player.color, type: 'block', placedBy: player.id };
          gameState.blocks.set(key, block);
          io.emit('blockPlaced', block);
        }
      }
    }
  });
  
  // Handle block removal
  socket.on('removeBlock', (data) => {
    const { x, y, z } = data;
    const key = `${x},${y},${z}`;
    const block = gameState.blocks.get(key);
    
    // Only remove non-floor blocks
    if (block && block.type !== 'floor') {
      gameState.blocks.delete(key);
      io.emit('blockRemoved', { x, y, z });
    }
  });
  
  // Handle chat messages
  socket.on('chat', (text) => {
    const player = gameState.players.get(socket.id);
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
      gameState.chatHistory.push(message);
      
      // Keep only last 100 messages
      if (gameState.chatHistory.length > 100) {
        gameState.chatHistory = gameState.chatHistory.slice(-100);
      }
      
      io.emit('chatMessage', message);
    }
  });
  
  // Handle name change
  socket.on('setName', (name) => {
    const player = gameState.players.get(socket.id);
    if (player && name.trim()) {
      const oldName = player.name;
      player.name = name.trim().substring(0, 20);
      io.emit('playerUpdated', player);
      
      const message = {
        id: uuidv4(),
        type: 'system',
        text: `${oldName} is now known as ${player.name}`,
        timestamp: Date.now()
      };
      gameState.chatHistory.push(message);
      io.emit('chatMessage', message);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const player = gameState.players.get(socket.id);
    if (player) {
      const leaveMessage = {
        id: uuidv4(),
        type: 'system',
        text: `${player.name} left the game`,
        timestamp: Date.now()
      };
      gameState.chatHistory.push(leaveMessage);
      io.emit('chatMessage', leaveMessage);
      
      gameState.players.delete(socket.id);
      io.emit('playerLeft', socket.id);
    }
    console.log('Player disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
