(function () {
  const tl = window.QAME_TIMELINE;
  if (!tl) {
    console.error("missing timeline.js — run generate_audio.sh first");
    return;
  }
  const still = document.getElementById("still");
  const board = document.getElementById("board");
  const turnEl = document.getElementById("turn");
  const resultEl = document.getElementById("result");
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const d = document.createElement("div");
    d.className = "cell";
    board.appendChild(d);
    cells.push(d);
  }
  const moves = [
    { i: 0, m: "X" },
    { i: 3, m: "O" },
    { i: 1, m: "X" },
    { i: 4, m: "O" },
    { i: 2, m: "X" },
  ];

  function show(id) {
    document.querySelectorAll(".scene").forEach((el) => el.classList.toggle("on", el.id === id));
    const url = new URL(`stills/${id.toLowerCase()}.png`, window.location.href);
    fetch(url, { method: "HEAD" })
      .then((r) => {
        if (r.ok) {
          still.style.backgroundImage = `url('${url}')`;
          still.classList.add("on");
        } else still.classList.remove("on");
      })
      .catch(() => still.classList.remove("on"));
  }

  function playBoard(sceneStart, sceneEnd) {
    cells.forEach((c) => {
      c.textContent = "";
      c.classList.remove("mark");
    });
    resultEl.classList.add("hidden");
    const span = Math.max(1, sceneEnd - sceneStart);
    const step = span / (moves.length + 1.2);
    moves.forEach((mv, n) => {
      window.setTimeout(() => {
        cells[mv.i].textContent = mv.m;
        cells[mv.i].classList.add("mark");
        turnEl.textContent = "turn · " + (mv.m === "X" ? "1" : "0");
        if (n === moves.length - 1) {
          turnEl.textContent = "finished";
          resultEl.classList.remove("hidden");
        }
      }, step * (n + 0.35) * 1000);
    });
  }

  const t0 = performance.now();
  function tick() {
    const t = (performance.now() - t0) / 1000;
    let cur = tl.scenes[0];
    for (const sc of tl.scenes) {
      if (t >= sc.start) cur = sc;
    }
    if (cur && document.querySelector(".scene.on")?.id !== cur.id) {
      show(cur.id);
      if (cur.id === "S4") playBoard(cur.start, cur.end);
    }
    if (t >= tl.duration) {
      window.__QAME_DEMO_DONE__ = true;
      return;
    }
    requestAnimationFrame(tick);
  }
  show(tl.scenes[0].id);
  requestAnimationFrame(tick);
})();
