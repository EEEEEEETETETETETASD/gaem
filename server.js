#!/usr/bin/env node
/**
 * GAEM - Ultra Robust Multiplayer Puzzle Platformer Server
 * Each player connects from their own device!
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
const rooms = new Map();
const PLAYER_COLORS = ['#ff0000', '#0066ff', '#00aa00', '#ff6600'];
const MAX_PLAYERS = 4;

// Level definitions - 10 progressively harder cooperative levels
const LEVELS = [
    {
        id: 1,
        name: "First Steps Together",
        description: "Simple cooperation - one switch, one door",
        width: 25,
        height: 15,
        platforms: [
            // Ground
            ...Array.from({length: 25}, (_, i) => ({x: i, y: 13, type: 'ground'})),
            ...Array.from({length: 25}, (_, i) => ({x: i, y: 14, type: 'ground'})),
            // Walls
            ...Array.from({length: 15}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 15}, (_, i) => ({x: 24, y: i, type: 'ground'})),
            // Simple platform
            {x: 10, y: 10}, {x: 11, y: 10}, {x: 12, y: 10}
        ],
        switches: [{x: 5, y: 12, id: 0}],
        doors: [{x: 15, y: 12, switchId: 0}, {x: 15, y: 11, switchId: 0}],
        exit: {x: 22, y: 12},
        spawns: [{x: 2, y: 11}, {x: 3, y: 11}, {x: 4, y: 11}, {x: 5, y: 11}]
    },
    
    {
        id: 2,
        name: "Divided Paths", 
        description: "Two switches control one door - teamwork required",
        width: 30,
        height: 15,
        platforms: [
            // Ground and walls
            ...Array.from({length: 30}, (_, i) => ({x: i, y: 13, type: 'ground'})),
            ...Array.from({length: 30}, (_, i) => ({x: i, y: 14, type: 'ground'})),
            ...Array.from({length: 15}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 15}, (_, i) => ({x: 29, y: i, type: 'ground'})),
            // Central barrier
            ...Array.from({length: 8}, (_, i) => ({x: 14, y: 5 + i, type: 'ground'})),
            // Left platform
            {x: 5, y: 9}, {x: 6, y: 9}, {x: 7, y: 9},
            // Right platform  
            {x: 22, y: 9}, {x: 23, y: 9}, {x: 24, y: 9}
        ],
        switches: [
            {x: 6, y: 8, id: 0}, 
            {x: 23, y: 8, id: 1}
        ],
        doors: [
            {x: 14, y: 12, switchId: 'both'}, 
            {x: 14, y: 11, switchId: 'both'}
        ],
        exit: {x: 27, y: 12},
        spawns: [{x: 2, y: 11}, {x: 3, y: 11}, {x: 16, y: 11}, {x: 17, y: 11}]
    },
    
    {
        id: 3,
        name: "Elevator Puzzle",
        description: "One player operates elevator for others",
        width: 25,
        height: 18,
        platforms: [
            // Ground and walls
            ...Array.from({length: 25}, (_, i) => ({x: i, y: 16, type: 'ground'})),
            ...Array.from({length: 25}, (_, i) => ({x: i, y: 17, type: 'ground'})),
            ...Array.from({length: 18}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 18}, (_, i) => ({x: 24, y: i, type: 'ground'})),
            // Elevator shaft walls
            ...Array.from({length: 12}, (_, i) => ({x: 10, y: 4 + i, type: 'ground'})),
            ...Array.from({length: 12}, (_, i) => ({x: 14, y: 4 + i, type: 'ground'})),
            // Upper platform
            {x: 16, y: 5}, {x: 17, y: 5}, {x: 18, y: 5}, {x: 19, y: 5},
            // Control platform
            {x: 6, y: 10}, {x: 7, y: 10}, {x: 8, y: 10}
        ],
        switches: [{x: 7, y: 9, id: 0}],
        elevators: [{x: 12, y: 15, targetY: 6, switchId: 0}],
        doors: [{x: 20, y: 4, switchId: 'elevator'}],
        exit: {x: 22, y: 4},
        spawns: [{x: 2, y: 14}, {x: 3, y: 14}, {x: 4, y: 14}, {x: 5, y: 14}]
    },
    
    {
        id: 4,
        name: "Synchronized Switches",
        description: "All switches must be pressed simultaneously",
        width: 35,
        height: 15,
        platforms: [
            // Ground and walls
            ...Array.from({length: 35}, (_, i) => ({x: i, y: 13, type: 'ground'})),
            ...Array.from({length: 35}, (_, i) => ({x: i, y: 14, type: 'ground'})),
            ...Array.from({length: 15}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 15}, (_, i) => ({x: 34, y: i, type: 'ground'})),
            // Platforms for switches
            {x: 8, y: 8}, {x: 9, y: 8}, {x: 10, y: 8},
            {x: 15, y: 6}, {x: 16, y: 6}, {x: 17, y: 6},
            {x: 22, y: 4}, {x: 23, y: 4}, {x: 24, y: 4},
            {x: 29, y: 10}, {x: 30, y: 10}, {x: 31, y: 10}
        ],
        switches: [
            {x: 9, y: 7, id: 0},
            {x: 16, y: 5, id: 1}, 
            {x: 23, y: 3, id: 2},
            {x: 30, y: 9, id: 3}
        ],
        doors: [
            {x: 17, y: 12, switchId: 'all'},
            {x: 17, y: 11, switchId: 'all'},
            {x: 17, y: 10, switchId: 'all'}
        ],
        exit: {x: 32, y: 12},
        spawns: [{x: 2, y: 11}, {x: 3, y: 11}, {x: 4, y: 11}, {x: 5, y: 11}]
    },
    
    {
        id: 5,
        name: "Chain Reaction",
        description: "Switches must be activated in sequence",
        width: 40,
        height: 16,
        platforms: [
            // Ground and walls
            ...Array.from({length: 40}, (_, i) => ({x: i, y: 14, type: 'ground'})),
            ...Array.from({length: 40}, (_, i) => ({x: i, y: 15, type: 'ground'})),
            ...Array.from({length: 16}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 16}, (_, i) => ({x: 39, y: i, type: 'ground'})),
            // Zigzag platforms
            {x: 6, y: 11}, {x: 7, y: 11}, {x: 8, y: 11},
            {x: 15, y: 8}, {x: 16, y: 8}, {x: 17, y: 8},
            {x: 24, y: 5}, {x: 25, y: 5}, {x: 26, y: 5},
            {x: 33, y: 9}, {x: 34, y: 9}, {x: 35, y: 9}
        ],
        switches: [
            {x: 7, y: 10, id: 0, sequence: 1},
            {x: 16, y: 7, id: 1, sequence: 2},
            {x: 25, y: 4, id: 2, sequence: 3},
            {x: 34, y: 8, id: 3, sequence: 4}
        ],
        doors: [
            {x: 12, y: 13, switchId: 0},
            {x: 21, y: 13, switchId: 1}, 
            {x: 30, y: 13, switchId: 2},
            {x: 37, y: 13, switchId: 3}, {x: 37, y: 12, switchId: 3}
        ],
        exit: {x: 37, y: 11},
        spawns: [{x: 2, y: 12}, {x: 3, y: 12}, {x: 4, y: 12}, {x: 5, y: 12}]
    },
    
    {
        id: 6,
        name: "The Great Divide",
        description: "Players separated - must coordinate remotely",
        width: 50,
        height: 20,
        platforms: [
            // Ground and walls
            ...Array.from({length: 50}, (_, i) => ({x: i, y: 18, type: 'ground'})),
            ...Array.from({length: 50}, (_, i) => ({x: i, y: 19, type: 'ground'})),
            ...Array.from({length: 20}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 20}, (_, i) => ({x: 49, y: i, type: 'ground'})),
            // Central dividing wall
            ...Array.from({length: 15}, (_, i) => ({x: 24, y: 3 + i, type: 'ground'})),
            // Left side platforms
            {x: 8, y: 14}, {x: 9, y: 14}, {x: 10, y: 14},
            {x: 15, y: 10}, {x: 16, y: 10}, {x: 17, y: 10},
            {x: 5, y: 6}, {x: 6, y: 6}, {x: 7, y: 6},
            // Right side platforms  
            {x: 32, y: 12}, {x: 33, y: 12}, {x: 34, y: 12},
            {x: 40, y: 8}, {x: 41, y: 8}, {x: 42, y: 8},
            {x: 45, y: 14}, {x: 46, y: 14}, {x: 47, y: 14}
        ],
        switches: [
            {x: 9, y: 13, id: 0}, // Left side
            {x: 16, y: 9, id: 1},  // Left side
            {x: 33, y: 11, id: 2}, // Right side
            {x: 41, y: 7, id: 3}   // Right side
        ],
        doors: [
            {x: 24, y: 17, switchId: 'cross'}, // Opens when left and right cooperate
            {x: 24, y: 16, switchId: 'cross'}
        ],
        exit: {x: 47, y: 17},
        spawns: [{x: 2, y: 16}, {x: 3, y: 16}, {x: 26, y: 16}, {x: 27, y: 16}]
    },
    
    {
        id: 7,
        name: "Pressure Timing",
        description: "Timed switches - coordination is key",
        width: 45,
        height: 18,
        platforms: [
            // Ground and walls
            ...Array.from({length: 45}, (_, i) => ({x: i, y: 16, type: 'ground'})),
            ...Array.from({length: 45}, (_, i) => ({x: i, y: 17, type: 'ground'})),
            ...Array.from({length: 18}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 18}, (_, i) => ({x: 44, y: i, type: 'ground'})),
            // Complex platform maze
            {x: 6, y: 12}, {x: 7, y: 12}, {x: 8, y: 12},
            {x: 12, y: 8}, {x: 13, y: 8}, {x: 14, y: 8},
            {x: 18, y: 12}, {x: 19, y: 12}, {x: 20, y: 12},
            {x: 24, y: 6}, {x: 25, y: 6}, {x: 26, y: 6},
            {x: 30, y: 10}, {x: 31, y: 10}, {x: 32, y: 10},
            {x: 36, y: 4}, {x: 37, y: 4}, {x: 38, y: 4}
        ],
        switches: [
            {x: 7, y: 11, id: 0, timed: true, duration: 5000},
            {x: 13, y: 7, id: 1, timed: true, duration: 4000},
            {x: 19, y: 11, id: 2, timed: true, duration: 6000},
            {x: 31, y: 9, id: 3, timed: true, duration: 3000}
        ],
        doors: [
            {x: 22, y: 15, switchId: 'timed'},
            {x: 22, y: 14, switchId: 'timed'},
            {x: 22, y: 13, switchId: 'timed'}
        ],
        exit: {x: 42, y: 15},
        spawns: [{x: 2, y: 14}, {x: 3, y: 14}, {x: 4, y: 14}, {x: 5, y: 14}]
    },
    
    {
        id: 8,
        name: "Multi-Level Madness",
        description: "3D puzzle - multiple floors to navigate",
        width: 35,
        height: 25,
        platforms: [
            // Ground floor
            ...Array.from({length: 35}, (_, i) => ({x: i, y: 23, type: 'ground'})),
            ...Array.from({length: 35}, (_, i) => ({x: i, y: 24, type: 'ground'})),
            // Walls
            ...Array.from({length: 25}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 25}, (_, i) => ({x: 34, y: i, type: 'ground'})),
            
            // Second floor (middle level)
            ...Array.from({length: 15}, (_, i) => ({x: 10 + i, y: 15, type: 'ground'})),
            
            // Third floor (top level)
            ...Array.from({length: 10}, (_, i) => ({x: 5 + i, y: 8, type: 'ground'})),
            ...Array.from({length: 8}, (_, i) => ({x: 20 + i, y: 5, type: 'ground'})),
            
            // Connecting platforms
            {x: 8, y: 18}, {x: 9, y: 18}, {x: 30, y: 18}, {x: 31, y: 18},
            {x: 12, y: 12}, {x: 22, y: 12}, {x: 26, y: 10}
        ],
        switches: [
            {x: 15, y: 22, id: 0}, // Ground floor
            {x: 17, y: 14, id: 1}, // Second floor
            {x: 10, y: 7, id: 2},  // Third floor left
            {x: 24, y: 4, id: 3}   // Third floor right
        ],
        doors: [
            {x: 20, y: 22, switchId: 0}, // Ground to second
            {x: 15, y: 14, switchId: 1}, // Second floor passage
            {x: 18, y: 7, switchId: 2},  // Third floor passage
            {x: 32, y: 22, switchId: 3}, {x: 32, y: 21, switchId: 3} // Exit
        ],
        elevators: [
            {x: 8, y: 22, targetY: 17, switchId: 0},
            {x: 30, y: 22, targetY: 17, switchId: 1}
        ],
        exit: {x: 32, y: 20},
        spawns: [{x: 2, y: 21}, {x: 3, y: 21}, {x: 4, y: 21}, {x: 5, y: 21}]
    },
    
    {
        id: 9,
        name: "The Gauntlet",
        description: "Fast coordination required - moving platforms!",
        width: 60,
        height: 20,
        platforms: [
            // Ground and walls
            ...Array.from({length: 60}, (_, i) => ({x: i, y: 18, type: 'ground'})),
            ...Array.from({length: 60}, (_, i) => ({x: i, y: 19, type: 'ground'})),
            ...Array.from({length: 20}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 20}, (_, i) => ({x: 59, y: i, type: 'ground'})),
            
            // Static platforms
            {x: 8, y: 14}, {x: 9, y: 14}, {x: 10, y: 14},
            {x: 20, y: 10}, {x: 21, y: 10}, {x: 22, y: 10},
            {x: 35, y: 6}, {x: 36, y: 6}, {x: 37, y: 6},
            {x: 50, y: 12}, {x: 51, y: 12}, {x: 52, y: 12}
        ],
        switches: [
            {x: 9, y: 13, id: 0, moving: true},
            {x: 21, y: 9, id: 1, moving: true},
            {x: 36, y: 5, id: 2, moving: true},
            {x: 51, y: 11, id: 3, moving: true}
        ],
        movingPlatforms: [
            {x: 15, y: 12, targetX: 25, speed: 0.5},
            {x: 30, y: 8, targetY: 14, speed: 0.3},
            {x: 45, y: 15, targetX: 55, speed: 0.4}
        ],
        doors: [
            {x: 12, y: 17, switchId: 0},
            {x: 27, y: 17, switchId: 1}, 
            {x: 42, y: 17, switchId: 2},
            {x: 57, y: 17, switchId: 3}, {x: 57, y: 16, switchId: 3}
        ],
        exit: {x: 57, y: 15},
        spawns: [{x: 2, y: 16}, {x: 3, y: 16}, {x: 4, y: 16}, {x: 5, y: 16}]
    },
    
    {
        id: 10,
        name: "The Ultimate Challenge",
        description: "Master-level cooperation - everything combined!",
        width: 70,
        height: 30,
        platforms: [
            // Massive complex level with all mechanics
            // Ground and walls
            ...Array.from({length: 70}, (_, i) => ({x: i, y: 28, type: 'ground'})),
            ...Array.from({length: 70}, (_, i) => ({x: i, y: 29, type: 'ground'})),
            ...Array.from({length: 30}, (_, i) => ({x: 0, y: i, type: 'ground'})),
            ...Array.from({length: 30}, (_, i) => ({x: 69, y: i, type: 'ground'})),
            
            // Complex multi-level structure
            // Level 1 platforms
            {x: 10, y: 24}, {x: 11, y: 24}, {x: 12, y: 24},
            {x: 20, y: 20}, {x: 21, y: 20}, {x: 22, y: 20}, {x: 23, y: 20},
            {x: 35, y: 25}, {x: 36, y: 25}, {x: 37, y: 25},
            {x: 50, y: 22}, {x: 51, y: 22}, {x: 52, y: 22},
            
            // Level 2 platforms
            {x: 15, y: 16}, {x: 16, y: 16}, {x: 17, y: 16}, {x: 18, y: 16},
            {x: 30, y: 12}, {x: 31, y: 12}, {x: 32, y: 12}, {x: 33, y: 12},
            {x: 45, y: 18}, {x: 46, y: 18}, {x: 47, y: 18},
            {x: 60, y: 14}, {x: 61, y: 14}, {x: 62, y: 14},
            
            // Level 3 platforms (top)
            {x: 25, y: 8}, {x: 26, y: 8}, {x: 27, y: 8}, {x: 28, y: 8},
            {x: 40, y: 6}, {x: 41, y: 6}, {x: 42, y: 6},
            {x: 55, y: 4}, {x: 56, y: 4}, {x: 57, y: 4}, {x: 58, y: 4}
        ],
        switches: [
            {x: 11, y: 23, id: 0, sequence: 1, timed: true, duration: 8000},
            {x: 21, y: 19, id: 1, sequence: 2, timed: true, duration: 6000},
            {x: 16, y: 15, id: 2, sequence: 3, moving: true},
            {x: 31, y: 11, id: 3, sequence: 4, timed: true, duration: 4000},
            {x: 46, y: 17, id: 4, sequence: 5, moving: true},
            {x: 26, y: 7, id: 5, sequence: 6, timed: true, duration: 10000},
            {x: 41, y: 5, id: 6, sequence: 7, moving: true},
            {x: 56, y: 3, id: 7, sequence: 8, timed: true, duration: 3000}
        ],
        doors: [
            {x: 25, y: 27, switchId: 0}, {x: 25, y: 26, switchId: 0},
            {x: 38, y: 24, switchId: 1}, {x: 38, y: 23, switchId: 1},
            {x: 48, y: 21, switchId: 2}, 
            {x: 34, y: 11, switchId: 3}, {x: 34, y: 10, switchId: 3},
            {x: 58, y: 13, switchId: 4}, {x: 58, y: 12, switchId: 4},
            {x: 43, y: 5, switchId: 5}, {x: 43, y: 4, switchId: 5},
            {x: 67, y: 27, switchId: 'final'}, {x: 67, y: 26, switchId: 'final'},
            {x: 67, y: 25, switchId: 'final'}, {x: 67, y: 24, switchId: 'final'}
        ],
        elevators: [
            {x: 8, y: 27, targetY: 23, switchId: 0},
            {x: 33, y: 24, targetY: 17, switchId: 1},
            {x: 43, y: 17, targetY: 7, switchId: 2},
            {x: 53, y: 13, targetY: 5, switchId: 3}
        ],
        movingPlatforms: [
            {x: 18, y: 18, targetX: 28, speed: 0.3},
            {x: 38, y: 15, targetY: 10, speed: 0.2},
            {x: 48, y: 9, targetX: 58, speed: 0.4}
        ],
        exit: {x: 67, y: 23},
        spawns: [{x: 2, y: 26}, {x: 3, y: 26}, {x: 4, y: 26}, {x: 5, y: 26}]
    }
];

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = new Map();
        this.currentLevel = 1;
        this.switches = new Map();
        this.doors = new Map();
        this.elevators = new Map();
        this.gameState = 'waiting'; // waiting, playing, completed
        this.lastUpdate = Date.now();
        this.levelStartTime = null;
        
        this.initializeLevel();
    }
    
    initializeLevel() {
        const level = LEVELS[this.currentLevel - 1];
        if (!level) return;
        
        // Initialize switches
        this.switches.clear();
        if (level.switches) {
            level.switches.forEach(s => {
                this.switches.set(s.id, {
                    ...s,
                    active: false,
                    lastActivated: 0,
                    isExpired: false
                });
            });
        }
        
        // Initialize doors
        this.doors.clear();
        if (level.doors) {
            level.doors.forEach((d, index) => {
                this.doors.set(index, {
                    ...d,
                    open: false
                });
            });
        }
        
        // Initialize elevators
        this.elevators.clear();
        if (level.elevators) {
            level.elevators.forEach((e, index) => {
                this.elevators.set(index, {
                    ...e,
                    currentY: e.y,
                    moving: false
                });
            });
        }
        
        this.levelStartTime = Date.now();
        this.gameState = 'playing';
        
        // Reset player positions to spawn points
        let spawnIndex = 0;
        this.players.forEach(player => {
            if (level.spawns && level.spawns[spawnIndex]) {
                const spawn = level.spawns[spawnIndex];
                player.x = spawn.x * 40; // Convert to pixels
                player.y = spawn.y * 40;
                player.vx = 0;
                player.vy = 0;
                player.onGround = false;
                spawnIndex++;
            }
        });
    }
    
    addPlayer(socket) {
        if (this.players.size >= MAX_PLAYERS) {
            return false;
        }
        
        const playerId = this.players.size + 1;
        const level = LEVELS[this.currentLevel - 1];
        const spawn = level.spawns[this.players.size] || level.spawns[0];
        
        const player = {
            id: playerId,
            name: `Player${playerId}`,
            socket: socket,
            x: spawn.x * 40,
            y: spawn.y * 40,
            vx: 0,
            vy: 0,
            width: 20,
            height: 20,
            color: PLAYER_COLORS[playerId - 1],
            onGround: false,
            keys: {}
        };
        
        this.players.set(socket.id, player);
        return player;
    }
    
    removePlayer(socketId) {
        this.players.delete(socketId);
        
        // If no players left, mark room for cleanup
        if (this.players.size === 0) {
            this.gameState = 'empty';
        }
    }
    
    updatePlayer(socketId, keys) {
        const player = this.players.get(socketId);
        if (!player) return;
        
        player.keys = keys;
        
        // Movement
        player.vx = 0;
        if (keys.left) player.vx = -4;
        if (keys.right) player.vx = 4;
        
        // Jumping
        if (keys.jump && player.onGround) {
            player.vy = -12;
            player.onGround = false;
        }
        
        // Gravity
        player.vy += 0.5;
        
        // Move with collision
        this.movePlayerWithCollision(player);
    }
    
    movePlayerWithCollision(player) {
        const level = LEVELS[this.currentLevel - 1];
        const TILE_SIZE = 40;
        
        // Horizontal movement
        player.x += player.vx;
        if (this.checkCollision(player, level)) {
            player.x -= player.vx;
        }
        
        // Vertical movement
        player.y += player.vy;
        const collision = this.checkCollision(player, level);
        if (collision) {
            if (player.vy > 0) {
                // Landing
                player.onGround = true;
                player.vy = 0;
                const tileY = Math.floor((player.y + player.height) / TILE_SIZE) * TILE_SIZE;
                player.y = tileY - player.height;
            } else {
                // Hit ceiling
                player.vy = 0;
                const tileY = Math.floor(player.y / TILE_SIZE) * TILE_SIZE;
                player.y = tileY + TILE_SIZE;
            }
        } else {
            player.onGround = false;
        }
        
        // Keep in bounds
        player.x = Math.max(0, Math.min(player.x, level.width * TILE_SIZE - player.width));
        player.y = Math.max(0, Math.min(player.y, level.height * TILE_SIZE - player.height));
    }
    
    checkCollision(player, level) {
        const TILE_SIZE = 40;
        const left = Math.floor(player.x / TILE_SIZE);
        const right = Math.floor((player.x + player.width - 1) / TILE_SIZE);
        const top = Math.floor(player.y / TILE_SIZE);
        const bottom = Math.floor((player.y + player.height - 1) / TILE_SIZE);
        
        // Check platforms
        for (let x = left; x <= right; x++) {
            for (let y = top; y <= bottom; y++) {
                if (level.platforms && level.platforms.some(p => p.x === x && p.y === y)) {
                    return true;
                }
            }
        }
        
        // Check doors
        this.doors.forEach((door, index) => {
            if (!door.open && door.x >= left && door.x <= right && door.y >= top && door.y <= bottom) {
                return true;
            }
        });
        
        return false;
    }
    
    update() {
        if (this.gameState !== 'playing') return;
        
        const now = Date.now();
        const level = LEVELS[this.currentLevel - 1];
        
        // Update switches
        this.switches.forEach((switchObj, id) => {
            // Check if any player is on the switch
            switchObj.active = false;
            
            this.players.forEach(player => {
                const switchRect = {
                    x: switchObj.x * 40,
                    y: switchObj.y * 40,
                    width: 40,
                    height: 40
                };
                
                if (this.rectanglesOverlap(player, switchRect)) {
                    switchObj.active = true;
                    switchObj.lastActivated = now;
                }
            });
            
            // Handle timed switches
            if (switchObj.timed && switchObj.active) {
                if (now - switchObj.lastActivated > switchObj.duration) {
                    switchObj.isExpired = true;
                } else {
                    switchObj.isExpired = false;
                }
            }
        });
        
        // Update doors based on switch logic
        this.doors.forEach((door, index) => {
            door.open = this.evaluateDoorCondition(door.switchId, level);
        });
        
        // Check win condition
        if (level.exit) {
            const exitRect = {
                x: level.exit.x * 40,
                y: level.exit.y * 40,
                width: 40,
                height: 40
            };
            
            this.players.forEach(player => {
                if (this.rectanglesOverlap(player, exitRect)) {
                    this.completeLevel();
                    return;
                }
            });
        }
    }
    
    evaluateDoorCondition(switchId, level) {
        if (switchId === 'both') {
            // Both switches must be active
            let activeCount = 0;
            this.switches.forEach(s => {
                if (s.active && !s.isExpired) activeCount++;
            });
            return activeCount >= 2;
        } else if (switchId === 'all') {
            // All switches must be active
            let allActive = true;
            this.switches.forEach(s => {
                if (!s.active || s.isExpired) allActive = false;
            });
            return allActive && this.switches.size > 0;
        } else if (switchId === 'cross') {
            // Left and right sides must cooperate
            let leftActive = false, rightActive = false;
            this.switches.forEach(s => {
                if (s.active && !s.isExpired) {
                    if (s.x < 25) leftActive = true;
                    else rightActive = true;
                }
            });
            return leftActive && rightActive;
        } else if (switchId === 'timed') {
            // All timed switches must be active simultaneously
            let allTimedActive = true;
            this.switches.forEach(s => {
                if (s.timed && (!s.active || s.isExpired)) {
                    allTimedActive = false;
                }
            });
            return allTimedActive;
        } else if (switchId === 'final') {
            // Ultimate challenge - complex condition
            let sequenceCorrect = true;
            let sequencePosition = 1;
            
            this.switches.forEach(s => {
                if (s.sequence === sequencePosition && s.active && !s.isExpired) {
                    sequencePosition++;
                } else if (s.sequence && s.sequence < sequencePosition && (!s.active || s.isExpired)) {
                    sequenceCorrect = false;
                }
            });
            
            return sequencePosition > 7; // Need at least 7 switches in sequence
        } else if (typeof switchId === 'number') {
            // Single switch condition
            const switchObj = this.switches.get(switchId);
            return switchObj && switchObj.active && !switchObj.isExpired;
        }
        
        return false;
    }
    
    rectanglesOverlap(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }
    
    completeLevel() {
        if (this.currentLevel >= LEVELS.length) {
            // Game completed!
            this.gameState = 'completed';
            this.broadcastToRoom('gameCompleted', {
                message: '🎉 CONGRATULATIONS! You have completed all 10 levels!',
                totalTime: Date.now() - this.levelStartTime
            });
        } else {
            // Next level
            this.currentLevel++;
            this.initializeLevel();
            this.broadcastToRoom('levelCompleted', {
                level: this.currentLevel - 1,
                nextLevel: this.currentLevel,
                message: `Level ${this.currentLevel - 1} Complete! Moving to Level ${this.currentLevel}`
            });
        }
    }
    
    broadcastToRoom(event, data) {
        this.players.forEach(player => {
            player.socket.emit(event, data);
        });
    }
    
    getGameState() {
        const level = LEVELS[this.currentLevel - 1];
        
        return {
            roomId: this.id,
            currentLevel: this.currentLevel,
            levelName: level ? level.name : 'Unknown',
            levelDescription: level ? level.description : '',
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                x: p.x,
                y: p.y,
                color: p.color
            })),
            switches: Array.from(this.switches.values()),
            doors: Array.from(this.doors.values()),
            elevators: Array.from(this.elevators.values()),
            level: level,
            gameState: this.gameState
        };
    }
}

// Server management
let nextRoomId = 1;

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    socket.on('joinRoom', (roomId) => {
        // Find or create room
        let room = rooms.get(roomId);
        if (!room) {
            room = new GameRoom(roomId);
            rooms.set(roomId, room);
        }
        
        // Add player to room
        const player = room.addPlayer(socket);
        if (!player) {
            socket.emit('roomFull');
            return;
        }
        
        socket.join(roomId);
        socket.roomId = roomId;
        
        // Send initial game state
        socket.emit('playerJoined', player);
        socket.emit('gameState', room.getGameState());
        
        // Notify other players
        socket.to(roomId).emit('playerConnected', player);
        
        console.log(`Player ${player.name} joined room ${roomId}`);
    });
    
    socket.on('playerInput', (keys) => {
        if (!socket.roomId) return;
        
        const room = rooms.get(socket.roomId);
        if (room) {
            room.updatePlayer(socket.id, keys);
        }
    });
    
    socket.on('disconnect', () => {
        if (socket.roomId) {
            const room = rooms.get(socket.roomId);
            if (room) {
                room.removePlayer(socket.id);
                socket.to(socket.roomId).emit('playerDisconnected', socket.id);
                
                // Clean up empty rooms
                if (room.gameState === 'empty') {
                    rooms.delete(socket.roomId);
                }
            }
        }
        
        console.log(`Player disconnected: ${socket.id}`);
    });
    
    socket.on('requestRoomList', () => {
        const roomList = [];
        rooms.forEach((room, id) => {
            if (room.players.size < MAX_PLAYERS) {
                roomList.push({
                    id: id,
                    playerCount: room.players.size,
                    maxPlayers: MAX_PLAYERS,
                    currentLevel: room.currentLevel,
                    gameState: room.gameState
                });
            }
        });
        
        socket.emit('roomList', roomList);
    });
});

// Game update loop
setInterval(() => {
    rooms.forEach((room) => {
        room.update();
        
        // Broadcast game state to all players in room
        if (room.gameState === 'playing') {
            room.broadcastToRoom('gameState', room.getGameState());
        }
    });
}, 1000 / 30); // 30 FPS server updates

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 GAEM Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in multiple browsers/devices to play!`);
});
