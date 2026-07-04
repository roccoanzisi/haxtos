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
const EXTRAPOLATION_LIMIT_MS = 250;

function createRoom(id, name, password, maxPlayers, showInList) {
    return { 
        id, 
        players: [], 
        state: null, 
        teamsLocked: false,
        name: name || `${id}'s room`,
        password: password || '',
        maxPlayers: maxPlayers || 12,
        showInList: showInList !== false
    };
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
        team: p.team,
        extrapolationMs: p.extrapolationMs || 0
    }));
    broadcast(room, { type: 'players_list', list, teamsLocked: room.teamsLocked || false });
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

        if (msg.type === 'list_rooms') {
            const list = [];
            let totalPlayers = 0;
            rooms.forEach(r => {
                totalPlayers += r.players.length;
                if (r.showInList !== false) {
                    list.push({
                        code: r.id,
                        name: r.name || `${r.id}'s room`,
                        players: r.players.length,
                        maxPlayers: r.maxPlayers || 12,
                        hasPass: !!r.password
                    });
                }
            });
            ws.send(JSON.stringify({ 
                type: 'room_list', 
                list, 
                totalPlayers, 
                totalRooms: rooms.size 
            }));
            return;
        }

        if (msg.type === 'join') {
            const roomCode = msg.room.toUpperCase();
            let room = rooms.get(roomCode);
            if (!room) {
                room = createRoom(roomCode, msg.roomName, msg.password, msg.maxPlayers, msg.showInList);
                rooms.set(roomCode, room); // CRITICAL: Save new room in the rooms Map!
            }

            const limit = room.maxPlayers || 12;
            if (room.players.length >= limit) {
                ws.send(JSON.stringify({ type: 'error', text: 'Sala llena' }));
                return;
            }

            ws.roomId = roomCode;
            ws.playerIndex = room.players.length;
            ws.id = ws.playerIndex + 1;
            ws.name = msg.name || (ws.playerIndex === 0 ? "Host" : "Invitado");
            ws.admin = ws.playerIndex === 0;
            ws.team = ws.playerIndex === 0 ? "blue" : "red";
            ws.ip = ip;
            ws.extrapolationMs = 0;

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
            broadcast(room, { type: 'chat', text: `* ${ws.name} joined`, color: '#bcf085' });

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
            } else if (msg.type === 'lock_teams') {
                if (ws.admin) {
                    room.teamsLocked = msg.locked;
                    sendRoomPlayersUpdate(room);
                }
            } else if (msg.type === 'auto_teams') {
                if (ws.admin) {
                    const active = room.players.filter(p => p.team === 'red' || p.team === 'blue');
                    active.forEach((p, idx) => {
                        p.team = idx % 2 === 0 ? 'red' : 'blue';
                    });
                    sendRoomPlayersUpdate(room);
                }
            } else if (msg.type === 'rand_teams') {
                if (ws.admin) {
                    const active = room.players.filter(p => p.team === 'red' || p.team === 'blue');
                    for (let i = active.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [active[i].team, active[j].team] = [active[j].team, active[i].team];
                    }
                    sendRoomPlayersUpdate(room);
                }
            } else if (msg.type === 'toggle_admin') {
                if (ws.admin) {
                    const target = room.players.find(p => p.playerIndex === msg.playerIndex);
                    if (target) {
                        target.admin = !target.admin;
                        sendRoomPlayersUpdate(room);
                    }
                }
            } else if (msg.type === 'lobby_kick') {
                if (ws.admin) {
                    const target = room.players.find(p => p.playerIndex === msg.playerIndex);
                    if (target) {
                        target.send(JSON.stringify({ type: 'error', text: 'Has sido expulsado de la sala' }));
                        target.close();
                    }
                }
            } else if (msg.type === 'lobby_ban') {
                if (ws.admin) {
                    const target = room.players.find(p => p.playerIndex === msg.playerIndex);
                    if (target) {
                        bannedIps.add(target.ip);
                        target.send(JSON.stringify({ type: 'error', text: 'Has sido baneado de esta sala' }));
                        target.close();
                    }
                }
            } else if (msg.type === 'start_game') {
                if (ws.admin) {
                    broadcast(room, { type: 'start_game', scoreWin: msg.scoreWin, timeLimit: msg.timeLimit, by: ws.name });
                }
            } else if (msg.type === 'stop_game') {
                if (ws.admin) {
                    broadcast(room, { type: 'stop_game', by: ws.name });
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
            } else if (msg.type === 'report_extrapolation') {
                // Anti-cheat: clients self-report their local extrapolation value on a
                // timer. A patched client could set window.HAXTOS_EXTRAPOLATION directly,
                // bypassing the /extrapolation command entirely — so validate every report,
                // not just command input, and force-revert anyone over the room limit.
                const reported = Number(msg.ms);
                if (!Number.isFinite(reported) || reported < 0) return;
                if (reported > EXTRAPOLATION_LIMIT_MS) {
                    ws.extrapolationMs = EXTRAPOLATION_LIMIT_MS;
                    ws.send(JSON.stringify({ type: 'set_extrapolation', ms: EXTRAPOLATION_LIMIT_MS }));
                } else {
                    ws.extrapolationMs = reported;
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
                        ws.send(JSON.stringify({ type: 'chat', text: 'You are not an admin', color: '#ffaaaa' }));
                        return;
                    }

                    if (args.length === 0) {
                        ws.send(JSON.stringify({ type: 'chat', text: `Usage: /${cmd} <name_or_id>`, color: '#ffaaaa' }));
                        return;
                    }

                    const target = findTarget(args[0]);
                    if (!target) {
                        ws.send(JSON.stringify({ type: 'chat', text: `Player "${args[0]}" not found`, color: '#ffaaaa' }));
                        return;
                    }

                    if (cmd === 'kick') {
                        broadcast(room, { type: 'chat', text: `* ${target.name} was kicked by admin`, color: '#bcf085' });
                        target.close();
                    } else if (cmd === 'ban') {
                        broadcast(room, { type: 'chat', text: `* ${target.name} was banned by admin`, color: '#bcf085' });
                        bannedIps.add(target.ip);
                        target.close();
                    } else if (cmd === 'admin') {
                        target.admin = true;
                        broadcast(room, { type: 'chat', text: `* ${target.name} was given admin rights`, color: '#bcf085' });
                        sendRoomPlayersUpdate(room);
                    }
                } else if (cmd === 'w') {
                    if (args.length < 2) {
                        ws.send(JSON.stringify({ type: 'chat', text: 'Usage: /w <name_or_id> <message>', color: '#ffaaaa' }));
                        return;
                    }

                    const target = findTarget(args[0]);
                    if (!target) {
                        ws.send(JSON.stringify({ type: 'chat', text: `Player "${args[0]}" not found`, color: '#ffaaaa' }));
                        return;
                    }

                    const whisperMsg = args.slice(1).join(' ');
                    target.send(JSON.stringify({ type: 'chat', text: `From ${ws.name}: ${whisperMsg}`, color: '#ff88ff' }));
                    ws.send(JSON.stringify({ type: 'chat', text: `To ${target.name}: ${whisperMsg}`, color: '#ff88ff' }));
                } else if (cmd === 'extrapolation') {
                    const valorStr = args[0];
                    if (!valorStr) {
                        ws.send(JSON.stringify({ type: 'chat', text: `Extrapolation is ${ws.extrapolationMs || 0} ms.`, color: '#bcf085' }));
                        return;
                    }
                    const ms = parseInt(valorStr, 10);
                    if (!isNaN(ms) && ms >= 0 && ms <= EXTRAPOLATION_LIMIT_MS) {
                        ws.extrapolationMs = ms;
                        ws.send(JSON.stringify({ type: 'chat', text: `* Extrapolation set to ${ms} ms.`, color: '#bcf085' }));
                        ws.send(JSON.stringify({ type: 'set_extrapolation', ms }));
                        sendRoomPlayersUpdate(room);
                    } else {
                        ws.send(JSON.stringify({ type: 'chat', text: `Error. Use a valid number between 0 and ${EXTRAPOLATION_LIMIT_MS}. Example: /extrapolation 100`, color: '#ffaaaa' }));
                    }
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
        broadcast(room, { type: 'chat', text: `* ${ws.name} left`, color: '#bcf085' });

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
