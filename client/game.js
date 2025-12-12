// Point World Client
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const connectionStatus = document.getElementById('connection-status');
const playerList = document.getElementById('player-list');

// Get or create player ID
let playerId = localStorage.getItem('pointworld_player_id');
if (!playerId) {
  playerId = 'player_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('pointworld_player_id', playerId);
}

// Game state
let players = [];
let points = [];
let worldWidth = 800;
let worldHeight = 600;
let myScore = 0;

// Input state
const keys = {
  up: false,
  down: false,
  left: false,
  right: false
};

// WebSocket connection
const WS_URL = window.location.hostname === 'localhost'
  ? 'ws://localhost:8080'
  : (window.WEBSOCKET_URL || 'wss://point-world-server.fly.dev');

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('Connected to server');
    connectionStatus.textContent = 'Connected';
    connectionStatus.className = 'connected';
    reconnectAttempts = 0;

    // Join the game
    ws.send(JSON.stringify({
      type: 'join',
      playerId
    }));
  };

  ws.onmessage = (event) => {
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
        // Update score if we collected a point
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

  ws.onclose = () => {
    console.log('Disconnected from server');
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'disconnected';

    // Attempt to reconnect
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      setTimeout(connect, delay);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Send input to server
function sendInput() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
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
  // Find the point position (approximate)
  const player = players.find(p => p.id === playerId);
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

// Render loop
function render() {
  // Clear canvas
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
  if (keys.up || keys.down || keys.left || keys.right) {
    sendInput();
  }
}, 50);
