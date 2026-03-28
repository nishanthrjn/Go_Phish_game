from flask import Flask, render_template, jsonify, request
import random
from collections import Counter

app = Flask(__name__)

# --- Game Engine Logic ---
class GoFishEngine:
    def __init__(self):
        self.ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
        self.suits = ['♠', '♥', '♦', '♣']
        self.deck = [{"rank": r, "suit": s} for r in self.ranks for s in self.suits]
        random.shuffle(self.deck)
        
        self.players = {}  # {username: {"hand": [], "books": 0}}
        self.player_order = [] 
        self.turn_index = 0
        self.game_started = False
        self.ai_memory = set() # Stores ranks the player has asked for

    def add_player(self, username):
        if username not in self.players and len(self.players) < 5:
            self.players[username] = {"hand": [], "books": 0}
            self.player_order.append(username)
            return True
        return False

    def start_game(self):
        if len(self.players) < 2:
            return False
        self.game_started = True
        count = 7 if len(self.players) <= 3 else 5
        for _ in range(count):
            for p in self.player_order:
                if self.deck:
                    self.players[p]["hand"].append(self.deck.pop())
        self.check_all_books()
        return True

    def check_all_books(self):
        """Checks for sets of 4 and draws ONE replacement ONLY if deck exists."""
        for name in self.player_order:
            hand = self.players[name]["hand"]
            counts = Counter(c['rank'] for c in hand)
            
            # 1. Remove books
            for rank, count in counts.items():
                if count == 4:
                    self.players[name]["books"] += 1
                    self.players[name]["hand"] = [c for c in hand if c['rank'] != rank]
            
            # 2. THE REFILL: Only if hand is empty AND deck has cards
            if not self.players[name].get("hand") and self.deck:
                self.players[name]["hand"].append(self.deck.pop())

    def next_turn(self):
        """Cycles to the next player who has cards."""
        num_players = len(self.player_order)
        for _ in range(num_players):
            self.turn_index = (self.turn_index + 1) % num_players
            if self.players[self.player_order[self.turn_index]]["hand"]:
                return 
        # If no one has cards, the game is over.

    def get_state(self, viewer_name):
        total_books = sum(p["books"] for p in self.players.values())
        no_cards_left = all(len(p["hand"]) == 0 for p in self.players.values())
        
        return {
            "gameStarted": self.game_started,
            "gameOver": total_books == 13 or (self.game_started and no_cards_left),
            "currentTurn": self.player_order[self.turn_index] if self.player_order else None,
            "yourHand": self.players.get(viewer_name, {}).get("hand", []),
            "yourBooks": self.players.get(viewer_name, {}).get("books", 0),
            "others": {name: {"cards": len(info["hand"]), "books": info["books"]} 
                       for name, info in self.players.items() if name != viewer_name},
            "deckCount": len(self.deck)
        }

rooms = {}

# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/join', methods=['POST'])
def join():
    data = request.json
    room_id, username = data.get('room_id'), data.get('username')
    if room_id not in rooms: rooms[room_id] = GoFishEngine()
    rooms[room_id].add_player(username)
    return jsonify(rooms[room_id].get_state(username))

@app.route('/start', methods=['POST'])
def start():
    room_id = request.json.get('room_id')
    if room_id in rooms and rooms[room_id].start_game():
        return jsonify({"status": "started"})
    return jsonify({"status": "error", "message": "Need at least 2 players"})

@app.route('/ask', methods=['POST'])
def ask():
    data = request.json
    room_id, asker, target, rank = data['room_id'], data['username'], data['target_player'], data['rank']
    game = rooms.get(room_id)
    
    # --- AI MEMORY LOGIC ---
    # Computer remembers what you ask for
    if target == "Computer":
        game.ai_memory.add(rank)

    # Only skip if the hand is empty AND there is no deck to draw from
    if not game.players[asker]["hand"] and not game.deck:
        game.next_turn()
        return jsonify({"message": f"{asker} has no cards left. Passing...", "state": game.get_state(asker)})
    
    if not game.players[asker]["hand"] and game.deck:
        game.players[asker]["hand"].append(game.deck.pop())
    
    # Standard Match Logic
    t_hand = game.players[target]["hand"]
    matches = [c for c in t_hand if c['rank'] == rank]
    
    if matches:
        game.players[asker]["hand"].extend(matches)
        game.players[target]["hand"] = [c for c in t_hand if c['rank'] != rank]
        game.check_all_books()
        return jsonify({"message": f"Success! Took {len(matches)} {rank}(s)!", "state": game.get_state(asker), "goFish": False})
    
    # Go Fish Logic
    drawn_rank = None
    if game.deck:
        drawn = game.deck.pop()
        game.players[asker]["hand"].append(drawn)
        drawn_rank = drawn['rank']
        game.check_all_books()

    if drawn_rank == rank:
        return jsonify({"message": f"Go Fish! You caught a {rank}! Go again.", "state": game.get_state(asker), "goFish": False})
    
    game.next_turn()
    return jsonify({"message": f"Go Fish! No {rank}s found.", "state": game.get_state(asker), "goFish": True})


@app.route('/ai-move', methods=['POST'])
def ai_move():
    """Improved AI move route that returns the state for V2 UI syncing."""
    data = request.json
    room_id = data.get('room_id')
    game = rooms.get(room_id)
    
    # In Solo mode, the human player is "Player"
    viewer = "Player" 

    if not game or game.player_order[game.turn_index] != "Computer": 
        return jsonify({})

    hand = game.players["Computer"]["hand"]
    
    if not hand:
        game.next_turn()
        return jsonify({"message": "🤖 Computer passes.", "state": game.get_state(viewer)})

    # AI Decision Logic
    my_ranks = [c['rank'] for c in hand]
    # AI checks memory first!
    overlap = [r for r in my_ranks if r in game.ai_memory]
    rank_to_ask = random.choice(overlap) if overlap else Counter(my_ranks).most_common(1)[0][0]
    
    target = [p for p in game.player_order if p != "Computer"][0]
    p_hand = game.players[target]["hand"]
    matches = [c for c in p_hand if c['rank'] == rank_to_ask]
    
    if matches:
        game.players["Computer"]["hand"].extend(matches)
        game.players[target]["hand"] = [c for c in p_hand if c['rank'] != rank_to_ask]
        game.check_all_books()
        return jsonify({"message": f"🤖 Computer took your {rank_to_ask}s!", "state": game.get_state(viewer)})
    
    if game.deck: 
        game.players["Computer"]["hand"].append(game.deck.pop())
    
    game.check_all_books()
    game.next_turn()
    
    return jsonify({"message": f"🤖 Computer asked for {rank_to_ask}s and fished.", "state": game.get_state(viewer)})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)