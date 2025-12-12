import { PartyServer, type Connection, type ConnectionContext } from "partyserver";

// Configuration
const TICK_RATE = 60;        // 60fps game loop
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
const POINT_COUNT = 30;
const POINT_SPEED = 0.5;
const PLAYER_SPEED = 5;
const COLLECTION_RADIUS = 25;
const SAVE_INTERVAL = 30000; // Save every 30 seconds
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

interface GameState {
  points: Point[];
  lastSave: number;
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

export default class PointWorld extends PartyServer {
  points: Point[] = [];
  players: Map<string, Player> = new Map();
  lastTick: number = 0;

  async onStart(): Promise<void> {
    // Load saved state
    const savedState = await this.ctx.storage.get<GameState>("gameState");
    if (savedState) {
      this.points = savedState.points;
      console.log("Loaded saved game state");
    } else {
      // Initialize points
      this.points = [];
      for (let i = 0; i < POINT_COUNT; i++) {
        this.points.push(createPoint(i));
      }
      console.log("Initialized new game state");
    }

    // Start the game loop using alarm
    await this.scheduleNextTick();
  }

  async scheduleNextTick(): Promise<void> {
    // Schedule next tick - Durable Objects alarm for persistent simulation
    await this.ctx.storage.setAlarm(Date.now() + TICK_INTERVAL);
  }

  async onAlarm(): Promise<void> {
    this.gameTick();
    await this.scheduleNextTick();

    // Periodic save
    const now = Date.now();
    if (now - this.lastTick > SAVE_INTERVAL) {
      await this.saveState();
      this.lastTick = now;
    }
  }

  async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
    // Player joins when they send a join message
    console.log(`Connection opened: ${connection.id}`);
  }

  async onMessage(connection: Connection, message: string): Promise<void> {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "join": {
          const playerId = data.playerId || connection.id;

          // Load player score from storage
          const savedScore = await this.ctx.storage.get<number>(`player:${playerId}`) || 0;

          const player: Player = {
            id: playerId,
            x: Math.random() * WORLD_WIDTH,
            y: Math.random() * WORLD_HEIGHT,
            score: savedScore,
            color: randomColor(),
            input: { up: false, down: false, left: false, right: false }
          };

          this.players.set(connection.id, player);

          // Send welcome message
          connection.send(JSON.stringify({
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
          const player = this.players.get(connection.id);
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
    } catch (err) {
      console.error("Error processing message:", err);
    }
  }

  onClose(connection: Connection): void {
    const player = this.players.get(connection.id);
    if (player) {
      console.log(`Player ${player.id} disconnected`);
      this.players.delete(connection.id);
    }
  }

  gameTick(): void {
    // Update player positions based on input
    for (const player of this.players.values()) {
      if (player.input.up) player.y -= PLAYER_SPEED;
      if (player.input.down) player.y += PLAYER_SPEED;
      if (player.input.left) player.x -= PLAYER_SPEED;
      if (player.input.right) player.x += PLAYER_SPEED;

      // Keep player in bounds
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

          // Save player score
          this.ctx.storage.put(`player:${player.id}`, player.score);

          // Respawn point
          this.points[i] = createPoint(point.id);
        }
      }
    }

    // Broadcast state to all connected clients
    const state = {
      type: "state",
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        score: p.score,
        color: p.color
      })),
      points: this.points.map(p => ({ id: p.id, x: p.x, y: p.y, value: p.value }))
    };

    this.broadcast(JSON.stringify(state));

    // Notify about collected points
    if (collected.length > 0) {
      this.broadcast(JSON.stringify({
        type: "collected",
        points: collected
      }));
    }
  }

  async saveState(): Promise<void> {
    const state: GameState = {
      points: this.points,
      lastSave: Date.now()
    };
    await this.ctx.storage.put("gameState", state);
    console.log("Game state saved");
  }
}
