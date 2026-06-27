const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

// --- Online rooms (phase 2) ---
const rooms = new Map();

function createRoom(id) {
    return { id, players: [], state: null, ready: false };
}

wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'join') {
            let room = rooms.get(msg.room) || createRoom(msg.room);
            if (room.players.length >= 2) {
                ws.send(JSON.stringify({ type: 'error', text: 'Room full' }));
                return;
            }
            ws.roomId = msg.room;
            ws.playerIndex = room.players.length;
            room.players.push(ws);
            rooms.set(msg.room, room);

            ws.send(JSON.stringify({ type: 'joined', index: ws.playerIndex }));

            if (room.players.length === 2) {
                room.players.forEach((p, i) =>
                    p.send(JSON.stringify({ type: 'start', index: i }))
                );
            }
        }

        if (msg.type === 'input' && ws.roomId) {
            const room = rooms.get(ws.roomId);
            if (!room) return;
            room.players.forEach((p) => {
                if (p !== ws && p.readyState === 1) {
                    p.send(JSON.stringify({ type: 'input', index: ws.playerIndex, keys: msg.keys }));
                }
            });
        }

        if (msg.type === 'state' && ws.roomId) {
            const room = rooms.get(ws.roomId);
            if (!room) return;
            room.players.forEach((p) => {
                if (p !== ws && p.readyState === 1) {
                    p.send(JSON.stringify({ type: 'state', data: msg.data }));
                }
            });
        }
    });

    ws.on('close', () => {
        if (!ws.roomId) return;
        const room = rooms.get(ws.roomId);
        if (!room) return;
        room.players = room.players.filter((p) => p !== ws);
        if (room.players.length === 0) rooms.delete(ws.roomId);
        else room.players.forEach((p) =>
            p.send(JSON.stringify({ type: 'opponent_left' }))
        );
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Haxtos running at http://localhost:${PORT}`));
