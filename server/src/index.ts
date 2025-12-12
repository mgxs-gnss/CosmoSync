// Point World - Cloudflare Workers + Durable Objects

// Configuration
const TICK_RATE = 60;
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const POINT_COUNT = 30;
const POINT_SPEED = 0.5;
const PLAYER_SPEED = 5;
const COLLECTION_RADIUS = 25;
const SAVE_INTERVAL = 30000;
const TICK_INTERVAL = 1000 / TICK_RATE;

interface Point {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
}

interface Player {
  id: string;
  x: number;
  y: number;
  score: number;
  color: string;
  input: { up: boolean; down: boolean; left: boolean; right: boolean };
}

interface Env {
  POINT_WORLD: DurableObjectNamespace;
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function createPoint(id: number): Point {
  return {
    id,
    x: Math.random() * WORLD_WIDTH,
    y: Math.random() * WORLD_HEIGHT,
    vx: (Math.random() - 0.5) * POINT_SPEED * 2,
    vy: (Math.random() - 0.5) * POINT_SPEED * 2,
    value: Math.floor(Math.random() * 3) + 1
  };
}

// Durable Object class
export class PointWorld {
  state: DurableObjectState;
  points: Point[] = [];
  players: Map<string, Player> = new Map();
  connections: Map<string, WebSocket> = new Map();
  lastSave: number = 0;
  initialized: boolean = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;

    // Load saved state
    const savedPoints = await this.state.storage.get<Point[]>("points");
    if (savedPoints) {
      this.points = savedPoints;
      console.log("Loaded saved game state");
    } else {
      this.points = [];
      for (let i = 0; i < POINT_COUNT; i++) {
        this.points.push(createPoint(i));
      }
      console.log("Initialized new game state");
    }

    // Start game loop
    await this.state.storage.setAlarm(Date.now() + TICK_INTERVAL);
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize();

    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      const connectionId = crypto.randomUUID();

      server.accept();
      this.connections.set(connectionId, server);

      server.addEventListener("message", async (event) => {
        try {
          const data = JSON.parse(event.data as string);
          await this.handleMessage(connectionId, server, data);
        } catch (err) {
          console.error("Error handling message:", err);
        }
      });

      server.addEventListener("close", () => {
        const player = this.players.get(connectionId);
        if (player) {
          console.log(`Player ${player.id} disconnected`);
        }
        this.players.delete(connectionId);
        this.connections.delete(connectionId);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // Health check
    return new Response("Point World Server Running", { status: 200 });
  }

  async handleMessage(connectionId: string, ws: WebSocket, data: any) {
    switch (data.type) {
      case "join": {
        const playerId = data.playerId || connectionId;
        const savedScore = await this.state.storage.get<number>(`player:${playerId}`) || 0;

        const player: Player = {
          id: playerId,
          x: Math.random() * WORLD_WIDTH,
          y: Math.random() * WORLD_HEIGHT,
          score: savedScore,
          color: randomColor(),
          input: { up: false, down: false, left: false, right: false }
        };

        this.players.set(connectionId, player);

        ws.send(JSON.stringify({
          type: "welcome",
          playerId,
          score: savedScore,
          worldWidth: WORLD_WIDTH,
          worldHeight: WORLD_HEIGHT
        }));

        console.log(`Player ${playerId} joined (score: ${savedScore})`);
        break;
      }

      case "input": {
        const player = this.players.get(connectionId);
        if (player) {
          player.input = {
            up: !!data.up,
            down: !!data.down,
            left: !!data.left,
            right: !!data.right
          };
        }
        break;
      }
    }
  }

  async alarm() {
    this.gameTick();

    // Schedule next tick
    await this.state.storage.setAlarm(Date.now() + TICK_INTERVAL);

    // Periodic save
    const now = Date.now();
    if (now - this.lastSave > SAVE_INTERVAL) {
      await this.saveState();
      this.lastSave = now;
    }
  }

  gameTick() {
    // Update player positions
    for (const player of this.players.values()) {
      if (player.input.up) player.y -= PLAYER_SPEED;
      if (player.input.down) player.y += PLAYER_SPEED;
      if (player.input.left) player.x -= PLAYER_SPEED;
      if (player.input.right) player.x += PLAYER_SPEED;

      player.x = Math.max(15, Math.min(WORLD_WIDTH - 15, player.x));
      player.y = Math.max(15, Math.min(WORLD_HEIGHT - 15, player.y));
    }

    // Update points (bouncing physics)
    for (const point of this.points) {
      point.x += point.vx;
      point.y += point.vy;

      if (point.x <= 0 || point.x >= WORLD_WIDTH) {
        point.vx *= -1;
        point.x = Math.max(0, Math.min(WORLD_WIDTH, point.x));
      }
      if (point.y <= 0 || point.y >= WORLD_HEIGHT) {
        point.vy *= -1;
        point.y = Math.max(0, Math.min(WORLD_HEIGHT, point.y));
      }
    }

    // Check collisions
    const collected: { playerId: string; pointId: number; value: number }[] = [];

    for (const player of this.players.values()) {
      for (let i = this.points.length - 1; i >= 0; i--) {
        const point = this.points[i];
        const dx = player.x - point.x;
        const dy = player.y - point.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < COLLECTION_RADIUS) {
          player.score += point.value;
          collected.push({ playerId: player.id, pointId: point.id, value: point.value });
          this.state.storage.put(`player:${player.id}`, player.score);
          this.points[i] = createPoint(point.id);
        }
      }
    }

    // Broadcast state
    const state = JSON.stringify({
      type: "state",
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        score: p.score,
        color: p.color
      })),
      points: this.points.map(p => ({ id: p.id, x: p.x, y: p.y, value: p.value }))
    });

    this.broadcast(state);

    if (collected.length > 0) {
      this.broadcast(JSON.stringify({ type: "collected", points: collected }));
    }
  }

  broadcast(message: string) {
    for (const ws of this.connections.values()) {
      try {
        ws.send(message);
      } catch (err) {
        // Connection might be closed
      }
    }
  }

  async saveState() {
    await this.state.storage.put("points", this.points);
    console.log("Game state saved");
  }
}

// Worker entry point
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Route to the single global game world
    const id = env.POINT_WORLD.idFromName("main");
    const stub = env.POINT_WORLD.get(id);

    const response = await stub.fetch(request);

    // Add CORS headers to response
    const newResponse = new Response(response.body, response);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  }
};
