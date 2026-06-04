import asyncio, json, os, uuid
import websockets
from websockets.server import serve

clients = {}   # cid -> {ws, name, room_id}
rooms   = {}   # rid -> {host, host_name, players}

PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#1abc9c"]
MAX_PLAYERS   = 6


async def _send(cid, data):
    c = clients.get(cid)
    if c:
        try:
            await c["ws"].send(json.dumps(data))
        except Exception:
            pass


async def _broadcast_room(room_id, data):
    for p in rooms.get(room_id, {}).get("players", []):
        await _send(p["id"], data)


async def _broadcast_lobby():
    lobby_rooms = [
        {"id": rid, "host": r["host_name"], "players": len(r["players"])}
        for rid, r in rooms.items()
    ]
    msg = json.dumps({"type": "lobby_update", "rooms": lobby_rooms})
    for c in clients.values():
        if not c["room_id"]:
            try:
                await c["ws"].send(msg)
            except Exception:
                pass


def _free_slot(room):
    used = {p["idx"] for p in room["players"]}
    idx  = next(i for i in range(MAX_PLAYERS) if i not in used)
    return idx, PLAYER_COLORS[idx]


async def _leave_room(cid):
    client  = clients.get(cid)
    room_id = client and client["room_id"]
    room    = rooms.get(room_id)
    if not room:
        return
    name              = client["name"] or "?"
    room["players"]   = [p for p in room["players"] if p["id"] != cid]
    client["room_id"] = None
    if not room["players"]:
        rooms.pop(room_id, None)
    else:
        if room["host"] == cid:
            room["host"]      = room["players"][0]["id"]
            room["host_name"] = room["players"][0]["name"]
        await _broadcast_room(room_id, {"type": "player_left", "name": name, "players": room["players"]})
    await _broadcast_lobby()


async def handle(cid, data):
    t      = data.get("type")
    client = clients.get(cid)
    if not client:
        return

    if t == "join_lobby":
        client["name"] = (str(data.get("name", "")).strip() or "Player")[:20]
        await _send(cid, {"type": "joined_lobby", "client_id": cid})
        await _broadcast_lobby()

    elif t == "create_room":
        if client["room_id"]:
            return
        room_id = str(uuid.uuid4())[:8]
        color   = PLAYER_COLORS[0]
        rooms[room_id] = {
            "host":      cid,
            "host_name": client["name"],
            "players":   [{"id": cid, "name": client["name"], "color": color, "idx": 0}],
        }
        client["room_id"] = room_id
        await _send(cid, {"type": "room_created", "room_id": room_id, "color": color, "player_idx": 0})
        await _broadcast_room(room_id, {"type": "player_joined", "players": rooms[room_id]["players"]})
        await _broadcast_lobby()

    elif t == "join_room":
        room_id = data.get("room_id")
        room    = rooms.get(room_id)
        if not room:
            await _send(cid, {"type": "error", "msg": "Room not found"}); return
        if len(room["players"]) >= MAX_PLAYERS:
            await _send(cid, {"type": "error", "msg": "Room full"}); return
        if client["room_id"]:
            return
        idx, color = _free_slot(room)
        room["players"].append({"id": cid, "name": client["name"], "color": color, "idx": idx})
        client["room_id"] = room_id
        await _send(cid, {"type": "room_joined", "room_id": room_id, "color": color, "player_idx": idx})
        await _broadcast_room(room_id, {"type": "player_joined", "players": room["players"]})
        await _broadcast_lobby()

    elif t == "leave_room":
        await _leave_room(cid)


async def handler(ws):
    cid = str(uuid.uuid4())[:8]
    clients[cid] = {"ws": ws, "name": None, "room_id": None}
    print(f"[+] {cid} connected  (total={len(clients)})", flush=True)
    try:
        async for raw in ws:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await handle(cid, data)
    finally:
        await _leave_room(cid)
        clients.pop(cid, None)
        print(f"[-] {cid} disconnected (total={len(clients)})", flush=True)


async def main():
    port = int(os.environ.get("PORT", 8765))
    print(f"Lobby server listening on 0.0.0.0:{port}", flush=True)
    async with serve(handler, "0.0.0.0", port):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
