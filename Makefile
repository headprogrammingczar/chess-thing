build:
	$(MAKE) -C Stockfish/src build ARCH=x86-64

interact: build
	firefox http://127.0.0.1:8080/foo.html
	websocketd --port 8080 --address 127.0.0.1 --staticdir=frontend ./Stockfish/src/stockfish

interact-cli: build
	xboard -fUCI -fcp ./Stockfish/src/stockfish -sUCI -scp ./Stockfish/src/stockfish

.PHONEY: build interact
