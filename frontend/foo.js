var chess;
var boardObject;
var boardDOM;
var fishSocket;
var fishQueue;
var fishData;
var fishDataDOM;
var engineHistoryDOM;
var pgnHistoryDOM;
var fenDOM;
var tooltipDOM;
var focusedIdea;

// for convenience, various lookup tables for squares
// annoyingly, bitboards and square indexes are transposed
// because stockfish decided to write enum Square : int wrong
var hex_digits = {
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "a": 10,
  "b": 11,
  "c": 12,
  "d": 13,
  "e": 14,
  "f": 15,
};
var bitboard_squares = [
  "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8",
  "b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8",
  "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8",
  "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8",
  "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8",
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8",
  "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8",
  "h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8",
];
var square_to_index = {};
var index_to_square = [
  "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1",
  "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
  "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
  "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
  "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
  "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
  "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
  "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
]
index_to_square.forEach(function(val, index) {
  square_to_index[val] = index;
});

// some data stockfish returns isn't a term that's added into
// the total score, but just something interesting to look at
// these are the ideas that aren't full terms, so in some places
// they can be handled correctly
var sub_ideas = {
  6: true,
  7: true
};

// stockfish can't handle multiple queries at a time
// and more complicated gui elements may need to test
// multiple hypothetical positions in quick succession
// a simple message queue implementation will make all
// the async bookkeeping easier to manage
function FishQueue(socket) {
  this.socket = socket;
  this.socket.addEventListener('message', (event) => {
    if (match = event.data.match(/^JSON (.*)$/)) {
      this.active_callback(JSON.parse(match[1]));
      this.active_callback = undefined;
      this.loop();
    }
  });
  this.queue = [];
  this.active_callback;
  // queue up a sequence to send to stockfish,
  // and what to do with the JSON it sends back
  // this function is unsafe if the sequence doesn't
  // provoke stockfish to send back a JSON line
  this.push = function(send_strings, callback) {
    this.queue.push({
      send_strings: send_strings,
      callback: callback,
    });
  };
  // handle a single item in the queue
  // this is called from loop
  // loop is reentered when the JSON text is received
  this.go = function(item) {
    this.active_callback = item.callback;
    item.send_strings.forEach((string) => {
      this.socket.send(string);
    });
  };
  // the main loop running constantly in the background
  // if the queue is empty, wait for it to have something
  // if the queue has things in it, immediately start
  // processing them
  this.loop = function() {
    if (this.queue.length == 0) {
      setTimeout(() => {
        this.loop();
      }, 100);
    } else {
      item = this.queue.shift();
      this.go(item);
    }
  };
}

function stockfishOnMessage(json) {
  fishData = json;
  fishDataDOM.val(JSON.stringify(fishData, null, 1));
  // remove enpassant field, stockfish is stupid about setting it
  var remote_fen_array = fishData.fen.split(/ /);
  var local_fen_array = fenDOM.val().split(/ /);
  remote_fen_array.splice(3, 1);
  local_fen_array.splice(3, 1);
  var remote_fen = remote_fen_array.join(" ");
  var local_fen = local_fen_array.join(" ");
  // sanity-check that engine and client are in sync
  if (remote_fen != local_fen) {
    console.log("ERROR - stockfish and browser out of sync");
    console.log("stockfish fen - " + remote_fen);
    console.log("local fen     - " + local_fen);
  }
  onMouseoutSquare(undefined, undefined);
  console.log("remote position - " + fishData.fen);
}

function update(engine_moves, options = {}) {
  // sets the board state and position textarea inputs,
  // then submits the position to stockfish
  engineHistoryDOM.val("position startpos moves "+engine_moves);
  chess = new Chess();
  engine_moves.split(/ /).forEach(function(val) {
    chess.move(val, {sloppy: true});
  });
  pgnHistoryDOM.val(chess.pgn());
  fenDOM.val(chess.fen());
  if (! options.skip_board) {
    // when the state is updated from board drag-and-drop,
    // the board behaves weirdly when it's modified from within
    // the event handling logic, so allow the option to skip it
  }
  setTimeout(function() {
    boardObject.position(chess.fen());
    fishQueue.push([engineHistoryDOM.val(), "eval"], stockfishOnMessage);
  }, 100);
  console.log("client position - "+chess.fen());
}

function bitboard_to_squares(bitboard_str) {
  // read hex string one digit at a time
  // because javascript numbers are a floaty mess
  var squares = [];
  var digitnum;
  var index = 0;
  bitboard_str.split("").reverse().forEach(function(digit) {
    digitnum = hex_digits[digit];
    for (var n = 0; n < 4; n++) {
      if (digitnum % 2 == 1) {
        squares.push(index_to_square[index]);
      }
      index++;
      digitnum = digitnum >>> 1;
    }
  });
  return squares;
}

function onMouseoutSquare (square, piece) {
  boardDOM.find(".square-55d63").attr("data-highlight", "");
  boardDOM.find(".square-55d63").attr("data-color", "");

  fishData.ideas.white[focusedIdea].forEach(function(data, index) {
    if (data.mg < 0) {
      square = index_to_square[index];
      boardDOM.find('.square-' + square).attr("data-color", "red");
    } else if (data.mg > 0) {
      square = index_to_square[index];
      boardDOM.find('.square-' + square).attr("data-color", "green");
    }
  });

  tooltipDOM.css("display", "none");
}

function onMouseoverSquare(square, piece) {
  // highlight other squares
  index = square_to_index[square];
  data = fishData.ideas.white[focusedIdea][index];
  boardDOM.find('.square-' + square).attr("data-color", "blue");
  bitboard_to_squares(data.why).forEach(function(square) {
    boardDOM.find('.square-' + square).attr("data-highlight", "red");
  });

  total_for_square = 0;
  // can't do regular forEach, but apparently this works...
  for (var idea in fishData.ideas.white) {
    // only add up the terms that contribute to a position's final score
    if (!sub_ideas[idea]) {
      total_for_square += fishData.ideas.white[idea][index].mg;
    }
  }

  // update tooltip text
  tooltipDOM.css("display", "block");
  tooltipDOM.html(`Score for ${square}<br>This idea: ${data.mg}<br>Total: ${total_for_square.toFixed(2)}`);
}

function onDrop(source, target, piece, newPos, oldPos, orientation) {
  var moves = engineHistoryDOM.val() + " "+source+target;
  moves = moves.replace(/^position startpos moves ?/, "");
  update(moves, {skip_board: true});
}

$(document).ready(function() {
  // initialize local rules engine
  chess = new Chess();

  // initialize interactive chessboard

  boardObject = Chessboard('board1', {
    position: "start",
    draggable: true,
    sparePieces: true,
    onMouseoverSquare: onMouseoverSquare,
    onMouseoutSquare: onMouseoutSquare,
    onDrop: onDrop,
  });
  boardDOM = $("#board1");

  // initialize engine-formatted turn history
  engineHistoryDOM = $("#engine-history");
  engineHistoryDOM.val("position startpos moves");
  engineHistoryDOM.change(function(e) {
    if (! engineHistoryDOM.val().match(/^position startpos moves/)) {
      engineHistoryDOM.val("position startpos moves");
    }
    var moves = engineHistoryDOM.val();
    moves = moves.replace(/^position startpos moves ?/, "");
    update(moves);
  });

  // initialize pgn-formatted turn history
  pgnHistoryDOM = $("#pgn-history");
  pgnHistoryDOM.change(function(e) {
    var engineMoves = "";
    var parser = new Chess();
    parser.load_pgn(pgnHistoryDOM.val());
    parser.history({verbose: true}).forEach(function(move) {
      engineMoves += move.from + move.to + " ";
    });
    engineMoves.replace(/ $/, '');
    update(engineMoves);
  });

  // initialize fen-formatted board state
  fenDOM = $("#fen-string");
  fenDOM.val(chess.fen());

  // initialize tooltips
  tooltipDOM = $("#tooltip");
  $(document).mousemove(function(event) {
    tooltipDOM.css("top", event.pageY + 20);
    tooltipDOM.css("left", event.pageX + 20);
  });

  // initialize stockfish json display
  fishDataDOM = $("#stockfish-json");

  // initialize idea display
  focusedIdea = 0;
  $(".idea").click(function(event) {
    $(".idea").attr("data-selected", "false");
    $(event.delegateTarget).attr("data-selected", "true");
    focusedIdea = $(event.delegateTarget).attr("data-idea");
    onMouseoutSquare(undefined, undefined);
    event.stopPropagation();
  });

  // initialize stockfish websocket
  fishSocket = new WebSocket('ws://localhost:8080');
  fishQueue = new FishQueue(fishSocket);
  fishSocket.addEventListener('open', function (event) {
    fishQueue.push([engineHistoryDOM.val(), "eval"], stockfishOnMessage);
  });
  fishQueue.loop();
});
