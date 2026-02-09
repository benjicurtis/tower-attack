# 🏰 Tower Attack - Multiplayer Isometric Game

A fun multiplayer isometric game with a lobby system, multiple game modes, and badge collection!

## Features

### 🎮 Game Modes

1. **Free Build** 🏗️
   - Build freely and explore the world
   - Collect badges by stomping NPCs
   - Perfect for casual play
   - Tag: Casual

2. **Tower Defense** 🛡️
   - Build towers to defend against waves of enemies
   - Cooperative gameplay
   - Tag: Action

3. **Race Mode** 🏁
   - Race to the finish line
   - Climb and build to reach the goal faster
   - Tag: Action

4. **Creative** 🎨
   - Unlimited blocks and resources
   - Pure creativity with no limits
   - Tag: Casual

5. **Survival** 💀
   - Survive against increasing waves of NPCs
   - Test your skills and strategy
   - Tag: Competitive

### 🎯 Badge System

Earn badges by stomping NPCs from above:

- **First Blood** 🎯 - Stomp your first NPC
- **Ghost Buster** 👻 - Stomp Blinky the Ghost
- **Slime Slayer** 🟢 - Squish Goopy the Slime
- **Robot Wrecker** 🤖 - Deactivate Beep-Boop
- **Mushroom Masher** 🍄 - Flatten Shroomie
- **Combo King** 👑 - Stomp 3 NPCs in 10 seconds
- **Sky Diver** 🪂 - Stomp from 3+ blocks high
- **Serial Stomper** 👟 - Stomp 10 NPCs total
- **Speed Demon** ⚡ - Stomp within 5 seconds of spawning
- **Perfectionist** 💎 - Collect all NPC-specific badges

### 🎨 Features

- **Lobby System**: Select your name, color, and game mode before joining
- **Multiple Rooms**: Create or join existing game rooms
- **Real-time Chat**: Communicate with other players
- **Isometric Graphics**: Beautiful 3D-looking world in 2D
- **Block Building**: Place and remove colorful blocks
- **Climbing System**: Climb up blocks to reach higher areas
- **NPC Characters**: Unique NPCs with different personalities
- **Badge Notifications**: Animated notifications when earning badges

## Controls

- **WASD** - Move and Climb
- **Q/E** - Rotate camera view
- **Space** - Place block
- **X** - Remove block
- **1-8** - Select block color
- **Stomp NPCs** - Land on them from above for badges!

## Getting Started

### Installation

1. Clone or download this repository
2. Navigate to the `tower-attack` folder
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the Server

Start the server:
```bash
node server.js
```

The server will run on `http://localhost:8080`

### Playing the Game

1. Open your browser and go to `http://localhost:8080`
2. You'll see the lobby with:
   - Name input field
   - Color picker
   - Game mode selection
   - Active rooms list
3. Enter your name and select a color
4. Choose a game mode by clicking on a mode card
5. Either:
   - Click **Create Room** to start a new room
   - Click **Quick Join** to join an existing room of that mode
   - Or click on an active room in the list to join it
6. Start playing!

### Multiplayer

- Each room supports up to 10 players
- Rooms are automatically created when you select "Create Room"
- Empty rooms are automatically deleted when all players leave
- The lobby shows real-time player counts for each game mode

## Technical Details

### Technologies Used

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5 Canvas, CSS3
- **Real-time Communication**: WebSockets (Socket.IO)

### Project Structure

```
tower-attack/
├── server.js           # Main server file with game logic
├── public/
│   ├── lobby.html      # Lobby page
│   ├── lobby.css       # Lobby styles
│   ├── lobby.js        # Lobby client logic
│   ├── game.html       # Game page
│   ├── game.js         # Game client logic
│   ├── styles.css      # Game styles
│   └── index.html      # Redirects to lobby
├── package.json        # Dependencies
└── README.md          # This file
```

### How It Works

1. **Lobby System**: 
   - Players connect to the lobby first
   - They can see all available rooms and game modes
   - Creating or joining a room takes them to the game page

2. **Room Management**:
   - Each room is isolated with its own game state
   - Rooms have separate blocks, NPCs, players, and chat
   - NPCs move independently in each room

3. **Game State**:
   - Server maintains authoritative game state
   - Clients send input, server validates and broadcasts updates
   - Real-time synchronization using Socket.IO

## Future Enhancements

- Game mode-specific mechanics (currently all modes use free build mechanics)
- Tower defense wave system
- Battle royale shrinking zone
- Racing checkpoints and timers
- Survival scoring system
- Player statistics and leaderboards
- Persistent player accounts
- More NPCs and badges
- Power-ups and special abilities

## License

Free to use and modify!

## Credits

Created with ❤️ for fun multiplayer gaming!
