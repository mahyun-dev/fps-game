import { WebSocket, WebSocketServer } from "ws";

const port = Number(process.env.PORT || 2567);
const wss = new WebSocketServer({ port });

const rooms = new Map();

function getRoom(roomCode) {
    const normalized = roomCode.toLowerCase();
    if (!rooms.has(normalized)) {
        rooms.set(normalized, {
            code: normalized,
            players: new Map(),
            createdAt: Date.now()
        });
    }
    return rooms.get(normalized);
}

function listPlayers(room) {
    return [...room.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        rotationY: player.rotationY,
        pitch: player.pitch,
        score: player.score,
        health: player.health
    }));
}

function send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function broadcastRoom(room, message) {
    room.players.forEach((player) => {
        send(player.socket, message);
    });
}

function cleanupRoom(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) {
        return;
    }
    if (room.players.size === 0) {
        rooms.delete(roomCode);
    }
}

function makePlayer(socket, payload) {
    return {
        id: crypto.randomUUID(),
        socket,
        name: payload.name || "Player",
        team: payload.team || "ALPHA",
        roomCode: payload.roomCode.toLowerCase(),
        position: [0, 2.5, -12],
        rotationY: 0,
        pitch: 0,
        score: 0,
        health: 100,
        joinedAt: Date.now()
    };
}

wss.on("connection", (socket) => {
    let currentPlayer = null;

    send(socket, {
        type: "system",
        payload: {
            text: "CONNECTED"
        }
    });

    socket.on("message", (raw) => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch {
            send(socket, {
                type: "system",
                payload: {
                    text: "INVALID MESSAGE"
                }
            });
            return;
        }

        if (message.type === "join") {
            const payload = message.payload || {};
            const roomCode = (payload.roomCode || "arena-01").trim();
            const room = getRoom(roomCode);

            if (room.players.size >= 4) {
                send(socket, {
                    type: "system",
                    payload: {
                        text: "ROOM FULL"
                    }
                });
                return;
            }

            currentPlayer = makePlayer(socket, payload);
            room.players.set(currentPlayer.id, currentPlayer);

            send(socket, {
                type: "welcome",
                payload: {
                    playerId: currentPlayer.id,
                    roomCode: room.code
                }
            });

            broadcastRoom(room, {
                type: "system",
                payload: {
                    text: `${currentPlayer.name} JOINED ${room.code.toUpperCase()}`
                }
            });

            broadcastRoom(room, {
                type: "snapshot",
                payload: {
                    roomCode: room.code,
                    players: listPlayers(room)
                }
            });
            return;
        }

        if (!currentPlayer) {
            send(socket, {
                type: "system",
                payload: {
                    text: "JOIN REQUIRED"
                }
            });
            return;
        }

        const room = rooms.get(currentPlayer.roomCode);
        if (!room) {
            return;
        }

        if (message.type === "state") {
            const payload = message.payload || {};
            currentPlayer.position = Array.isArray(payload.position) ? payload.position : currentPlayer.position;
            currentPlayer.rotationY = Number.isFinite(payload.rotationY) ? payload.rotationY : currentPlayer.rotationY;
            currentPlayer.pitch = Number.isFinite(payload.pitch) ? payload.pitch : currentPlayer.pitch;
            currentPlayer.health = Number.isFinite(payload.health) ? payload.health : currentPlayer.health;
            currentPlayer.score = Number.isFinite(payload.score) ? payload.score : currentPlayer.score;
        }

        if (message.type === "shot") {
            broadcastRoom(room, {
                type: "system",
                payload: {
                    text: `${currentPlayer.name} FIRED`
                }
            });
        }
    });

    socket.on("close", () => {
        if (!currentPlayer) {
            return;
        }

        const room = rooms.get(currentPlayer.roomCode);
        if (!room) {
            return;
        }

        room.players.delete(currentPlayer.id);
        broadcastRoom(room, {
            type: "snapshot",
            payload: {
                roomCode: room.code,
                players: listPlayers(room)
            }
        });
        cleanupRoom(room.code);
    });
});

setInterval(() => {
    rooms.forEach((room) => {
        broadcastRoom(room, {
            type: "snapshot",
            payload: {
                roomCode: room.code,
                players: listPlayers(room)
            }
        });
    });
}, 1000 / 20);

console.log(`Neon Strike server listening on ${port}`);