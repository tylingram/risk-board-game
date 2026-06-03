import asyncio, json, os, uuid, random
import websockets
from websockets.server import serve

clients = {}   # cid -> {ws, name, room_id}
rooms   = {}   # rid -> {host, host_name, players, status, state}

PLAYER_COLORS = ["#e74c3c","#3498db","#2ecc71","#f1c40f","#9b59b6","#1abc9c"]

ADJACENCY = {
    "alaska":          ["nw_territory","alberta","kamchatka"],
    "nw_territory":    ["alaska","alberta","ontario","greenland"],
    "greenland":       ["nw_territory","ontario","quebec","iceland"],
    "alberta":         ["alaska","nw_territory","ontario","western_us"],
    "ontario":         ["nw_territory","alberta","greenland","quebec","eastern_us","western_us"],
    "quebec":          ["ontario","greenland","eastern_us"],
    "western_us":      ["alberta","ontario","eastern_us","central_america"],
    "eastern_us":      ["ontario","quebec","western_us","central_america"],
    "central_america": ["western_us","eastern_us","venezuela"],
    "venezuela":       ["central_america","brazil","peru"],
    "peru":            ["venezuela","brazil","argentina"],
    "brazil":          ["venezuela","peru","argentina","n_africa"],
    "argentina":       ["peru","brazil"],
    "iceland":         ["greenland","great_britain","n_europe"],
    "great_britain":   ["iceland","n_europe","w_europe"],
    "n_europe":        ["iceland","great_britain","w_europe","s_europe","ukraine"],
    "w_europe":        ["great_britain","n_europe","s_europe","n_africa"],
    "s_europe":        ["n_europe","w_europe","e_europe","ukraine","n_africa","egypt","middle_east"],
    "e_europe":        ["n_europe","s_europe","ukraine","ural","afghanistan","middle_east"],
    "ukraine":         ["n_europe","s_europe","e_europe","ural","afghanistan","middle_east"],
    "n_africa":        ["brazil","w_europe","s_europe","egypt","e_africa","congo"],
    "egypt":           ["s_europe","n_africa","e_africa","middle_east"],
    "congo":           ["n_africa","e_africa","s_africa"],
    "e_africa":        ["egypt","n_africa","congo","s_africa","madagascar","middle_east"],
    "s_africa":        ["congo","e_africa","madagascar"],
    "madagascar":      ["s_africa","e_africa"],
    "ural":            ["ukraine","e_europe","siberia","afghanistan","china"],
    "siberia":         ["ural","yakutsk","irkutsk","mongolia","china"],
    "yakutsk":         ["siberia","irkutsk","kamchatka"],
    "kamchatka":       ["yakutsk","irkutsk","mongolia","japan","alaska"],
    "irkutsk":         ["siberia","yakutsk","kamchatka","mongolia"],
    "mongolia":        ["irkutsk","siberia","kamchatka","china","japan"],
    "japan":           ["kamchatka","mongolia"],
    "afghanistan":     ["ukraine","e_europe","ural","china","india","middle_east"],
    "china":           ["ural","siberia","mongolia","afghanistan","india","siam"],
    "middle_east":     ["ukraine","e_europe","s_europe","egypt","e_africa","afghanistan","india"],
    "india":           ["middle_east","afghanistan","china","siam"],
    "siam":            ["india","china","indonesia"],
    "indonesia":       ["siam","new_guinea","w_australia"],
    "new_guinea":      ["indonesia","w_australia","e_australia"],
    "w_australia":     ["indonesia","new_guinea","e_australia"],
    "e_australia":     ["new_guinea","w_australia"],
}

CONTINENT_TERRITORIES = {
    "na": ["alaska","nw_territory","greenland","alberta","ontario","quebec","western_us","eastern_us","central_america"],
    "sa": ["venezuela","peru","brazil","argentina"],
    "eu": ["iceland","great_britain","n_europe","w_europe","s_europe","e_europe","ukraine"],
    "af": ["n_africa","egypt","congo","e_africa","s_africa","madagascar"],
    "as": ["ural","siberia","yakutsk","kamchatka","irkutsk","mongolia","japan","afghanistan","china","middle_east","india","siam"],
    "au": ["indonesia","new_guinea","w_australia","e_australia"],
}
CONTINENT_BONUS = {"na":5,"sa":2,"eu":5,"af":3,"as":7,"au":2}
ALL_TERRITORIES  = list(ADJACENCY.keys())


def calc_reinforcements(player_idx, territories):
    owned = [t for t, d in territories.items() if d["owner"] == player_idx]
    base  = max(3, len(owned) // 3)
    bonus = sum(
        CONTINENT_BONUS[c]
        for c, terrs in CONTINENT_TERRITORIES.items()
        if all(territories[t]["owner"] == player_idx for t in terrs)
    )
    return base + bonus


def are_connected(from_t, to_t, territories, player_idx):
    visited, queue = set(), [from_t]
    while queue:
        curr = queue.pop(0)
        if curr == to_t:
            return True
        if curr in visited:
            continue
        visited.add(curr)
        for n in ADJACENCY[curr]:
            if n not in visited and territories[n]["owner"] == player_idx:
                queue.append(n)
    return False


def initial_state(players):
    n = len(players)
    setup_armies = {2: 40, 3: 35, 4: 30, 5: 25, 6: 20}[n]
    terr_list = ALL_TERRITORIES[:]
    random.shuffle(terr_list)
    territories = {t: {"owner": None, "armies": 0} for t in ALL_TERRITORIES}
    for i, t in enumerate(terr_list):
        owner = i % n
        territories[t] = {"owner": owner, "armies": 1}
    owned_counts      = [sum(1 for t in ALL_TERRITORIES if territories[t]["owner"] == i) for i in range(n)]
    armies_remaining  = [setup_armies - owned_counts[i] for i in range(n)]
    return {
        "phase":                 "setup",
        "turn":                  0,
        "current_player_idx":    0,
        "territories":           territories,
        "setup_armies_remaining": armies_remaining,
        "armies_to_place":       armies_remaining[0],
        "winner":                None,
        "last_attack":           None,
    }


def end_turn(state, room):
    n = len(room["players"])
    nxt = (state["current_player_idx"] + 1) % n
    for _ in range(n):
        if any(state["territories"][t]["owner"] == nxt for t in ALL_TERRITORIES):
            break
        nxt = (nxt + 1) % n
    state["turn"]               += 1
    state["current_player_idx"]  = nxt
    state["phase"]               = "reinforce"
    state["armies_to_place"]     = calc_reinforcements(nxt, state["territories"])
    state["last_attack"]         = None


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
        for rid, r in rooms.items() if r["status"] == "waiting"
    ]
    msg = json.dumps({"type": "lobby_update", "rooms": lobby_rooms})
    for c in clients.values():
        if not c["room_id"]:
            try:
                await c["ws"].send(msg)
            except Exception:
                pass


async def handle(cid, data):
    t      = data.get("type")
    client = clients.get(cid)
    if not client:
        return

    # ── Lobby ──────────────────────────────────────────────────────────────
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
            "status":    "waiting",
            "state":     None,
        }
        client["room_id"] = room_id
        await _send(cid, {"type": "room_created", "room_id": room_id, "color": color, "player_idx": 0})
        await _broadcast_lobby()

    elif t == "join_room":
        room_id = data.get("room_id")
        room    = rooms.get(room_id)
        if not room:
            await _send(cid, {"type": "error", "msg": "Room not found"}); return
        if room["status"] != "waiting":
            await _send(cid, {"type": "error", "msg": "Game already in progress"}); return
        if len(room["players"]) >= 6:
            await _send(cid, {"type": "error", "msg": "Room full"}); return
        if client["room_id"]:
            return
        idx   = len(room["players"])
        color = PLAYER_COLORS[idx]
        room["players"].append({"id": cid, "name": client["name"], "color": color, "idx": idx})
        client["room_id"] = room_id
        await _send(cid, {"type": "room_joined", "room_id": room_id, "color": color, "player_idx": idx})
        await _broadcast_room(room_id, {"type": "player_joined", "players": room["players"]})
        await _broadcast_lobby()

    elif t == "start_game":
        room_id = client["room_id"]
        room    = rooms.get(room_id)
        if not room or room["host"] != cid or room["status"] != "waiting":
            return
        if len(room["players"]) < 2:
            await _send(cid, {"type": "error", "msg": "Need at least 2 players"}); return
        room["status"] = "playing"
        room["state"]  = initial_state(room["players"])
        await _broadcast_room(room_id, {
            "type": "game_started", "players": room["players"], "state": room["state"]
        })
        await _broadcast_lobby()

    # ── Game actions ───────────────────────────────────────────────────────
    elif t == "place_armies":
        room_id = client["room_id"]
        room    = rooms.get(room_id)
        if not room or room["status"] != "playing":
            return
        state      = room["state"]
        player_idx = next((p["idx"] for p in room["players"] if p["id"] == cid), None)
        if player_idx != state["current_player_idx"]:
            await _send(cid, {"type": "error", "msg": "Not your turn"}); return

        territory = data.get("territory")
        count     = max(1, int(data.get("count", 1)))
        if territory not in state["territories"]:
            return
        if state["territories"][territory]["owner"] != player_idx:
            await _send(cid, {"type": "error", "msg": "You don't own that territory"}); return

        if state["phase"] == "setup":
            remaining = state["setup_armies_remaining"][player_idx]
            count     = min(count, remaining)
            if count <= 0:
                return
            state["territories"][territory]["armies"]     += count
            state["setup_armies_remaining"][player_idx]   -= count
            state["armies_to_place"] = state["setup_armies_remaining"][player_idx]
            if state["setup_armies_remaining"][player_idx] == 0:
                n    = len(room["players"])
                nxt  = (player_idx + 1) % n
                if all(state["setup_armies_remaining"][i] == 0 for i in range(n)):
                    state["phase"]            = "reinforce"
                    state["current_player_idx"] = 0
                    state["armies_to_place"]  = calc_reinforcements(0, state["territories"])
                else:
                    state["current_player_idx"] = nxt
                    state["armies_to_place"]    = state["setup_armies_remaining"][nxt]

        elif state["phase"] == "reinforce":
            if count > state["armies_to_place"]:
                await _send(cid, {"type": "error", "msg": "Not enough armies to place"}); return
            state["territories"][territory]["armies"] += count
            state["armies_to_place"]                 -= count
            if state["armies_to_place"] == 0:
                state["phase"] = "attack"

        await _broadcast_room(room_id, {"type": "state_update", "state": state})

    elif t == "attack":
        room_id = client["room_id"]
        room    = rooms.get(room_id)
        if not room or room["status"] != "playing":
            return
        state      = room["state"]
        player_idx = next((p["idx"] for p in room["players"] if p["id"] == cid), None)
        if player_idx != state["current_player_idx"]:
            await _send(cid, {"type": "error", "msg": "Not your turn"}); return
        if state["phase"] not in ("attack",):
            await _send(cid, {"type": "error", "msg": "Not in attack phase"}); return

        from_t       = data.get("from")
        to_t         = data.get("to")
        num_attackers = min(int(data.get("attackers", 3)), 3)

        if not from_t or not to_t or from_t not in state["territories"] or to_t not in state["territories"]:
            return
        if state["territories"][from_t]["owner"] != player_idx:
            await _send(cid, {"type": "error", "msg": "You don't own the attacker"}); return
        if state["territories"][to_t]["owner"] == player_idx:
            await _send(cid, {"type": "error", "msg": "Can't attack your own territory"}); return
        if to_t not in ADJACENCY[from_t]:
            await _send(cid, {"type": "error", "msg": "Not adjacent"}); return
        if state["territories"][from_t]["armies"] < 2:
            await _send(cid, {"type": "error", "msg": "Need at least 2 armies to attack"}); return

        num_attackers = min(num_attackers, state["territories"][from_t]["armies"] - 1)
        num_defenders = min(state["territories"][to_t]["armies"], 2)
        atk_dice      = sorted([random.randint(1, 6) for _ in range(num_attackers)], reverse=True)
        def_dice      = sorted([random.randint(1, 6) for _ in range(num_defenders)], reverse=True)
        atk_losses, def_losses = 0, 0
        for a, d in zip(atk_dice, def_dice):
            if a > d:
                def_losses += 1
            else:
                atk_losses += 1

        state["territories"][from_t]["armies"] -= atk_losses
        state["territories"][to_t]["armies"]   -= def_losses
        captured   = False
        old_owner  = state["territories"][to_t]["owner"]
        winner_name = None

        if state["territories"][to_t]["armies"] <= 0:
            captured = True
            move_in  = num_attackers - atk_losses
            state["territories"][to_t]["owner"]  = player_idx
            state["territories"][to_t]["armies"] = move_in
            state["territories"][from_t]["armies"] -= move_in
            all_owners = set(v["owner"] for v in state["territories"].values())
            if len(all_owners) == 1:
                winner_name      = room["players"][player_idx]["name"]
                state["winner"]  = winner_name
                room["status"]   = "finished"

        attack_result = {
            "from": from_t, "to": to_t,
            "atk_dice": atk_dice, "def_dice": def_dice,
            "atk_losses": atk_losses, "def_losses": def_losses,
            "captured": captured, "winner": winner_name,
        }
        state["last_attack"] = attack_result
        await _broadcast_room(room_id, {"type": "state_update", "state": state, "attack_result": attack_result})

    elif t == "end_attack":
        room_id = client["room_id"]
        room    = rooms.get(room_id)
        if not room or room["status"] != "playing":
            return
        state      = room["state"]
        player_idx = next((p["idx"] for p in room["players"] if p["id"] == cid), None)
        if player_idx != state["current_player_idx"] or state["phase"] != "attack":
            return
        state["phase"] = "fortify"
        await _broadcast_room(room_id, {"type": "state_update", "state": state})

    elif t == "fortify":
        room_id = client["room_id"]
        room    = rooms.get(room_id)
        if not room or room["status"] != "playing":
            return
        state      = room["state"]
        player_idx = next((p["idx"] for p in room["players"] if p["id"] == cid), None)
        if player_idx != state["current_player_idx"]:
            await _send(cid, {"type": "error", "msg": "Not your turn"}); return
        if state["phase"] != "fortify":
            await _send(cid, {"type": "error", "msg": "Not in fortify phase"}); return

        from_t = data.get("from")
        to_t   = data.get("to")
        count  = max(1, int(data.get("count", 1)))
        if not from_t or not to_t:
            return
        if state["territories"].get(from_t, {}).get("owner") != player_idx:
            await _send(cid, {"type": "error", "msg": "You don't own that territory"}); return
        if state["territories"].get(to_t, {}).get("owner") != player_idx:
            await _send(cid, {"type": "error", "msg": "You don't own that territory"}); return
        if not are_connected(from_t, to_t, state["territories"], player_idx):
            await _send(cid, {"type": "error", "msg": "Not connected through your territories"}); return
        count = min(count, state["territories"][from_t]["armies"] - 1)
        if count <= 0:
            return
        state["territories"][from_t]["armies"] -= count
        state["territories"][to_t]["armies"]   += count
        end_turn(state, room)
        await _broadcast_room(room_id, {"type": "state_update", "state": state})

    elif t == "end_turn":
        room_id = client["room_id"]
        room    = rooms.get(room_id)
        if not room or room["status"] != "playing":
            return
        state      = room["state"]
        player_idx = next((p["idx"] for p in room["players"] if p["id"] == cid), None)
        if player_idx != state["current_player_idx"]:
            return
        if state["phase"] not in ("attack", "fortify"):
            return
        end_turn(state, room)
        await _broadcast_room(room_id, {"type": "state_update", "state": state})


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
        room_id = clients[cid]["room_id"]
        if room_id and room_id in rooms:
            room  = rooms[room_id]
            name  = clients[cid]["name"] or "?"
            room["players"] = [p for p in room["players"] if p["id"] != cid]
            await _broadcast_room(room_id, {"type": "player_left", "name": name, "players": room["players"]})
            if not room["players"]:
                rooms.pop(room_id, None)
            elif room["host"] == cid and room["players"]:
                room["host"] = room["players"][0]["id"]
        clients.pop(cid, None)
        print(f"[-] {cid} disconnected (total={len(clients)})", flush=True)
        await _broadcast_lobby()


async def main():
    port = int(os.environ.get("PORT", 8765))
    print(f"Risk server listening on 0.0.0.0:{port}", flush=True)
    async with serve(handler, "0.0.0.0", port):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
