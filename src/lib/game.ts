export function initGame(): () => void {
  // ============================================================
  // SECTION 1: CONSTANTS & CONFIG
  // ============================================================

  const LOGICAL_W   = 240;
  const LOGICAL_H   = 320;
  const TILE        = 16;
  const COLS        = 15;
  const LEVEL_ROWS  = 64;
  const GRAVITY     = 580;
  const MAX_FALL    = 380;
  const JUMP_VEL    = -270;
  const WALK_SPEED  = 85;
  const WORLD_H     = LEVEL_ROWS * TILE; // 1024

  const T = { EMPTY: 0, PLATFORM: 1, ICE: 2, CRACKED: 3, WALL: 4 };

  const PAL = {
    SKY:      '#5C94FC',
    SKY2:     '#3070DC',
    MNTSNOW:  '#E8F8FF',
    PLATFORM: '#AC7C00',
    PLATHL:   '#D4A800',
    WALL:     '#806000',
    ICE:      '#ACE0FF',
    ICE2:     '#78C0E0',
    CRACK:    '#6090A8',
    PLAYER:   '#0000DC',
    PLAYERHL: '#4444FF',
    SKIN:     '#FCC09C',
    HAT:      '#0000DC',
    BOOT:     '#DC0000',
    MALLET:   '#804000',
    MALLETHL: '#B46000',
    TOPI:     '#E84018',
    TOPI2:    '#FF6840',
    BIRD:     '#18C818',
    BIRD2:    '#30FF30',
    CONDOR:   '#8040C0',
    CONDOR2:  '#C080FF',
    BONUS:    '#FCFC00',
    TEXT:     '#FCFCFC',
    HUDTXT:   '#FCFCFC',
    BLACK:    '#000000',
    SCORE:    '#FCFC00',
    RED:      '#FC0000',
  };

  const SCORE_VAL = {
    CRACK:  10,
    BREAK:  50,
    HIT:   100,
    KILL:  300,
    BONUS: 200,
    CONDOR: 1000,
    TOP:   500,
  };

  // ============================================================
  // SECTION 2: CANVAS SETUP
  // ============================================================

  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  const ctx    = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  canvas.width  = LOGICAL_W;
  canvas.height = LOGICAL_H;

  function resizeCanvas() {
    const wrapper  = document.getElementById('canvasWrapper')!;
    const controls = document.getElementById('controls')!;
    void wrapper;
    const ctrlH    = controls.offsetHeight;
    const availW   = window.innerWidth;
    const availH   = window.innerHeight - ctrlH;
    const scale    = Math.min(availW / LOGICAL_W, availH / LOGICAL_H);
    canvas.style.width  = (LOGICAL_W * scale) + 'px';
    canvas.style.height = (LOGICAL_H * scale) + 'px';
  }
  window.addEventListener('resize', resizeCanvas);
  // Delay initial resize so the browser has laid out the controls div first
  requestAnimationFrame(resizeCanvas);

  // ============================================================
  // SECTION 3: STATE MACHINE
  // ============================================================

  const STATE = {
    TITLE:       'title',
    PLAYING:     'playing',
    PAUSED:      'paused',
    BONUS:       'bonus',
    STAGE_CLEAR: 'stage_clear',
    GAME_OVER:   'game_over',
    TRANSITION:  'transition',
  };

  let currentState  = STATE.TITLE;
  let stateTimer    = 0;
  let nextState: string | null = null;
  let transDuration = 0;

  function setState(s: string, delay?: number) {
    if (delay) {
      nextState     = s;
      currentState  = STATE.TRANSITION;
      stateTimer    = 0;
      transDuration = delay;
    } else {
      currentState = s;
      stateTimer   = 0;
      onEnter(s);
    }
  }

  function onEnter(s: string) {
    if (s === STATE.PLAYING)   initLevel();
    if (s === STATE.BONUS)     initBonus();
    if (s === STATE.GAME_OVER) {
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('iceHi', String(highScore));
      }
    }
  }

  // ============================================================
  // SECTION 4: INPUT
  // ============================================================

  const input = { left: false, right: false, jump: false, jumpEdge: false };
  const touchMap: Record<number, string> = {};

  function setupInput() {
    const btns: Record<string, string> = {
      'btn-left':  'left',
      'btn-right': 'right',
      'btn-jump':  'jump',
    };

    Object.entries(btns).forEach(([id, action]) => {
      const el = document.getElementById(id)!;

      el.addEventListener('touchstart', (e: TouchEvent) => {
        e.preventDefault();
        el.classList.add('pressed');
        for (const t of Array.from(e.changedTouches)) {
          touchMap[t.identifier] = action;
          (input as Record<string, boolean>)[action] = true;
          if (action === 'jump') input.jumpEdge = true;
        }
      }, { passive: false });

      const endFn = (e: TouchEvent) => {
        e.preventDefault();
        for (const t of Array.from(e.changedTouches)) {
          const a = touchMap[t.identifier];
          if (a) {
            delete touchMap[t.identifier];
            if (!Object.values(touchMap).includes(a)) (input as Record<string, boolean>)[a] = false;
          }
        }
        if (!Object.values(touchMap).includes(action)) el.classList.remove('pressed');
      };
      el.addEventListener('touchend',    endFn as EventListener, { passive: false });
      el.addEventListener('touchcancel', endFn as EventListener, { passive: false });
    });

    // Keyboard fallback
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') input.left  = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (!input.jump) input.jumpEdge = true;
        input.jump = true;
      }
      if (e.code === 'Escape') {
        if (currentState === STATE.PLAYING) setState(STATE.PAUSED);
        else if (currentState === STATE.PAUSED) setState(STATE.PLAYING);
      }
    });
    document.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft'  || e.code === 'KeyA') input.left  = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') input.right = false;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') input.jump = false;
    });

    // Tap to advance on title/gameover/stageclear
    canvas.addEventListener('touchstart', (e: TouchEvent) => {
      e.preventDefault();
      handleTap();
    }, { passive: false });
    canvas.addEventListener('click', () => handleTap());
  }

  function handleTap() {
    if (currentState === STATE.TITLE) {
      startGame();
    } else if (currentState === STATE.GAME_OVER) {
      setState(STATE.TITLE);
    } else if (currentState === STATE.PAUSED) {
      setState(STATE.PLAYING);
    }
  }

  // ============================================================
  // SECTION 5: GAME GLOBALS
  // ============================================================

  let score       = 0;
  let highScore   = parseInt(localStorage.getItem('iceHi') || '0');
  let lives       = 3;
  let mountainNum = 1;
  let player: ReturnType<typeof mkPlayer> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let entities:  any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let particles: any[] = [];
  let levelGrid: Uint8Array[] | null = null;

  // ============================================================
  // SECTION 6: LEVEL GENERATION
  // ============================================================

  function newGrid() {
    return Array.from({ length: LEVEL_ROWS }, () => new Uint8Array(COLS));
  }

  function getTile(row: number, col: number) {
    if (row < 0 || row >= LEVEL_ROWS) return T.EMPTY;
    if (col < 0 || col >= COLS)       return T.EMPTY;
    return levelGrid![row][col];
  }

  function setTile(row: number, col: number, val: number) {
    if (row >= 0 && row < LEVEL_ROWS && col >= 0 && col < COLS)
      levelGrid![row][col] = val;
  }

  function isSolid(t: number) {
    return t === T.PLATFORM || t === T.ICE || t === T.CRACKED || t === T.WALL;
  }

  function generateLevel() {
    levelGrid = newGrid();

    // Walls
    for (let r = 0; r < LEVEL_ROWS; r++) {
      levelGrid[r][0]      = T.WALL;
      levelGrid[r][COLS-1] = T.WALL;
    }

    // Ground floor
    for (let c = 1; c < COLS-1; c++) levelGrid[LEVEL_ROWS-1][c] = T.PLATFORM;

    const diff = Math.min((mountainNum - 1) * 0.08, 0.7);

    // Platform bands every 4 rows
    const bands = Math.floor((LEVEL_ROWS - 4 - 1) / 4);
    for (let b = 1; b <= bands; b++) {
      const pRow = LEVEL_ROWS - 1 - b * 4;
      const iRow = pRow - 1;
      if (pRow <= 3) break;

      // Stone platform
      for (let c = 1; c < COLS-1; c++) levelGrid[pRow][c] = T.PLATFORM;

      // Ice row with gaps
      if (iRow > 3) placeIceRow(iRow, diff);
    }
  }

  function placeIceRow(row: number, diff: number) {
    for (let c = 1; c < COLS-1; c++) levelGrid![row][c] = T.ICE;

    const numGaps = Math.max(1, Math.round(3 - diff * 2));
    const gapSize = Math.max(2, Math.round(3 - diff));
    const placed: number[] = [];

    for (let g = 0; g < numGaps; g++) {
      let pos, tries = 0;
      do {
        pos = 1 + Math.floor(Math.random() * (COLS - 2 - gapSize));
        tries++;
      } while (placed.some(p => Math.abs(p - pos) < gapSize + 1) && tries < 30);
      placed.push(pos);
      for (let i = 0; i < gapSize; i++) {
        if (pos + i < COLS - 1) levelGrid![row][pos + i] = T.EMPTY;
      }
    }
  }

  function spawnLevelEntities() {
    entities  = [];
    particles = [];

    // Spawn ice block entities from grid
    for (let r = 0; r < LEVEL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (levelGrid![r][c] === T.ICE) {
          entities.push({
            type: 'iceblock', alive: true,
            x: c * TILE, y: r * TILE, w: TILE, h: TILE,
            row: r, col: c, cracked: false,
            breaking: false, breakTimer: 0,
          });
        }
      }
    }

    // Spawn Topi on platform bands
    const diff  = Math.min((mountainNum - 1) * 0.08, 0.7);
    const bands = Math.floor((LEVEL_ROWS - 4 - 1) / 4);
    for (let b = 1; b <= bands; b++) {
      const pRow = LEVEL_ROWS - 1 - b * 4;
      if (pRow <= 4) break;
      if (Math.random() < 0.55 + diff * 0.3) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        const col = dir > 0 ? 2 : COLS - 3;
        entities.push(mkTopi(col * TILE, (pRow - 1) * TILE, dir));
      }
    }

    // Spawn nitpickers
    const birdCount = Math.min(2 + Math.floor(mountainNum / 3), 5);
    for (let i = 0; i < birdCount; i++) {
      entities.push(mkBird(i));
    }

    // Condor (placed at top for bonus)
    entities.push(mkCondor());
  }

  function mkTopi(x: number, y: number, dir: number) {
    return {
      type: 'topi', alive: true,
      x, y, w: 14, h: 12,
      vx: 0, vy: 0,
      dir, onGround: false,
      stunned: false, stunTimer: 0,
      animFrame: 0, animTimer: 0,
      respawnTimer: -1,
    };
  }

  function mkBird(idx: number) {
    const worldY = 80 + idx * 120 + Math.random() * 60;
    return {
      type: 'nitpicker', alive: true,
      x: LOGICAL_W + Math.random() * 60,
      y: worldY, w: 14, h: 10,
      vx: -(45 + Math.random() * 25),
      vy: 0,
      baseY: worldY,
      phase: Math.random() * Math.PI * 2,
      freq: 1.2 + Math.random() * 0.8,
      amp: 16 + Math.random() * 12,
      animFrame: 0, animTimer: 0,
    };
  }

  function mkCondor() {
    return {
      type: 'condor', alive: true,
      x: TILE * 2, y: TILE * 1,
      w: 22, h: 16,
      vx: 55, vy: 0,
      animFrame: 0, animTimer: 0,
      visible: false,
    };
  }

  // ============================================================
  // SECTION 7: ENTITY SYSTEM & PHYSICS
  // ============================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyPhysics(e: any, dt: number) {
    e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function resolveVsTiles(e: any) {
    e.onGround = false;
    for (let s = 0; s < 2; s++) resolveStep(e);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function resolveStep(e: any) {
    const l = Math.floor(e.x / TILE);
    const r = Math.floor((e.x + e.w - 0.5) / TILE);
    const t = Math.floor(e.y / TILE);
    const b = Math.floor((e.y + e.h - 0.5) / TILE);

    for (let row = t; row <= b; row++) {
      for (let col = l; col <= r; col++) {
        const tile = getTile(row, col);
        if (!isSolid(tile)) continue;

        const tx = col * TILE, ty = row * TILE;
        const ol = (e.x + e.w) - tx;
        const or_ = (tx + TILE) - e.x;
        const ot = (e.y + e.h) - ty;
        const ob = (ty + TILE) - e.y;

        const min = Math.min(ol, or_, ot, ob);
        if (min <= 0) continue;

        if (min === ot && e.vy >= 0) {
          e.y = ty - e.h;
          e.vy = 0;
          e.onGround = true;
        } else if (min === ob && e.vy < 0 && tile !== T.PLATFORM) {
          // Platforms are one-way: passable from below, solid from above.
          // Only ice/cracked/wall block upward movement.
          e.y = ty + TILE;
          onHitCeiling(e, row, col);
          e.vy = 0;
        } else if (min === ol && e.vx >= 0) {
          e.x = tx - e.w;
          if (e.type !== 'player') e.vx = 0;
        } else if (min === or_ && e.vx <= 0) {
          e.x = tx + TILE;
          if (e.type !== 'player') e.vx = 0;
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onHitCeiling(e: any, row: number, col: number) {
    if (e.type !== 'player') return;
    const tile = getTile(row, col);
    if (tile === T.ICE) {
      setTile(row, col, T.CRACKED);
      const blk = findBlock(row, col);
      if (blk) blk.cracked = true;
      addScore(SCORE_VAL.CRACK);
    } else if (tile === T.CRACKED) {
      setTile(row, col, T.EMPTY);
      const blk = findBlock(row, col);
      if (blk) { blk.breaking = true; blk.breakTimer = 0; blk.alive = false; }
      spawnBreakFx(col * TILE, row * TILE);
      addScore(SCORE_VAL.BREAK);
    }
  }

  function findBlock(row: number, col: number) {
    return entities.find(e => e.type === 'iceblock' && e.row === row && e.col === col);
  }

  // ============================================================
  // SECTION 8: PLAYER
  // ============================================================

  function mkPlayer() {
    return {
      type: 'player', alive: true,
      x: 7 * TILE, y: (LEVEL_ROWS - 2) * TILE,
      w: 12, h: 16,
      vx: 0, vy: 0,
      onGround: false,
      facingRight: true,
      invTimer: 0,
      animFrame: 0, animTimer: 0,
      dead: false,
    };
  }

  function updatePlayer(dt: number) {
    if (!player || player.dead) return;

    player.vx = 0;
    if (input.left)  { player.vx = -WALK_SPEED; player.facingRight = false; }
    if (input.right) { player.vx =  WALK_SPEED; player.facingRight = true; }

    if (input.jumpEdge && player.onGround) {
      player.vy = JUMP_VEL;
      player.onGround = false;
    }
    input.jumpEdge = false;

    applyPhysics(player, dt);
    resolveVsTiles(player);

    // Screen wrap horizontally (between walls)
    if (player.x < TILE)                       player.x = TILE;
    if (player.x + player.w > (COLS-1)*TILE)   player.x = (COLS-1)*TILE - player.w;

    // Invincibility countdown
    if (player.invTimer > 0) player.invTimer -= dt;

    // Animation
    player.animTimer += dt;
    if (player.animTimer > 0.12) {
      player.animTimer = 0;
      player.animFrame = (player.animFrame + 1) % 2;
    }

    // Check fall death
    if (player.y > camera.lockY + LOGICAL_H + TILE * 2) {
      hitPlayer();
    }

    // Reach bonus zone
    if (currentState === STATE.PLAYING && player.y < TILE * 4) {
      setState(STATE.BONUS);
    }
  }

  function hitPlayer() {
    if (player!.invTimer > 0) return;
    lives--;
    if (lives <= 0) {
      setState(STATE.GAME_OVER, 1.5);
    } else {
      player!.x = 7 * TILE;
      player!.y = camera.lockY + LOGICAL_H - TILE * 4;
      player!.vy = 0;
      player!.vx = 0;
      player!.invTimer = 2.5;
      for (let r = Math.floor(player!.y / TILE); r < LEVEL_ROWS; r++) {
        if (getTile(r, 7) === T.PLATFORM || getTile(r, 6) === T.PLATFORM) {
          player!.y = r * TILE - player!.h;
          break;
        }
      }
    }
  }

  // ============================================================
  // SECTION 9: ENEMY AI
  // ============================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateTopi(e: any, dt: number) {
    e.animTimer += dt;
    if (e.animTimer > 0.2) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 2; }

    if (!e.onGround && !e.stunned) {
      applyPhysics(e, dt);
      resolveVsTiles(e);
      return;
    }

    if (e.stunned) {
      e.stunTimer -= dt;
      e.vx = e.dir * 100;
      applyPhysics(e, dt);
      resolveVsTiles(e);
      if (!e.onGround || e.stunTimer <= 0) {
        if (!e.onGround) {
          addScore(SCORE_VAL.KILL);
          e.alive = false;
          return;
        }
        e.stunned = false;
        e.vx = 0;
      }
      return;
    }

    e.vx = e.dir * 28;
    applyPhysics(e, dt);
    resolveVsTiles(e);

    // Reverse at walls or edges
    const nextC = e.dir > 0 ? Math.floor((e.x + e.w + 2) / TILE) : Math.floor((e.x - 2) / TILE);
    const botR  = Math.floor((e.y + e.h + 2) / TILE);
    const wallA = isSolid(getTile(Math.floor((e.y) / TILE), nextC));
    const flrA  = isSolid(getTile(botR, nextC));

    if (wallA || !flrA) {
      e.dir *= -1;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateBird(e: any, dt: number) {
    e.animTimer += dt;
    if (e.animTimer > 0.15) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 2; }

    e.phase += e.freq * dt;
    e.x += e.vx * dt;
    e.y = e.baseY + Math.sin(e.phase) * e.amp;

    if (e.vx < 0 && e.x + e.w < 0) {
      e.x = LOGICAL_W + 8;
      e.baseY = camera.y + 30 + Math.random() * (LOGICAL_H - 80);
      e.y = e.baseY;
    }
    if (e.vx > 0 && e.x > LOGICAL_W) {
      e.x = -e.w - 8;
      e.baseY = camera.y + 30 + Math.random() * (LOGICAL_H - 80);
      e.y = e.baseY;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function updateCondor(e: any, dt: number) {
    e.animTimer += dt;
    if (e.animTimer > 0.18) { e.animTimer = 0; e.animFrame = (e.animFrame + 1) % 2; }

    e.x += e.vx * dt;
    if (e.x > (COLS - 2) * TILE - e.w) { e.x = (COLS - 2) * TILE - e.w; e.vx = -Math.abs(e.vx); }
    if (e.x < TILE)                     { e.x = TILE;                     e.vx =  Math.abs(e.vx); }
  }

  // ============================================================
  // SECTION 10: CAMERA
  // ============================================================

  const camera = { y: 0, lockY: 0 };

  function updateCamera() {
    const screenY = player ? player.y - camera.y : 0;
    const thresh  = LOGICAL_H * 0.42;

    if (player && screenY < thresh) {
      const targetY = player.y - thresh;
      camera.y += (targetY - camera.y) * 0.12;
    }

    camera.lockY = Math.min(camera.lockY, camera.y);
    camera.y     = Math.min(camera.y, camera.lockY);

    camera.y = Math.max(camera.y, -(LOGICAL_H * 0.1));
    camera.y = Math.min(camera.y, WORLD_H - LOGICAL_H);
  }

  // ============================================================
  // SECTION 11: PARTICLES
  // ============================================================

  function spawnBreakFx(wx: number, wy: number) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: wx + Math.random() * TILE,
        y: wy + Math.random() * TILE,
        vx: (Math.random() - 0.5) * 80,
        vy: -Math.random() * 90 - 20,
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.75,
        color: i % 2 === 0 ? PAL.ICE : PAL.ICE2,
        size: 2 + Math.random() * 2.5,
      });
    }
  }

  function updateParticles(dt: number) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += GRAVITY * dt * 0.5;
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ============================================================
  // SECTION 12: SCORING
  // ============================================================

  function addScore(pts: number) {
    const prev = score;
    score += pts;
    if (Math.floor(score / 10000) > Math.floor(prev / 10000)) {
      lives++;
      showPopup('+1 UP!', '#FCFC00');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const popups: any[] = [];
  function showPopup(text: string, color: string) {
    if (!player) return;
    popups.push({
      text, color,
      x: player.x,
      y: player.y - 10,
      life: 1.2,
      maxLife: 1.2,
      vy: -30,
    });
  }

  function updatePopups(dt: number) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y    += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) popups.splice(i, 1);
    }
  }

  // ============================================================
  // SECTION 13: GAME INIT
  // ============================================================

  function startGame() {
    score       = 0;
    lives       = 3;
    mountainNum = 1;
    setState(STATE.PLAYING);
  }

  function initLevel() {
    camera.y     = WORLD_H - LOGICAL_H;
    camera.lockY = camera.y;
    generateLevel();
    spawnLevelEntities();
    player = mkPlayer();
  }

  function initBonus() {
    for (const e of entities) {
      if (e.type === 'topi' || e.type === 'nitpicker') e.alive = false;
    }
    const c = entities.find((e: { type: string }) => e.type === 'condor');
    if (c) c.visible = true;
    stateTimer = 0;
  }

  // ============================================================
  // SECTION 14: ENEMY-PLAYER COLLISION
  // ============================================================

  function checkCollisions() {
    if (!player || player.invTimer > 0) return;

    for (const e of entities) {
      if (!e.alive) continue;
      if (e.type !== 'topi' && e.type !== 'nitpicker') continue;
      if (overlap(player, e)) {
        hitPlayer();
        return;
      }
    }

    if (currentState === STATE.BONUS) {
      const c = entities.find((e: { type: string; alive: boolean; visible: boolean }) => e.type === 'condor' && e.alive && e.visible);
      if (c && overlap(player, c)) {
        addScore(SCORE_VAL.CONDOR);
        addScore(SCORE_VAL.TOP);
        showPopup('CONDOR! ' + SCORE_VAL.CONDOR, PAL.CONDOR2);
        setState(STATE.STAGE_CLEAR, 2.0);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function overlap(a: any, b: any) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ============================================================
  // SECTION 15: UPDATE
  // ============================================================

  function update(dt: number) {
    stateTimer += dt;

    if (currentState === STATE.TRANSITION) {
      if (stateTimer >= transDuration) setState(nextState!);
      return;
    }

    if (currentState === STATE.TITLE)     return;
    if (currentState === STATE.PAUSED)    return;
    if (currentState === STATE.GAME_OVER) return;

    if (currentState === STATE.STAGE_CLEAR) {
      if (stateTimer > 2.5) {
        mountainNum++;
        setState(STATE.PLAYING);
      }
      return;
    }

    updatePlayer(dt);
    updateCamera();
    updateEntities(dt);
    updateParticles(dt);
    updatePopups(dt);
    checkCollisions();

    if (currentState === STATE.BONUS && stateTimer > 10) {
      addScore(SCORE_VAL.TOP);
      setState(STATE.STAGE_CLEAR, 1.5);
    }
  }

  function updateEntities(dt: number) {
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (!e.alive) { entities.splice(i, 1); continue; }

      if (e.type === 'iceblock') {
        if (e.breaking) {
          e.breakTimer += dt;
          if (e.breakTimer > 0.3) e.alive = false;
        }
      } else if (e.type === 'topi') {
        updateTopi(e, dt);
      } else if (e.type === 'nitpicker') {
        updateBird(e, dt);
      } else if (e.type === 'condor') {
        if (e.visible) updateCondor(e, dt);
      }
    }
  }

  // ============================================================
  // SECTION 16: RENDERING
  // ============================================================

  function render() {
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    if (currentState === STATE.TITLE) {
      renderTitle();
      return;
    }
    if (currentState === STATE.GAME_OVER) {
      renderGameOver();
      return;
    }
    if (currentState === STATE.TRANSITION) {
      const alpha = Math.min(stateTimer / transDuration, 1);
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      return;
    }

    ctx.fillStyle = PAL.SKY;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.save();
    ctx.translate(0, -camera.y);

    renderTiles();
    renderEntities();
    renderPlayer_r();
    renderParticles_r();

    ctx.restore();

    renderHUD();

    if (currentState === STATE.STAGE_CLEAR) renderStageClear();
    if (currentState === STATE.PAUSED)      renderPaused();
  }

  function renderTiles() {
    const r0 = Math.max(0, Math.floor(camera.y / TILE) - 1);
    const r1 = Math.min(LEVEL_ROWS - 1, Math.ceil((camera.y + LOGICAL_H) / TILE) + 1);

    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = levelGrid![r][c];
        if (t === T.EMPTY) continue;
        drawTile(t, c * TILE, r * TILE);
      }
    }
  }

  function drawTile(t: number, x: number, y: number) {
    if (t === T.PLATFORM) {
      ctx.fillStyle = PAL.PLATFORM;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = PAL.PLATHL;
      ctx.fillRect(x, y, TILE, 3);
    } else if (t === T.ICE) {
      ctx.fillStyle = PAL.ICE;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = PAL.ICE2;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
    } else if (t === T.CRACKED) {
      ctx.fillStyle = PAL.ICE2;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = PAL.CRACK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x+8, y+2); ctx.lineTo(x+4, y+8); ctx.lineTo(x+11, y+13);
      ctx.moveTo(x+5, y+2); ctx.lineTo(x+8, y+6);
      ctx.stroke();
    } else if (t === T.WALL) {
      ctx.fillStyle = PAL.WALL;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = PAL.PLATFORM;
      ctx.fillRect(x+2, y+2, TILE-4, TILE-4);
    }
  }

  function renderEntities() {
    for (const e of entities) {
      if (!e.alive) {
        if (e.type === 'iceblock' && e.breaking) {
          const a = 1 - e.breakTimer / 0.3;
          ctx.globalAlpha = a;
          ctx.fillStyle = PAL.ICE;
          ctx.fillRect(e.x, e.y, e.w, e.h);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      if (e.type === 'iceblock') {
        // rendered via tile layer
      } else if (e.type === 'topi') {
        drawTopi(e);
      } else if (e.type === 'nitpicker') {
        drawBird(e);
      } else if (e.type === 'condor' && e.visible) {
        drawCondor(e);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function drawTopi(e: any) {
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    const flip = e.dir < 0;

    ctx.save();
    if (flip) { ctx.translate(x + e.w, y); ctx.scale(-1, 1); }
    else        ctx.translate(x, y);

    ctx.fillStyle = PAL.TOPI;
    ctx.fillRect(1, 3, 12, 8);
    ctx.fillStyle = PAL.TOPI2;
    ctx.fillRect(2, 0, 8, 6);
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(7, 1, 2, 2);
    ctx.fillStyle = PAL.TOPI;
    if (e.animFrame === 0) {
      ctx.fillRect(0, 8, 3, 4);
      ctx.fillRect(9, 8, 4, 3);
    } else {
      ctx.fillRect(0, 9, 4, 3);
      ctx.fillRect(10, 7, 3, 4);
    }
    ctx.restore();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function drawBird(e: any) {
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    const flip = e.vx > 0;

    ctx.save();
    if (flip) { ctx.translate(x + e.w, y); ctx.scale(-1, 1); }
    else        ctx.translate(x, y);

    ctx.fillStyle = PAL.BIRD;
    ctx.fillRect(2, 3, 10, 6);
    ctx.fillStyle = PAL.BIRD2;
    ctx.fillRect(6, 0, 6, 5);
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(10, 1, 2, 2);
    ctx.fillStyle = '#FCFC00';
    ctx.fillRect(12, 2, 3, 2);
    ctx.fillStyle = PAL.BIRD;
    if (e.animFrame === 0) {
      ctx.fillRect(0, 0, 5, 5);
    } else {
      ctx.fillRect(0, 4, 5, 5);
    }
    ctx.restore();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function drawCondor(e: any) {
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = PAL.CONDOR;
    ctx.fillRect(4, 5, 14, 8);
    ctx.fillStyle = PAL.CONDOR2;
    ctx.fillRect(8, 0, 8, 7);
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(14, 1, 2, 2);
    ctx.fillStyle = '#FC8000';
    ctx.fillRect(16, 2, 4, 2);
    ctx.fillStyle = PAL.CONDOR;
    if (e.animFrame === 0) {
      ctx.fillRect(0, 0, 7, 10);
      ctx.fillRect(17, 0, 5, 10);
    } else {
      ctx.fillRect(0, 6, 7, 6);
      ctx.fillRect(17, 6, 5, 6);
    }
    ctx.restore();
  }

  function renderPlayer_r() {
    if (!player) return;

    if (player.invTimer > 0 && Math.floor(player.invTimer * 10) % 2 === 0) return;

    const x = Math.round(player.x);
    const y = Math.round(player.y);
    const flip = !player.facingRight;

    ctx.save();
    if (flip) { ctx.translate(x + player.w, y); ctx.scale(-1, 1); }
    else        ctx.translate(x, y);

    ctx.fillStyle = PAL.PLAYER;
    ctx.fillRect(2, 5, 10, 9);
    ctx.fillStyle = PAL.SKIN;
    ctx.fillRect(2, 1, 8, 7);
    ctx.fillStyle = PAL.HAT;
    ctx.fillRect(1, 0, 10, 3);
    ctx.fillRect(0, 2, 12, 2);
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(7, 3, 2, 2);
    ctx.fillStyle = PAL.BOOT;
    const legOff = player.animFrame === 0 ? 0 : 1;
    ctx.fillRect(2, 14, 4, 2);
    ctx.fillRect(7 + legOff, 14, 4, 2);
    ctx.fillStyle = PAL.MALLET;
    ctx.fillRect(12, 4, 3, 8);
    ctx.fillStyle = PAL.MALLETHL;
    ctx.fillRect(11, 2, 5, 5);

    ctx.restore();
  }

  function renderParticles_r() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle   = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    for (const p of popups) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle   = p.color;
      ctx.fillText(p.text, p.x + 6, Math.round(p.y));
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function renderHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, LOGICAL_W, 14);

    ctx.font      = '8px monospace';
    ctx.fillStyle = PAL.HUDTXT;
    ctx.fillText('SCO', 2, 10);
    ctx.fillStyle = PAL.SCORE;
    ctx.fillText(String(score).padStart(6, '0'), 22, 10);

    ctx.fillStyle = PAL.HUDTXT;
    ctx.fillText('HI', 80, 10);
    ctx.fillStyle = PAL.SCORE;
    ctx.fillText(String(highScore).padStart(6, '0'), 94, 10);

    for (let i = 0; i < Math.min(lives, 5); i++) {
      ctx.fillStyle = PAL.PLAYER;
      ctx.fillRect(164 + i * 10, 3, 7, 8);
      ctx.fillStyle = PAL.BOOT;
      ctx.fillRect(164 + i * 10, 9, 7, 2);
    }

    ctx.fillStyle = '#FCFC00';
    ctx.font = '7px monospace';
    ctx.fillText(`MNT ${mountainNum}`, 215, 10);

    if (currentState === STATE.BONUS) {
      ctx.font      = 'bold 10px monospace';
      ctx.fillStyle = PAL.CONDOR2;
      ctx.textAlign = 'center';
      ctx.fillText('BONUS STAGE', LOGICAL_W/2, 28);
      ctx.textAlign = 'left';
    }
  }

  function renderTitle() {
    const grad = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    grad.addColorStop(0, PAL.SKY2);
    grad.addColorStop(1, PAL.SKY);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.fillStyle = PAL.MNTSNOW;
    ctx.beginPath();
    ctx.moveTo(0, 220);
    ctx.lineTo(60, 100); ctx.lineTo(120, 200); ctx.lineTo(180, 80); ctx.lineTo(240, 190);
    ctx.lineTo(240, 320); ctx.lineTo(0, 320);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(20, 60, 200, 60);
    ctx.strokeStyle = PAL.ICE;
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 60, 200, 60);

    ctx.font      = 'bold 20px monospace';
    ctx.fillStyle = PAL.ICE;
    ctx.textAlign = 'center';
    ctx.fillText('ICE CLIMBER', LOGICAL_W/2, 86);
    ctx.font      = '9px monospace';
    ctx.fillStyle = PAL.HUDTXT;
    ctx.fillText('スマホ対応版', LOGICAL_W/2, 108);

    if (Math.floor(stateTimer * 2) % 2 === 0) {
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = PAL.SCORE;
      ctx.fillText('TAP TO START', LOGICAL_W/2, 170);
    }

    ctx.font      = '7px monospace';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText('◀ ▶ 移動  ▲ ジャンプ', LOGICAL_W/2, 220);
    ctx.fillText('氷ブロックを下から2回破壊して登ろう！', LOGICAL_W/2, 235);

    ctx.font      = '8px monospace';
    ctx.fillStyle = PAL.SCORE;
    ctx.fillText(`HI-SCORE  ${String(highScore).padStart(6,'0')}`, LOGICAL_W/2, 270);

    ctx.textAlign = 'left';
  }

  function renderGameOver() {
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    ctx.textAlign = 'center';
    ctx.font      = 'bold 22px monospace';
    ctx.fillStyle = PAL.RED;
    ctx.fillText('GAME OVER', LOGICAL_W/2, 110);

    ctx.font      = '10px monospace';
    ctx.fillStyle = PAL.HUDTXT;
    ctx.fillText(`SCORE  ${String(score).padStart(6,'0')}`, LOGICAL_W/2, 150);

    if (score >= highScore && score > 0) {
      ctx.fillStyle = PAL.SCORE;
      ctx.fillText('NEW RECORD!', LOGICAL_W/2, 172);
    }
    ctx.fillStyle = PAL.HUDTXT;
    ctx.fillText(`HI    ${String(highScore).padStart(6,'0')}`, LOGICAL_W/2, 190);
    ctx.fillText(`MNT ${mountainNum}  まで登った`, LOGICAL_W/2, 215);

    if (Math.floor(stateTimer * 2) % 2 === 0) {
      ctx.font      = '9px monospace';
      ctx.fillStyle = PAL.ICE;
      ctx.fillText('TAP TO RETRY', LOGICAL_W/2, 260);
    }
    ctx.textAlign = 'left';
  }

  function renderStageClear() {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(30, 120, 180, 70);
    ctx.strokeStyle = PAL.SCORE;
    ctx.lineWidth   = 2;
    ctx.strokeRect(30, 120, 180, 70);

    ctx.textAlign   = 'center';
    ctx.font        = 'bold 14px monospace';
    ctx.fillStyle   = PAL.SCORE;
    ctx.fillText('STAGE CLEAR!', LOGICAL_W/2, 148);

    ctx.font        = '9px monospace';
    ctx.fillStyle   = PAL.HUDTXT;
    ctx.fillText(`Mountain ${mountainNum} 完了`, LOGICAL_W/2, 170);
    ctx.textAlign   = 'left';
  }

  function renderPaused() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.textAlign   = 'center';
    ctx.font        = 'bold 14px monospace';
    ctx.fillStyle   = PAL.ICE;
    ctx.fillText('PAUSE', LOGICAL_W/2, LOGICAL_H/2);
    ctx.font        = '8px monospace';
    ctx.fillStyle   = PAL.HUDTXT;
    ctx.fillText('タップで再開', LOGICAL_W/2, LOGICAL_H/2 + 20);
    ctx.textAlign   = 'left';
  }

  // ============================================================
  // SECTION 17: GAME LOOP
  // ============================================================

  let lastTime = 0;
  let rafId    = 0;

  function loop(ts: number) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    update(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }

  function init() {
    setupInput();
    rafId = requestAnimationFrame(ts => {
      lastTime = ts;
      rafId = requestAnimationFrame(loop);
    });
  }

  init();

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resizeCanvas);
  };
}
