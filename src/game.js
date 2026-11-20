import Matter from 'matter-js';
import { Gymnast } from './gymnast';
import { Environment } from './environment';
import { CustomRenderer } from './renderer';
import { gameAudio } from './audio';
import { TOY_CATALOG, SKIN_CONFIG } from './toys';

const { Engine, Events, Composite, Vector, Body } = Matter;

const DEFAULT_CUSTOMIZATION = {
  skinColor: '#ffdbac',
  hairColor: '#e0a96d',
  hairStyle: 'pony',
  outfitColor: '#db2777',
  hat: 'none',
  hasCape: false
};

export class GymnasticsGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.width = 1600; 
    this.height = 1000;
    
    // Core game stats
    this.score = 0;
    this.highScore = 0;
    this.starCount = 0; // Current active run squishy health
    this.highestAlt = 0; // Max Distance reached
    this.flipsCompleted = 0; // Tricks completed
    
    // Persistent session inventory (tracks 4 skin variants for each of the 22 squishies)
    this.inventory = {};
    for (let t = 0; t < 22; t++) {
      this.inventory[t] = { normal: 0, glitter: 0, metallic: 0, galaxy: 0 };
    }

    // Input tracking
    this.activeKeys = {};
    
    // Tricks tracking
    this.activeCombo = [];
    this.inAir = true;
    this.jumpCount = 0; // Double jump tracker
    this.gameWon = false; // Represents the "Game Over" state
    this.wipeoutTimer = 0; // Recovery ticks after a wipeout
    this.chalkBoostTimer = 0; // Tumble track / chalk speed and score booster timer

    // Physics step accumulator & animation frame handles
    this.accumulator = 0;
    this.fixedDelta = 1000 / 60; // 16.666 ms
    this.rafId = null;
    this.viewerRafId = null;
    this.collectionCanvasesInitialized = false;

    // 3D Squishy Viewer state
    this.viewerActive = false;
    this.viewerTypeId = 0;
    this.activeViewerSkin = 'normal';
    this.viewerRotation = 0;
    this.viewerTiltX = 0;
    this.viewerTiltY = 0;
    this.viewerCanvas = null;
    this.viewerCtx = null;

    // Revive state variables
    this.reviveCount = 0;
    this.totalDeaths = 0;
    this.revivePromptActive = false;

    // Store customization choices
    this.currentCustomization = { ...DEFAULT_CUSTOMIZATION };

    this.initPhysics();
    this.initGame();
    this.initInput();
    this.initCollisions();
    
    // Start loop
    this.resizeCanvas();
    const handleResize = () => this.resizeCanvas();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    
    this.lastTime = performance.now();
    this.startLoop();
  }

  startLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(() => this.loop());
  }

  initPhysics() {
    this.engine = Engine.create({
      gravity: { y: 1.35 } 
    });
    this.world = this.engine.world;
  }

  initGame() {
    // 1. Build environment
    this.environment = new Environment(this.world, this.width, this.height);
    
    // 2. Spawn gymnast near left side on the mat
    this.gymnast = new Gymnast(this.world, 150, 700);
    this.gymnast.customization = this.currentCustomization;
    
    // 3. Renderer
    this.renderer = new CustomRenderer(this.canvas, this.world, this.gymnast, this.environment);

    this.updateHUD();
    this.updateCollectionUI();
  }

  initInput() {
    window.addEventListener('keydown', (e) => {
      if (this.gameWon) return;

      // Do not hijack keyboard controls while interacting with form inputs
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      this.activeKeys[key] = true;

      // Jump action
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.triggerJump();
      }

      // Reset shortcut (Enter key, ignore if pressing a button)
      if (e.key === 'Enter' && tag !== 'BUTTON') {
        this.resetLevel();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.activeKeys[key] = false;
    });

    // Clear held keys if window loses focus to prevent stuck movement
    window.addEventListener('blur', () => {
      this.activeKeys = {};
    });

    // Mobile / Touch controls hooking
    this.setupTouchControls();
  }

  setupTouchControls() {
    const setActionState = (action, pressed) => {
      if (action === 'left') {
        this.activeKeys['a'] = pressed;
      } else if (action === 'right') {
        this.activeKeys['d'] = pressed;
      } else if (action !== 'jump') {
        this.activeKeys[action] = pressed;
      }
    };

    const bindBtn = (id, action) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      
      const handlerStart = (e) => {
        e.preventDefault();
        btn.classList.add('is-pressed');
        if (this.gameWon || this.wipeoutTimer > 0) return;
        
        if (action === 'jump') {
          this.triggerJump();
        } else {
          setActionState(action, true);
        }
      };

      const handlerEnd = (e) => {
        if (e.cancelable) e.preventDefault();
        btn.classList.remove('is-pressed');
        setActionState(action, false);
      };

      btn.addEventListener('touchstart', handlerStart, { passive: false });
      btn.addEventListener('touchend', handlerEnd, { passive: false });
      btn.addEventListener('touchcancel', handlerEnd, { passive: false });
      btn.addEventListener('mousedown', handlerStart);
      btn.addEventListener('mouseup', handlerEnd);
      btn.addEventListener('mouseleave', handlerEnd);
    };

    bindBtn('btn-jump', 'jump');
    bindBtn('btn-spin-left', 'left');
    bindBtn('btn-spin-right', 'right');
    
    bindBtn('btn-backflip', 'q');  
    bindBtn('btn-frontflip', 'w');   
    bindBtn('btn-tuck', 'r');    
    bindBtn('btn-split', 'e');   
    bindBtn('btn-layout', 't');   
    bindBtn('btn-reach', 'o');   
    bindBtn('btn-front-aerial', 'y');
    bindBtn('btn-side-aerial', 'u');
    bindBtn('btn-front-handspring', 'f');
    bindBtn('btn-back-handspring', 'h');

    // Toggle expandable extra tricks tray on mobile
    const moreBtn = document.getElementById('btn-more-tricks');
    const extraTray = document.getElementById('touch-extra-poses');
    if (moreBtn && extraTray) {
      const toggleTray = (e) => {
        e.preventDefault();
        const isOpen = extraTray.classList.toggle('open');
        moreBtn.setAttribute('aria-expanded', String(isOpen));
        extraTray.setAttribute('aria-hidden', String(!isOpen));
        moreBtn.textContent = isOpen ? '× Tricks' : '+ Tricks';
      };
      moreBtn.addEventListener('click', toggleTray);
    }
  }

  triggerJump() {
    if (this.wipeoutTimer > 0) return;

    if (this.gymnast.isGrabbing()) {
      const velocity = this.gymnast.body.velocity;
      this.gymnast.release('both');
      Body.setVelocity(this.gymnast.body, { x: velocity.x + 4, y: -12.5 });
      this.inAir = true;
      this.jumpCount = 1; // set to 1 after releasing a bar (can double jump once)
      gameAudio.playBoing();
      return;
    }

    // Try normal jump (grounded)
    if (this.gymnast.applyJumpPush()) {
      this.inAir = true;
      this.jumpCount = 1;
      this.renderer.spawnDust(this.gymnast.body.position.x, this.gymnast.body.position.y + 26, 6);
    }
    // Try double jump (in air, jumpCount < 2)
    else if (this.inAir && this.jumpCount < 2) {
      this.jumpCount = 2;
      const currentVx = this.gymnast.body.velocity.x;
      
      // Apply upward double-jump impulse
      Body.setVelocity(this.gymnast.body, { x: currentVx, y: -11.5 });
      
      // Spawn double jump particles
      const pos = this.gymnast.body.position;
      this.renderer.spawnDust(pos.x, pos.y + 18, 8);
      this.renderer.spawnSparkles(pos.x, pos.y + 18, 5);
      this.renderer.spawnTextPopup(pos.x, pos.y, 'DOUBLE JUMP!', '#38bdf8');
      
      gameAudio.playBoing();
    }
  }

  addCombo(trickName, score) {
    if (!this.activeCombo.some(t => t.name === trickName)) {
      let finalScore = score;
      if (this.chalkBoostTimer > 0) {
        finalScore *= 2;
      }
      this.activeCombo.push({ name: trickName, score: finalScore });
      this.renderer.spawnSparkles(this.gymnast.body.position.x, this.gymnast.body.position.y, 8);
      
      const popupText = this.chalkBoostTimer > 0 
        ? `${trickName}! x2 CHALK +${finalScore}` 
        : `${trickName}! +${finalScore}`;
      const popupColor = this.chalkBoostTimer > 0 ? '#06b6d4' : '#c084fc';
      this.renderer.spawnTextPopup(this.gymnast.body.position.x, this.gymnast.body.position.y, popupText, popupColor);
      gameAudio.playCheer();
    }
  }

  updateGymnastTricks() {
    if (this.gameWon || this.wipeoutTimer > 0) return;

    const gymnast = this.gymnast;

    // 1. AIR TRICKS (if inAir)
    if (this.inAir) {
      if (this.activeKeys['q'] || this.activeKeys['1']) {
        gymnast.state = 'flip-back';
        gymnast.visualAngle -= 0.15; // spin backward as long as held
        this.addCombo('BACKFLIP', 250);
      } 
      else if (this.activeKeys['w'] || this.activeKeys['2']) {
        gymnast.state = 'flip-front';
        gymnast.visualAngle += 0.15; // spin forward as long as held
        this.addCombo('FRONTFLIP', 250);
      } 
      else if (this.activeKeys['e'] || this.activeKeys['3']) {
        gymnast.state = 'split';
        this.addCombo('SPLIT JUMP', 150);
      } 
      else if (this.activeKeys['r'] || this.activeKeys['4']) {
        gymnast.state = 'tuck';
        this.addCombo('TUCK JUMP', 150);
      } 
      else if (this.activeKeys['t'] || this.activeKeys['5']) {
        gymnast.state = 'layout';
        this.addCombo('LAYOUT', 150);
      } 
      else if (this.activeKeys['y'] || this.activeKeys['6']) {
        gymnast.state = 'front-aerial';
        gymnast.visualAngle += 0.16; // spin forward hands-free!
        this.addCombo('FRONT AERIAL', 300);
      }
      else if (this.activeKeys['u'] || this.activeKeys['7']) {
        gymnast.state = 'side-aerial';
        const goingLeft = this.activeKeys['a'] || this.activeKeys['arrowleft'];
        gymnast.visualAngle += goingLeft ? -0.16 : 0.16; // spin sideways hands-free!
        this.addCombo('SIDE AERIAL', 300);
      }
      else if (this.activeKeys['f'] || this.activeKeys['8']) {
        gymnast.state = 'front-handspring';
        gymnast.visualAngle += 0.16; // flip forward in air
        this.addCombo('FRONT HANDSPRING', 280);
      }
      else if (this.activeKeys['h'] || this.activeKeys['9']) {
        gymnast.state = 'back-handspring';
        gymnast.visualAngle -= 0.16; // flip backward in air
        this.addCombo('BACK HANDSPRING', 280);
      }
      else if (this.activeKeys['o']) {
        gymnast.state = 'reach';
        this.checkBarGrabbing();
      } 
      else {
        if (gymnast.state !== 'swing') {
          gymnast.state = 'jump'; // return to neutral jump
        }
      }
    }
    // 2. FLOOR TRICKS (if grounded)
    else {
      const goingLeft = this.activeKeys['a'] || this.activeKeys['arrowleft'];
      
      if (this.activeKeys['e'] || this.activeKeys['3']) {
        gymnast.state = 'cartwheel';
        this.addCombo('CARTWHEEL', 180);
        
        if (goingLeft) {
          gymnast.visualAngle -= 0.14; // Cartwheel roll left
          Body.setVelocity(gymnast.body, { x: Math.min(gymnast.body.velocity.x, -3.8), y: gymnast.body.velocity.y });
        } else {
          gymnast.visualAngle += 0.14; // Cartwheel roll right
          Body.setVelocity(gymnast.body, { x: Math.max(gymnast.body.velocity.x, 3.8), y: gymnast.body.velocity.y });
        }
        if (Math.random() < 0.15) this.renderer.spawnSparkles(gymnast.body.position.x, gymnast.body.position.y + 20, 2);
      } 
      else if (this.activeKeys['t'] || this.activeKeys['5']) {
        gymnast.state = 'handstand';
        gymnast.visualAngle = Math.PI; // upside down!
        this.addCombo('HANDSTAND', 200);
        
        if (goingLeft) {
          Body.setVelocity(gymnast.body, { x: Math.min(gymnast.body.velocity.x, -2.8), y: gymnast.body.velocity.y });
        } else {
          Body.setVelocity(gymnast.body, { x: Math.max(gymnast.body.velocity.x, 2.8), y: gymnast.body.velocity.y });
        }
        if (Math.random() < 0.15) this.renderer.spawnDust(gymnast.body.position.x, gymnast.body.position.y + 20, 2);
      } 
      else if (this.activeKeys['w'] || this.activeKeys['2']) {
        gymnast.state = 'roll';
        this.addCombo('FORWARD ROLL', 150);
        
        if (goingLeft) {
          gymnast.visualAngle -= 0.18; // Roll left
          Body.setVelocity(gymnast.body, { x: Math.min(gymnast.body.velocity.x, -4.2), y: gymnast.body.velocity.y });
        } else {
          gymnast.visualAngle += 0.18; // Roll right
          Body.setVelocity(gymnast.body, { x: Math.max(gymnast.body.velocity.x, 4.2), y: gymnast.body.velocity.y });
        }
        if (Math.random() < 0.15) this.renderer.spawnDust(gymnast.body.position.x, gymnast.body.position.y + 20, 2);
      } 
      else if (this.activeKeys['f'] || this.activeKeys['8']) {
        gymnast.state = 'front-handspring';
        this.addCombo('FRONT HANDSPRING', 280);
        
        if (goingLeft) {
          gymnast.visualAngle -= 0.22;
          Body.setVelocity(gymnast.body, { x: Math.min(gymnast.body.velocity.x, -5.5), y: -5.0 });
        } else {
          gymnast.visualAngle += 0.22;
          Body.setVelocity(gymnast.body, { x: Math.max(gymnast.body.velocity.x, 5.5), y: -5.0 });
        }
        if (Math.random() < 0.15) this.renderer.spawnDust(gymnast.body.position.x, gymnast.body.position.y + 20, 3);
      }
      else if (this.activeKeys['h'] || this.activeKeys['9']) {
        gymnast.state = 'back-handspring';
        this.addCombo('BACK HANDSPRING', 280);
        
        if (goingLeft) {
          gymnast.visualAngle += 0.22;
          Body.setVelocity(gymnast.body, { x: Math.min(gymnast.body.velocity.x, -5.5), y: -5.0 });
        } else {
          gymnast.visualAngle -= 0.22;
          Body.setVelocity(gymnast.body, { x: Math.max(gymnast.body.velocity.x, 5.5), y: -5.0 });
        }
        if (Math.random() < 0.15) this.renderer.spawnDust(gymnast.body.position.x, gymnast.body.position.y + 20, 3);
      }
      else if (
        gymnast.state === 'cartwheel' || 
        gymnast.state === 'handstand' || 
        gymnast.state === 'roll' ||
        gymnast.state === 'front-handspring' ||
        gymnast.state === 'back-handspring'
      ) {
        gymnast.state = 'idle'; // clear floor trick when key released
      }
    }
  }

  initCollisions() {
    Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const labelA = pair.bodyA.label || '';
        const labelB = pair.bodyB.label || '';

        const isStarCollision = labelA === 'star-collectible' || labelB === 'star-collectible';
        if (isStarCollision) {
          const starBody = labelA === 'star-collectible' ? pair.bodyA : pair.bodyB;
          const gymnastBody = labelA === 'star-collectible' ? pair.bodyB : pair.bodyA;
          
          if (gymnastBody.label && gymnastBody.label.startsWith('gymnast')) {
            this.collectStar(starBody);
          }
          return;
        }

        const isChalkCollision = labelA === 'chalk-cup' || labelB === 'chalk-cup';
        if (isChalkCollision) {
          const chalkBody = labelA === 'chalk-cup' ? pair.bodyA : pair.bodyB;
          const gymnastBody = labelA === 'chalk-cup' ? pair.bodyB : pair.bodyA;
          
          if (gymnastBody.label && gymnastBody.label.startsWith('gymnast')) {
            this.collectChalkCup(chalkBody);
          }
          return;
        }

        const isGymnastBody = (lbl) => lbl === 'gymnast-body';
        if (isGymnastBody(labelA) || isGymnastBody(labelB)) {
          const platformLabel = isGymnastBody(labelA) ? labelB : labelA;
          
          // 1. TRAMPOLINE HIGH LAUNCH
          if (platformLabel.includes('trampoline')) {
            Body.setVelocity(this.gymnast.body, { 
              x: this.gymnast.body.velocity.x * 1.15, 
              y: -19.5 
            });
            this.inAir = true;
            this.gymnast.grounded = false;
            this.jumpCount = 0; // reset double jump in air
            this.renderer.spawnSparkles(this.gymnast.body.position.x, this.gymnast.body.position.y + 20, 16);
            this.renderer.spawnTextPopup(this.gymnast.body.position.x, this.gymnast.body.position.y, 'TRAMPOLINE LAUNCH!', '#d946ef');
            gameAudio.playBoing();
            return;
          }
          
          // 2. SPRINGBOARD MEDIUM BOOST
          if (platformLabel.includes('springboard')) {
            Body.setVelocity(this.gymnast.body, { 
              x: this.gymnast.body.velocity.x * 1.1, 
              y: -14.5 
            });
            this.inAir = true;
            this.gymnast.grounded = false;
            this.jumpCount = 0; // reset double jump in air
            this.renderer.spawnDust(this.gymnast.body.position.x, this.gymnast.body.position.y + 20, 10);
            this.renderer.spawnTextPopup(this.gymnast.body.position.x, this.gymnast.body.position.y, 'SPRINGBOARD BOOST!', '#eab308');
            gameAudio.playBoing();
            return;
          }

          // 4. TUMBLE TRACK SPEED BOOST
          if (platformLabel.includes('tumble-track')) {
            this.chalkBoostTimer = 180; // 3 seconds of high-performance speed boost!
            this.renderer.spawnTextPopup(this.gymnast.body.position.x, this.gymnast.body.position.y, 'TUMBLE SPEED BOOST!', '#06b6d4');
            gameAudio.playBoing();
            return;
          }

          // 3. STANDARD MATS / FLOORS / BEAMS
          const isGroundPlatform = (lbl) => 
            lbl.includes('mat') || 
            lbl.includes('floor') || 
            lbl.includes('beam') || 
            lbl.includes('slide') ||
            lbl.includes('tower') ||
            lbl.includes('pommel-horse');

          if (isGroundPlatform(platformLabel)) {
            this.handleLanding();
          }
        }
      });
    });
  }

  collectChalkCup(chalkBody) {
    if (chalkBody.isCollected) return;
    chalkBody.isCollected = true;

    this.chalkBoostTimer = 360; // 6 seconds of chalk grip power!
    this.starCount = Math.min(this.starCount + 1, 5); 
    this.jumpCount = 0;

    this.renderer.spawnSparkles(chalkBody.position.x, chalkBody.position.y, 25, '#22d3ee');
    this.renderer.spawnTextPopup(chalkBody.position.x, chalkBody.position.y - 30, "CHALK GRIP BOOST!", "#06b6d4");
    gameAudio.playCheer();

    Composite.remove(this.engine.world, chalkBody);
    this.environment.stars = this.environment.stars.filter(s => s !== chalkBody);
  }

  collectStar(starBody) {
    if (starBody.isCollected) return;
    starBody.isCollected = true;

    const toyType = starBody.toyType !== undefined ? starBody.toyType : 0;
    const toySkin = starBody.toySkin || 'normal';
    const toy = TOY_CATALOG[toyType] || TOY_CATALOG[0];
    const skinInfo = SKIN_CONFIG[toySkin] || SKIN_CONFIG.normal;

    // Points scale accurately by rarity (Common=150, Rare=300, Legendary=600) and skin multiplier
    let finalPoints = Math.round(toy.points * skinInfo.multiplier);
    if (this.chalkBoostTimer > 0) {
      finalPoints *= 2;
    }

    // Add to active run health and session catalog counts
    this.starCount++;
    this.inventory[toyType][toySkin]++;
    this.score += finalPoints;

    gameAudio.playCheer();

    const popupColor = skinInfo.popupColor || toy.color;
    const pos = starBody.position;
    this.renderer.spawnSparkles(pos.x, pos.y, 14);
    this.renderer.spawnTextPopup(pos.x, pos.y, `${skinInfo.label}${toy.name}! +${finalPoints}`, popupColor);

    this.environment.respawnStar(starBody);
    this.updateHUD();
    this.updateCollectionCard(toyType);
  }

  handleLanding() {
    if (!this.inAir || this.gameWon) return;
    this.inAir = false;
    this.gymnast.grounded = true;
    this.jumpCount = 0; // reset double jump counter on landing

    const normalizedAngle = Math.abs(this.gymnast.visualAngle) % (Math.PI * 2);
    const tolerance = 1.2; 
    const isUpright = normalizedAngle < tolerance || normalizedAngle > (Math.PI * 2 - tolerance);

    if (isUpright) {
      this.gymnast.visualAngle = Math.round(this.gymnast.visualAngle / (Math.PI * 2)) * (Math.PI * 2);
      this.renderer.spawnDust(this.gymnast.body.position.x, this.gymnast.body.position.y + 26, 12);
      
      // Maintain landing momentum if moving
      if (this.activeKeys['d'] || this.activeKeys['arrowright'] || this.activeKeys['a'] || this.activeKeys['arrowleft']) {
        this.gymnast.state = 'run';
      } else {
        this.gymnast.state = 'idle';
      }

      if (this.activeCombo.length > 0) {
        const baseScore = this.activeCombo.reduce((sum, t) => sum + t.score, 0);
        const multiplier = this.activeCombo.length;
        const comboBonus = baseScore * multiplier;

        this.score += comboBonus;
        this.flipsCompleted += multiplier;

        this.renderer.spawnConfetti(this.gymnast.body.position.x, this.gymnast.body.position.y - 20, 20);
        this.renderer.spawnTextPopup(
          this.gymnast.body.position.x, 
          this.gymnast.body.position.y - 60, 
          `PERFECT LANDING! ${multiplier}x Combo (+${comboBonus})`, 
          '#10b981'
        );

        this.activeCombo = [];
      } else {
        gameAudio.playGrab();
      }
    } else {
      // Landing failed! Trigger rings-spill penalty or death
      this.triggerWipeout();
    }

    this.updateHUD();
  }

  triggerWipeout() {
    // 1. Calculate spill count (losses up to 3 squishies)
    const spillCount = Math.min(this.starCount, 3);
    
    if (spillCount > 0) {
      // Lose squishy health and trigger physical scatter animation
      this.starCount -= spillCount;
      
      // Determine what unlocked toy types are available to scatter
      const collectedTypes = [];
      for (let t = 0; t < 22; t++) {
        const inv = this.inventory[t] || { normal: 0, glitter: 0, metallic: 0, galaxy: 0 };
        const sum = inv.normal + inv.glitter + inv.metallic + inv.galaxy;
        if (sum > 0) collectedTypes.push(t);
      }
      if (collectedTypes.length === 0) collectedTypes.push(0);

      const scatterTypes = [];
      for (let i = 0; i < spillCount; i++) {
        scatterTypes.push(collectedTypes[Math.floor(Math.random() * collectedTypes.length)]);
      }

      this.gymnast.setPose('wipeout');
      this.wipeoutTimer = 90; // 1.5 seconds cooldown
      this.activeCombo = [];  // Forfeit active combo queue

      // Trigger physical bounce particles
      const playerPos = this.gymnast.body.position;
      this.renderer.spawnPhysicalSpill(playerPos.x, playerPos.y, spillCount, scatterTypes);
      this.renderer.triggerShake(14);
      this.renderer.spawnTextPopup(playerPos.x, playerPos.y, `TOY SPILL! -${spillCount} Squishies`, '#fbbf24');
      
      gameAudio.playSplat();
    } else {
      // Fatal! 0 squishies left, prompt revive option
      this.promptReviveOrGameOver();
    }
  }

  checkBarGrabbing() {
    if (this.wipeoutTimer > 0 || this.gymnast.state === 'swing') return;

    const hands = this.gymnast.getHandPositions();
    const grabPoints = this.environment.grabPoints;
    const maxGrabDist = 26;

    ['left', 'right'].forEach(side => {
      const hand = hands[side];
      
      for (let i = 0; i < grabPoints.length; i++) {
        const gp = grabPoints[i];
        const dist = Vector.magnitude(Vector.sub(hand, { x: gp.x, y: gp.y }));

        if (dist <= maxGrabDist) {
          this.gymnast.grab(side, gp.body, { x: gp.x, y: gp.y });
          this.inAir = false;
          this.activeCombo = []; 
          break;
        }
      }
    });
  }

  applyHorizontalMovement() {
    if (this.gameWon) return;

    // Traverse along high bars while swinging
    if (this.gymnast.state === 'swing') {
      const leftC = this.gymnast.grabConstraints.left;
      const rightC = this.gymnast.grabConstraints.right;
      
      const goingLeft = this.activeKeys['a'] || this.activeKeys['arrowleft'];
      const goingRight = this.activeKeys['d'] || this.activeKeys['arrowright'];

      if (goingLeft || goingRight) {
        const dx = goingRight ? 1.8 : -1.8;
        
        [leftC, rightC].forEach(c => {
          if (c && c.bodyB && c.bodyB.label === 'swing-bar') {
            let newLocalX = c.pointB.x + dx;
            const halfWidth = 55; // Keep slightly inside the 60px bar radius
            newLocalX = Math.max(-halfWidth, Math.min(halfWidth, newLocalX));
            
            c.pointB.x = newLocalX;
            
            // Move physical body position along with the grab point
            Body.setPosition(this.gymnast.body, {
              x: this.gymnast.body.position.x + dx,
              y: this.gymnast.body.position.y
            });
            
            // Leg shimmy animation
            this.gymnast.runFrame += 0.08;
          }
        });
      }
      return;
    }

    const body = this.gymnast.body;
    let targetVx = 0;
    
    // Scale horizontal speed dynamically as distance progresses
    const distance = Math.max(0, Math.floor(body.position.x / 100));
    const speedMultiplier = 1.0 + Math.min(0.45, distance * 0.00035); // up to +45% speed!
    const baseSpeed = 7.8;
    let runSpeed = baseSpeed * speedMultiplier;

    // Apply Chalk/Tumble speed boost
    if (this.chalkBoostTimer > 0) {
      runSpeed *= 1.45;
      this.chalkBoostTimer--;
      
      // Spawn white/cyan speed particles behind her
      if (Math.random() < 0.25) {
        this.renderer.spawnDust(body.position.x - 10 * Math.sign(body.velocity.x), body.position.y + 12, 3);
      }
    }

    if (this.wipeoutTimer <= 0) {
      if (this.activeKeys['d'] || this.activeKeys['arrowright']) {
        targetVx = runSpeed;
        if (!this.inAir) {
          this.gymnast.setPose('run');
        }
      } else if (this.activeKeys['a'] || this.activeKeys['arrowleft']) {
        targetVx = -runSpeed;
        if (!this.inAir) {
          this.gymnast.setPose('run');
        }
      } else if (!this.inAir) {
        this.gymnast.setPose('idle');
      }
    }

    if (this.wipeoutTimer > 0) {
      Body.setVelocity(body, { x: body.velocity.x * 0.95, y: body.velocity.y });
    } else {
      const accel = this.inAir ? 0.08 : 0.22;
      const vx = body.velocity.x + (targetVx - body.velocity.x) * accel;
      Body.setVelocity(body, { x: vx, y: body.velocity.y });
    }
  }

  loop() {
    const now = performance.now();
    const frameTime = now - this.lastTime;
    this.lastTime = now;

    if (!this.revivePromptActive) {
      this.accumulator += Math.min(250, frameTime);

      while (this.accumulator >= this.fixedDelta) {
        Engine.update(this.engine, this.fixedDelta);

        this.applyHorizontalMovement();
        this.updateGymnastTricks();
        this.gymnast.updateMuscles();

        this.environment.updateLevel(this.gymnast.body.position.x);

        if (this.wipeoutTimer > 0) {
          this.wipeoutTimer--;
          if (this.wipeoutTimer <= 0) {
            this.gymnast.state = 'idle';
            this.gymnast.visualAngle = 0;
          }
        }

        // Check fall deaths
        if (this.gymnast.body.position.y > 1050 && !this.gameWon) {
          this.promptReviveOrGameOver();
        }

        this.accumulator -= this.fixedDelta;
      }
    } else {
      this.accumulator = 0;
    }

    // Distance metrics
    const currentDistance = Math.max(0, Math.floor(this.gymnast.body.position.x / 100));
    if (currentDistance > this.highestAlt) {
      this.highestAlt = currentDistance;
      this.score += 1;
    }

    this.renderer.render(this.canvas.width, this.canvas.height);

    this.updateHUD();

    if (!this.gameWon) {
      this.rafId = requestAnimationFrame(() => this.loop());
    } else {
      this.rafId = null;
    }
  }

  triggerGameOver() {
    this.gameWon = true;
    this.gymnast.setPose('wipeout');
    gameAudio.playSplat();

    const victoryTitle = document.querySelector('#victory-screen h2');
    if (victoryTitle) victoryTitle.textContent = 'GAME OVER!';

    const victorySub = document.querySelector('#victory-screen p');
    if (victorySub) victorySub.textContent = 'Belle ran out of Squishy shields and crashed! Collect toys to stay protected.';

    const victoryStars = document.getElementById('victory-stars');
    if (victoryStars) victoryStars.textContent = this.starCount;
    
    const victoryScore = document.getElementById('victory-score');
    if (victoryScore) victoryScore.textContent = this.score;

    const victoryOverlay = document.getElementById('victory-screen');
    if (victoryOverlay) {
      victoryOverlay.classList.add('visible');
    }
  }

  resetLevel() {
    Composite.clear(this.world, false);
    
    // Regenerate Environment and Gymnast (preserve session inventory collections!)
    this.environment = new Environment(this.world, this.width, this.height);
    this.gymnast = new Gymnast(this.world, 150, 700);
    this.gymnast.customization = this.currentCustomization;

    // Reset renderer
    this.renderer.gymnast = this.gymnast;
    this.renderer.environment = this.environment;
    this.renderer.particles = [];
    this.renderer.spillParticles = [];
    this.renderer.popups = [];
    this.renderer.trail = [];
    
    // Reset active run stats (Session inventory remains!)
    this.score = 0;
    this.starCount = 0; // Starts at 0 health, need first collection for protection
    this.highestAlt = 0;
    this.flipsCompleted = 0;
    this.activeCombo = [];
    this.inAir = true;
    this.jumpCount = 0;
    this.gameWon = false;
    this.wipeoutTimer = 0;
    this.chalkBoostTimer = 0;

    // Reset revive variables
    this.reviveCount = 0;
    this.revivePromptActive = false;
    if (this.reviveInterval) {
      clearInterval(this.reviveInterval);
    }
    const reviveModal = document.getElementById('revive-modal');
    if (reviveModal) {
      reviveModal.classList.remove('visible');
    }

    const victoryOverlay = document.getElementById('victory-screen');
    if (victoryOverlay) {
      victoryOverlay.classList.remove('visible');
    }

    this.updateHUD();
    this.startLoop();
  }

  updateCustomization(field, val) {
    this.currentCustomization[field] = val;
    if (this.gymnast) {
      this.gymnast.customization[field] = val;
    }
  }

  resetCustomization() {
    this.currentCustomization = { ...DEFAULT_CUSTOMIZATION };
    if (this.gymnast) {
      this.gymnast.customization = { ...DEFAULT_CUSTOMIZATION };
    }
    return this.currentCustomization;
  }

  // Draw static 3D toy thumbnails once lazily when collection modal opens
  initCollectionCanvases() {
    if (this.collectionCanvasesInitialized || !this.renderer) return;
    this.collectionCanvasesInitialized = true;

    const glowMap = {
      6: [5, '#eab308'],
      7: [6, '#fecdd3'],
      8: [10, '#fbbf24'],
      16: [6, '#d946ef'],
      17: [8, '#ff8787'],
      18: [10, '#fcc419'],
      19: [6, '#fdba74'],
      20: [6, '#67e8f9'],
      21: [10, '#34d399']
    };

    for (let i = 0; i < TOY_CATALOG.length; i++) {
      const canvas = document.getElementById(`collection-canvas-${i}`);
      if (!canvas) continue;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);

      const glow = glowMap[i];
      if (glow) {
        ctx.shadowBlur = glow[0];
        ctx.shadowColor = glow[1];
      }

      this.renderer.drawSquishyToy(ctx, i, 17);
      ctx.restore();
    }
  }

  updateCollectionCard(i) {
    const inv = this.inventory[i] || { normal: 0, glitter: 0, metallic: 0, galaxy: 0 };
    const totalCollected = inv.normal + inv.glitter + inv.metallic + inv.galaxy;

    const card = document.getElementById(`card-${i}`);
    if (!card) return;

    const countEl = card.querySelector('.card-count');
    if (countEl) countEl.textContent = `Collected: ${totalCollected}`;

    if (totalCollected > 0 && card.classList.contains('locked')) {
      card.classList.remove('locked');
    }

    if (totalCollected > 0) {
      card.style.cursor = 'pointer';
      card.onclick = () => {
        this.openSquishyViewer(i);
      };
    } else {
      card.style.cursor = 'default';
      card.onclick = null;
    }

    const normalBadge = card.querySelector('.skin-badge.normal');
    const glitterBadge = card.querySelector('.skin-badge.glitter');
    const metallicBadge = card.querySelector('.skin-badge.metallic');
    const galaxyBadge = card.querySelector('.skin-badge.galaxy');

    if (normalBadge && inv.normal > 0) normalBadge.classList.remove('locked');
    if (glitterBadge && inv.glitter > 0) glitterBadge.classList.remove('locked');
    if (metallicBadge && inv.metallic > 0) metallicBadge.classList.remove('locked');
    if (galaxyBadge && inv.galaxy > 0) galaxyBadge.classList.remove('locked');
  }

  updateCollectionUI() {
    for (let i = 0; i < TOY_CATALOG.length; i++) {
      this.updateCollectionCard(i);
    }
  }

  updateHUD() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }

    // Lazy cache DOM elements and stats tracker to avoid per-frame DOM queries/writes
    if (!this.hudElements) {
      this.hudElements = {
        score: document.getElementById('val-score'),
        highScore: document.getElementById('val-highscore'),
        stars: document.getElementById('val-stars'),
        maxAlt: document.getElementById('val-maxalt'),
        flips: document.getElementById('val-flips')
      };
      this.lastHUDStats = { score: -1, highScore: -1, starCount: -1, highestAlt: -1, flipsCompleted: -1 };
    }

    const stats = this.lastHUDStats;
    if (
      this.score === stats.score &&
      this.highScore === stats.highScore &&
      this.starCount === stats.starCount &&
      this.highestAlt === stats.highestAlt &&
      this.flipsCompleted === stats.flipsCompleted
    ) {
      return; // Skip DOM writes if values have not changed
    }

    if (this.score !== stats.score && this.hudElements.score) {
      this.hudElements.score.textContent = this.score;
      stats.score = this.score;
    }
    if (this.highScore !== stats.highScore && this.hudElements.highScore) {
      this.hudElements.highScore.textContent = this.highScore;
      stats.highScore = this.highScore;
    }
    if (this.starCount !== stats.starCount && this.hudElements.stars) {
      this.hudElements.stars.textContent = this.starCount;
      stats.starCount = this.starCount;
    }
    if (this.highestAlt !== stats.highestAlt && this.hudElements.maxAlt) {
      this.hudElements.maxAlt.textContent = `${this.highestAlt}m`;
      stats.highestAlt = this.highestAlt;
    }
    if (this.flipsCompleted !== stats.flipsCompleted && this.hudElements.flips) {
      this.hudElements.flips.textContent = this.flipsCompleted;
      stats.flipsCompleted = this.flipsCompleted;
    }
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  closeSquishyViewer() {
    this.viewerActive = false;
    if (this.viewerRafId !== null) {
      cancelAnimationFrame(this.viewerRafId);
      this.viewerRafId = null;
    }
  }

  openSquishyViewer(typeId) {
    if (this.viewerRafId !== null) {
      cancelAnimationFrame(this.viewerRafId);
      this.viewerRafId = null;
    }

    this.viewerTypeId = typeId;
    this.viewerActive = true;
    this.viewerRotation = 0;
    this.viewerTiltX = 0;
    this.viewerTiltY = 0;

    const item = TOY_CATALOG[typeId] || TOY_CATALOG[0];
    const rarityEl = document.getElementById('viewer-rarity');
    if (rarityEl) {
      rarityEl.textContent = item.rarity;
      rarityEl.className = `card-rarity ${item.rarityClass}`;
    }

    document.getElementById('viewer-name').textContent = item.name;
    document.getElementById('viewer-description').textContent = item.description;
    document.getElementById('viewer-val-points').textContent = item.points;

    const inv = this.inventory[typeId] || { normal: 0, glitter: 0, metallic: 0, galaxy: 0 };
    
    // Default to first unlocked skin
    let activeSkin = 'normal';
    if (inv.normal > 0) activeSkin = 'normal';
    else if (inv.glitter > 0) activeSkin = 'glitter';
    else if (inv.metallic > 0) activeSkin = 'metallic';
    else if (inv.galaxy > 0) activeSkin = 'galaxy';

    this.activeViewerSkin = activeSkin;

    document.getElementById('viewer-val-mult').textContent = SKIN_CONFIG[activeSkin].multText;

    const setupBadge = (id, skinName, unlocked) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (unlocked) {
        el.classList.remove('locked');
      } else {
        el.classList.add('locked');
      }
      el.onclick = () => {
        if (unlocked) {
          this.activeViewerSkin = skinName;
          document.getElementById('viewer-val-mult').textContent = SKIN_CONFIG[skinName].multText;
          document.querySelectorAll('.viewer-skin-badge').forEach(b => b.classList.remove('active'));
          el.classList.add('active');
        }
      };
    };

    setupBadge('badge-view-normal', 'normal', inv.normal > 0);
    setupBadge('badge-view-glitter', 'glitter', inv.glitter > 0);
    setupBadge('badge-view-metallic', 'metallic', inv.metallic > 0);
    setupBadge('badge-view-galaxy', 'galaxy', inv.galaxy > 0);

    // Set active badge style
    document.querySelectorAll('.viewer-skin-badge').forEach(b => {
      b.classList.remove('active');
      if (b.dataset.skin === activeSkin) b.classList.add('active');
    });

    const modal = document.getElementById('squishy-viewer-modal');
    if (modal) modal.classList.add('visible');

    // Cache canvas & context once and attach mouse + touch handlers for interactive tilt
    const canvas = document.getElementById('viewer-canvas');
    if (canvas) {
      this.viewerCanvas = canvas;
      this.viewerCtx = canvas.getContext('2d');
      const updateTiltFromClient = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (clientX - rect.left) / rect.width - 0.5;
        const my = (clientY - rect.top) / rect.height - 0.5;
        this.viewerTiltX = mx * 1.5;
        this.viewerTiltY = my * 1.5;
      };
      canvas.onmousemove = (e) => updateTiltFromClient(e.clientX, e.clientY);
      canvas.onmouseleave = () => {
        this.viewerTiltX = 0;
        this.viewerTiltY = 0;
      };
      canvas.ontouchmove = (e) => {
        if (e.touches.length > 0) {
          e.preventDefault();
          updateTiltFromClient(e.touches[0].clientX, e.touches[0].clientY);
        }
      };
      canvas.ontouchend = () => {
        this.viewerTiltX = 0;
        this.viewerTiltY = 0;
      };
    }

    this.renderViewer();
  }

  renderViewer() {
    if (!this.viewerActive) {
      this.viewerRafId = null;
      return;
    }

    const canvas = this.viewerCanvas;
    const ctx = this.viewerCtx;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = performance.now();
    this.viewerRotation += 0.012;
    const angle = this.viewerRotation + this.viewerTiltX;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);

    // Render large glowing skin aura behind toy
    const skin = this.activeViewerSkin;
    ctx.save();
    const auraRadius = 115; // Enlarged glow radius
    const auraGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, auraRadius);

    if (skin === 'glitter') {
      auraGrad.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
      auraGrad.addColorStop(0.7, 'rgba(236, 72, 153, 0.15)');
      auraGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
    } else if (skin === 'metallic') {
      auraGrad.addColorStop(0, 'rgba(241, 245, 249, 0.5)');
      auraGrad.addColorStop(0.7, 'rgba(148, 163, 184, 0.18)');
      auraGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
    } else if (skin === 'galaxy') {
      auraGrad.addColorStop(0, 'rgba(168, 85, 247, 0.55)');
      auraGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.22)');
      auraGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
      
      // Spinner orbital celestial ring
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.35)';
      ctx.lineWidth = 2.0;
      ctx.save();
      ctx.rotate(now * 0.001);
      ctx.beginPath();
      ctx.ellipse(0, 0, 100, 30, 0.2, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    } else {
      auraGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      auraGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }

    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Characteristics: Draw rising steam curves above Dumplings (9..18)
    if (this.viewerTypeId >= 9 && this.viewerTypeId <= 18) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 2.0;
      for (let s = 0; s < 3; s++) {
        const steamOffset = (now * 0.03 + s * 30) % 80;
        const steamX = -20 + s * 20 + Math.sin(now * 0.004 + s) * 6;
        const steamY = -50 - steamOffset;
        ctx.beginPath();
        ctx.moveTo(steamX, steamY);
        ctx.quadraticCurveTo(steamX + 5, steamY - 10, steamX - 5, steamY - 20);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Characteristics: Draw floating neon purple spots rising from UV Light Dumpling (16)
    if (this.viewerTypeId === 16) {
      ctx.save();
      for (let p = 0; p < 4; p++) {
        const pOffset = (now * 0.02 + p * 20) % 65;
        const px = -22 + p * 15 + Math.sin(now * 0.005 + p) * 4;
        const py = -40 - pOffset;
        const alpha = 1.0 - pOffset / 65;
        ctx.fillStyle = `rgba(217, 70, 239, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Characteristics: Draw rotating gold sparkles around Golden Cube (8) or Golden Dumpling (18)
    if (this.viewerTypeId === 8 || this.viewerTypeId === 18) {
      ctx.save();
      ctx.rotate(now * 0.0012);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 1.4;
      const drawSpark = (sx, sy) => {
        ctx.beginPath();
        ctx.moveTo(sx - 7, sy); ctx.lineTo(sx + 7, sy);
        ctx.moveTo(sx, sy - 7); ctx.lineTo(sx, sy + 7);
        ctx.stroke();
      };
      drawSpark(-60, -60);
      drawSpark(60, 60);
      drawSpark(-60, 60);
      drawSpark(60, -60);
      ctx.restore();
    }

    // Characteristics: Apply dynamic deform/squish transforms directly to the canvas context
    ctx.save();
    let scaleX = 1.0;
    let scaleY = 1.0;
    let transY = 0;

    if (this.viewerTypeId === 3) {
      // Gumdrop slow-rise compression
      const cycle = (now * 0.002) % (Math.PI * 2);
      const factor = Math.sin(cycle);
      scaleY = 1.0 - Math.max(0, factor) * 0.16;
      scaleX = 1.0 + Math.max(0, factor) * 0.08;
      transY = 15 * Math.max(0, factor);
    } else if (this.viewerTypeId === 19) {
      // Gummy Bear jello jiggle wobble
      const cycle = now * 0.008;
      scaleY = 1.0 + Math.sin(cycle) * 0.05;
      scaleX = 1.0 - Math.sin(cycle) * 0.025;
      transY = -Math.abs(Math.sin(cycle)) * 2;
    }

    ctx.translate(0, transY);
    ctx.scale(scaleX, scaleY);

    // Draw the toy at large size (radius 76 = 5.4x size increase)
    this.renderer.drawSquishyToy(ctx, this.viewerTypeId, 76, angle, skin);

    ctx.restore(); // Restore deform transforms

    // Accent overlays for the viewer (like stars, sparkles, chrome line)
    if (skin === 'glitter') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-45, -45); ctx.lineTo(-30, -45);
      ctx.moveTo(-37, -52); ctx.lineTo(-37, -38);
      ctx.moveTo(35, 35); ctx.lineTo(50, 35);
      ctx.moveTo(42, 28); ctx.lineTo(42, 42);
      ctx.stroke();
    } 
    else if (skin === 'metallic') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(-50, -50);
      ctx.lineTo(-15, -50);
      ctx.lineTo(-35, 50);
      ctx.lineTo(-70, 50);
      ctx.closePath();
      ctx.fill();
    }
    else if (skin === 'galaxy') {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-35, 35, 2.5, 0, Math.PI*2);
      ctx.arc(35, -35, 2.5, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();

    this.viewerRafId = requestAnimationFrame(() => this.renderViewer());
  }

  getPermanentSquishyCount() {
    let total = 0;
    for (let t = 0; t < 22; t++) {
      const inv = this.inventory[t] || { normal: 0, glitter: 0, metallic: 0, galaxy: 0 };
      total += inv.normal + inv.glitter + inv.metallic + inv.galaxy;
    }
    return total;
  }

  deductPermanentSquishies(amount) {
    let deducted = 0;
    const variants = ['normal', 'glitter', 'metallic', 'galaxy'];
    
    for (let v of variants) {
      for (let t = 0; t < 22; t++) {
        if (this.inventory[t] && this.inventory[t][v] > 0) {
          const take = Math.min(this.inventory[t][v], amount - deducted);
          this.inventory[t][v] -= take;
          deducted += take;
          if (deducted >= amount) {
            this.updateCollectionUI();
            return true;
          }
        }
      }
    }
    
    this.updateCollectionUI();
    return deducted >= amount;
  }

  promptReviveOrGameOver() {
    if (this.gameWon || this.revivePromptActive) return;

    this.totalDeaths++;
    this.reviveCost = 2; // Flat 2 squishies to revive
    const totalBal = this.getPermanentSquishyCount();

    const modal = document.getElementById('revive-modal');
    if (modal) {
      modal.classList.add('visible');
    }

    document.getElementById('revive-cost-value').textContent = `${this.reviveCost} Squishies`;
    document.getElementById('revive-balance-value').textContent = totalBal;

    const confirmBtn = document.getElementById('btn-confirm-revive');
    if (totalBal >= this.reviveCost) {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1.0';
      confirmBtn.style.cursor = 'pointer';
    } else {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.4';
      confirmBtn.style.cursor = 'not-allowed';
    }

    this.revivePromptActive = true;
    this.reviveTimeLeft = 6.0;

    const progressPath = document.getElementById('timer-progress');
    const timerText = document.getElementById('revive-timer-text');

    if (this.reviveInterval) {
      clearInterval(this.reviveInterval);
    }

    const updateTimer = () => {
      if (!this.revivePromptActive) {
        clearInterval(this.reviveInterval);
        return;
      }
      
      timerText.textContent = Math.ceil(this.reviveTimeLeft);
      const pct = (this.reviveTimeLeft / 6.0) * 100;
      if (progressPath) {
        progressPath.setAttribute('stroke-dasharray', `${pct}, 100`);
      }

      if (this.reviveTimeLeft <= 0) {
        clearInterval(this.reviveInterval);
        this.skipRevive();
      }
      this.reviveTimeLeft -= 0.05;
    };

    this.reviveInterval = setInterval(updateTimer, 50);

    confirmBtn.onclick = () => {
      clearInterval(this.reviveInterval);
      this.confirmRevive();
    };

    const skipBtn = document.getElementById('btn-skip-revive');
    if (skipBtn) {
      skipBtn.onclick = () => {
        clearInterval(this.reviveInterval);
        this.skipRevive();
      };
    }
  }

  confirmRevive() {
    this.revivePromptActive = false;
    const modal = document.getElementById('revive-modal');
    if (modal) {
      modal.classList.remove('visible');
    }

    this.deductPermanentSquishies(this.reviveCost);
    this.reviveCount++;

    this.starCount = 1;
    this.gymnast.state = 'run';
    this.gymnast.visualAngle = 0;
    this.wipeoutTimer = 0;

    const pos = this.gymnast.body.position;
    const gymnastX = pos.x;

    let bestPlatform = null;
    let maxPX = -Infinity;

    if (this.environment && this.environment.staticBodies) {
      for (let body of this.environment.staticBodies) {
        const lbl = body.label || '';
        if (lbl === 'mat-ground' || lbl === 'mat-platform' || lbl === 'floating-mat' || lbl === 'tower-block') {
          if (body.position.x <= gymnastX + 60) {
            if (body.position.x > maxPX) {
              maxPX = body.position.x;
              bestPlatform = body;
            }
          }
        }
      }
    }

    let targetX = gymnastX;
    let targetY = pos.y - 140;

    if (bestPlatform) {
      targetX = bestPlatform.position.x;
      targetY = bestPlatform.bounds.min.y - 50;
    } else {
      targetX = 400;
      targetY = 780;
    }

    Body.setPosition(this.gymnast.body, { x: targetX, y: targetY });
    Body.setVelocity(this.gymnast.body, { x: 7.8, y: 0 });

    this.renderer.spawnSparkles(targetX, targetY, 25);
    this.renderer.spawnTextPopup(targetX, targetY - 40, "REVIVED!", "#10b981");

    this.canvas.focus();
  }

  skipRevive() {
    this.revivePromptActive = false;
    const modal = document.getElementById('revive-modal');
    if (modal) {
      modal.classList.remove('visible');
    }

    this.triggerGameOver();
  }
}
