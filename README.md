# Tower Attack - Multiplayer Isometric Game

A fun multiplayer isometric game with a lobby system, multiple game modes, and real-time gameplay — deployable on **Vercel** (or any static host) using **Supabase Realtime**.

## Architecture

The game uses **Supabase Realtime Channels** for all multiplayer communication. There is **no custom server process** required — everything runs in the browser.

- **Lobby** subscribes to a `rooms:directory` channel. Each room's host advertises the room via Presence.
- **Per-room channel** carries Presence (who's connected) and Broadcast events (moves, chat, blocks, NPC ticks, mode state).
- **Host-client authoritative**: the first player in a room becomes the "host" and runs NPC movement, match timers, and state sync. If the host disconnects, another player is automatically elected.

## Features

### Game Modes

1. **Free Build** — Build freely and explore. No NPCs. (Casual)
2. **Classic Stomp** — NPCs enabled. Stomp them from above! Timed match with scoring. (Action)
3. **King of the Hill** — Hold the hill to earn points. Most points wins. (Competitive)
4. **Infection** — One player starts infected. Touch a carrier to spread it. (Infection)

### Gameplay

- **Lobby System**: Select your name, color, and game mode before joining.
- **Multiple Rooms**: Create or join existing game rooms.
- **Real-time Chat**: Communicate with other players.
- **Isometric Graphics**: Beautiful 3D-looking world rendered on HTML5 Canvas.
- **Block Building**: Place and remove colorful blocks.
- **Climbing System**: Climb up blocks to reach higher areas.
- **NPC Characters**: Unique NPCs with different personalities (Classic Stomp mode).
- **Push Mechanic**: Push other players with the P key.
- **Host Failover**: If the room host disconnects, a new host is elected automatically.

## Controls

| Key | Action |
|-----|--------|
| WASD / Arrows | Move and climb |
| Q / E | Rotate camera view |
| Space | Place block |
| X | Remove block |
| 1-8 | Select block color |
| P | Push player in front |

## Getting Started

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Realtime is enabled by default — no tables or database setup needed.
3. Copy your **Project URL** and **anon (public) key** from Settings > API.

### 2. Configure

Edit `public/config.js`:

```js
window.SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...your-anon-key...";
```

### 3. Deploy to Vercel

Deploy the `tower-attack/public/` directory as a static site:

```bash
cd tower-attack
npx vercel --prod
```

Or connect the repo to Vercel and set the root directory to `tower-attack/public`.

### 4. Local Development

You can also open `public/lobby.html` directly or serve with any static file server:

```bash
npx serve public
```

The legacy `server.js` (Socket.IO) is still in the repo but is **not required** for the Supabase-based deployment.

## Project Structure

```
tower-attack/
├── public/
│   ├── config.js           # Supabase URL + anon key
│   ├── supabaseClient.js   # Thin Supabase wrapper (getPlayerId, getSupabase)
│   ├── lobby.html           # Lobby page
│   ├── lobby.css            # Lobby styles
│   ├── lobby.js             # Lobby client (rooms directory via Presence)
│   ├── game.html            # Game page
│   ├── game.js              # Game client (room channel, host election, rendering)
│   ├── styles.css           # Game styles
│   └── index.html           # Redirect to lobby
├── server.js               # Legacy Socket.IO server (not needed for Vercel)
├── package.json
└── README.md
```

## How It Works

1. **Lobby**: Players connect to the `rooms:directory` Supabase channel. Active rooms appear via Presence advertisements from each room's host.

2. **Room Creation**: Generating a room ID + navigating to the game page. The first player becomes host and advertises the room.

3. **Host Election**: Deterministic election via broadcast claims. Smallest timestamp wins, with lexicographic tie-break on player ID. Heartbeat monitored every second; failover triggers after 3.5 seconds of silence.

4. **State Sync**: New joiners request a state snapshot from the host (blocks, NPCs, mode state, chat history). Retries automatically if no response.

5. **Gameplay**: Movement is validated locally and broadcast. The host runs NPC simulation (Classic Stomp) and match timers (Classic Stomp, King of the Hill). Infection spread is host-managed.

## License

Free to use and modify!
