build:
	$(MAKE) -C Stockfish/src build ARCH=x86-64

browser:
	firefox http://127.0.0.1:8080/foo.html &

run: browser websocket

websocket: build
	websocketd --port 8080 --address 127.0.0.1 --staticdir=frontend ./Stockfish/src/stockfish

cli: build
	xboard -fUCI -fcp ./Stockfish/src/stockfish -sUCI -scp ./Stockfish/src/stockfish

.PHONEY: build browser run websocket cli
