# Point World

A persistent multiplayer 2D game where points float around the world and players collect them.

- **Realtime multiplayer** - see other players moving
- **Persistent scores** - your points are saved forever
- **Always running** - simulation continues even with no players
- **One global world** - everyone shares the same space

## Architecture

```
┌─────────────┐     WebSocket     ┌─────────────┐     ┌─────────────┐
│   Vercel    │◀─────────────────▶│   Fly.io    │────▶│   Upstash   │
│  (client)   │                   │  (server)   │     │   (Redis)   │
└─────────────┘                   └─────────────┘     └─────────────┘
```

## How It Works

### World Simulation

The server runs a game loop at 20 ticks/second that:
- Moves all floating points around (with bouncing physics)
- Checks for player-point collisions
- Broadcasts state to all connected clients

### Persistence

- **Player scores**: Saved to Redis immediately when a point is collected
- **World state**: Saved every 30 seconds
- **On restart**: Server loads the last saved state from Redis

### Anonymous Players

Players get a random ID stored in localStorage. Same browser = same player = same score.

## Local Development

### Prerequisites

- Node.js 18+
- Redis (local or Upstash)

### Setup

1. Install dependencies:
   ```bash
   cd server && npm install
   ```

2. Start Redis locally (or set `REDIS_URL` to your Upstash URL):
   ```bash
   # Using Docker
   docker run -p 6379:6379 redis
   ```

3. Start the server:
   ```bash
   cd server && npm start
   ```

4. Serve the client:
   ```bash
   cd client && npx serve .
   ```

5. Open http://localhost:3000 in your browser

## Deployment

### Server (Fly.io)

1. Install the Fly CLI and authenticate:
   ```bash
   fly auth login
   ```

2. Create the app:
   ```bash
   cd server
   fly launch
   ```

3. Set your Redis URL:
   ```bash
   fly secrets set REDIS_URL=redis://your-upstash-url
   ```

4. Deploy:
   ```bash
   fly deploy
   ```

### Client (Vercel)

1. Update `game.js` with your Fly.io WebSocket URL:
   ```javascript
   const WS_URL = 'wss://your-app.fly.dev';
   ```

2. Deploy to Vercel:
   ```bash
   cd client
   vercel
   ```

### Redis (Upstash)

1. Create a free Redis database at [upstash.com](https://upstash.com)
2. Copy the Redis URL and set it as a secret on Fly.io

## Customization

In `server/index.js`:

```javascript
const TICK_RATE = 20;        // Game speed
const WORLD_WIDTH = 800;     // World size
const WORLD_HEIGHT = 600;
const POINT_COUNT = 30;      // How many points float around
const POINT_SPEED = 0.5;     // How fast points move
const PLAYER_SPEED = 5;      // How fast players move
const COLLECTION_RADIUS = 25; // How close to collect a point
```

## Controls

- **W / Arrow Up** - Move up
- **S / Arrow Down** - Move down
- **A / Arrow Left** - Move left
- **D / Arrow Right** - Move right

## License

MIT
