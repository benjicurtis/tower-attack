# Isometric Multiplayer World

A real-time multiplayer isometric 3D room game where players can interact, build, and chat together.

## Features

- **Isometric 3D Environment**: Beautiful isometric view of a shared world
- **Multiplayer**: Real-time synchronization between all connected players
- **Building System**: Place and remove colored blocks to build structures
- **Chat System**: Real-time chat with all players in the room
- **Player Avatars**: Cute avatars with directional facing and name tags

## Controls

| Key | Action |
|-----|--------|
| **W/A/S/D** or **Arrow Keys** | Move around |
| **Q/E** | Rotate direction (for building) |
| **Space** | Place a block in front of you |
| **X** | Remove the topmost block in front of you |
| **1-8** | Select block color |

## Getting Started

### Prerequisites

- Node.js (v14 or higher)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

4. Share the URL with friends to play together!

## How to Play

1. **Move**: Use WASD or arrow keys to walk around the isometric world
2. **Build**: Face the direction you want to build (Q/E to rotate), select a color (1-8), and press Space to place a block
3. **Destroy**: Face a block and press X to remove it
4. **Chat**: Use the chat panel on the right to communicate with other players
5. **Set Name**: Enter your name in the chat header and click "Set Name"

## Technical Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5 Canvas
- **Real-time Communication**: WebSockets via Socket.IO

## Architecture

```
multi/
├── server.js          # WebSocket server and game state management
├── package.json       # Dependencies
└── public/
    ├── index.html     # Main HTML structure
    ├── styles.css     # UI styling
    └── game.js        # Isometric renderer and game logic
```

## License

MIT
