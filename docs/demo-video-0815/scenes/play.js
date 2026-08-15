(function () {
  const tl = window.QAME_TIMELINE;
  if (!tl) {
    console.error("missing timeline.js — run generate_audio.sh first");
    return;
  }

  const MOVES = [
    { i: 4, m: "X", agent: "black", win: false },
    { i: 2, m: "O", agent: "white", win: false },
    { i: 8, m: "X", agent: "black", win: false },
    { i: 1, m: "O", agent: "white", win: false },
    { i: 0, m: "X", agent: "black", win: true },
  ];
  const WIN = [0, 4, 8];

  function cellsOf(board) {
    if (!board || board.dataset.ready) return board ? [...board.children] : [];
    for (let i = 0; i < 9; i++) {
      const d = document.createElement("div");
      d.className = "cell";
      board.appendChild(d);
    }
    board.dataset.ready = "1";
    return [...board.children];
  }

  function clearBoard(board) {
    cellsOf(board).forEach((c) => {
      c.textContent = "";
      c.classList.remove("mark", "win");
    });
  }

  function setTools(agent, which) {
    const root = document.getElementById(agent === "black" ? "ag-black" : "ag-white");
    if (!root) return;
    root.querySelectorAll(".tool").forEach((el) => {
      el.classList.toggle("on", Boolean(which) && el.dataset.tool === which);
    });
  }

  function setSeat(agent) {
    const s0 = document.getElementById("seat0");
    const s1 = document.getElementById("seat1");
    if (s0) s0.classList.toggle("active", agent === "black");
    if (s1) s1.classList.toggle("active", agent === "white");
  }

  function playBoard(board, span, { replay } = {}) {
    const cells = cellsOf(board);
    clearBoard(board);
    setTools("black", null);
    setTools("white", null);
    const step = Math.max(1.2, span / (MOVES.length + 1.15));
    MOVES.forEach((mv, n) => {
      window.setTimeout(() => {
        setSeat(mv.agent);
        setTools(mv.agent, "watch");
        setTools(mv.agent === "black" ? "white" : "black", null);
      }, step * (n + 0.15) * 1000);
      window.setTimeout(() => {
        setTools(mv.agent, "move");
        cells[mv.i].textContent = mv.m;
        cells[mv.i].classList.add("mark");
        if (mv.win) {
          WIN.forEach((i) => cells[i].classList.add("win"));
          setSeat(null);
          setTools("black", null);
          setTools("white", null);
        }
      }, step * (n + 0.55) * 1000);
    });
    if (replay) {
      /* same timing; badge already says replay */
    }
  }

  function playSteps(span) {
    const ids = ["st-create", "st-join", "st-start"];
    ids.forEach((id) => document.getElementById(id)?.classList.remove("on"));
    const step = span / 3.4;
    ids.forEach((id, n) => {
      window.setTimeout(() => document.getElementById(id)?.classList.add("on"), (0.35 + n * step) * 1000);
    });
  }

  function show(id) {
    document.querySelectorAll(".scene").forEach((el) => el.classList.toggle("on", el.id === id));
  }

  const params = new URLSearchParams(location.search);
  const only = params.get("scene");

  function runScene(sc, localStart, localEnd) {
    show(sc.id);
    const span = Math.max(0.8, localEnd - localStart);
    if (sc.id === "S3") playSteps(span);
    if (sc.id === "S4") playBoard(document.getElementById("board"), span);
    if (sc.id === "S5") playBoard(document.getElementById("board-replay"), span, { replay: true });
  }

  if (only) {
    const sc = tl.scenes.find((s) => s.id === only);
    if (!sc) {
      console.error("unknown scene", only);
      return;
    }
    const span = sc.end - sc.start;
    runScene(sc, 0, span);
    window.setTimeout(() => {
      window.__QAME_DEMO_DONE__ = true;
    }, span * 1000);
    return;
  }

  const t0 = performance.now();
  let last = "";
  function tick() {
    const t = (performance.now() - t0) / 1000;
    let cur = tl.scenes[0];
    for (const sc of tl.scenes) {
      if (t >= sc.start) cur = sc;
    }
    if (cur && last !== cur.id) {
      last = cur.id;
      runScene(cur, cur.start, cur.end);
    }
    if (t >= tl.duration) {
      window.__QAME_DEMO_DONE__ = true;
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
