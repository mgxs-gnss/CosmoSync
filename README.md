# Point World

A persistent multiplayer 2D game where points float around the world and players collect them.

- **Realtime multiplayer** - see other players moving
- **Persistent scores** - your points are saved forever
- **Always running** - simulation continues even with no players (using Durable Objects alarms)
- **One global world** - everyone shares the same space
- **60fps** - smooth gameplay on both server and client

## Architecture

```
┌─────────────┐     WebSocket     ┌─────────────────────┐
│   Vercel    │◀─────────────────▶│  Cloudflare Workers │
│  (client)   │                   │  (PartyServer)      │
└─────────────┘                   │  + Durable Objects  │
                                  └─────────────────────┘
```

**No external database needed!** Durable Objects have built-in persistent storage.

## How It Works

### World Simulation

The server runs a game loop at 60 ticks/second using Durable Objects alarms:
- Moves all floating points around (with bouncing physics)
- Checks for player-point collisions
- Broadcasts state to all connected clients
- **Continues running even with no players connected**

### Persistence

- **Player scores**: Saved to Durable Objects storage immediately
- **World state**: Auto-saved every 30 seconds
- **On restart**: Server loads the last saved state automatically

### Anonymous Players

Players get a random ID stored in localStorage. Same browser = same player = same score.

## Deployment

### Server (Cloudflare Workers)

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. Deploy the server:
   ```bash
   cd server
   npm install
   npm run deploy
   ```

3. Note your Worker URL: `https://point-world.<your-account>.workers.dev`

### Client (Vercel)

1. Update `client/game.js` line 18 with your Worker URL:
   ```javascript
   const PARTYSERVER_HOST = 'point-world.your-account.workers.dev';
   ```

2. Go to [vercel.com/new](https://vercel.com/new)
3. Import this GitHub repository
4. Deploy

## Demo Mode

If no server is available, the game automatically runs in **Demo Mode**:
- Single-player experience in browser
- Score saved to localStorage
- Same 60fps physics and gameplay

## Customization

In `server/src/index.ts`:

```typescript
const TICK_RATE = 60;        // Game speed (60fps!)
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

## Tech Stack

- **PartyServer** - WebSocket server framework (Cloudflare's evolution of PartyKit)
- **Durable Objects** - Persistent state + alarms for continuous simulation
- **Vercel** - Static client hosting

## License

MIT
