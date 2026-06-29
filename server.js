const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

const rooms = new Map();

function createRoom(id) {
    return { id, players: [], state: null };
}

function broadcast(room, msg, exclude) {
    const data = JSON.stringify(msg);
    room.players.forEach((p) => {
        if (p !== exclude && p.readyState === 1) {
            p.send(data);
        }
    });
}

wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'join') {
            const roomCode = msg.room.toUpperCase();
            let room = rooms.get(roomCode) || createRoom(roomCode);

            if (room.players.length >= 2) {
                ws.send(JSON.stringify({ type: 'error', text: 'Sala llena' }));
                return;
            }

            ws.roomId = roomCode;
            ws.playerIndex = room.players.length;
            room.players.push(ws);
            rooms.set(roomCode, room);

            ws.send(JSON.stringify({ type: 'joined', index: ws.playerIndex }));

            if (room.players.length === 2) {
                room.players.forEach((p, i) =>
                    p.send(JSON.stringify({ type: 'start', index: i }))
                );
            }
        }

        if (ws.roomId) {
            const room = rooms.get(ws.roomId);
            if (!room) return;

            if (msg.type === 'input') {
                broadcast(room, { type: 'input', index: ws.playerIndex, keys: msg.keys }, ws);
            } else if (msg.type === 'state') {
                broadcast(room, { type: 'state', data: msg.data }, ws);
            } else {
                // Relay all other message types (chat, colors, etc.) to the other players
                broadcast(room, msg, ws);
            }
        }
    });

    ws.on('close', () => {
        if (!ws.roomId) return;
        const room = rooms.get(ws.roomId);
        if (!room) return;
        room.players = room.players.filter((p) => p !== ws);
        if (room.players.length === 0) {
            rooms.delete(ws.roomId);
        } else {
            room.players.forEach((p) => {
                if (p.readyState === 1) {
                    p.send(JSON.stringify({ type: 'opponent_left' }));
                }
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Haxtos running at http://localhost:${PORT}`));
