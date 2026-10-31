
"use strict";

/* =========================================================
   CHESS PRACTICE
   chess.js 0.10.3 + local Stockfish Worker

   Local files:
     ./stockfish.js
     ./stockfish.wasm
     ./myfont.ttf
     ./assets/pieces/*.png
   ========================================================= */

(() => {
  /* ---------- DOM ---------- */

  const $ = (id) => document.getElementById(id);

  const el = {
    brandHome: $("brandHome"),
    openOptions: $("openOptions"),
    homeOptions: $("homeOptions"),
    playButton: $("playButton"),
    homeScreen: $("homeScreen"),
    gameScreen: $("gameScreen"),

    backHome: $("backHome"),
    flipButton: $("flipButton"),
    gameSubtitle: $("gameSubtitle"),

    board: $("board"),
    opponentStrip: $("opponentStrip"),
    humanStrip: $("humanStrip"),
    botCaption: $("botCaption"),
    humanCaption: $("humanCaption"),
    botTurnIndicator: $("botTurnIndicator"),
    humanTurnIndicator: $("humanTurnIndicator"),

    engineDot: $("engineDot"),
    statusText: $("statusText"),
    engineNote: $("engineNote"),

    moveCount: $("moveCount"),
    moveHistory: $("moveHistory"),

    undoButton: $("undoButton"),
    resetButton: $("resetButton"),
    optionsButton: $("optionsButton"),

    optionsModal: $("optionsModal"),
    closeOptions: $("closeOptions"),
    saveOptions: $("saveOptions"),
    humanColor: $("humanColor"),
    engineDepth: $("engineDepth"),
    engineDepthRange: $("engineDepthRange"),
    engineTier: $("engineTier"),
    hintDepth: $("hintDepth"),
    hintDepthRange: $("hintDepthRange"),
    hintTier: $("hintTier"),
    boardOrientation: $("boardOrientation"),

    promotionModal: $("promotionModal"),
    promotionOptions: $("promotionOptions"),
    toast: $("toast"),

    resultModal: $("resultModal"),
    resultCard: $("resultCard"),
    resultIcon: $("resultIcon"),
    resultEyebrow: $("resultEyebrow"),
    resultTitle: $("resultTitle"),
    resultDetail: $("resultDetail"),
    resultMoves: $("resultMoves"),
    resultSide: $("resultSide"),
    resultDepth: $("resultDepth"),
    resultPlayAgain: $("resultPlayAgain"),
    resultViewBoard: $("resultViewBoard"),
    confettiCanvas: $("confettiCanvas"),

    hintButton: $("hintButton"),
    hintCard: $("hintCard"),
    hintBest: $("hintBest"),
    hintEval: $("hintEval"),
    hintSummary: $("hintSummary"),
    hintLine: $("hintLine"),
    hintDismiss: $("hintDismiss")
  };

  /* ---------- Dependency checks ---------- */

  if (typeof window.Chess !== "function") {
    setStatus("chess.js tidak ditemukan", "error");
    setNote("Periksa koneksi internet dan file chess.js di index.html.");
    return;
  }

  /* ---------- Chess state ---------- */

  const game = new window.Chess();

  const settings = {
    humanColor: "w",
    depth: 14,
    hintDepth: 16,
    orientation: "player"
  };

  let orientation = "w";
  let gameStarted = false;
  let selectedSquare = null;
  let legalTargets = [];
  let pendingPromotion = null;

  let worker = null;
  let engineReady = false;
  let engineFailed = false;
  let engineBusy = false;
  let engineSearching = false;
  let pendingBotMove = false;
  let gameVersion = 0;
  let activeSearchVersion = -1;
  let latestEngineDepth = 0;

  let toastTimeout = null;
  let moveToAnimate = null;

  let hintState = null;
  let hintSearching = false;
  let hintSearchVersion = -1;
  let hintFen = "";
  let hintLatest = null;

  /*
   * Waktu minimum (ms) sebelum bot menjalankan langkahnya.
   * Jika Stockfish menemukan langkah lebih cepat dari ini,
   * langkahnya ditahan sampai waktu minimum terpenuhi.
   * Ubah angka ini untuk mengatur kecepatan bot.
   */
  const BOT_MIN_THINK_MS = 1800;
  let searchStartedAt = 0;

  /* ---------- Piece textures ---------- */

  const pieceTextures = {
    wK: "assets/pieces/piece-nostroke-angle-light-king.png",
    wQ: "assets/pieces/piece-nostroke-angle-light-queen.png",
    wR: "assets/pieces/piece-nostroke-angle-light-rook.png",
    wB: "assets/pieces/piece-nostroke-angle-light-bishop.png",
    wN: "assets/pieces/piece-nostroke-angle-light-knight.png",
    wP: "assets/pieces/piece-nostroke-angle-light-pawn.png",

    bK: "assets/pieces/piece-nostroke-angle-dark-king.png",
    bQ: "assets/pieces/piece-nostroke-angle-dark-queen.png",
    bR: "assets/pieces/piece-nostroke-angle-dark-rook.png",
    bB: "assets/pieces/piece-nostroke-angle-dark-bishop.png",
    bN: "assets/pieces/piece-nostroke-angle-dark-knight.png",
    bP: "assets/pieces/piece-nostroke-angle-dark-pawn.png"
  };

  const pieceGlyphs = {
    wK: "♔",
    wQ: "♕",
    wR: "♖",
    wB: "♗",
    wN: "♘",
    wP: "♙",

    bK: "♚",
    bQ: "♛",
    bR: "♜",
    bB: "♝",
    bN: "♞",
    bP: "♟"
  };

  const pieceNames = {
    k: "raja",
    q: "menteri",
    r: "benteng",
    b: "gajah",
    n: "kuda",
    p: "pion"
  };


  /* ---------- MP3 sound system ---------- */

  const soundFiles = {
    arenaStart: "sounds/arena-start.mp3",
    arenaEnd: "sounds/arena-end.mp3",
    win: "sounds/game-win.mp3",
    draw: "sounds/game-draw.mp3",
    lose: "sounds/game-lose.mp3",
    check: "sounds/move-check.mp3",
    move: "sounds/move.mp3",
    promote: "sounds/promote.mp3"
  };

  let soundEnabled = true;
  let lastResultSoundVersion = -1;

  function playAudio(name) {
    if (!soundEnabled || !soundFiles[name]) return;

    const audio = new Audio(soundFiles[name]);
    audio.preload = "auto";
    audio.volume = 0.8;

    const playback = audio.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch((error) => {
        console.warn("Audio tidak dapat diputar:", name, error);
      });
    }
  }

  function playMoveAudio(move) {
    // Promosi pion memiliki suara tersendiri.
    if (move && move.promotion) {
      playAudio("promote");
      return;
    }

    // Periksa apakah langkah terakhir memberi check.
    if (typeof game.in_check === "function" && game.in_check()) {
      playAudio("check");
      return;
    }

    playAudio("move");
  }

  function playResultAudio() {
    if (lastResultSoundVersion === gameVersion) return;

    const result = getGameResult();
    if (!result) return;

    lastResultSoundVersion = gameVersion;

    if (game.in_checkmate()) {
      const winner = oppositeColor(game.turn());
      playAudio(winner === settings.humanColor ? "win" : "lose");
    } else {
      playAudio("draw");
    }
  }

  /* ---------- UI helpers ---------- */

  function setStatus(message, type = "normal") {
    el.statusText.textContent = message;

    el.engineDot.classList.remove("busy", "error");

    if (type === "busy") {
      el.engineDot.classList.add("busy");
    } else if (type === "error") {
      el.engineDot.classList.add("error");
    }
  }

  function setNote(message) {
    el.engineNote.textContent = message;
  }

  function showToast(message) {
    clearTimeout(toastTimeout);

    el.toast.textContent = message;
    el.toast.classList.remove("hidden");

    toastTimeout = setTimeout(() => {
      el.toast.classList.add("hidden");
    }, 2400);
  }

  function showScreen(screen) {
    const showGame = screen === "game";

    el.homeScreen.classList.toggle("hidden", showGame);
    el.gameScreen.classList.toggle("hidden", !showGame);
  }

  function openOptions() {
    el.humanColor.value = settings.humanColor;
    setStrength(botStrength, settings.depth);
    setStrength(hintStrength, settings.hintDepth);
    el.boardOrientation.value = settings.orientation;

    el.optionsModal.classList.remove("hidden");
  }

  function closeOptions() {
    el.optionsModal.classList.add("hidden");
  }

  function oppositeColor(color) {
    return color === "w" ? "b" : "w";
  }

  function colorName(color) {
    return color === "w" ? "Putih" : "Hitam";
  }

  function isHumanTurn() {
    return game.turn() === settings.humanColor;
  }

  /* ---------- Board orientation ---------- */

  function getStartingOrientation() {
    if (settings.orientation === "white") return "w";
    if (settings.orientation === "black") return "b";
    return settings.humanColor;
  }

  function flipBoard() {
    orientation = oppositeColor(orientation);
    renderBoard();
  }

  function visibleSquares() {
    const squares = [];

    if (orientation === "w") {
      for (let rank = 8; rank >= 1; rank--) {
        for (let file = 0; file < 8; file++) {
          squares.push("abcdefgh"[file] + rank);
        }
      }
    } else {
      for (let rank = 1; rank <= 8; rank++) {
        for (let file = 7; file >= 0; file--) {
          squares.push("abcdefgh"[file] + rank);
        }
      }
    }

    return squares;
  }

  /* ---------- Piece rendering ---------- */

  function makePieceElement(piece, square) {
    const key = piece.color + piece.type.toUpperCase();

    const wrapper = document.createElement("span");
    wrapper.className =
      "piece " + (piece.color === "w" ? "piece-white" : "piece-black");

    wrapper.setAttribute("aria-hidden", "true");

    const fallback = document.createElement("span");
    fallback.className = "piece-fallback";
    fallback.textContent = pieceGlyphs[key] || "?";

    const image = document.createElement("img");
    image.className = "piece-image";
    image.src = pieceTextures[key];
    image.alt = "";
    image.draggable = false;

    image.addEventListener("error", () => {
      image.remove();
    }, { once: true });

    image.addEventListener("load", () => {
      fallback.remove();
    }, { once: true });

    wrapper.append(image, fallback);

    /*
     * Jika texture berhasil dimuat, event load menghapus fallback.
     * Jika gagal, event error menghapus img dan glyph tetap ada.
     */

    wrapper.dataset.square = square;

    return wrapper;
  }

  function findKingSquare(color) {
    const board = game.board();

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board[row][col];

        if (piece && piece.type === "k" && piece.color === color) {
          return "abcdefgh"[col] + (8 - row);
        }
      }
    }

    return null;
  }

  function slidePiece(from, to) {
    const movingPiece = el.board.querySelector(
      `.square[data-square="${to}"] .piece`
    );
    const fromSquare = el.board.querySelector(
      `.square[data-square="${from}"]`
    );
    const toSquare = movingPiece && movingPiece.closest(".square");

    if (!movingPiece || !fromSquare || !toSquare) return;

    const fromRect = fromSquare.getBoundingClientRect();
    const toRect = toSquare.getBoundingClientRect();

    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;

    if (dx === 0 && dy === 0) return;

    /*
     * Angkat kotak tujuan di atas kotak lain selama animasi,
     * supaya bidak tidak tertutup kotak yang digambar belakangan.
     */
    toSquare.style.zIndex = "20";

    const animation = movingPiece.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: "translate(0, -1%)" }
      ],
      {
        duration: 260,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    );

    const cleanup = () => {
      toSquare.style.zIndex = "";
    };

    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }

  function animateBoardPieces(move) {
    if (!move) return;

    slidePiece(move.from, move.to);

    /*
     * Rokade: benteng ikut bergeser bersama raja.
     */
    const rank = move.color === "w" ? "1" : "8";

    if (move.flags.includes("k")) {
      slidePiece("h" + rank, "f" + rank);
    } else if (move.flags.includes("q")) {
      slidePiece("a" + rank, "d" + rank);
    }
  }

  function renderBoard() {
    if (hintState && hintState.fen !== game.fen()) {
      hintState = null;
      renderHintPanel();
    }

    const activeHint = hintState;
    const squares = visibleSquares();
    const boardState = game.board();
    const lastMove = game.history({ verbose: true }).slice(-1)[0];

    const lastFrom = lastMove ? lastMove.from : null;
    const lastTo = lastMove ? lastMove.to : null;

    let checkedKing = null;

    if (typeof game.in_check === "function" && game.in_check()) {
      checkedKing = findKingSquare(game.turn());
    }

    const fragment = document.createDocumentFragment();

    for (const squareName of squares) {
      const file = squareName.charCodeAt(0) - 97;
      const rank = Number(squareName[1]);
      const piece = boardState[8 - rank][file];

      const square = document.createElement("button");
      square.type = "button";
      square.className = "square";
      square.dataset.square = squareName;
      square.setAttribute("role", "gridcell");

      const isLight = (file + rank) % 2 === 0;
      square.classList.add(isLight ? "light" : "dark");

      if (squareName === lastFrom || squareName === lastTo) {
        square.classList.add("last-move");
      }

      if (squareName === selectedSquare) {
        square.classList.add("selected");
      }

      if (legalTargets.includes(squareName)) {
        square.classList.add("legal-target");

        if (piece) square.classList.add("has-piece");
      }

      if (squareName === checkedKing) {
        square.classList.add("in-check");
      }

      if (activeHint) {
        if (squareName === activeHint.from) square.classList.add("hint-from");
        if (squareName === activeHint.to) square.classList.add("hint-to");
      }

      if (piece) {
        square.appendChild(makePieceElement(piece, squareName));

        square.setAttribute(
          "aria-label",
          squareName + ", " +
          colorName(piece.color) + " " +
          pieceNames[piece.type]
        );
      } else {
        square.setAttribute("aria-label", squareName);
      }

      /*
       * Koordinat ditampilkan pada tepi kiri dan bawah papan.
       */
      const showRank = orientation === "w"
        ? file === 0
        : file === 7;

      const showFile = orientation === "w"
        ? rank === 1
        : rank === 8;

      if (showRank) {
        const coordinate = document.createElement("span");
        coordinate.className = "coordinate";
        coordinate.textContent = String(rank);
        square.appendChild(coordinate);
      }

      if (showFile) {
        const coordinate = document.createElement("span");
        coordinate.className = "coordinate";
        coordinate.textContent = "abcdefgh"[file];
        square.appendChild(coordinate);
      }

      square.addEventListener("click", () => {
        handleSquareClick(squareName);
      });

      fragment.appendChild(square);
    }

    el.board.replaceChildren(fragment);

    if (moveToAnimate) {
      animateBoardPieces(moveToAnimate);
      moveToAnimate = null;
    }

    updatePlayerStrips();
  }

  /* ---------- Move history ---------- */

  function renderHistory() {
    const history = game.history({ verbose: true });

    el.moveCount.textContent =
      history.length + " ply";

    if (history.length === 0) {
      const empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "Langkah akan muncul di sini.";
      el.moveHistory.replaceChildren(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    for (let index = 0; index < history.length; index += 2) {
      const whiteMove = history[index];
      const blackMove = history[index + 1];

      const row = document.createElement("div");
      row.className = "move-row";

      const number = document.createElement("span");
      number.className = "move-number";
      number.textContent = (Math.floor(index / 2) + 1) + ".";

      const white = document.createElement("span");
      white.className = "move-san";
      white.textContent = whiteMove ? whiteMove.san : "";

      const black = document.createElement("span");
      black.className = "move-san";
      black.textContent = blackMove ? blackMove.san : "";

      row.append(number, white, black);
      fragment.appendChild(row);
    }

    el.moveHistory.replaceChildren(fragment);
    el.moveHistory.scrollTop = el.moveHistory.scrollHeight;
  }

  /* ---------- Player indicators ---------- */

  function updatePlayerStrips() {
    const botColor = oppositeColor(settings.humanColor);
    const humanColor = settings.humanColor;

    el.botCaption.textContent = colorName(botColor) + " · Stockfish";
    el.humanCaption.textContent = colorName(humanColor) + " · Kamu";

    const botTurn = gameStarted && game.turn() === botColor &&
      !game.game_over();

    const humanTurn = gameStarted && game.turn() === humanColor &&
      !game.game_over();

    el.opponentStrip.classList.toggle("active", botTurn);
    el.humanStrip.classList.toggle("active", humanTurn);

    el.botTurnIndicator.classList.toggle("hidden", !botTurn);
    el.humanTurnIndicator.classList.toggle("hidden", !humanTurn);
  }

  /* ---------- Game result ---------- */

  function getGameResult() {
    if (typeof game.in_checkmate === "function" && game.in_checkmate()) {
      const winner = oppositeColor(game.turn());

      return {
        title: "Skakmat!",
        detail: colorName(winner) + " menang."
      };
    }

    if (typeof game.in_stalemate === "function" && game.in_stalemate()) {
      return {
        title: "Remis",
        detail: "Stalemate — tidak ada langkah legal."
      };
    }

    if (typeof game.in_draw === "function" && game.in_draw()) {
      return {
        title: "Remis",
        detail: "Permainan berakhir seri."
      };
    }

    if (typeof game.in_threefold_repetition === "function" &&
        game.in_threefold_repetition()) {
      return {
        title: "Remis",
        detail: "Posisi yang sama terulang tiga kali."
      };
    }

    if (typeof game.insufficient_material === "function" &&
        game.insufficient_material()) {
      return {
        title: "Remis",
        detail: "Material tidak cukup untuk skakmat."
      };
    }

    return null;
  }

  function updateGameStatus() {
    if (!gameStarted) {
      setStatus(
        engineReady ? "Engine siap" : "Menyiapkan engine…",
        engineReady ? "normal" : "busy"
      );

      updatePlayerStrips();
      return;
    }

    const result = getGameResult();

    if (result) {
      playResultAudio();
      showResultScreen();
      selectedSquare = null;
      legalTargets = [];

      setStatus(result.title);
      setNote(result.detail);
      updatePlayerStrips();
      return;
    }

    if (engineFailed) {
      setStatus("Engine tidak tersedia", "error");
      setNote("Periksa stockfish.js dan stockfish.wasm.");
      updatePlayerStrips();
      return;
    }

    if (!engineReady) {
      setStatus("Menunggu Stockfish…", "busy");
      setNote("Papan sudah siap; engine masih dimuat.");
      updatePlayerStrips();
      return;
    }

    if (engineBusy || engineSearching) {
      setStatus(
        hintSearching ? "Mencari petunjuk…" : "Stockfish berpikir…",
        "busy"
      );

      setNote(
        latestEngineDepth > 0
          ? "Pencarian terakhir mencapai depth " + latestEngineDepth + "."
          : "Menganalisis posisi…"
      );

      updatePlayerStrips();
      return;
    }

    if (isHumanTurn()) {
      setStatus("Giliran kamu");
      setNote("Pilih bidak lalu pilih kotak tujuan.");
    } else {
      setStatus("Giliran Stockfish", "busy");
      setNote("Menunggu langkah engine…");
    }

    updatePlayerStrips();
  }

  /* ---------- Selection and legal moves ---------- */

  function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
  }

  function selectSquare(squareName) {
    const piece = game.get(squareName);

    if (!piece || piece.color !== settings.humanColor) {
      clearSelection();
      renderBoard();
      return;
    }

    selectedSquare = squareName;

    legalTargets = game.moves({
      square: squareName,
      verbose: true
    }).map((move) => move.to);

    renderBoard();
  }

  function handleSquareClick(squareName) {
    if (!gameStarted || engineFailed || !engineReady) return;
    if (engineBusy || engineSearching) return;
    if (game.game_over()) return;

    if (!isHumanTurn()) {
      showToast("Tunggu giliran kamu.");
      return;
    }

    const clickedPiece = game.get(squareName);

    if (!selectedSquare) {
      if (clickedPiece && clickedPiece.color === settings.humanColor) {
        selectSquare(squareName);
      }
      return;
    }

    if (squareName === selectedSquare) {
      clearSelection();
      renderBoard();
      return;
    }

    if (clickedPiece && clickedPiece.color === settings.humanColor) {
      selectSquare(squareName);
      return;
    }

    if (!legalTargets.includes(squareName)) {
      clearSelection();
      renderBoard();
      return;
    }

    const movingPiece = game.get(selectedSquare);
    const isPromotion =
      movingPiece &&
      movingPiece.type === "p" &&
      (squareName[1] === "8" || squareName[1] === "1");

    if (isPromotion) {
      pendingPromotion = {
        from: selectedSquare,
        to: squareName
      };

      clearSelection();
      renderBoard();
      showPromotionOptions(movingPiece.color);
      return;
    }

    makeHumanMove(selectedSquare, squareName);
  }

  function makeHumanMove(from, to, promotion = "q") {
    let move;

    try {
      move = game.move({
        from,
        to,
        promotion
      });
    } catch (error) {
      move = null;
    }

    pendingPromotion = null;
    el.promotionModal.classList.add("hidden");
    clearSelection();

    if (!move) {
      renderBoard();
      return false;
    }

    gameVersion++;
    playMoveAudio(move);

    moveToAnimate = move;
    renderBoard();
    renderHistory();
    updateGameStatus();
    maybeStartBot();

    return true;
  }

  /* ---------- Pawn promotion ---------- */

  function showPromotionOptions(color) {
    const options = [
      { type: "q", glyph: color === "w" ? "♕" : "♛", label: "Menteri" },
      { type: "r", glyph: color === "w" ? "♖" : "♜", label: "Benteng" },
      { type: "b", glyph: color === "w" ? "♗" : "♝", label: "Gajah" },
      { type: "n", glyph: color === "w" ? "♘" : "♞", label: "Kuda" }
    ];

    const fragment = document.createDocumentFragment();

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "promotion-choice";
      button.textContent = option.glyph;
      button.title = option.label;
      button.setAttribute("aria-label", option.label);

      button.addEventListener("click", () => {
        if (!pendingPromotion) return;

        const { from, to } = pendingPromotion;
        makeHumanMove(from, to, option.type);
      });

      fragment.appendChild(button);
    }

    el.promotionOptions.replaceChildren(fragment);
    el.promotionModal.classList.remove("hidden");
  }

  /* ---------- Stockfish UCI worker ---------- */

  function startEngine() {
    if (worker || engineFailed) return;

    try {
      worker = new Worker("./stockfish.js");
    } catch (error) {
      engineFailed = true;
      setStatus("Gagal memuat engine", "error");
      setNote(String(error));
      return;
    }

    worker.onmessage = (event) => {
      const message = String(event.data || "").trim();

      if (!message) return;

      handleEngineMessage(message);
    };

    worker.onerror = (event) => {
      engineFailed = true;
      engineReady = false;
      engineBusy = false;
      engineSearching = false;
      hintSearching = false;

      setStatus("Stockfish mengalami error", "error");
      setNote(event.message || "Gagal menjalankan Web Worker.");
      updatePlayerStrips();
    };

    setStatus("Memuat Stockfish…", "busy");
    setNote("Memulai Worker lokal…");

    sendEngineCommand("uci");
  }

  function sendEngineCommand(command) {
    if (!worker) return;

    try {
      worker.postMessage(command);
    } catch (error) {
      engineFailed = true;
      setStatus("Gagal mengirim perintah", "error");
      setNote(String(error));
    }
  }

  function handleEngineMessage(message) {
    if (message === "uciok") {
      sendEngineCommand("setoption name Threads value 1");
      sendEngineCommand("setoption name Hash value 32");
      sendEngineCommand("isready");
      return;
    }

    if (message === "readyok") {
      engineReady = true;

      setStatus("Stockfish siap");
      setNote("Engine lokal aktif · 1 thread · Hash 32 MB");

      updateGameStatus();
      maybeStartBot();
      return;
    }

    if (message.startsWith("info ")) {
      const depthMatch = message.match(/\bdepth\s+(\d+)/);
      const scoreMatch = message.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);

      if (depthMatch) {
        latestEngineDepth = Number(depthMatch[1]);
      }

      if (hintSearching) {
        captureHintInfo(message);
      }

      if (engineBusy) {
        let note = "Menganalisis posisi";

        if (depthMatch) {
          note += " · depth " + depthMatch[1];
        }

        if (scoreMatch) {
          if (scoreMatch[1] === "mate") {
            note += " · mate " + scoreMatch[2];
          } else {
            const pawns = Number(scoreMatch[2]) / 100;
            note += " · evaluasi " + (pawns > 0 ? "+" : "") + pawns.toFixed(2);
          }
        }

        setNote(note);
      }

      return;
    }

    if (message.startsWith("bestmove ")) {
      if (hintSearching) {
        handleHintResult(message);
      } else {
        handleBestMove(message);
      }
    }
  }

  function cancelEngineSearch() {
    /*
     * Jangan mulai pencarian baru sampai Worker selesai mengembalikan
     * bestmove dari pencarian yang dihentikan.
     */
    if (engineBusy && worker) {
      pendingBotMove = false;
      sendEngineCommand("stop");
    }
  }

  function maybeStartBot() {
    if (!gameStarted || !engineReady || engineFailed) return;
    if (game.game_over()) {
      updateGameStatus();
      return;
    }

    if (game.turn() === settings.humanColor) {
      updateGameStatus();
      return;
    }

    pendingBotMove = true;

    if (engineBusy || engineSearching) {
      return;
    }

    pendingBotMove = false;
    startBotSearch();
  }

  function startBotSearch() {
    if (!gameStarted || !engineReady || engineFailed) return;
    if (engineBusy || engineSearching || game.game_over()) return;
    if (game.turn() === settings.humanColor) return;

    engineBusy = true;
    engineSearching = true;
    activeSearchVersion = gameVersion;
    latestEngineDepth = 0;
    searchStartedAt = performance.now();

    setStatus("Stockfish berpikir…", "busy");
    setNote("Menganalisis posisi…");
    updatePlayerStrips();

    const depth = Math.max(
      1,
      Math.min(30, Number(settings.depth) || 14)
    );

    sendEngineCommand("position fen " + game.fen());
    sendEngineCommand("go depth " + depth);
  }

  function handleBestMove(message) {
    const parts = message.split(/\s+/);
    const uci = parts[1];

    const searchVersion = activeSearchVersion;

    engineBusy = false;
    engineSearching = false;
    activeSearchVersion = -1;

    /*
     * Jika papan di-reset atau undo ketika engine berpikir,
     * hasil pencarian lama tidak boleh diterapkan.
     */
    if (searchVersion !== gameVersion) {
      if (pendingBotMove) {
        pendingBotMove = false;
        maybeStartBot();
      } else {
        updateGameStatus();
      }

      return;
    }

    if (!gameStarted || game.game_over()) {
      updateGameStatus();
      return;
    }

    if (game.turn() === settings.humanColor) {
      updateGameStatus();
      return;
    }

    if (!uci || uci === "(none)" || uci === "0000") {
      updateGameStatus();
      return;
    }

    /*
     * Tahan langkah bot jika ditemukan terlalu cepat.
     * Versi permainan dicek lagi setelah jeda, supaya reset/undo
     * selama menunggu tidak menerapkan langkah yang sudah usang.
     */
    const wait = Math.max(
      0,
      BOT_MIN_THINK_MS - (performance.now() - searchStartedAt)
    );

    if (wait === 0) {
      applyBotMove(uci);
      return;
    }

    setTimeout(() => {
      if (searchVersion !== gameVersion) return;
      if (!gameStarted || game.game_over() || isHumanTurn()) return;

      applyBotMove(uci);
    }, wait);
  }

  function applyBotMove(uci) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;

    let move = null;

    try {
      move = game.move({
        from,
        to,
        promotion
      });
    } catch (error) {
      move = null;
    }

    if (!move) {
      setStatus("Langkah engine tidak valid", "error");
      setNote("Periksa versi dan kompatibilitas stockfish.js.");
      renderBoard();
      return;
    }

    gameVersion++;
    playMoveAudio(move);

    clearSelection();
    moveToAnimate = move;
    renderBoard();
    renderHistory();
    updateGameStatus();
  }

  /* ---------- Hint (petunjuk) ---------- */

  /*
   * Batas waktu pengaman analisis petunjuk. Kekuatan petunjuk diatur
   * lewat depth di pengaturan; waktu ini mencegah analisis tanpa akhir
   * di perangkat yang lambat.
   */
  const HINT_MAX_MS = 20000;

  function describeHint(hint) {
    if (hint.scoreType === "mate") {
      if (hint.scoreValue > 0) {
        return {
          tag: "Mat dalam " + hint.scoreValue,
          summary: "Skakmat paksa ditemukan. Ikuti jalur di bawah sampai menang."
        };
      }

      if (hint.scoreValue < 0) {
        return {
          tag: "Terancam mat",
          summary:
            "Posisimu sulit. Ini pertahanan terbaik; lawan bisa skakmat dalam " +
            Math.abs(hint.scoreValue) + " langkah jika bermain sempurna."
        };
      }
    }

    const note = " Belum ada skakmat paksa yang terlihat, jadi ini jalur " +
      "terbaik sampai depth " + hint.depth + ". Jalur bisa berubah " +
      "mengikuti balasan lawan.";

    if (hint.scoreType === "cp") {
      const pawns = hint.scoreValue / 100;
      const tag = (pawns > 0 ? "+" : "") + pawns.toFixed(2);

      if (pawns >= 3) return { tag, summary: "Kamu unggul besar." + note };
      if (pawns >= 0.8) return { tag, summary: "Kamu lebih unggul." + note };
      if (pawns > -0.8) return { tag, summary: "Posisi seimbang." + note };

      return { tag, summary: "Kamu sedikit tertinggal." + note };
    }

    return { tag: "", summary: "Langkah terbaik menurut Stockfish." };
  }

  function uciLineToSan(fen, uciMoves) {
    const scratch = new window.Chess(fen);
    const line = [];

    for (const uci of uciMoves) {
      if (!uci || uci.length < 4) break;

      let move = null;

      try {
        move = scratch.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined
        });
      } catch (error) {
        move = null;
      }

      if (!move) break;

      line.push({ san: move.san, color: move.color });
    }

    return line;
  }

  function renderHintPanel() {
    if (!hintState && !hintSearching) {
      el.hintCard.classList.add("hidden");
      return;
    }

    el.hintCard.classList.remove("hidden");

    if (!hintState) {
      el.hintBest.textContent = "Menganalisis…";
      el.hintSummary.textContent = "Stockfish sedang mencari langkah terbaik.";
      el.hintEval.textContent = "";
      el.hintLine.replaceChildren();
      return;
    }

    const info = describeHint(hintState);

    el.hintBest.textContent = hintState.line[0].san;
    el.hintSummary.textContent = info.summary;
    el.hintEval.textContent = info.tag;

    const parts = hintState.fen.split(" ");
    let number = Number(parts[5]) || 1;

    const fragment = document.createDocumentFragment();

    const addText = (className, text) => {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      fragment.appendChild(span);
    };

    hintState.line.forEach((move, index) => {
      if (move.color === "w") {
        addText("hint-num", number + ".");
      } else if (index === 0) {
        addText("hint-num", number + "…");
      }

      addText("hint-move" + (index === 0 ? " first" : ""), move.san);

      if (move.color === "b") number++;
    });

    el.hintLine.replaceChildren(fragment);
  }

  function clearHint() {
    hintState = null;
    renderHintPanel();
  }

  function requestHint() {
    if (!gameStarted) return;

    if (engineFailed || !engineReady) {
      showToast("Engine belum siap.");
      return;
    }

    if (game.game_over()) {
      showToast("Permainan sudah selesai.");
      return;
    }

    if (!isHumanTurn()) {
      showToast("Petunjuk hanya tersedia di giliran kamu.");
      return;
    }

    if (engineBusy || engineSearching) return;

    clearSelection();

    engineBusy = true;
    engineSearching = true;
    hintSearching = true;
    hintSearchVersion = gameVersion;
    hintFen = game.fen();
    hintLatest = null;
    latestEngineDepth = 0;
    hintState = null;

    setStatus("Mencari petunjuk…", "busy");
    setNote("Menganalisis posisi…");

    renderBoard();
    renderHintPanel();

    sendEngineCommand("position fen " + hintFen);
    sendEngineCommand(
      "go depth " + settings.hintDepth + " movetime " + HINT_MAX_MS
    );
  }

  function captureHintInfo(message) {
    // Baris dengan batas atas/bawah belum final; abaikan.
    if (/\b(lowerbound|upperbound)\b/.test(message)) return;

    const pvMatch = message.match(/\bpv\s+(.+)$/);
    if (!pvMatch) return;

    const depthMatch = message.match(/\bdepth\s+(\d+)/);
    const scoreMatch = message.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);

    hintLatest = {
      depth: depthMatch ? Number(depthMatch[1]) : 0,
      scoreType: scoreMatch ? scoreMatch[1] : null,
      scoreValue: scoreMatch ? Number(scoreMatch[2]) : 0,
      pv: pvMatch[1].trim().split(/\s+/)
    };
  }

  function handleHintResult(message) {
    const bestUci = message.split(/\s+/)[1];

    const requestVersion = hintSearchVersion;
    const requestedFen = hintFen;
    const latest = hintLatest;

    engineBusy = false;
    engineSearching = false;
    hintSearching = false;
    hintLatest = null;

    // Posisi berubah (reset/undo/menu) saat engine menganalisis.
    if (
      requestVersion !== gameVersion ||
      !gameStarted ||
      game.fen() !== requestedFen
    ) {
      renderHintPanel();

      if (pendingBotMove) {
        pendingBotMove = false;
        maybeStartBot();
      } else {
        updateGameStatus();
      }

      return;
    }

    if (!bestUci || bestUci === "(none)" || bestUci === "0000") {
      renderHintPanel();
      updateGameStatus();
      showToast("Tidak ada langkah yang bisa disarankan.");
      return;
    }

    let pv = latest && latest.pv.length ? latest.pv : [bestUci];

    // Pastikan langkah pertama sama dengan langkah terbaik final.
    if (pv[0] !== bestUci) pv = [bestUci];

    const line = uciLineToSan(requestedFen, pv);

    if (line.length === 0) {
      renderHintPanel();
      updateGameStatus();
      return;
    }

    hintState = {
      fen: requestedFen,
      from: bestUci.slice(0, 2),
      to: bestUci.slice(2, 4),
      line,
      depth: latest ? latest.depth : 0,
      scoreType: latest ? latest.scoreType : null,
      scoreValue: latest ? latest.scoreValue : 0
    };

    renderBoard();
    renderHintPanel();
    updateGameStatus();
  }

  /* ---------- Strength controls (slider + angka) ---------- */

  const STRENGTH_MIN = 1;
  const STRENGTH_MAX = 20;

  function clampStrength(value, fallback) {
    const number = Math.round(Number(value));

    if (!Number.isFinite(number)) return fallback;

    return Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, number));
  }

  function strengthTier(value) {
    if (value <= 4) return "Pemula";
    if (value <= 9) return "Menengah";
    if (value <= 14) return "Kuat";
    if (value <= 18) return "Sangat kuat";
    return "Maksimal";
  }

  function paintStrength(control) {
    const value = clampStrength(control.range.value, STRENGTH_MIN);
    const percent =
      ((value - STRENGTH_MIN) / (STRENGTH_MAX - STRENGTH_MIN)) * 100;

    control.range.style.setProperty("--fill", percent + "%");
    control.tier.textContent = strengthTier(value);
  }

  function setStrength(control, value) {
    const clamped = clampStrength(value, control.fallback);

    control.range.value = String(clamped);
    control.number.value = String(clamped);
    paintStrength(control);

    return clamped;
  }

  function readStrength(control) {
    return clampStrength(control.number.value, control.fallback);
  }

  function bindStrength(control) {
    control.range.min = String(STRENGTH_MIN);
    control.range.max = String(STRENGTH_MAX);
    control.number.min = String(STRENGTH_MIN);
    control.number.max = String(STRENGTH_MAX);

    // Geser slider: angka ikut berubah.
    control.range.addEventListener("input", () => {
      control.number.value = control.range.value;
      paintStrength(control);
    });

    // Ketik angka: slider ikut bergerak selama angkanya valid.
    control.number.addEventListener("input", () => {
      const raw = control.number.value.trim();
      if (raw === "") return;

      const typed = Number(raw);
      if (!Number.isFinite(typed)) return;

      control.range.value = String(
        Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, Math.round(typed)))
      );
      paintStrength(control);
    });

    // Selesai mengetik: paksa ke batas yang valid.
    const commit = () => {
      setStrength(control, control.number.value);
    };

    control.number.addEventListener("change", commit);
    control.number.addEventListener("blur", commit);

    control.number.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
        control.number.blur();
      }
    });
  }

  const botStrength = {
    range: el.engineDepthRange,
    number: el.engineDepth,
    tier: el.engineTier,
    fallback: 14
  };

  const hintStrength = {
    range: el.hintDepthRange,
    number: el.hintDepth,
    tier: el.hintTier,
    fallback: 16
  };

  bindStrength(botStrength);
  bindStrength(hintStrength);

  /* ---------- Result screen & confetti ---------- */

  const RESULT_DELAY_MS = 900;
  const CONFETTI_COLORS = [
    "#cba6f7", "#f5c2e7", "#f9e2af", "#a6e3a1", "#89b4fa", "#fab387"
  ];

  let resultTimer = null;
  let lastResultShownVersion = -1;
  let confettiFrame = 0;

  function prefersReducedMotion() {
    return Boolean(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function getOutcome() {
    if (game.in_checkmate()) {
      return oppositeColor(game.turn()) === settings.humanColor
        ? "win"
        : "lose";
    }

    return "draw";
  }

  function stopConfetti() {
    cancelAnimationFrame(confettiFrame);
    confettiFrame = 0;

    const ctx = el.confettiCanvas.getContext("2d");

    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.confettiCanvas.width, el.confettiCanvas.height);
    }
  }

  function launchConfetti() {
    if (prefersReducedMotion()) return;

    const canvas = el.confettiCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    stopConfetti();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const scale = Math.max(0.6, Math.min(1.3, height / 800));
    const rand = (min, max) => min + Math.random() * (max - min);
    const particles = [];

    const addParticle = (x, y, vx, vy, delay) => {
      particles.push({
        x,
        y,
        vx,
        vy,
        delay,
        size: rand(6, 11) * Math.max(0.8, scale),
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.25, 0.25),
        wobble: rand(0, Math.PI * 2),
        circle: Math.random() < 0.25,
        color: CONFETTI_COLORS[
          Math.floor(Math.random() * CONFETTI_COLORS.length)
        ]
      });
    };

    // Dua meriam dari sudut bawah layar.
    for (let i = 0; i < 55; i++) {
      const speed = rand(11, 21) * scale;

      const leftAngle = -Math.PI / 2 + rand(0.15, 0.75);
      addParticle(
        0, height,
        Math.cos(leftAngle) * speed,
        Math.sin(leftAngle) * speed,
        0
      );

      const rightAngle = -Math.PI / 2 - rand(0.15, 0.75);
      addParticle(
        width, height,
        Math.cos(rightAngle) * speed,
        Math.sin(rightAngle) * speed,
        0
      );
    }

    // Gelombang kedua jatuh dari atas.
    for (let i = 0; i < 50; i++) {
      addParticle(
        rand(0, width), rand(-60, -10),
        rand(-1.5, 1.5), rand(1, 4) * scale,
        rand(500, 1300)
      );
    }

    const startedAt = performance.now();

    const frame = (now) => {
      const elapsed = now - startedAt;
      const fade = Math.max(0, 1 - Math.max(0, elapsed - 3600) / 1000);

      ctx.clearRect(0, 0, width, height);

      let alive = 0;

      for (const p of particles) {
        if (elapsed < p.delay) {
          alive++;
          continue;
        }

        p.vx *= 0.99;
        p.vy = p.vy * 0.992 + 0.28 * scale;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.wobble += 0.14;

        if (p.y > height + 30) continue;

        alive++;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;

        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const flutter = Math.abs(Math.cos(p.wobble)) * 0.8 + 0.2;
          ctx.fillRect(-p.size / 2, -p.size * flutter / 4, p.size,
                       p.size * flutter / 2);
        }

        ctx.restore();
      }

      if (alive > 0 && elapsed < 4800) {
        confettiFrame = requestAnimationFrame(frame);
      } else {
        stopConfetti();
      }
    };

    confettiFrame = requestAnimationFrame(frame);
  }

  function hideResult() {
    clearTimeout(resultTimer);
    resultTimer = null;

    el.resultModal.classList.add("hidden");
    stopConfetti();

    const frame = el.board.closest(".board-frame");
    if (frame) frame.classList.remove("win-glow");
  }

  function showResultScreen() {
    if (lastResultShownVersion === gameVersion) return;

    const result = getGameResult();
    if (!result) return;

    lastResultShownVersion = gameVersion;

    const outcome = getOutcome();

    const copy = {
      win: {
        icon: "♛",
        eyebrow: "SKAKMAT",
        title: "Kamu menang!",
        detail: "Mantap! Kamu berhasil mengalahkan Stockfish.",
        action: "Main lagi"
      },
      lose: {
        icon: "♚",
        eyebrow: "SKAKMAT",
        title: "Stockfish menang",
        detail: "Tinggal sedikit lagi. Coba lagi dan balas!",
        action: "Balas dendam"
      },
      draw: {
        icon: "½",
        eyebrow: "REMIS",
        title: "Permainan seri",
        detail: result.detail,
        action: "Main lagi"
      }
    }[outcome];

    el.resultCard.dataset.outcome = outcome;
    el.resultIcon.textContent = copy.icon;
    el.resultEyebrow.textContent = copy.eyebrow;
    el.resultTitle.textContent = copy.title;
    el.resultDetail.textContent = copy.detail;
    el.resultPlayAgain.textContent = copy.action;
    el.resultMoves.textContent = String(
      Math.ceil(game.history().length / 2)
    );
    el.resultSide.textContent = colorName(settings.humanColor);
    el.resultDepth.textContent = String(settings.depth);

    const version = gameVersion;

    clearTimeout(resultTimer);

    // Beri waktu agar animasi langkah terakhir terlihat dulu.
    resultTimer = setTimeout(() => {
      if (version !== gameVersion || !gameStarted) return;

      el.resultModal.classList.remove("hidden");

      if (outcome === "win") {
        const frame = el.board.closest(".board-frame");
        if (frame) frame.classList.add("win-glow");

        launchConfetti();
      }

      el.resultPlayAgain.focus();
    }, RESULT_DELAY_MS);
  }

  /* ---------- Game lifecycle ---------- */

  function startNewGame() {
    /*
     * Versi posisi berubah agar hasil pencarian lama tidak dipakai.
     */
    gameVersion++;
    pendingBotMove = false;
    clearSelection();
    pendingPromotion = null;

    el.promotionModal.classList.add("hidden");
    hideResult();

    if (engineBusy) {
      cancelEngineSearch();
    }

    game.reset();
    lastResultSoundVersion = -1;
    lastResultShownVersion = -1;
    playAudio("arenaStart");

    gameStarted = true;
    orientation = getStartingOrientation();

    showScreen("game");
    renderBoard();
    renderHistory();

    el.gameSubtitle.textContent =
      "Kamu (" + colorName(settings.humanColor) + ") vs Stockfish";

    updateGameStatus();

    if (!engineReady && !engineFailed) {
      setStatus("Menunggu Stockfish…", "busy");
      setNote("Engine sedang dimuat. Giliran pertama akan berjalan otomatis.");
    } else {
      maybeStartBot();
    }
  }

  function resetGame() {
    startNewGame();
    showToast("Permainan di-reset.");
  }

  function undoTurn() {
    if (!gameStarted) return;

    /*
     * Hentikan pencarian yang sedang berjalan. bestmove lama akan
     * diabaikan berdasarkan gameVersion.
     */
    gameVersion++;
    pendingBotMove = false;

    if (engineBusy) {
      cancelEngineSearch();
    }

    clearSelection();
    pendingPromotion = null;
    el.promotionModal.classList.add("hidden");
    hideResult();

    const history = game.history({ verbose: true });

    if (history.length === 0) {
      renderBoard();
      renderHistory();
      updateGameStatus();
      showToast("Belum ada langkah untuk di-undo.");
      maybeStartBot();
      return;
    }

    /*
     * Hapus langkah terakhir engine jika sudah bermain,
     * lalu hapus langkah terakhir pemain bila tersedia.
     * Jika bot baru saja memulai game sebagai hitam/putih,
     * undo tetap aman saat baru ada satu langkah.
     */
    const lastMove = history[history.length - 1];

    if (lastMove) {
      game.undo();
    }

    const remaining = game.history({ verbose: true });
    const previousMove = remaining[remaining.length - 1];

    if (previousMove && previousMove.color === settings.humanColor) {
      game.undo();
    }

    renderBoard();
    renderHistory();
    updateGameStatus();
    maybeStartBot();

    showToast("Langkah terakhir di-undo.");
  }

  function goHome() {
    const wasPlaying = gameStarted;
    gameStarted = false;
    if (wasPlaying) playAudio("arenaEnd");
    gameVersion++;
    pendingBotMove = false;

    if (engineBusy) {
      cancelEngineSearch();
    }

    clearSelection();
    pendingPromotion = null;
    el.promotionModal.classList.add("hidden");
    hideResult();

    showScreen("home");
    updateGameStatus();
  }

  /* ---------- Options ---------- */

  function saveOptions() {
    const nextColor = el.humanColor.value === "b" ? "b" : "w";
    const nextDepth = readStrength(botStrength);
    const nextHintDepth = readStrength(hintStrength);
    const nextOrientation = el.boardOrientation.value;

    settings.humanColor = nextColor;
    settings.depth = nextDepth;
    settings.hintDepth = nextHintDepth;

    settings.orientation =
      ["player", "white", "black"].includes(nextOrientation)
        ? nextOrientation
        : "player";

    closeOptions();

    if (gameStarted) {
      /*
       * Warna pemain adalah pengaturan untuk permainan baru.
       * Jangan mengubah warna sisi ketika permainan sudah berjalan,
       * karena itu dapat membuat giliran pemain tidak konsisten.
       */
      showToast(
        "Pengaturan disimpan. Warna pemain berlaku di game baru."
      );
    } else {
      orientation = getStartingOrientation();
      showToast("Pengaturan berhasil disimpan.");
    }

    if (engineReady) {
      setNote(
        "Engine lokal aktif · depth pilihan: " + settings.depth
      );
    }
  }

  /* ---------- Event listeners ---------- */

  el.playButton.addEventListener("click", startNewGame);
  el.backHome.addEventListener("click", goHome);

  el.brandHome.addEventListener("click", (event) => {
    event.preventDefault();
    goHome();
  });

  el.openOptions.addEventListener("click", openOptions);
  el.homeOptions.addEventListener("click", openOptions);
  el.optionsButton.addEventListener("click", openOptions);

  el.closeOptions.addEventListener("click", closeOptions);
  el.saveOptions.addEventListener("click", saveOptions);

  el.flipButton.addEventListener("click", () => {
    flipBoard();
    showToast("Orientasi papan dibalik.");
  });

  el.resultPlayAgain.addEventListener("click", startNewGame);
  el.resultViewBoard.addEventListener("click", hideResult);

  el.resultModal.addEventListener("click", (event) => {
    if (event.target === el.resultModal) {
      hideResult();
    }
  });

  el.hintButton.addEventListener("click", requestHint);
  el.hintDismiss.addEventListener("click", clearHint);

  el.undoButton.addEventListener("click", undoTurn);
  el.resetButton.addEventListener("click", resetGame);

  el.optionsModal.addEventListener("click", (event) => {
    if (event.target === el.optionsModal) {
      closeOptions();
    }
  });

  el.promotionModal.addEventListener("click", (event) => {
    if (event.target === el.promotionModal) {
      pendingPromotion = null;
      el.promotionModal.classList.add("hidden");
      renderBoard();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOptions();
      hideResult();

      if (!el.promotionModal.classList.contains("hidden")) {
        pendingPromotion = null;
        el.promotionModal.classList.add("hidden");
        renderBoard();
      }
    }
  });

  /* ---------- Initial state ---------- */

  showScreen("home");
  renderBoard();
  renderHistory();
  updatePlayerStrips();

  setStatus("Menyiapkan engine…", "busy");
  setNote("Memuat Stockfish lokal…");

  startEngine();
})();

