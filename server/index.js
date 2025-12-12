const { WebSocketServer } = require('ws');
const Redis = require('ioredis');

// Configuration
const TICK_RATE = 20;        // Game speed (ticks per second)
const WORLD_WIDTH = 800;     // World size
const WORLD_HEIGHT = 600;
const POINT_COUNT = 30;      // How many points float around
const POINT_SPEED = 0.5;     // How fast points move
const PLAYER_SPEED = 5;      // How fast players move
const COLLECTION_RADIUS = 25; // How close to collect a point
const SAVE_INTERVAL = 30000; // Save world state every 30 seconds

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Game state
let points = [];
let players = new Map(); // playerId -> { x, y, score, ws, color }
let playerScores = new Map(); // playerId -> score (persistent)

// Generate a random color for players
function randomColor() {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Initialize points with random positions and velocities
function initializePoints() {
  points = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    points.push(createPoint(i));
  }
}

function createPoint(id) {
  return {
    id,
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    vx: (Math.random() - 0.5) * POINT_SPEED * 2,
    vy: (Math.random() - 0.5) * POINT_SPEED * 2,
    value: Math.floor(Math.random() * 3) + 1 // 1-3 points
  };
}

// Update point positions with bouncing physics
function updatePoints() {
  for (const point of points) {
    point.x += point.vx;
    point.y += point.vy;

    // Bounce off walls
    if (point.x <= 0 || point.x >= WORLD_WIDTH) {
      point.vx *= -1;
      point.x = Math.max(0, Math.min(WORLD_WIDTH, point.x));
    }
    if (point.y <= 0 || point.y >= WORLD_HEIGHT) {
      point.vy *= -1;
      point.y = Math.max(0, Math.min(WORLD_HEIGHT, point.y));
    }
  }
}

// Check for player-point collisions
function checkCollisions() {
  const collectedPoints = [];

  for (const [playerId, player] of players) {
    for (let i = points.length - 1; i >= 0; i--) {
      const point = points[i];
      const dx = player.x - point.x;
      const dy = player.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < COLLECTION_RADIUS) {
        // Player collected the point
        player.score += point.value;
        playerScores.set(playerId, player.score);

        // Save score to Redis immediately
        savePlayerScore(playerId, player.score);

        collectedPoints.push({ playerId, pointId: point.id, value: point.value });

        // Respawn point at random location
        points[i] = createPoint(point.id);
      }
    }
  }

  return collectedPoints;
}

// Handle player input
function handlePlayerInput(playerId, input) {
  const player = players.get(playerId);
  if (!player) return;

  if (input.up) player.y -= PLAYER_SPEED;
  if (input.down) player.y += PLAYER_SPEED;
  if (input.left) player.x -= PLAYER_SPEED;
  if (input.right) player.x += PLAYER_SPEED;

  // Keep player in bounds
  player.x = Math.max(0, Math.min(WORLD_WIDTH, player.x));
  player.y = Math.max(0, Math.min(WORLD_HEIGHT, player.y));
}

// Save player score to Redis
async function savePlayerScore(playerId, score) {
  try {
    await redis.hset('player_scores', playerId, score);
  } catch (err) {
    console.error('Failed to save player score:', err);
  }
}

// Load player score from Redis
async function loadPlayerScore(playerId) {
  try {
    const score = await redis.hget('player_scores', playerId);
    return score ? parseInt(score, 10) : 0;
  } catch (err) {
    console.error('Failed to load player score:', err);
    return 0;
  }
}

// Save world state to Redis
async function saveWorldState() {
  try {
    await redis.set('world_state', JSON.stringify({
      points,
      timestamp: Date.now()
    }));
    console.log('World state saved');
  } catch (err) {
    console.error('Failed to save world state:', err);
  }
}

// Load world state from Redis
async function loadWorldState() {
  try {
    const state = await redis.get('world_state');
    if (state) {
      const parsed = JSON.parse(state);
      points = parsed.points;
      console.log('World state loaded from Redis');
      return true;
    }
  } catch (err) {
    console.error('Failed to load world state:', err);
  }
  return false;
}

// Get current game state for broadcasting
function getGameState() {
  const playerList = [];
  for (const [id, player] of players) {
    playerList.push({
      id,
      x: player.x,
      y: player.y,
      score: player.score,
      color: player.color
    });
  }

  return {
    type: 'state',
    players: playerList,
    points: points.map(p => ({ id: p.id, x: p.x, y: p.y, value: p.value }))
  };
}

// Broadcast state to all connected players
function broadcast(message) {
  const data = JSON.stringify(message);
  for (const [, player] of players) {
    if (player.ws.readyState === 1) { // WebSocket.OPEN
      player.ws.send(data);
    }
  }
}

// Main game loop
function gameLoop() {
  updatePoints();
  const collectedPoints = checkCollisions();

  // Broadcast current state
  broadcast(getGameState());

  // Notify about collected points
  if (collectedPoints.length > 0) {
    broadcast({
      type: 'collected',
      points: collectedPoints
    });
  }
}

// Start the server
async function startServer() {
  const PORT = process.env.PORT || 8080;

  // Try to load existing world state
  const loaded = await loadWorldState();
  if (!loaded) {
    initializePoints();
    console.log('Initialized new world');
  }

  // Create WebSocket server
  const wss = new WebSocketServer({ port: PORT });
  console.log(`WebSocket server running on port ${PORT}`);

  wss.on('connection', async (ws) => {
    let playerId = null;

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case 'join':
            playerId = message.playerId;
            const score = await loadPlayerScore(playerId);
            playerScores.set(playerId, score);

            players.set(playerId, {
              x: Math.random() * WORLD_WIDTH,
              y: Math.random() * WORLD_HEIGHT,
              score,
              ws,
              color: randomColor()
            });

            // Send welcome message with player info
            ws.send(JSON.stringify({
              type: 'welcome',
              playerId,
              score,
              worldWidth: WORLD_WIDTH,
              worldHeight: WORLD_HEIGHT
            }));

            console.log(`Player ${playerId} joined (score: ${score})`);
            break;

          case 'input':
            if (playerId) {
              handlePlayerInput(playerId, message);
            }
            break;
        }
      } catch (err) {
        console.error('Error processing message:', err);
      }
    });

    ws.on('close', () => {
      if (playerId) {
        players.delete(playerId);
        console.log(`Player ${playerId} disconnected`);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
    });
  });

  // Start game loop
  setInterval(gameLoop, 1000 / TICK_RATE);

  // Save world state periodically
  setInterval(saveWorldState, SAVE_INTERVAL);

  // Save on shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await saveWorldState();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await saveWorldState();
    process.exit(0);
  });
}

startServer().catch(console.error);
