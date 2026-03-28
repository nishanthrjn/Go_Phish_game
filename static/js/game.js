let myName = "", currentRoom = "", selectedRank = null, pollInterval = null, aiThinking = false;

async function startSolo() {
    myName = "Player";
    currentRoom = "solo_" + Math.random().toString(36).substring(7);
    await fetch('/join', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: myName }) });
    await fetch('/join', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: "Computer" }) });
    await fetch('/start', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom }) });
    
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    pollInterval = setInterval(updateGameState, 2000);
}

async function joinGame() {
    myName = document.getElementById('username').value.trim();
    currentRoom = document.getElementById('room-id').value.trim();
    if(!myName || !currentRoom) return alert("Enter Name & Table ID");
    
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
    if(data.message) document.getElementById('status-msg').innerText = data.message;
    aiThinking = false;
}

function renderUI(state) {
    document.getElementById('deck-size').innerText = state.deckCount;
    document.getElementById('p-books').innerText = state.yourBooks;
    
    const isMyTurn = state.currentTurn === myName;
    const turnIndicator = document.getElementById('turn-indicator');
    turnIndicator.innerText = isMyTurn ? "★ Your Turn ★" : `${state.currentTurn}'s Turn`;

    // Render Hand
    const pArea = document.getElementById('player-area');
    pArea.innerHTML = '';
    state.yourHand.forEach(card => {
        const div = document.createElement('div');
        div.className = 'card';
        if (card.suit === '♥' || card.suit === '♦') div.style.color = '#d40000';
        
        div.innerHTML = `<div>${card.rank}</div><div style="font-size:2.5rem">${card.suit}</div>`;
        
        if(selectedRank === card.rank) div.classList.add('selected');

        div.onclick = () => { 
            if(isMyTurn) { 
                selectedRank = card.rank;
                renderUI(state); // Re-render to show selection
                document.getElementById('ask-btn').disabled = false;
            }
        };
        pArea.appendChild(div);
    });

    // Handle Opponents
    const oppContainer = document.getElementById('opponents-container');
    const select = document.getElementById('target-player-select');
    oppContainer.innerHTML = ''; 
    select.innerHTML = '';

    const opponentNames = Object.keys(state.others);
    if (opponentNames.length === 1) {
        select.style.display = "none";
        select.innerHTML = `<option value="${opponentNames[0]}" selected></option>`;
    } else {
        select.style.display = "inline-block";
        select.innerHTML = '<option value="">Target Player</option>';
    }

    opponentNames.forEach(name => {
        const info = state.others[name];
        const isActive = state.currentTurn === name;
        oppContainer.innerHTML += `
            <div class="opponent-slot ${isActive ? 'active-turn' : ''}">
                <strong style="color:var(--gold)">${name}</strong><br>
                Books: ${info.books}<br>Cards: ${info.cards}
            </div>`;
        if (opponentNames.length > 1) select.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

async function performAsk() {
    const target = document.getElementById('target-player-select').value;
    if(!target || !selectedRank) return;

    const res = await fetch('/ask', { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ room_id: currentRoom, username: myName, target_player: target, rank: selectedRank }) });
    const data = await res.json();
    
    document.getElementById('status-msg').innerText = data.message;
    document.getElementById('ask-btn').disabled = true;
    selectedRank = null;
}

function showVictory(state) {
    let winner = "You";
    let maxBooks = state.yourBooks;
    for(const [name, info] of Object.entries(state.others)) {
        if(info.books > maxBooks) { maxBooks = info.books; winner = name; }
    }
    document.body.innerHTML = `<div class="screen-overlay"><div class="casino-card"><h1>${winner === "You" ? "🏆 YOU WIN!" : "Dealer Wins"}</h1><p>Final Score: ${maxBooks} Books</p><button class="gold-btn" onclick="location.reload()">New Game</button></div></div>`;
}