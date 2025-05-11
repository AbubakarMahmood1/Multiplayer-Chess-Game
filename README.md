Multiplayer Chess Game
A real-time multiplayer chess application built using Socket.io, Node.js, Express, and React.
Features

User Authentication: Register and login system with JWT authentication
Game Lobby: Create and join chess games with different time controls
Real-Time Gameplay: Make moves that instantly update for all players
Chat System: In-game chat functionality for players and spectators
Time Control: Chess clock with various time settings
ELO Rating: Player ratings that update based on game outcomes
Spectator Mode: Watch ongoing games
Reconnection: Ability to reconnect to games after disconnection
Draw Offers: Players can offer and accept draws
Responsive Design: Works on various screen sizes

Technology Stack
Backend

Node.js
Express
Socket.io
MongoDB/Mongoose
JWT Authentication
Winston (logging)

Frontend

React
React Router
Socket.io Client
CSS for styling

Setup and Installation
Prerequisites

Node.js (v14+)
MongoDB

Backend Setup

Clone the repository
Navigate to the server directory
Install dependencies:
npm install

Create a .env file with the following variables:
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

Start the server:
npm start


Frontend Setup

Navigate to the client directory
Install dependencies:
npm install

Create a .env file:
REACT_APP_API_URL=http://localhost:5000

Start the client:
npm start


Gameplay

Register or log in to your account
Enter the game lobby
Create a new game or join an existing one
Make chess moves by selecting pieces and valid destinations
Chat with your opponent during the game
Resign or offer a draw if needed
Your rating will update based on the game outcome

Project Structure
Backend

server.js: Main server file with Express and Socket.io setup
models/: Database schemas (Game.js, Users.js)
controllers/: API route handlers (authController.js, gameController.js)
middleware/: Authentication middleware
utils/: Utility functions including chess logic

Frontend

components/: React components including Board, Chat, Game, Lobby, etc.
utils/: Client-side utility functions including socket connection handling
styles/: CSS files for styling components

Features Implementation
Socket Communication
The application uses bidirectional Socket.io communication for real-time updates:

Move validation
Chess clock updates
Chat messages
Game state synchronization
Reconnection handling

Game Logic

Chess rules validation using chess.js library
Turn management
Time control with countdown timers
ELO rating calculations
Game state persistence in MongoDB

Security Features

JWT authentication
Password hashing with bcrypt
Rate limiting for API endpoints and socket events
Input sanitization
Error logging with Winston

Future Improvements

Tournament system
Game analysis tools
Friends list and social features
Opening book recognition
Mobile app version

Troubleshooting

Connection Issues: Verify your MongoDB connection string and ensure the server is running
Move Validation Errors: Check the console for detailed error messages
Authentication Problems: Ensure your JWT_SECRET is properly set in .env

License
MIT
Acknowledgements

Chess.js for chess move validation
Socket.io for real-time communication
Computer Networks course for the project requirements

Authors:
Abubakar Mahmood
Arshad Ali
Fida Kainth