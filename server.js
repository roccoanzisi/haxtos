const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

const rooms = new Map();
const bannedIps = new Set();

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

function sendRoomPlayersUpdate(room) {
    const list = room.players.map(p => ({
        index: p.playerIndex,
        id: p.id,
        name: p.name,
        admin: p.admin,
        team: p.team
    }));
    broadcast(room, { type: 'players_list', list });
}

wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (bannedIps.has(ip)) {
        ws.send(JSON.stringify({ type: 'error', text: 'Estás baneado de este servidor' }));
        ws.close();
        return;
    }

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
            ws.id = ws.playerIndex + 1;
            ws.name = ws.playerIndex === 0 ? "Host" : "Invitado";
            ws.admin = ws.playerIndex === 0;
            ws.team = ws.playerIndex === 0 ? "blue" : "red";
            ws.ip = ip;

            room.players.push(ws);
            rooms.set(roomCode, room);

            ws.send(JSON.stringify({ 
                type: 'joined', 
                index: ws.playerIndex,
                id: ws.id,
                name: ws.name,
                admin: ws.admin
            }));

            // Announce join to chat
            broadcast(room, { type: 'chat', text: `${ws.name} se ha unido a la sala`, color: '#ffffaa' });

            // Send updated player list
            sendRoomPlayersUpdate(room);

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
            } else if (msg.type === 'request_players') {
                sendRoomPlayersUpdate(room);
            } else if (msg.type === 'move_team') {
                ws.team = msg.team;
                sendRoomPlayersUpdate(room);
            } else if (msg.type === 'move_player_team') {
                if (ws.admin) {
                    const target = room.players.find(p => p.playerIndex === msg.playerIndex);
                    if (target) {
                        target.team = msg.team;
                        sendRoomPlayersUpdate(room);
                    }
                }
            } else if (msg.type === 'start_game') {
                if (ws.admin) {
                    broadcast(room, { type: 'start_game' });
                }
            } else if (msg.type === 'stop_game') {
                if (ws.admin) {
                    broadcast(room, { type: 'stop_game' });
                }
            } else if (msg.type === 'resume_game') {
                if (ws.admin) {
                    broadcast(room, { type: 'resume_game' });
                }
            } else if (msg.type === 'set_map') {
                if (ws.admin && msg.hbs) {
                    room.hbs = msg.hbs;
                    broadcast(room, { type: 'map_changed', hbs: msg.hbs });
                }
            } else if (msg.type === 'command') {
                const text = (msg.text || '').trim();
                if (!text.startsWith('/')) return;

                const parts = text.slice(1).split(/\s+/);
                const cmd = parts[0].toLowerCase();
                const args = parts.slice(1);

                const findTarget = (query) => {
                    return room.players.find(p => p.id.toString() === query || p.name.toLowerCase() === query.toLowerCase());
                };

                if (cmd === 'kick' || cmd === 'ban' || cmd === 'admin') {
                    if (!ws.admin) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'No tienes permisos de administrador', color: '#ffaaaa' }));
                        return;
                    }

                    if (args.length === 0) {
                        ws.send(JSON.stringify({ type: 'chat', text: `Uso: /${cmd} <nombre_o_id>`, color: '#ffaaaa' }));
                        return;
                    }

                    const target = findTarget(args[0]);
                    if (!target) {
                        ws.send(JSON.stringify({ type: 'chat', text: `Jugador "${args[0]}" no encontrado`, color: '#ffaaaa' }));
                        return;
                    }

                    if (cmd === 'kick') {
                        broadcast(room, { type: 'chat', text: `El administrador expulsó a ${target.name}`, color: '#ffaaaa' });
                        target.close();
                    } else if (cmd === 'ban') {
                        broadcast(room, { type: 'chat', text: `El administrador baneó a ${target.name}`, color: '#ffaaaa' });
                        bannedIps.add(target.ip);
                        target.close();
                    } else if (cmd === 'admin') {
                        target.admin = true;
                        broadcast(room, { type: 'chat', text: `${target.name} ahora es administrador de la sala`, color: '#aaffaa' });
                        sendRoomPlayersUpdate(room);
                    }
                } else if (cmd === 'w') {
                    if (args.length < 2) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'Uso: /w <nombre_o_id> <mensaje>', color: '#ffaaaa' }));
                        return;
                    }

                    const target = findTarget(args[0]);
                    if (!target) {
                        ws.send(JSON.stringify({ type: 'chat', text: `Jugador "${args[0]}" no encontrado`, color: '#ffaaaa' }));
                        return;
                    }

                    const whisperMsg = args.slice(1).join(' ');
                    target.send(JSON.stringify({ type: 'chat', text: `De ${ws.name} (privado): ${whisperMsg}`, color: '#ff88ff' }));
                    ws.send(JSON.stringify({ type: 'chat', text: `A ${target.name} (privado): ${whisperMsg}`, color: '#ff88ff' }));
                }
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

        // Announce leave to chat
        broadcast(room, { type: 'chat', text: `${ws.name} ha abandonado la sala`, color: '#ffaaaa' });

        if (room.players.length === 0) {
            rooms.delete(ws.roomId);
        } else {
            sendRoomPlayersUpdate(room);
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
