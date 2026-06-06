import OBR, { buildImage } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk/+esm";

const NS = "phil.tokenProcessor";
const TOKEN_KEY = "timestamp";
const PROCESSED_KEY = "processed";

const knownIds = new Set();
let suppressChanges = false;

let config = null;
let backgroundsConfig = null;

// =========================
// ✅ ON READY (DO NOTHING TO SCENE)
// =========================
OBR.onReady(async () => {
  console.log("✅ Extension Ready");
  document.getElementById("status").innerText = "Waiting for scene...";

  await waitForSceneReady();

  console.log("🎬 Scene ready");


  // ✅ SET CAMERA FOR EVERYONE ON LOAD
  await setGameCamera();

  const existingItems = await OBR.scene.items.getItems();
  for (const item of existingItems) {
    if (item.type === "IMAGE") {
      knownIds.add(item.id);
    }
  }

  setupItemWatcher();

  await loadConfig();
  await loadBackgrounds();

  document.getElementById("status").innerText = "Ready";
});

// =========================
// ✅ WAIT FOR SCENE
// =========================
async function waitForSceneReady() {
  while (true) {
    try {
      await OBR.scene.items.getItems();
      return;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
}



function setupItemWatcher() {
  OBR.scene.items.onChange(async (items) => {
    if (suppressChanges) return;

    for (const item of items) {
      if (item.type !== "IMAGE") continue;

      const isKnown = knownIds.has(item.id);

      // Track all seen items
      if (!isKnown) {
        knownIds.add(item.id);
      }

      // ✅ DEBUG ONLY (no mutation!)
      if (!item.metadata?.["phil.sudoku"]?.system && !item.locked) {
        debugPlayerInfo(item);
      }
    }
  });
}

// =========================
// ✅ CLEAR SCENE
// =========================
async function clearScene() {
  const items = await OBR.scene.items.getItems();

  const toDelete = items
    .filter(i => i.type === "IMAGE")
    .map(i => i.id);

  if (toDelete.length) {
    await OBR.scene.items.deleteItems(toDelete);
    console.log(`🧹 Cleared ${toDelete.length} items`);
  }
}

// =========================
// ✅ CAMERA
// =========================
async function setGameCamera() {
  await OBR.viewport.setScale(0.175);
  await OBR.viewport.setPosition({ x: 1000, y: 200 });
}

// =========================
// ✅ BACKGROUND SYSTEM
// =========================
async function loadBackgrounds() {
  const res = await fetch("https://philharbin-eng.github.io/457813/backgrounds/backgrounds.json");

  if (!res.ok) {
    throw new Error(`Failed to load backgrounds.json`);
  }

  backgroundsConfig = await res.json();

  const select = document.getElementById("backgroundSelect");
  select.innerHTML = "";

  backgroundsConfig.backgrounds.forEach(bg => {
    const opt = document.createElement("option");
    opt.value = bg.id;
    opt.textContent = bg.label;
    select.appendChild(opt);
  });

  console.log(`✅ Loaded backgrounds`);
}

function getSelectedBackground() {
  if (!backgroundsConfig) return null;

  const id = document.getElementById("backgroundSelect").value;
  return backgroundsConfig.backgrounds.find(b => b.id === id);
}

async function addBackground(bgPath) {
  const centerX = 700;
  const centerY = 1900;

  const bg = buildImage(
    {
      width: 1920,
      height: 1080,
      mime: "image/png",
      url: new URL(bgPath, window.location.origin).href
    },
    {
      dpi: 100,
      offset: { x: 960, y: 540 }
    }
  )
    .id(crypto.randomUUID())
    .name("Background")
    .position({ x: centerX, y: centerY })
    .scale({ x: 2.5, y: 2.5 })
    .layer("MAP")
    .locked(true)
    .metadata({
      "phil.sudoku": {
        system: true,
        kind: "background"
      }
    })
    .build();

  await OBR.scene.items.addItems([bg]);

  console.log(`✅ Background added: ${bgPath}`);
}

// =========================
// ✅ BUILD BOARD
// =========================
async function buildBoard(grid, solution) {async function buildBoard(grid, const items = [];

  const startX = -2650;
  const startY = 170;
  const spacing = 620;

  const cells = [];

  // ✅ Build full 81-cell coordinate map
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = startX + 7 + (c * spacing);
      const y = startY + 7 + (r * spacing);

      cells.push({
        row: r,
        col: c,
        x,
        y
      });
    }
  }

  // ✅ Build initial tokens (given values only)
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = grid[r][c];
      if (value === 0) continue;

      const x = startX + 7 + (c * spacing);
      const y = startY + 7 + (r * spacing);

      const url = new URL(
        `https://philharbin-eng.github.io/457813/tokens/${value}.png`,
        window.location.origin
      ).href;

      const item = buildImage(
        {
          width: 70,
          height: 70,
          mime: "image/png",
          url
        },
        {
          dpi: 70,
          offset: { x: 0, y: 0 }
        }
      )
        .id(crypto.randomUUID())
        .name(`Sudoku-${value}`)
        .position({ x, y })
        .scale({ x: 3, y: 3 })
        .layer("CHARACTER")
        .locked(true)
        .metadata({
          "phil.sudoku": {
            value,
            row: r,
            col: c,
            system: true
          }
        })
        .build();

      items.push(item);
    }
  }

  // ✅ Add initial tokens to scene
  if (items.length) {
    await OBR.scene.items.addItems(items);
    console.log(`✅ Board built`);
  }

  // ✅ Create working gameboard (deep copy of grid)
  const gameboard = grid.map(row => [...row]);

  // ✅ Store full board state in scene metadata (ONE atomic write)
  await OBR.scene.setMetadata({
    "phil.sudoku.board": {
      grid,        // original puzzle
      gameboard,   // mutable board
      solution,    // full solution
      cells        // full coordinate map
    }
  });

  console.log(`✅ Board metadata stored`);
}


// =========================
// ✅ GAME CONFIG
// =========================
async function loadConfig() {
  const res = await fetch("https://philharbin-eng.github.io/457813/config/games.json");
  if (!res.ok) throw new Error("Failed to load game config");

  config = await res.json();
  populateDifficulty();
}

function populateDifficulty() {
  const select = document.getElementById("difficulty");
  select.innerHTML = "";

  config.difficulties.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.label || d.id;
    select.appendChild(opt);
  });
}



function debugPlayerInfo(item) {
  console.log("---- PLAYER DEBUG ----");
  console.log("id:", item.id);
  console.log("name:", item.name);

  console.log("createdUserId:", item.createdUserId);
  console.log("lastModifiedUserId:", item.lastModifiedUserId);
  console.log("ownerId:", item.ownerId);
  console.log("createdBy:", item.createdBy);
  console.log("lastModifiedBy:", item.lastModifiedBy);

  console.log("full item:", item);
}




function getPath(diffId, number) {
  const diff = config.difficulties.find(d => d.id === diffId);
  return diff.path.replace("{n}", number);
}

// =========================
// ✅ START BUTTON (CORE FLOW)
// =========================
document.getElementById("startBtn").addEventListener("click", async () => {
  try {
    const role = await OBR.player.getRole();
    if (role !== "GM") {
      document.getElementById("status").innerText = "DM only";
      return;
    }

    await waitForSceneReady();

    const diff = document.getElementById("difficulty").value;
    const num = document.getElementById("gameNumber").value;

    const bg = getSelectedBackground();
    if (!bg) {
      document.getElementById("status").innerText = "Select background";
      return;
    }

    const path = getPath(diff, num);

    const response = await fetch(path);
    if (!response.ok) throw new Error("Game load failed");

    const data = await response.json();

    // ✅ FULL CONTROL FLOW HERE
    await clearScene();
    await setGameCamera();
    await addBackground(bg.path);
    await buildBoard(data.grid);

    document.getElementById("status").innerText = "Game Started";

  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = "Error";
  }
});

// =========================
// ✅ TOKEN TAGGER (UNCHANGED)
// =========================
async function tagNewToken(item) {
  const now = Date.now();

  suppressChanges = true;
  try {
    await OBR.scene.items.updateItems([item.id], (items) => {
      const token = items[0];
      const existingMeta = token.metadata || {};
      const existingNs = existingMeta[NS] || {};

      token.metadata = {
        ...existingMeta,
        [NS]: {
          ...existingNs,
          [TOKEN_KEY]: now,
          [PROCESSED_KEY]: false
        }
      };
    });
  } finally {
    setTimeout(() => {
      suppressChanges = false;
    }, 50);
  }
}
