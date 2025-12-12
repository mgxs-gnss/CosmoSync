// Point World Client - PartySocket Edition
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const connectionStatus = document.getElementById('connection-status');
const playerList = document.getElementById('player-list');

// Configuration
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const POINT_COUNT = 30;
const POINT_SPEED = 0.5;
const PLAYER_SPEED = 5;
const COLLECTION_RADIUS = 25;
const TICK_RATE = 60;

// Server configuration - UPDATE THIS after deploying to Cloudflare
const PARTYSERVER_HOST = window.PARTYSERVER_HOST || 'point-world.your-account.workers.dev';
const ROOM_NAME = 'main'; // Single global world

// Get or create player ID
let playerId = localStorage.getItem('pointworld_player_id');
if (!playerId) {
  playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('pointworld_player_id', playerId);
}

// Game state
let players = [];
let points = [];
let worldWidth = WORLD_WIDTH;
let worldHeight = WORLD_HEIGHT;
let myScore = parseInt(localStorage.getItem('pointworld_score') || '0', 10);

// Demo mode state
let demoMode = false;
let myPlayer = null;

// Input state
const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Generate a random color for players
function randomColor() {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Create a point
function createPoint(id) {
  return {
    id,
    x: Math.random() * worldWidth,
    y: Math.random() * worldHeight,
    vx: (Math.random() - 0.5) * POINT_SPEED * 2,
    vy: (Math.random() - 0.5) * POINT_SPEED * 2,
    value: Math.floor(Math.random() * 3) + 1
  };
}

// Initialize demo mode
function startDemoMode() {
  demoMode = true;
  connectionStatus.textContent = 'Demo Mode';
  connectionStatus.className = 'demo';
  console.log('Starting demo mode (single player)');

  // Initialize player
  myPlayer = {
    id: playerId,
    x: worldWidth / 2,
    y: worldHeight / 2,
    score: myScore,
    color: localStorage.getItem('pointworld_color') || randomColor()
  };
  localStorage.setItem('pointworld_color', myPlayer.color);
  players = [myPlayer];

  // Initialize points
  points = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    points.push(createPoint(i));
  }

  // Update score display
  scoreDisplay.textContent = myScore;
  updateLeaderboard();

  // Start game loop at 60fps for demo mode
  setInterval(demoGameLoop, 1000 / TICK_RATE);
}

// Demo mode game loop
function demoGameLoop() {
  if (!demoMode) return;

  // Update player position based on input
  if (keys.up) myPlayer.y -= PLAYER_SPEED;
  if (keys.down) myPlayer.y += PLAYER_SPEED;
  if (keys.left) myPlayer.x -= PLAYER_SPEED;
  if (keys.right) myPlayer.x += PLAYER_SPEED;

  // Keep player in bounds
  myPlayer.x = Math.max(15, Math.min(worldWidth - 15, myPlayer.x));
  myPlayer.y = Math.max(15, Math.min(worldHeight - 15, myPlayer.y));

  // Update points (bouncing physics)
  for (const point of points) {
    point.x += point.vx;
    point.y += point.vy;

    if (point.x <= 0 || point.x >= worldWidth) {
      point.vx *= -1;
      point.x = Math.max(0, Math.min(worldWidth, point.x));
    }
    if (point.y <= 0 || point.y >= worldHeight) {
      point.vy *= -1;
      point.y = Math.max(0, Math.min(worldHeight, point.y));
    }
  }

  // Check collisions
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    const dx = myPlayer.x - point.x;
    const dy = myPlayer.y - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < COLLECTION_RADIUS) {
      myScore += point.value;
      myPlayer.score = myScore;
      scoreDisplay.textContent = myScore;
      localStorage.setItem('pointworld_score', myScore);

      showCollectionEffect({ value: point.value });

      // Respawn point
      points[i] = createPoint(point.id);
    }
  }

  updateLeaderboard();
}

// Connect using PartySocket pattern for Cloudflare Workers
function connect() {
  // PartyServer WebSocket URL pattern
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${PARTYSERVER_HOST}/parties/pointworld/${ROOM_NAME}`;

  console.log('Connecting to:', wsUrl);

  try {
    socket = new WebSocket(wsUrl);
  } catch (e) {
    console.log('WebSocket not available, starting demo mode');
    startDemoMode();
    return;
  }

  const connectionTimeout = setTimeout(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      socket.close();
      startDemoMode();
    }
  }, 5000);

  socket.onopen = () => {
    clearTimeout(connectionTimeout);
    console.log('Connected to PartyServer');
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'connected';
    reconnectAttempts = 0;
    demoMode = false;

    socket.send(JSON.stringify({
      type: 'join',
      playerId
    }));
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'welcome':
        myScore = message.score;
        scoreDisplay.textContent = myScore;
        worldWidth = message.worldWidth;
        worldHeight = message.worldHeight;
        canvas.width = worldWidth;
        canvas.height = worldHeight;
        break;

      case 'state':
        players = message.players;
        points = message.points;
        updateLeaderboard();
        break;

      case 'collected':
        for (const collected of message.points) {
          if (collected.playerId === playerId) {
            myScore += collected.value;
            scoreDisplay.textContent = myScore;
            showCollectionEffect(collected);
          }
        }
        break;
    }
  };

  socket.onclose = () => {
    clearTimeout(connectionTimeout);
    console.log('Disconnected from server');
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'disconnected';

    if (!demoMode && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 5000);
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      setTimeout(connect, delay);
    } else if (!demoMode) {
      startDemoMode();
    }
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function sendInput() {
  if (!demoMode && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'input',
      ...keys
    }));
  }
}

// Input handling
document.addEventListener('keydown', (e) => {
  let changed = false;

  switch (e.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      if (!keys.up) { keys.up = true; changed = true; }
      break;
    case 's':
    case 'arrowdown':
      if (!keys.down) { keys.down = true; changed = true; }
      break;
    case 'a':
    case 'arrowleft':
      if (!keys.left) { keys.left = true; changed = true; }
      break;
    case 'd':
    case 'arrowright':
      if (!keys.right) { keys.right = true; changed = true; }
      break;
  }

  if (changed) {
    e.preventDefault();
    sendInput();
  }
});

document.addEventListener('keyup', (e) => {
  let changed = false;

  switch (e.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      if (keys.up) { keys.up = false; changed = true; }
      break;
    case 's':
    case 'arrowdown':
      if (keys.down) { keys.down = false; changed = true; }
      break;
    case 'a':
    case 'arrowleft':
      if (keys.left) { keys.left = false; changed = true; }
      break;
    case 'd':
    case 'arrowright':
      if (keys.right) { keys.right = false; changed = true; }
      break;
  }

  if (changed) {
    sendInput();
  }
});

// Collection effects
const collectionEffects = [];

function showCollectionEffect(collected) {
  const player = demoMode ? myPlayer : players.find(p => p.id === playerId);
  if (player) {
    collectionEffects.push({
      x: player.x,
      y: player.y,
      value: collected.value,
      alpha: 1,
      offsetY: 0
    });
  }
}

// Update leaderboard
function updateLeaderboard() {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  playerList.innerHTML = sorted.map(player => {
    const isYou = player.id === playerId;
    return `
      <li>
        <span class="player-color" style="background: ${player.color}"></span>
        <span class="${isYou ? 'player-you' : ''}">${isYou ? 'You' : player.id.slice(0, 8)}</span>
        <span class="player-score">${player.score}</span>
      </li>
    `;
  }).join('');
}

// Render loop (always 60fps)
function render() {
  // Clear canvas with slight trail effect
  ctx.fillStyle = 'rgba(10, 10, 26, 0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  ctx.strokeStyle = 'rgba(78, 205, 196, 0.1)';
  ctx.lineWidth = 1;
  const gridSize = 50;
  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw points
  for (const point of points) {
    const radius = 8 + point.value * 2;
    const colors = ['#FFEAA7', '#F7DC6F', '#FFD700'];

    // Glow effect
    const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 2);
    gradient.addColorStop(0, colors[point.value - 1]);
    gradient.addColorStop(0.5, colors[point.value - 1] + '80');
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = colors[point.value - 1];
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Value indicator
    ctx.fillStyle = '#000';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(point.value, point.x, point.y);
  }

  // Draw players
  for (const player of players) {
    const isMe = player.id === playerId;
    const radius = 15;

    // Glow for current player
    if (isMe) {
      const gradient = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, radius * 2);
      gradient.addColorStop(0, player.color + '80');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(player.x, player.y, radius * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player body
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = isMe ? 3 : 2;
    ctx.stroke();

    // Name tag
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(player.x - 25, player.y - 35, 50, 16);
    ctx.fillStyle = '#fff';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(isMe ? 'You' : player.id.slice(0, 6), player.x, player.y - 24);
  }

  // Draw collection effects
  for (let i = collectionEffects.length - 1; i >= 0; i--) {
    const effect = collectionEffects[i];

    ctx.fillStyle = `rgba(255, 234, 167, ${effect.alpha})`;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`+${effect.value}`, effect.x, effect.y - 30 - effect.offsetY);

    effect.alpha -= 0.02;
    effect.offsetY += 1;

    if (effect.alpha <= 0) {
      collectionEffects.splice(i, 1);
    }
  }

  requestAnimationFrame(render);
}

// Start the game
connect();
render();

// Send input continuously while keys are held
setInterval(() => {
  if (!demoMode && (keys.up || keys.down || keys.left || keys.right)) {
    sendInput();
  }
}, 16); // ~60fps input rate
