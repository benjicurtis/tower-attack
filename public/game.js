// Game Configuration
const CONFIG = {
  TILE_WIDTH: 64,
  TILE_HEIGHT: 32,
  BLOCK_HEIGHT: 20,
  WORLD_SIZE: 20,
  COLORS: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
};

// Game State
const state = {
  socket: null,
  player: null,
  players: new Map(),
  blocks: new Map(),
  npcs: new Map(),
  badges: [],
  earnedBadges: [],
  selectedColor: 0,
  keys: {},
  camera: { x: 0, y: 0 },
  lastMoveTime: 0,
  moveDelay: 150,
  notifications: [],
  stompEffects: []
};

// Canvas setup
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Resize canvas
function resizeCanvas() {
  const container = document.getElementById('game-container');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  render();
}

window.addEventListener('resize', resizeCanvas);

// Isometric conversion functions
function toIso(x, y, z) {
  return {
    x: (x - z) * (CONFIG.TILE_WIDTH / 2),
    y: (x + z) * (CONFIG.TILE_HEIGHT / 2) - y * CONFIG.BLOCK_HEIGHT
  };
}

function toWorld(screenX, screenY) {
  const x = (screenX / (CONFIG.TILE_WIDTH / 2) + screenY / (CONFIG.TILE_HEIGHT / 2)) / 2;
  const z = (screenY / (CONFIG.TILE_HEIGHT / 2) - screenX / (CONFIG.TILE_WIDTH / 2)) / 2;
  return { x: Math.floor(x), z: Math.floor(z) };
}

// Draw isometric block
function drawBlock(x, y, z, color, isPlayer = false, playerData = null) {
  const iso = toIso(x, y, z);
  const screenX = iso.x + state.camera.x + canvas.width / 2;
  const screenY = iso.y + state.camera.y + canvas.height / 2;
  
  const w = CONFIG.TILE_WIDTH / 2;
  const h = CONFIG.TILE_HEIGHT / 2;
  const blockH = CONFIG.BLOCK_HEIGHT;
  
  const baseColor = color;
  const darkColor = shadeColor(color, -30);
  const lightColor = shadeColor(color, 20);
  
  // Top face
  ctx.beginPath();
  ctx.moveTo(screenX, screenY - blockH);
  ctx.lineTo(screenX + w, screenY + h - blockH);
  ctx.lineTo(screenX, screenY + h * 2 - blockH);
  ctx.lineTo(screenX - w, screenY + h - blockH);
  ctx.closePath();
  ctx.fillStyle = lightColor;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Left face
  ctx.beginPath();
  ctx.moveTo(screenX - w, screenY + h - blockH);
  ctx.lineTo(screenX, screenY + h * 2 - blockH);
  ctx.lineTo(screenX, screenY + h * 2);
  ctx.lineTo(screenX - w, screenY + h);
  ctx.closePath();
  ctx.fillStyle = darkColor;
  ctx.fill();
  ctx.stroke();
  
  // Right face
  ctx.beginPath();
  ctx.moveTo(screenX + w, screenY + h - blockH);
  ctx.lineTo(screenX, screenY + h * 2 - blockH);
  ctx.lineTo(screenX, screenY + h * 2);
  ctx.lineTo(screenX + w, screenY + h);
  ctx.closePath();
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.stroke();
}

// Draw player avatar
function drawPlayerAvatar(x, y, player, elevated = false) {
  const bodyWidth = 24;
  const bodyHeight = 32;
  
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + bodyHeight + 5, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Body
  ctx.beginPath();
  ctx.fillStyle = player.color;
  roundRect(ctx, x - bodyWidth/2, y, bodyWidth, bodyHeight, 8);
  ctx.fill();
  ctx.strokeStyle = shadeColor(player.color, -40);
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Face
  ctx.fillStyle = '#FFE4C4';
  ctx.beginPath();
  ctx.arc(x, y + 10, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#DEB887';
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Eyes based on direction
  ctx.fillStyle = '#333';
  const eyeOffset = getEyeOffset(player.direction);
  ctx.beginPath();
  ctx.arc(x - 3 + eyeOffset.x, y + 8, 2, 0, Math.PI * 2);
  ctx.arc(x + 3 + eyeOffset.x, y + 8, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Height indicator if elevated
  if (elevated && player.y > 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 10px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(`↑${player.y - 1}`, x, y + bodyHeight + 20);
  }
  
  // Badge count indicator
  if (player.badges && player.badges.length > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(x + 15, y - 5, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 10px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(player.badges.length, x + 15, y - 1);
  }
  
  // Name tag
  ctx.font = 'bold 12px Segoe UI';
  ctx.textAlign = 'center';
  const nameWidth = ctx.measureText(player.name).width + 10;
  
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  roundRect(ctx, x - nameWidth/2, y - 22, nameWidth, 18, 4);
  ctx.fill();
  
  ctx.fillStyle = '#fff';
  ctx.fillText(player.name, x, y - 8);
}

// Draw NPC based on type
function drawNPC(x, y, npc) {
  if (!npc.isAlive) return;
  
  const bounce = Math.sin(Date.now() / 200 + npc.animationFrame) * 3;
  const drawY = y + bounce;
  
  switch(npc.type) {
    case 'ghost':
      drawGhost(x, drawY, npc);
      break;
    case 'slime':
      drawSlime(x, drawY, npc);
      break;
    case 'robot':
      drawRobot(x, drawY, npc);
      break;
    case 'mushroom':
      drawMushroom(x, drawY, npc);
      break;
    default:
      drawGenericNPC(x, drawY, npc);
  }
  
  // Name tag
  ctx.font = 'bold 11px Segoe UI';
  ctx.textAlign = 'center';
  const nameWidth = ctx.measureText(npc.name).width + 8;
  
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, x - nameWidth/2, y - 35, nameWidth, 16, 4);
  ctx.fill();
  
  ctx.fillStyle = npc.color;
  ctx.fillText(npc.name, x, y - 23);
}

function drawGhost(x, y, npc) {
  // Ghost body
  ctx.fillStyle = npc.color;
  ctx.beginPath();
  ctx.arc(x, y + 5, 15, Math.PI, 0, false);
  ctx.lineTo(x + 15, y + 25);
  // Wavy bottom
  for (let i = 0; i < 5; i++) {
    const wx = x + 15 - i * 7.5;
    const wy = y + 25 + (i % 2 === 0 ? 5 : 0);
    ctx.lineTo(wx, wy);
  }
  ctx.closePath();
  ctx.fill();
  
  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x - 5, y + 5, 4, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 5, y + 5, 4, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Eye highlights
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - 6, y + 3, 2, 0, Math.PI * 2);
  ctx.arc(x + 4, y + 3, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSlime(x, y, npc) {
  const squish = Math.sin(Date.now() / 150) * 2;
  
  // Slime body
  ctx.fillStyle = npc.color;
  ctx.beginPath();
  ctx.ellipse(x, y + 15, 18 + squish, 12 - squish/2, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Highlight
  ctx.fillStyle = npc.secondaryColor;
  ctx.beginPath();
  ctx.ellipse(x - 5, y + 10, 6, 4, -0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - 6, y + 12, 3, 0, Math.PI * 2);
  ctx.arc(x + 6, y + 12, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Cute mouth
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y + 18, 4, 0, Math.PI);
  ctx.stroke();
}

function drawRobot(x, y, npc) {
  // Body
  ctx.fillStyle = npc.color;
  roundRect(ctx, x - 12, y, 24, 28, 4);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Head
  ctx.fillStyle = npc.color;
  roundRect(ctx, x - 10, y - 15, 20, 18, 3);
  ctx.fill();
  ctx.stroke();
  
  // Antenna
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 15);
  ctx.lineTo(x, y - 25);
  ctx.stroke();
  ctx.fillStyle = npc.secondaryColor;
  ctx.beginPath();
  ctx.arc(x, y - 25, 4, 0, Math.PI * 2);
  ctx.fill();
  
  // Eyes (LED style)
  const blink = Math.sin(Date.now() / 100) > 0.8;
  ctx.fillStyle = blink ? '#FF0000' : npc.secondaryColor;
  ctx.beginPath();
  ctx.arc(x - 5, y - 6, 3, 0, Math.PI * 2);
  ctx.arc(x + 5, y - 6, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Chest panel
  ctx.fillStyle = '#333';
  roundRect(ctx, x - 8, y + 5, 16, 10, 2);
  ctx.fill();
  
  // Blinking lights
  const lights = ['#FF0000', '#00FF00', '#0000FF'];
  lights.forEach((color, i) => {
    ctx.fillStyle = Math.sin(Date.now() / 200 + i) > 0 ? color : '#333';
    ctx.beginPath();
    ctx.arc(x - 5 + i * 5, y + 10, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawMushroom(x, y, npc) {
  // Stem
  ctx.fillStyle = npc.secondaryColor;
  roundRect(ctx, x - 8, y + 10, 16, 18, 4);
  ctx.fill();
  
  // Cap
  ctx.fillStyle = npc.color;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 20, 14, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  
  // Spots
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x - 8, y + 2, 4, 0, Math.PI * 2);
  ctx.arc(x + 6, y - 2, 3, 0, Math.PI * 2);
  ctx.arc(x + 2, y + 5, 3, 0, Math.PI * 2);
  ctx.fill();
  
  // Face
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - 4, y + 18, 2, 0, Math.PI * 2);
  ctx.arc(x + 4, y + 18, 2, 0, Math.PI * 2);
  ctx.fill();
  
  // Blush
  ctx.fillStyle = 'rgba(255,150,150,0.5)';
  ctx.beginPath();
  ctx.ellipse(x - 8, y + 20, 3, 2, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 8, y + 20, 3, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGenericNPC(x, y, npc) {
  ctx.fillStyle = npc.color;
  ctx.beginPath();
  ctx.arc(x, y + 15, 15, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(x - 5, y + 12, 3, 0, Math.PI * 2);
  ctx.arc(x + 5, y + 12, 3, 0, Math.PI * 2);
  ctx.fill();
}

// Draw stomp effect
function drawStompEffect(effect) {
  const progress = (Date.now() - effect.startTime) / effect.duration;
  if (progress >= 1) return false;
  
  const iso = toIso(effect.x, effect.y, effect.z);
  const screenX = iso.x + state.camera.x + canvas.width / 2;
  const screenY = iso.y + state.camera.y + canvas.height / 2;
  
  // Expanding ring
  ctx.strokeStyle = `rgba(255, 215, 0, ${1 - progress})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(screenX, screenY, 20 + progress * 40, 0, Math.PI * 2);
  ctx.stroke();
  
  // Stars
  const starCount = 5;
  for (let i = 0; i < starCount; i++) {
    const angle = (i / starCount) * Math.PI * 2 + progress * 2;
    const dist = 20 + progress * 50;
    const starX = screenX + Math.cos(angle) * dist;
    const starY = screenY + Math.sin(angle) * dist - progress * 30;
    
    ctx.fillStyle = `rgba(255, 215, 0, ${1 - progress})`;
    ctx.font = `${20 - progress * 10}px Segoe UI`;
    ctx.fillText('★', starX - 8, starY + 8);
  }
  
  return true;
}

function getEyeOffset(direction) {
  switch(direction) {
    case 0: return { x: 0, y: 2 };
    case 1: return { x: -2, y: 0 };
    case 2: return { x: 0, y: -2 };
    case 3: return { x: 2, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// Main render function
function render() {
  ctx.fillStyle = '#0f0f23';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  drawGrid();
  
  const renderList = [];
  
  // Add blocks
  state.blocks.forEach((block, key) => {
    renderList.push({
      type: 'block',
      x: block.x,
      y: block.y,
      z: block.z,
      color: block.color,
      sortKey: block.x + block.z + block.y * 0.1
    });
  });
  
  // Add players
  state.players.forEach((player, id) => {
    renderList.push({
      type: 'player',
      x: player.x,
      y: player.y,
      z: player.z,
      player: player,
      sortKey: player.x + player.z + player.y * 0.1 + 0.05
    });
  });
  
  // Add NPCs
  state.npcs.forEach((npc, id) => {
    if (npc.isAlive) {
      renderList.push({
        type: 'npc',
        x: npc.x,
        y: npc.y,
        z: npc.z,
        npc: npc,
        sortKey: npc.x + npc.z + npc.y * 0.1 + 0.03
      });
    }
  });
  
  // Sort by depth
  renderList.sort((a, b) => a.sortKey - b.sortKey);
  
  // Render all objects
  renderList.forEach(obj => {
    if (obj.type === 'block') {
      drawBlock(obj.x, obj.y, obj.z, obj.color);
    } else if (obj.type === 'player') {
      drawPlayerIndicator(obj.x, obj.y, obj.z, obj.player);
    } else if (obj.type === 'npc') {
      drawNPCIndicator(obj.x, obj.y, obj.z, obj.npc);
    }
  });
  
  // Draw stomp effects
  state.stompEffects = state.stompEffects.filter(effect => drawStompEffect(effect));
  
  drawColorPalette();
  drawBadgeDisplay();
  
  if (state.player) {
    drawSelectionIndicator();
  }
  
  // Draw notifications
  drawNotifications();
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  
  for (let x = 0; x <= CONFIG.WORLD_SIZE; x++) {
    for (let z = 0; z <= CONFIG.WORLD_SIZE; z++) {
      const iso = toIso(x, 0, z);
      const screenX = iso.x + state.camera.x + canvas.width / 2;
      const screenY = iso.y + state.camera.y + canvas.height / 2;
      
      if (x < CONFIG.WORLD_SIZE) {
        const nextIso = toIso(x + 1, 0, z);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(nextIso.x + state.camera.x + canvas.width / 2, nextIso.y + state.camera.y + canvas.height / 2);
        ctx.stroke();
      }
      
      if (z < CONFIG.WORLD_SIZE) {
        const nextIso = toIso(x, 0, z + 1);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(nextIso.x + state.camera.x + canvas.width / 2, nextIso.y + state.camera.y + canvas.height / 2);
        ctx.stroke();
      }
    }
  }
}

function drawPlayerIndicator(x, y, z, player) {
  const iso = toIso(x, y, z);
  const screenX = iso.x + state.camera.x + canvas.width / 2;
  const screenY = iso.y + state.camera.y + canvas.height / 2;
  
  // Glow
  const gradient = ctx.createRadialGradient(screenX, screenY + 20, 0, screenX, screenY + 20, 30);
  gradient.addColorStop(0, player.color + '40');
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 20, 30, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  
  drawPlayerAvatar(screenX, screenY - 30, player, true);
}

function drawNPCIndicator(x, y, z, npc) {
  const iso = toIso(x, y, z);
  const screenX = iso.x + state.camera.x + canvas.width / 2;
  const screenY = iso.y + state.camera.y + canvas.height / 2;
  
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 25, 15, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  
  drawNPC(screenX, screenY - 15, npc);
}

function drawSelectionIndicator() {
  if (!state.player) return;
  
  const { x, y, z, direction } = state.player;
  let targetX = x, targetZ = z;
  
  switch(direction) {
    case 0: targetZ++; break;
    case 1: targetX--; break;
    case 2: targetZ--; break;
    case 3: targetX++; break;
  }
  
  targetX = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetX));
  targetZ = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetZ));
  
  let targetY = 1;
  for (let checkY = 10; checkY >= 1; checkY--) {
    const key = `${targetX},${checkY},${targetZ}`;
    if (state.blocks.has(key)) {
      targetY = checkY + 1;
      break;
    }
  }
  
  const iso = toIso(targetX, targetY, targetZ);
  const screenX = iso.x + state.camera.x + canvas.width / 2;
  const screenY = iso.y + state.camera.y + canvas.height / 2;
  
  const w = CONFIG.TILE_WIDTH / 2;
  const h = CONFIG.TILE_HEIGHT / 2;
  
  ctx.strokeStyle = CONFIG.COLORS[state.selectedColor];
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  ctx.beginPath();
  ctx.moveTo(screenX, screenY - CONFIG.BLOCK_HEIGHT);
  ctx.lineTo(screenX + w, screenY + h - CONFIG.BLOCK_HEIGHT);
  ctx.lineTo(screenX, screenY + h * 2 - CONFIG.BLOCK_HEIGHT);
  ctx.lineTo(screenX - w, screenY + h - CONFIG.BLOCK_HEIGHT);
  ctx.closePath();
  ctx.stroke();
  
  ctx.setLineDash([]);
}

function drawColorPalette() {
  const startX = canvas.width - 280;
  const startY = 20;
  
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  roundRect(ctx, startX - 10, startY - 10, CONFIG.COLORS.length * 36 + 10, 50, 10);
  ctx.fill();
  
  CONFIG.COLORS.forEach((color, i) => {
    const x = startX + i * 36;
    const y = startY;
    
    if (i === state.selectedColor) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      roundRect(ctx, x - 2, y - 2, 32, 32, 8);
      ctx.stroke();
    }
    
    ctx.fillStyle = color;
    roundRect(ctx, x, y, 28, 28, 6);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 10px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(i + 1, x + 14, y + 18);
  });
}

function drawBadgeDisplay() {
  if (!state.player || !state.player.badges || state.player.badges.length === 0) return;
  
  const startX = 20;
  const startY = 100;
  
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  roundRect(ctx, startX - 10, startY - 10, 180, 30 + state.player.badges.length * 25, 10);
  ctx.fill();
  
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 14px Segoe UI';
  ctx.textAlign = 'left';
  ctx.fillText('Badges', startX, startY + 10);
  
  state.player.badges.forEach((badgeId, i) => {
    const badge = state.badges.find(b => b.id === badgeId);
    if (badge) {
      const y = startY + 30 + i * 25;
      
      // Rarity color
      const rarityColors = {
        common: '#9CA3AF',
        rare: '#3B82F6',
        epic: '#8B5CF6',
        legendary: '#F59E0B'
      };
      
      ctx.fillStyle = rarityColors[badge.rarity] || '#fff';
      ctx.font = '16px Segoe UI';
      ctx.fillText(badge.icon, startX, y);
      
      ctx.fillStyle = '#fff';
      ctx.font = '12px Segoe UI';
      ctx.fillText(badge.name, startX + 25, y);
    }
  });
}

function drawNotifications() {
  const now = Date.now();
  state.notifications = state.notifications.filter(n => now - n.time < 4000);
  
  state.notifications.forEach((notification, i) => {
    const age = now - notification.time;
    const alpha = Math.min(1, (4000 - age) / 1000);
    const y = canvas.height / 2 - 100 + i * 80;
    const slideIn = Math.min(1, age / 300);
    const x = canvas.width / 2 + (1 - slideIn) * 200;
    
    // Background
    ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * alpha})`;
    roundRect(ctx, x - 150, y - 30, 300, 70, 15);
    ctx.fill();
    
    // Border glow based on rarity
    const rarityColors = {
      common: '#9CA3AF',
      rare: '#3B82F6',
      epic: '#8B5CF6',
      legendary: '#F59E0B'
    };
    ctx.strokeStyle = rarityColors[notification.badge.rarity] || '#FFD700';
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Icon
    ctx.font = '36px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillText(notification.badge.icon, x - 100, y + 10);
    
    // Title
    ctx.font = 'bold 18px Segoe UI';
    ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
    ctx.fillText('Badge Earned!', x + 20, y - 5);
    
    // Badge name
    ctx.font = '14px Segoe UI';
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillText(notification.badge.name, x + 20, y + 15);
    
    // Description
    ctx.font = '11px Segoe UI';
    ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
    ctx.fillText(notification.badge.description, x + 20, y + 32);
  });
}

function updateCamera() {
  if (!state.player) return;
  
  const iso = toIso(state.player.x, state.player.y, state.player.z);
  const targetX = -iso.x;
  const targetY = -iso.y;
  
  state.camera.x += (targetX - state.camera.x) * 0.1;
  state.camera.y += (targetY - state.camera.y) * 0.1;
}

// Get ground level at position
function getGroundLevel(x, z) {
  for (let y = 10; y >= 0; y--) {
    const key = `${x},${y},${z}`;
    if (state.blocks.has(key)) {
      return y + 1;
    }
  }
  return 1;
}

function handleMovement() {
  if (!state.player) return;
  
  const now = Date.now();
  if (now - state.lastMoveTime < state.moveDelay) return;
  
  let moved = false;
  let newX = state.player.x;
  let newZ = state.player.z;
  let newDirection = state.player.direction;
  
  if (state.keys['KeyW'] || state.keys['ArrowUp']) {
    newZ--;
    newDirection = 2;
    moved = true;
  } else if (state.keys['KeyS'] || state.keys['ArrowDown']) {
    newZ++;
    newDirection = 0;
    moved = true;
  } else if (state.keys['KeyA'] || state.keys['ArrowLeft']) {
    newX--;
    newDirection = 1;
    moved = true;
  } else if (state.keys['KeyD'] || state.keys['ArrowRight']) {
    newX++;
    newDirection = 3;
    moved = true;
  }
  
  if (state.keys['KeyQ']) {
    newDirection = (state.player.direction + 3) % 4;
    state.socket.emit('move', { x: state.player.x, z: state.player.z, direction: newDirection });
    state.player.direction = newDirection;
    state.lastMoveTime = now;
    return;
  }
  if (state.keys['KeyE']) {
    newDirection = (state.player.direction + 1) % 4;
    state.socket.emit('move', { x: state.player.x, z: state.player.z, direction: newDirection });
    state.player.direction = newDirection;
    state.lastMoveTime = now;
    return;
  }
  
  if (moved) {
    state.socket.emit('move', { x: newX, z: newZ, direction: newDirection });
    state.lastMoveTime = now;
  }
}

function placeBlock() {
  if (!state.player) return;
  
  const { x, y, z, direction } = state.player;
  let targetX = x, targetZ = z;
  
  switch(direction) {
    case 0: targetZ++; break;
    case 1: targetX--; break;
    case 2: targetZ--; break;
    case 3: targetX++; break;
  }
  
  targetX = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetX));
  targetZ = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetZ));
  
  let targetY = 1;
  for (let checkY = 10; checkY >= 1; checkY--) {
    const key = `${targetX},${checkY},${targetZ}`;
    if (state.blocks.has(key)) {
      targetY = checkY + 1;
      break;
    }
  }
  
  if (targetY <= 10) {
    state.socket.emit('placeBlock', {
      x: targetX,
      y: targetY,
      z: targetZ,
      color: CONFIG.COLORS[state.selectedColor]
    });
  }
}

function removeBlock() {
  if (!state.player) return;
  
  const { x, z, direction } = state.player;
  let targetX = x, targetZ = z;
  
  switch(direction) {
    case 0: targetZ++; break;
    case 1: targetX--; break;
    case 2: targetZ--; break;
    case 3: targetX++; break;
  }
  
  targetX = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetX));
  targetZ = Math.max(0, Math.min(CONFIG.WORLD_SIZE - 1, targetZ));
  
  for (let y = 10; y >= 1; y--) {
    const key = `${targetX},${y},${targetZ}`;
    if (state.blocks.has(key)) {
      state.socket.emit('removeBlock', { x: targetX, y, z: targetZ });
      break;
    }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  
  state.keys[e.code] = true;
  
  if (e.code >= 'Digit1' && e.code <= 'Digit8') {
    state.selectedColor = parseInt(e.code.replace('Digit', '')) - 1;
  }
  
  if (e.code === 'Space') {
    e.preventDefault();
    placeBlock();
  }
  
  if (e.code === 'KeyX') {
    removeBlock();
  }
});

document.addEventListener('keyup', (e) => {
  state.keys[e.code] = false;
});

// Chat functionality
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
  if (text) {
    state.socket.emit('chat', text);
    chatInput.value = '';
  }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

nameBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (name) {
    state.socket.emit('setName', name);
    nameInput.value = '';
  }
});

nameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const name = nameInput.value.trim();
    if (name) {
      state.socket.emit('setName', name);
      nameInput.value = '';
    }
  }
});

function updateUI() {
  document.getElementById('player-count').textContent = `Players: ${state.players.size}`;
  if (state.player) {
    document.getElementById('position-info').textContent = `Position: (${state.player.x}, ${state.player.z}) Height: ${state.player.y}`;
  }
}

function gameLoop() {
  handleMovement();
  updateCamera();
  render();
  updateUI();
  requestAnimationFrame(gameLoop);
}

function connect() {
  state.socket = io();
  
  state.socket.on('init', (data) => {
    state.player = data.player;
    state.badges = data.badges || [];
    nameInput.placeholder = data.player.name;
    
    data.players.forEach(p => {
      state.players.set(p.id, p);
    });
    
    data.blocks.forEach(b => {
      const key = `${b.x},${b.y},${b.z}`;
      state.blocks.set(key, b);
    });
    
    if (data.npcs) {
      data.npcs.forEach(npc => {
        state.npcs.set(npc.id, npc);
      });
    }
    
    data.chatHistory.forEach(msg => addChatMessage(msg));
    
    console.log('Connected as', data.player.name);
  });
  
  state.socket.on('playerJoined', (player) => {
    state.players.set(player.id, player);
  });
  
  state.socket.on('playerLeft', (playerId) => {
    state.players.delete(playerId);
  });
  
  state.socket.on('playerMoved', (player) => {
    state.players.set(player.id, player);
    if (player.id === state.socket.id) {
      state.player = player;
    }
  });
  
  state.socket.on('playerUpdated', (player) => {
    state.players.set(player.id, player);
    if (player.id === state.socket.id) {
      state.player = player;
      nameInput.placeholder = player.name;
    }
  });
  
  state.socket.on('blockPlaced', (block) => {
    const key = `${block.x},${block.y},${block.z}`;
    state.blocks.set(key, block);
  });
  
  state.socket.on('blockRemoved', (data) => {
    const key = `${data.x},${data.y},${data.z}`;
    state.blocks.delete(key);
  });
  
  state.socket.on('chatMessage', (message) => {
    addChatMessage(message);
  });
  
  // NPC events
  state.socket.on('npcMoved', (npc) => {
    state.npcs.set(npc.id, npc);
  });
  
  state.socket.on('npcStomped', (data) => {
    const npc = state.npcs.get(data.npcId);
    if (npc) {
      npc.isAlive = false;
      
      // Add stomp effect
      state.stompEffects.push({
        x: npc.x,
        y: npc.y,
        z: npc.z,
        startTime: Date.now(),
        duration: 1000
      });
    }
  });
  
  state.socket.on('npcRespawned', (npc) => {
    state.npcs.set(npc.id, npc);
  });
  
  state.socket.on('badgeEarned', (badge) => {
    if (state.player) {
      if (!state.player.badges) state.player.badges = [];
      state.player.badges.push(badge.id);
    }
    
    // Show notification
    state.notifications.push({
      badge: badge,
      time: Date.now()
    });
  });
}

resizeCanvas();
connect();
gameLoop();
