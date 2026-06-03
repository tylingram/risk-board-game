const SERVER_URL = "REPLACE_SERVER_URL";

// ── Session state ───────────────────────────────────────────────────────────
const myRoom      = sessionStorage.getItem("risk_room");
const myIdx       = parseInt(sessionStorage.getItem("risk_idx") || "0");
const myColor     = sessionStorage.getItem("risk_color") || "#e74c3c";
let   players     = JSON.parse(sessionStorage.getItem("risk_players") || "[]");
let   state       = JSON.parse(sessionStorage.getItem("risk_state")   || "null");

// ── Interaction state ───────────────────────────────────────────────────────
let selectedAttacker  = null;   // territory id chosen as attack source
let selectedFortifyFrom = null; // territory id chosen as fortify source
let modalCallback     = null;

// ── WebSocket ───────────────────────────────────────────────────────────────
let ws;
function connect() {
    ws = new WebSocket(SERVER_URL);
    ws.onopen    = () => {
        ws.send(JSON.stringify({ type: "join_lobby", name: players[myIdx]?.name || "Player" }));
        ws.send(JSON.stringify({ type: "join_room", room_id: myRoom }));
    };
    ws.onmessage = e => handleMsg(JSON.parse(e.data));
    ws.onclose   = () => addLog("Disconnected from server.", "system");
}
function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function handleMsg(msg) {
    if (msg.type === "state_update") {
        state = msg.state;
        logPhaseChange();
        if (msg.attack_result) showAttackResult(msg.attack_result);
        else render();
    } else if (msg.type === "player_left") {
        addLog(`${msg.name} disconnected.`, "system");
        players = msg.players;
    }
}

// ── Rendering ───────────────────────────────────────────────────────────────
function render() {
    if (!state) return;
    renderMap();
    renderTopBar();
    renderPlayerList();
    renderContinents();
    if (state.winner) showWin(state.winner);
}

function renderTopBar() {
    const curPlayer = players[state.current_player_idx];
    document.getElementById("turn-num").textContent       = state.turn + 1;
    document.getElementById("cur-player-name").textContent = curPlayer?.name || "?";
    document.getElementById("cur-player-name").style.color = curPlayer?.color || "#fff";

    const badge = document.getElementById("phase-badge");
    badge.textContent  = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
    badge.className    = "phase-badge phase-" + state.phase;

    const armiesBadge = document.getElementById("armies-badge");
    if (state.armies_to_place > 0 && state.phase !== "attack") {
        armiesBadge.style.display = "inline-block";
        document.getElementById("armies-count").textContent = state.armies_to_place;
    } else {
        armiesBadge.style.display = "none";
    }

    const isMyTurn = state.current_player_idx === myIdx && !state.winner;
    document.getElementById("end-attack-btn").style.display =
        isMyTurn && state.phase === "attack" ? "inline-block" : "none";
    document.getElementById("end-turn-btn").style.display =
        isMyTurn && (state.phase === "attack" || state.phase === "fortify") ? "inline-block" : "none";
}

function territoryFill(tid) {
    const owner = state.territories[tid].owner;
    if (owner === null || owner === undefined) return "#2c3e50";
    const p = players[owner];
    const base = p ? p.color : "#888";
    // Darken slightly for unowned look
    return base;
}

function renderMap() {
    const svg = document.getElementById("map-svg");
    // Build or update all territory elements
    for (const [tid, terr] of Object.entries(TERRITORIES)) {
        let poly = svg.querySelector(`#poly-${tid}`);
        let labelEl = svg.querySelector(`#label-${tid}`);
        let armBg   = svg.querySelector(`#armbg-${tid}`);
        let armText = svg.querySelector(`#arm-${tid}`);

        if (!poly) {
            // First render — create elements
            poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            poly.id = `poly-${tid}`;
            poly.classList.add("territory");
            poly.setAttribute("points", terr.points.map(p => p.join(",")).join(" "));
            poly.addEventListener("click", () => onTerritoryClick(tid));
            svg.appendChild(poly);

            labelEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            labelEl.id = `label-${tid}`;
            labelEl.classList.add("terr-label");
            labelEl.setAttribute("x", terr.center[0]);
            labelEl.setAttribute("y", terr.center[1] - 7);
            labelEl.textContent = terr.name;
            svg.appendChild(labelEl);

            armBg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            armBg.id = `armbg-${tid}`;
            armBg.classList.add("armies-bg");
            armBg.setAttribute("cx", terr.center[0]);
            armBg.setAttribute("cy", terr.center[1] + 5);
            armBg.setAttribute("r", "8");
            svg.appendChild(armBg);

            armText = document.createElementNS("http://www.w3.org/2000/svg", "text");
            armText.id = `arm-${tid}`;
            armText.classList.add("terr-armies");
            armText.setAttribute("x", terr.center[0]);
            armText.setAttribute("y", terr.center[1] + 5);
            svg.appendChild(armText);
        }

        // Update fill
        poly.setAttribute("fill", territoryFill(tid));

        // Update army count
        const armies = state.territories[tid]?.armies ?? 0;
        armText.textContent = armies;

        // Clear selection classes
        poly.classList.remove("selected","attack-source","attack-target","fortify-source","fortify-target","valid-target");
    }

    // Apply selection highlights
    applySelectionStyles();
}

function applySelectionStyles() {
    const phase   = state.phase;
    const isMyTurn = state.current_player_idx === myIdx;

    if (selectedAttacker) {
        document.getElementById(`poly-${selectedAttacker}`)?.classList.add("attack-source");
        // Highlight valid targets
        TERRITORIES[selectedAttacker].neighbors.forEach(n => {
            if (state.territories[n]?.owner !== myIdx) {
                document.getElementById(`poly-${n}`)?.classList.add("attack-target");
            }
        });
    }

    if (selectedFortifyFrom) {
        document.getElementById(`poly-${selectedFortifyFrom}`)?.classList.add("fortify-source");
        // Highlight all connected owned territories
        for (const tid of Object.keys(TERRITORIES)) {
            if (tid !== selectedFortifyFrom && state.territories[tid]?.owner === myIdx) {
                document.getElementById(`poly-${tid}`)?.classList.add("fortify-target");
            }
        }
    }
}

// ── Click handler ───────────────────────────────────────────────────────────
function onTerritoryClick(tid) {
    if (!state || state.winner) return;
    const isMyTurn = state.current_player_idx === myIdx;
    if (!isMyTurn) return;

    const phase = state.phase;
    const owner = state.territories[tid]?.owner;

    if (phase === "setup" || phase === "reinforce") {
        if (owner !== myIdx) return;
        const max = state.armies_to_place;
        if (max <= 0) return;
        showModal(
            "Place Armies",
            `Place armies on ${TERRITORIES[tid].name} (${max} remaining)`,
            1, max,
            count => send({ type: "place_armies", territory: tid, count })
        );

    } else if (phase === "attack") {
        if (owner === myIdx) {
            // Select as attacker (need 2+ armies)
            if (state.territories[tid].armies >= 2) {
                selectedAttacker = (selectedAttacker === tid) ? null : tid;
                renderMap();
            }
        } else if (selectedAttacker) {
            // Attack this territory
            if (!TERRITORIES[selectedAttacker].neighbors.includes(tid)) {
                addLog("Those territories aren't adjacent.", "system");
                return;
            }
            const maxAtk = Math.min(state.territories[selectedAttacker].armies - 1, 3);
            showModal(
                "Attack!",
                `Attack ${TERRITORIES[tid].name} from ${TERRITORIES[selectedAttacker].name} with how many armies? (max ${maxAtk})`,
                1, maxAtk,
                count => {
                    send({ type: "attack", from: selectedAttacker, to: tid, attackers: count });
                    selectedAttacker = null;
                }
            );
        }

    } else if (phase === "fortify") {
        if (owner !== myIdx) return;
        if (!selectedFortifyFrom) {
            if (state.territories[tid].armies < 2) return;
            selectedFortifyFrom = tid;
            renderMap();
        } else if (selectedFortifyFrom === tid) {
            selectedFortifyFrom = null;
            renderMap();
        } else {
            const maxMove = state.territories[selectedFortifyFrom].armies - 1;
            showModal(
                "Fortify",
                `Move armies from ${TERRITORIES[selectedFortifyFrom].name} to ${TERRITORIES[tid].name} (max ${maxMove})`,
                1, maxMove,
                count => {
                    send({ type: "fortify", from: selectedFortifyFrom, to: tid, count });
                    selectedFortifyFrom = null;
                }
            );
        }
    }
}

// ── Button actions ──────────────────────────────────────────────────────────
function sendEndAttack() {
    selectedAttacker = null;
    send({ type: "end_attack" });
}

function sendEndTurn() {
    selectedAttacker    = null;
    selectedFortifyFrom = null;
    send({ type: "end_turn" });
}

// ── Modal ───────────────────────────────────────────────────────────────────
function showModal(title, desc, min, max, cb) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-desc").textContent  = desc;
    const input = document.getElementById("modal-count");
    input.min   = min;
    input.max   = max;
    input.value = max;
    modalCallback = cb;
    document.getElementById("modal-overlay").classList.add("active");
    input.focus();
    input.select();
}

function modalConfirm() {
    const val = parseInt(document.getElementById("modal-count").value);
    document.getElementById("modal-overlay").classList.remove("active");
    if (modalCallback && !isNaN(val)) modalCallback(val);
    modalCallback = null;
}

function modalCancel() {
    document.getElementById("modal-overlay").classList.remove("active");
    modalCallback = null;
}

// ── Attack popup ────────────────────────────────────────────────────────────
function showAttackResult(result) {
    const popup = document.getElementById("attack-popup");
    document.getElementById("atk-dice-row").innerHTML =
        result.atk_dice.map(d => `<div class="die atk">${d}</div>`).join("");
    document.getElementById("def-dice-row").innerHTML =
        result.def_dice.map(d => `<div class="die def">${d}</div>`).join("");

    const atkName = players[state.current_player_idx]?.name || "Attacker";
    document.getElementById("attack-result-text").textContent =
        `${atkName} lost ${result.atk_losses} — Defender lost ${result.def_losses}`;
    document.getElementById("capture-text").textContent =
        result.captured ? `🏴 ${TERRITORIES[result.to]?.name} captured!` : "";

    popup.style.display = "block";
    // Auto-dismiss after 2.5s
    setTimeout(() => { popup.style.display = "none"; render(); }, 2500);

    // Add to log
    if (result.captured) {
        addLog(`${atkName} captured ${TERRITORIES[result.to]?.name}!`, "capture");
    } else {
        addLog(`Attack on ${TERRITORIES[result.to]?.name}: atk -${result.atk_losses}, def -${result.def_losses}`, "attack");
    }
    if (result.winner) {
        setTimeout(() => showWin(result.winner), 2600);
    }
}

function dismissAttackPopup() {
    document.getElementById("attack-popup").style.display = "none";
    render();
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function renderPlayerList() {
    const container = document.getElementById("players-container");
    container.innerHTML = players.map(p => {
        const terrCount = Object.values(state.territories).filter(t => t.owner === p.idx).length;
        const isActive  = p.idx === state.current_player_idx;
        const eliminated = terrCount === 0;
        return `<div class="player-row ${isActive ? "active" : ""} ${eliminated ? "eliminated" : ""}">
            <div class="player-color" style="background:${p.color}"></div>
            <span class="player-name">${p.name}${p.idx === myIdx ? " (you)" : ""}</span>
            <span class="player-terr">${terrCount}</span>
        </div>`;
    }).join("");
}

function renderContinents() {
    const container = document.getElementById("continents-container");
    container.innerHTML = Object.entries(CONTINENTS).map(([cid, cont]) => {
        const terrs  = Object.entries(TERRITORIES).filter(([,t]) => t.continent === cid);
        const owners = new Set(terrs.map(([tid]) => state.territories[tid]?.owner));
        let ownerText = "";
        if (owners.size === 1 && !owners.has(null) && !owners.has(undefined)) {
            const p = players[Array.from(owners)[0]];
            ownerText = p ? `<span style="color:${p.color}">${p.name}</span>` : "";
        }
        return `<div class="cont-row">
            <div class="cont-dot" style="background:${cont.color}"></div>
            <span class="cont-name">${cont.name}</span>
            <span class="cont-bonus">+${cont.bonus}</span>
            ${ownerText ? `<span class="cont-owner">&nbsp;${ownerText}</span>` : ""}
        </div>`;
    }).join("");
}

function addLog(text, cls = "") {
    const entries = document.getElementById("log-entries");
    const div = document.createElement("div");
    div.className = `log-entry ${cls}`;
    div.textContent = text;
    entries.prepend(div);
    // Keep last 50 entries
    while (entries.children.length > 50) entries.removeChild(entries.lastChild);
}

// ── Win ──────────────────────────────────────────────────────────────────────
function showWin(winnerName) {
    document.getElementById("win-text").textContent = `${winnerName} has conquered the world!`;
    document.getElementById("win-overlay").classList.add("active");
}

// ── Phase change log ─────────────────────────────────────────────────────────
let lastPhase = null, lastTurn = -1;
function logPhaseChange() {
    if (!state) return;
    if (state.turn !== lastTurn || state.phase !== lastPhase) {
        lastTurn  = state.turn;
        lastPhase = state.phase;
        const p = players[state.current_player_idx];
        if (p) addLog(`Turn ${state.turn + 1}: ${p.name} — ${state.phase}`, "system");
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────
if (!myRoom) {
    window.location.href = "index.html";
} else {
    // Keyboard shortcuts
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            selectedAttacker    = null;
            selectedFortifyFrom = null;
            modalCancel();
            renderMap();
        }
        if (e.key === "Enter" && document.getElementById("modal-overlay").classList.contains("active")) {
            modalConfirm();
        }
    });

    // Initial render from session state, then connect for live updates
    render();
    logPhaseChange();
    connect();

}
