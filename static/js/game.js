let myName = "", currentRoom = "", selectedRank = null, pollInterval = null, aiThinking = false;

/**
 * START SOLO MODE: Auto-adds "Computer" and starts immediately.
 */
async function startSolo() {
    myName = "Player";
    currentRoom = "solo_" + Math.random().toString(36).substring(7);
    
    // Add You
    await fetch('/join', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: myName }) });
    
    // Add AI
    await fetch('/join', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: "Computer" }) });
    
    // Start Game
    await fetch('/start', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom }) });
    
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    pollInterval = setInterval(updateGameState, 2000);
}

/**
 * JOIN FAMILY MODE: Waits for others in the lobby.
 */
async function joinGame() {
    myName = document.getElementById('username').value.trim();
    currentRoom = document.getElementById('room-id').value.trim();
    if(!myName || !currentRoom) return alert("Please enter Name and Room!");
    
    await fetch('/join', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: myName }) });

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('waiting-screen').style.display = 'block';
    document.getElementById('display-room').innerText = currentRoom;
    pollInterval = setInterval(updateGameState, 2000);
}

async function triggerStart() {
    await fetch('/start', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom }) });
}

/**
 * THE HEARTBEAT: Checks the server for updates.
 */
async function updateGameState() {
    const res = await fetch('/join', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: myName }) });
    const state = await res.json();

    if (state.gameOver) {
        clearInterval(pollInterval);
        showVictory(state);
        return;
    }

    if (state.gameStarted) {
        // Handle Turn Skipping if Hand is Empty
        if (state.currentTurn === myName && state.yourHand.length === 0 && state.deckCount === 0) {
            console.log("No cards left, skipping turn...");
            await fetch('/ask', { method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ room_id: currentRoom, username: myName, target_player: Object.keys(state.others)[0], rank: 'SKIP' }) });
            return;
        }

        document.getElementById('waiting-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
        renderUI(state);
        
        if (state.currentTurn === "Computer" && !aiThinking) {
            aiThinking = true;
            setTimeout(handleAI, 2000);
        }
    }
}

async function handleAI() {
    const res = await fetch('/ai-move', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom }) });
    const data = await res.json();
    
    if(data.message) {
        const msgBox = document.getElementById('status-msg');
        msgBox.innerText = data.message;
        msgBox.style.color = "var(--accent-color)"; 
    }
    aiThinking = false;
}

/**
 * THE RENDERER: Draws the board with V2 Classes and Positioning.
 */
function renderUI(state) {
    // 1. Handle HUD (Top Stats)
    document.getElementById('deck-size').innerText = state.deckCount;
    document.getElementById('p-books').innerText = state.yourBooks;
    
    const isMyTurn = state.currentTurn === myName;
    const turnIndicator = document.getElementById('turn-indicator');
    turnIndicator.innerText = isMyTurn ? "★ YOUR TURN ★" : `${state.currentTurn.toUpperCase()}'S TURN`;
    turnIndicator.style.color = isMyTurn ? "var(--accent-color)" : "var(--muted-color)";

    // 2. Render Your Cards (Vertical Fan/Stack Logic)
    const pArea = document.getElementById('player-area');
    pArea.innerHTML = '';
    
    state.yourHand.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'card-v2';
        
        // Suit color logic
        if (card.suit === '♥' || card.suit === '♦') div.style.color = '#e53e3e'; // Modern Red
        else div.style.color = '#1a202c'; // Modern Black
        
        div.innerHTML = `<span>${card.rank}</span><span>${card.suit}</span>`;
        
        // Fan Positioning: Cards overlap by 35px
        div.style.left = `${35 * index}px`; 
        div.style.zIndex = index; 

        div.onclick = () => { 
            if(isMyTurn) { 
                selectedRank = card.rank; 
                // Remove 'selected' class from all cards, then add to this one
                document.querySelectorAll('.card-v2').forEach(c => c.classList.remove('selected'));
                div.classList.add('selected');
                document.getElementById('ask-btn').disabled = false; 
            }
        };
        pArea.appendChild(div);
    });

    // 3. Handle Opponents & Target Box
    const oppContainer = document.getElementById('opponents-container');
    const select = document.getElementById('target-player-select');
    oppContainer.innerHTML = ''; 
    select.innerHTML = '';

    const opponentNames = Object.keys(state.others);

    if (opponentNames.length === 1) {
        // SOLO: Hide the target dropdown
        select.classList.add("d-none");
        select.innerHTML = `<option value="${opponentNames[0]}" selected></option>`;
    } else {
        // MULTIPLAYER: Show the target dropdown
        select.classList.remove("d-none");
        select.innerHTML = '<option value="">Who?</option>';
    }

    opponentNames.forEach(name => {
        const info = state.others[name];
        
        // Use V2 Sidebar Slot styling
        const div = document.createElement('div');
        div.className = `opponent-slot-v2 ${state.currentTurn === name ? 'active-turn' : ''}`;
        div.innerHTML = `
            <div class="opp-name">${name.toUpperCase()}</div>
            <div class="opp-stats">
                Books: ${info.books} | Cards: ${info.cards}
            </div>
        `;
        oppContainer.appendChild(div);
        
        if (opponentNames.length > 1) {
            select.innerHTML += `<option value="${name}">${name}</option>`;
        }
    });
}

/**
 * THE ACTION: Sending your move to Python.
 */
async function performAsk() {
    const target = document.getElementById('target-player-select').value;
    if(!target || !selectedRank) return;

    const res = await fetch('/ask', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: myName, target_player: target, rank: selectedRank }) });
    const data = await res.json();
    
    const msgBox = document.getElementById('status-msg');
    msgBox.innerText = data.message;
    msgBox.style.color = "white"; 
    document.getElementById('ask-btn').disabled = true;
    
    // Clear selection visually
    selectedRank = null;
    document.querySelectorAll('.card-v2').forEach(c => c.classList.remove('selected'));
}

/**
 * THE FINALE: Show the results.
 */
function showVictory(state) {
    let winner = "You";
    let maxBooks = state.yourBooks;

    for(const [name, info] of Object.entries(state.others)) {
        if(info.books > maxBooks) {
            maxBooks = info.books;
            winner = name;
        }
    }

    document.getElementById('game-screen').innerHTML = `
        <div class="full-vh flex-col flex-center text-center">
            <h1 style="font-family: var(--font-logo); font-size: 4rem; color: var(--accent-color);">
                ${winner === "You" ? "VICTORY" : winner.toUpperCase() + " WINS"}
            </h1>
            <p style="font-size: 1.5rem;">Final Score: ${maxBooks} Books</p>
            <button onclick="location.reload()" class="btn-main" style="width: auto; margin-top: 2rem;">RESTART SESSION</button>
        </div>
    `;
}