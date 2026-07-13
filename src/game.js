import Matter from 'matter-js';
import { Gymnast } from './gymnast';
import { Environment } from './environment';
import { CustomRenderer } from './renderer';
import { gameAudio } from './audio';

const { Engine, Events, Composite, Vector, Body } = Matter;

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

    // Physics step accumulator
    this.accumulator = 0;
    this.fixedDelta = 1000 / 60; // 16.666 ms

    // 3D Squishy Viewer state
    this.viewerActive = false;
    this.viewerTypeId = 0;
    this.activeViewerSkin = 'normal';
    this.viewerRotation = 0;
    this.viewerTiltX = 0;
    this.viewerTiltY = 0;

    // Revive state variables
    this.reviveCount = 0;
    this.totalDeaths = 0;
    this.revivePromptActive = false;

    // Store customization choices
    this.currentCustomization = {
      skinColor: '#ffdbac',
      hairColor: '#e0a96d',
      hairStyle: 'pony',
      outfitColor: '#db2777',
      hat: 'none',
      hasCape: false
    };

    this.initPhysics();
    this.initGame();
    this.initInput();
    this.initCollisions();
    
    // Start loop
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    this.lastTime = performance.now();
    this.loop();
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

      const key = e.key.toLowerCase();
      this.activeKeys[key] = true;


      // Jump action
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.triggerJump();
      }

      // Reset shortcut (Enter key)
      if (e.key === 'Enter') {
        this.resetLevel();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      this.activeKeys[key] = false;
    });

    // Mobile / Touch controls hooking
    this.setupTouchControls();
  }

  setupTouchControls() {
    const bindBtn = (id, action) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      
      const handlerStart = (e) => {
        e.preventDefault();
        if (this.gameWon || this.wipeoutTimer > 0) return;
        
        if (action === 'jump') {
          this.triggerJump();
        } else if (action === 'left') {
          this.activeKeys['a'] = true;
        } else if (action === 'right') {
          this.activeKeys['d'] = true;
        } else {
          this.activeKeys[action] = true;
        }
      };

      const handlerEnd = (e) => {
        e.preventDefault();
        if (action === 'left') {
          this.activeKeys['a'] = false;
        } else if (action === 'right') {
          this.activeKeys['d'] = false;
        } else if (action !== 'jump') {
          this.activeKeys[action] = false;
        }
      };

      btn.addEventListener('touchstart', handlerStart, { passive: false });
      btn.addEventListener('touchend', handlerEnd, { passive: false });
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
    
    // 1. Points scale based on rarity: Common=150, Rare=300, Legendary=600
    let basePoints = 150;
    if (toyType >= 3 && toyType <= 5) {
      basePoints = 300;
    } else if (toyType >= 6) {
      basePoints = 600;
    }

    // 2. Skin multipliers: glitter=1.5x, metallic=2x, galaxy=3x
    let multiplier = 1.0;
    let skinLabel = '';
    if (toySkin === 'glitter') {
      multiplier = 1.5;
      skinLabel = 'Glitter ';
    } else if (toySkin === 'metallic') {
      multiplier = 2.0;
      skinLabel = 'Metallic ';
    } else if (toySkin === 'galaxy') {
      multiplier = 3.0;
      skinLabel = 'Galaxy ';
    }

    let finalPoints = Math.round(basePoints * multiplier);
    if (this.chalkBoostTimer > 0) {
      finalPoints *= 2;
    }
    
    // Add to active run health and session catalog counts
    this.starCount++;
    this.inventory[toyType][toySkin]++;
    this.score += finalPoints;
    
    gameAudio.playCheer();

    const names = [
      'Nice Cube NeeDoh', 
      'Wendy Frog Squish', 
      'Cam Cat Squish', 
      'NeeDoh Gumdrop', 
      'Connor Cow Squish', 
      'Teenie NeeDohs', 
      'Shaggy NeeDoh', 
      'Archie Axolotl Squish', 
      'Golden Nice Cube',
      'Red Dumpling Squishy',
      'Orange Dumpling Squishy',
      'Yellow Dumpling Squishy',
      'Green Dumpling Squishy',
      'Blue Dumpling Squishy',
      'Purple Dumpling Squishy',
      'Pink Dumpling Squishy',
      'UV Light Dumpling',
      'Rainbow Dumpling',
      'Golden Dumpling'
    ];
    
    const colors = [
      '#38bdf8', 
      '#4ade80', 
      '#fef3c7', 
      '#f472b6', 
      '#ffffff', 
      '#fb923c', 
      '#eab308', 
      '#fbcfe8', 
      '#fbbf24',
      '#ff6b6b',
      '#ff922b',
      '#ffd43b',
      '#51cf66',
      '#339af0',
      '#cc5de8',
      '#faa2c1',
      '#c084fc',
      '#ff8787',
      '#fcc419'
    ];

    // Fancy variant popup coloring
    let popupColor = colors[toyType];
    if (toySkin === 'glitter') popupColor = '#f472b6'; // pink glitter text
    else if (toySkin === 'metallic') popupColor = '#cbd5e1'; // chrome silver text
    else if (toySkin === 'galaxy') popupColor = '#c084fc'; // purple galaxy text

    const pos = starBody.position;
    this.renderer.spawnSparkles(pos.x, pos.y, 14);
    this.renderer.spawnTextPopup(pos.x, pos.y, `${skinLabel}${names[toyType]}! +${finalPoints}`, popupColor);

    this.environment.respawnStar(starBody);
    this.updateHUD();
    this.updateCollectionUI();
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
      requestAnimationFrame(() => this.loop());
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
    this.updateCollectionUI();
    
    this.lastTime = performance.now();
    this.loop();
  }

  updateCustomization(field, val) {
    this.currentCustomization[field] = val;
    if (this.gymnast) {
      this.gymnast.customization[field] = val;
    }
  }

  updateCollectionUI() {
    for (let i = 0; i < 22; i++) {
      const inv = this.inventory[i] || { normal: 0, glitter: 0, metallic: 0, galaxy: 0 };
      const totalCollected = inv.normal + inv.glitter + inv.metallic + inv.galaxy;
      
      const card = document.getElementById(`card-${i}`);
      if (!card) continue;

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

      // Unlock individual skin badges
      const normalBadge = card.querySelector('.skin-badge.normal');
      const glitterBadge = card.querySelector('.skin-badge.glitter');
      const metallicBadge = card.querySelector('.skin-badge.metallic');
      const galaxyBadge = card.querySelector('.skin-badge.galaxy');

      if (normalBadge && inv.normal > 0) normalBadge.classList.remove('locked');
      if (glitterBadge && inv.glitter > 0) glitterBadge.classList.remove('locked');
      if (metallicBadge && inv.metallic > 0) metallicBadge.classList.remove('locked');
      if (galaxyBadge && inv.galaxy > 0) galaxyBadge.classList.remove('locked');

      // Draw matching premium 3D vector graphics on the collection card canvas
      const canvas = document.getElementById(`collection-canvas-${i}`);
      if (canvas && this.renderer) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        
        // Match glow shading on Legendary and Rare items
        if (i === 6) {
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#eab308';
        } else if (i === 7) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#fecdd3';
        } else if (i === 8) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fbbf24';
        } else if (i === 16) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#d946ef';
        } else if (i === 17) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ff8787';
        } else if (i === 18) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#fcc419';
        } else if (i === 19) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#fdba74';
        } else if (i === 20) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#67e8f9';
        } else if (i === 21) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#34d399';
        }

        this.renderer.drawSquishyToy(ctx, i, 17);
        ctx.restore();
      }
    }
  }

  updateHUD() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('val-score', this.score);
    setVal('val-highscore', this.highScore);
    setVal('val-stars', this.starCount);
    setVal('val-maxalt', `${this.highestAlt}m`);
    setVal('val-flips', this.flipsCompleted);
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  openSquishyViewer(typeId) {
    this.viewerTypeId = typeId;
    this.viewerActive = true;
    this.viewerRotation = 0;
    this.viewerTiltX = 0;
    this.viewerTiltY = 0;

    const names = [
      'Nice Cube NeeDoh', 
      'Wendy Frog Squish', 
      'Cam Cat Squish', 
      'NeeDoh Gumdrop', 
      'Connor Cow Squish', 
      'Teenie NeeDohs', 
      'Shaggy NeeDoh', 
      'Archie Axolotl Squish', 
      'Golden Nice Cube',
      'Red Dumpling Squishy',
      'Orange Dumpling Squishy',
      'Yellow Dumpling Squishy',
      'Green Dumpling Squishy',
      'Blue Dumpling Squishy',
      'Purple Dumpling Squishy',
      'Pink Dumpling Squishy',
      'UV Light Dumpling',
      'Rainbow Dumpling',
      'Golden Dumpling',
      'Gummy Bear NeeDoh',
      'Fuzz Ball NeeDoh',
      'Colour Change NeeDoh'
    ];

    const descriptions = [
      'A super squishy transparent cube filled with shaving cream-like NeeDoh compound! Squeeze it to watch it deform.',
      'Wendy is a bright green frog who loves reading books by the pond and gardening with her friends!',
      'Cam is a cute calico cat mochi. He loves taking long naps in warm sunny spots and eating treats.',
      'A soft, velvety gumdrop squishy. It has a beautiful matte surface texture and an incredibly slow rise.',
      'Connor is a sweet black-and-white cow who loves baking fresh apple pies and playing soccer on the farm.',
      'A cluster of three tiny, super-glossy neon squishy spheres that bounce and slide together!',
      'A bright yellow stress ball covered in hundreds of shaggy, stretchy rubber strands ending in golden beads.',
      'Archie is a pink axolotl who loves learning sign language and playing the harp at gymnastics events!',
      'An ultra-rare holographic golden Nice Cube. Reflects light from every angle with spectacular chrome sparkles.',
      'A classic red dumpling squishy. Freshly steamed and super soft, it deforms easily under pressure.',
      'A bright orange dumpling squishy. Infused with a sweet citrus scent for extra sensory relaxation!',
      'A bright yellow dumpling squishy. Soft and elastic, it deforms and instantly rebounds back into shape.',
      'A cool green dumpling squishy. Feels incredibly refreshing to hold and squeeze after a long day.',
      'A sky blue dumpling squishy. Emits a soothing ambient glow under direct sunlight.',
      'A mysterious purple dumpling squishy. Its slow-rise density makes it incredibly satisfying to squish.',
      'A bright pink dumpling squishy. A cute and stylish addition to any squishy collector catalog!',
      'An ultraviolet reactive dumpling that glows with indigo light. Reveals secret glowing speckles under UV lights.',
      'A legendary dumpling that reflects a complete 6-color rainbow gradient. A masterpiece of squishy art!',
      'A solid gold metallic dumpling. Pure gold plating with dazzling sparkles that rotate as it spins.',
      'A cute translucent gummy bear squishy. Made from stretchy, rubbery compound that deforms and bounces!',
      'A soft fuzz-covered stress ball! Hundreds of micro-fuzzy hair strands make it incredibly soothing to squeeze.',
      'A magical colour-changing squishy ball! Smoothly shifts from vibrant green to bright pink as it bounces or gets squished.'
    ];

    const rarities = [
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'RARE', class: 'rare', points: 300 },
      { text: 'RARE', class: 'rare', points: 300 },
      { text: 'RARE', class: 'rare', points: 300 },
      { text: 'LEGENDARY', class: 'legendary', points: 600 },
      { text: 'LEGENDARY', class: 'legendary', points: 600 },
      { text: 'LEGENDARY', class: 'legendary', points: 600 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'COMMON', class: 'common', points: 150 },
      { text: 'RARE', class: 'rare', points: 300 },
      { text: 'LEGENDARY', class: 'legendary', points: 600 },
      { text: 'LEGENDARY', class: 'legendary', points: 600 },
      { text: 'RARE', class: 'rare', points: 300 },
      { text: 'RARE', class: 'rare', points: 300 },
      { text: 'LEGENDARY', class: 'legendary', points: 600 }
    ];

    const item = rarities[typeId];
    const rarityEl = document.getElementById('viewer-rarity');
    if (rarityEl) {
      rarityEl.textContent = item.text;
      rarityEl.className = `card-rarity ${item.class}`;
    }

    document.getElementById('viewer-name').textContent = names[typeId];
    document.getElementById('viewer-description').textContent = descriptions[typeId];
    document.getElementById('viewer-val-points').textContent = item.points;

    const inv = this.inventory[typeId] || { normal: 0, glitter: 0, metallic: 0, galaxy: 0 };
    
    // Default to first unlocked skin
    let activeSkin = 'normal';
    if (inv.normal > 0) activeSkin = 'normal';
    else if (inv.glitter > 0) activeSkin = 'glitter';
    else if (inv.metallic > 0) activeSkin = 'metallic';
    else if (inv.galaxy > 0) activeSkin = 'galaxy';

    this.activeViewerSkin = activeSkin;

    const mults = { normal: '1.0x', glitter: '1.5x', metallic: '2.0x', galaxy: '3.0x' };
    document.getElementById('viewer-val-mult').textContent = mults[activeSkin];

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
          document.getElementById('viewer-val-mult').textContent = mults[skinName];
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

    // Attach mouse handlers for interactive tilt
    const canvas = document.getElementById('viewer-canvas');
    if (canvas) {
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width - 0.5;
        const my = (e.clientY - rect.top) / rect.height - 0.5;
        this.viewerTiltX = mx * 1.5;
        this.viewerTiltY = my * 1.5;
      };
      canvas.onmouseleave = () => {
        this.viewerTiltX = 0;
        this.viewerTiltY = 0;
      };
    }

    this.renderViewer();
  }

  renderViewer() {
    if (!this.viewerActive) return;

    const canvas = document.getElementById('viewer-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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
      ctx.rotate(Date.now() * 0.001);
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
        const steamOffset = (Date.now() * 0.03 + s * 30) % 80;
        const steamX = -20 + s * 20 + Math.sin(Date.now() * 0.004 + s) * 6;
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
        const pOffset = (Date.now() * 0.02 + p * 20) % 65;
        const px = -22 + p * 15 + Math.sin(Date.now() * 0.005 + p) * 4;
        const py = -40 - pOffset;
        const alpha = 1.0 - pOffset / 65;
        ctx.fillStyle = `rgba(217, 70, 239, ${alpha})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#d946ef';
        ctx.beginPath();
        ctx.arc(px, py, 2.0, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Characteristics: Draw rotating gold sparkles around Golden Cube (8) or Golden Dumpling (18)
    if (this.viewerTypeId === 8 || this.viewerTypeId === 18) {
      ctx.save();
      ctx.rotate(Date.now() * 0.0012);
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

    ctx.shadowBlur = 18;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';

    // Characteristics: Apply dynamic deform/squish transforms directly to the canvas context
    ctx.save();
    let scaleX = 1.0;
    let scaleY = 1.0;
    let transY = 0;

    if (this.viewerTypeId === 3) {
      // Gumdrop slow-rise compression
      const cycle = (Date.now() * 0.002) % (Math.PI * 2);
      const factor = Math.sin(cycle);
      scaleY = 1.0 - Math.max(0, factor) * 0.16;
      scaleX = 1.0 + Math.max(0, factor) * 0.08;
      transY = 15 * Math.max(0, factor);
    } else if (this.viewerTypeId === 19) {
      // Gummy Bear jello jiggle wobble
      const cycle = Date.now() * 0.008;
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

    requestAnimationFrame(() => this.renderViewer());
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
