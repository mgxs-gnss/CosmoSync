# Point World

A persistent multiplayer 2D game where points float around the world and players collect them.

- **Realtime multiplayer** - see other players moving
- **Persistent scores** - your points are saved forever
- **Always running** - simulation continues even with no players
- **One global world** - everyone shares the same space

## Architecture

```
┌─────────────┐     WebSocket     ┌─────────────┐     ┌─────────────┐
│   Vercel    │◀─────────────────▶│  Railway    │────▶│   Upstash   │
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

## Deployment

### Server (Railway)

1. Go to [railway.app](https://railway.app) and create a new project
2. Select "Deploy from GitHub repo"
3. Choose this repository
4. Set the root directory to `server`
5. Add environment variable:
   - `REDIS_URL` = your Upstash Redis URL
6. Railway will auto-deploy and give you a URL like `https://your-app.up.railway.app`

### Client (Vercel)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import this GitHub repository
3. Add environment variable:
   - `WEBSOCKET_URL` = `wss://your-railway-app.up.railway.app`
4. Deploy - Vercel will serve the `client/` folder

### Redis (Upstash)

1. Create a free Redis database at [upstash.com](https://upstash.com)
2. Copy the Redis URL and add it to Railway

## Demo Mode

If no server is available, the game automatically runs in **Demo Mode**:
- Single-player experience in browser
- Score saved to localStorage
- Same physics and gameplay

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
