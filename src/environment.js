import Matter from 'matter-js';

const { Bodies, Body, Constraint, Composite } = Matter;

export class Environment {
  constructor(world, width, height) {
    this.world = world;
    this.width = width; // Default initial width, level is infinite
    this.height = height;
    
    this.staticBodies = [];
    this.interactiveBodies = [];
    this.grabPoints = []; 
    this.stars = []; // Collectibles (Toy Squishies)
    this.foamBlocks = [];
    
    this.trophy = null; // No end trophy needed for infinite mode, but keep variable to prevent errors

    this.lastGeneratedX = 800; // Start zone is 0 to 800
    this.buildStartZone();
  }

  // Build the initial starting platform
  buildStartZone() {
    const floorY = 900;
    
    // Left boundary wall
    this.createPlatform(-20, this.height / 2, 40, this.height, 'boundary-wall');
    // Sky Ceiling
    this.createPlatform(this.width / 2, -20, this.width * 2, 40, 'boundary-ceiling');

    // Starting platform mat (from x: 0 to 800)
    this.createPlatform(400, floorY, 800, 150, 'mat-ground');
    
    // Starting beam
    this.createPlatform(300, floorY - 50, 180, 12, 'balance-beam');
    
    // Spawn springboard near the end of start zone
    this.createSpringboard(680, floorY - 20, 70, 10);

    // Spawn initial toy squishies
    this.spawnSquishy(300, floorY - 110);
    this.spawnSquishy(500, floorY - 120);
    this.spawnSquishy(550, floorY - 180);
    this.spawnSquishy(600, floorY - 180);
  }

  createPlatform(x, y, w, h, label = 'platform') {
    const p = Bodies.rectangle(x, y + h / 2, w, h, {
      isStatic: true,
      friction: 0.8,
      label: label
    });
    this.staticBodies.push(p);
    Composite.add(this.world, p);
    return p;
  }

  createTrampoline(x, y, width, height, customLabel = 'trampoline-bed') {
    const leftPost = Bodies.rectangle(x - width/2, y + 10, 12, height * 2.5, { isStatic: true, label: 'trampoline-post' });
    const rightPost = Bodies.rectangle(x + width/2, y + 10, 12, height * 2.5, { isStatic: true, label: 'trampoline-post' });
    
    const bed = Bodies.rectangle(x, y, width - 16, height, {
      density: 0.005,
      friction: 0.1,
      restitution: 1.5, // High bounce for tricks!
      label: customLabel
    });

    const springL = Constraint.create({
      bodyA: leftPost,
      pointA: { x: 6, y: -height/2 },
      bodyB: bed,
      pointB: { x: -width/2 + 8, y: 0 },
      stiffness: 0.18,
      damping: 0.04,
      length: 6
    });

    const springR = Constraint.create({
      bodyA: rightPost,
      pointA: { x: -6, y: -height/2 },
      bodyB: bed,
      pointB: { x: width/2 - 8, y: 0 },
      stiffness: 0.18,
      damping: 0.04,
      length: 6
    });

    this.staticBodies.push(leftPost, rightPost);
    bed._constraints = [springL, springR];
    this.interactiveBodies.push(bed);
    Composite.add(this.world, [leftPost, rightPost, bed, springL, springR]);
  }

  createSpringboard(x, y, width, height) {
    const anchor = Bodies.rectangle(x - width/2, y + 10, 8, 8, { isStatic: true, label: 'board-anchor' });
    
    const plank = Bodies.rectangle(x, y, width, height, {
      angle: -0.16,
      density: 0.003,
      friction: 0.8,
      restitution: 1.3,
      label: 'springboard-plank'
    });

    const pivot = Constraint.create({
      bodyA: anchor,
      pointA: { x: 4, y: -4 },
      bodyB: plank,
      pointB: { x: -width/2, y: 0 },
      stiffness: 0.98,
      length: 0
    });

    const supportSpring = Constraint.create({
      pointA: { x: x + width/2 - 8, y: y + 20 },
      bodyB: plank,
      pointB: { x: width/2 - 4, y: 0 },
      stiffness: 0.22,
      damping: 0.05,
      length: 12
    });

    this.staticBodies.push(anchor);
    plank._constraints = [pivot, supportSpring];
    this.interactiveBodies.push(plank);
    Composite.add(this.world, [anchor, plank, pivot, supportSpring]);
  }

  createSwingingRings(x, yAnchor, ropeLength) {
    const anchor = Bodies.circle(x, yAnchor, 6, { isStatic: true, label: 'ring-anchor' });
    const ring = Bodies.circle(x, yAnchor + ropeLength, 16, {
      density: 0.0015,
      frictionAir: 0.003,
      friction: 0.8,
      label: 'swinging-ring'
    });

    const rope = Constraint.create({
      bodyA: anchor,
      pointA: { x: 0, y: 0 },
      bodyB: ring,
      pointB: { x: 0, y: 0 },
      stiffness: 0.9,
      length: ropeLength
    });

    this.staticBodies.push(anchor);
    ring._constraints = [rope];
    this.interactiveBodies.push(ring);
    
    this.grabPoints.push({
      body: ring,
      x: x,
      y: yAnchor + ropeLength,
      radius: 18,
      label: 'Swinging Ring',
      isDynamic: true
    });

    Composite.add(this.world, [anchor, ring, rope]);
  }

  spawnSquishy(x, y) {
    const distance = Math.max(0, Math.floor(x / 100));
    let typeId = 0; // default Cam Cat
    
    const rand = Math.random();
    
    const commonPool = [0, 1, 2, 9, 10, 11, 12, 13, 14, 15];
    const rarePool = [3, 4, 5, 16, 19, 20];
    const legendaryPool = [6, 7, 8, 17, 18, 21];

    if (distance < 100) {
      // Common only
      typeId = commonPool[Math.floor(Math.random() * commonPool.length)];
    } else if (distance < 300) {
      // 70% Common, 30% Rare
      if (rand < 0.70) {
        typeId = commonPool[Math.floor(Math.random() * commonPool.length)];
      } else {
        typeId = rarePool[Math.floor(Math.random() * rarePool.length)];
      }
    } else if (distance < 500) {
      // 60% Common, 30% Rare, 10% Legendary
      if (rand < 0.60) {
        typeId = commonPool[Math.floor(Math.random() * commonPool.length)];
      } else if (rand < 0.90) {
        typeId = rarePool[Math.floor(Math.random() * rarePool.length)];
      } else {
        typeId = legendaryPool[Math.floor(Math.random() * legendaryPool.length)];
      }
    } else {
      // 45% Common, 35% Rare, 20% Legendary
      if (rand < 0.45) {
        typeId = commonPool[Math.floor(Math.random() * commonPool.length)];
      } else if (rand < 0.80) {
        typeId = rarePool[Math.floor(Math.random() * rarePool.length)];
      } else {
        typeId = legendaryPool[Math.floor(Math.random() * legendaryPool.length)];
      }
    }

    // 2. Select skin variant based on progress distance (accelerated progression)
    let skin = 'normal';
    const skinRand = Math.random();
    
    if (distance >= 50 && distance < 150) {
      if (skinRand < 0.20) skin = 'glitter';
    } else if (distance >= 150 && distance < 300) {
      if (skinRand < 0.18) skin = 'glitter';
      else if (skinRand < 0.30) skin = 'metallic';
    } else if (distance >= 300) {
      if (skinRand < 0.20) skin = 'glitter';
      else if (skinRand < 0.38) skin = 'metallic';
      else if (skinRand < 0.50) skin = 'galaxy';
    }

    const squishy = Bodies.circle(x, y, 14, {
      isStatic: true,
      isSensor: true,
      label: 'star-collectible' // Keep key name to avoid game.js structural breakages
    });
    
    squishy.toyType = typeId;
    squishy.toySkin = skin;
    squishy.colorIndex = Math.floor(Math.random() * 5); // default color index fallback
    this.stars.push(squishy);
    Composite.add(this.world, squishy);
  }

  spawnChalkCup(x, y) {
    const chalk = Bodies.circle(x, y, 16, {
      isStatic: true,
      isSensor: true,
      label: 'chalk-cup'
    });
    this.stars.push(chalk); // Leverage stars list for auto-rendering and cleanup
    Composite.add(this.world, chalk);
  }

  // Called in game loop to infinitely generate segments ahead and delete off-screen assets behind
  updateLevel(playerX) {
    // 1. Generate new content ahead (player is 1200px close to the edge)
    if (playerX > this.lastGeneratedX - 1200) {
      this.generateNextSegment();
    }

    // 2. Clean up old elements to maintain lightweight execution
    const cullBoundaryX = playerX - 1800;
    
    // Cull static bodies (including old ceiling segments, keeping left boundary wall)
    for (let i = this.staticBodies.length - 1; i >= 0; i--) {
      const body = this.staticBodies[i];
      if (body.label === 'boundary-wall') continue;
      if (body.bounds.max.x < cullBoundaryX) {
        Composite.remove(this.world, body);
        this.staticBodies.splice(i, 1);
      }
    }

    // Cull orphaned grab points behind the cull boundary
    for (let i = this.grabPoints.length - 1; i >= 0; i--) {
      const gp = this.grabPoints[i];
      const gx = gp.isDynamic ? gp.body.position.x : gp.x;
      if (gx < cullBoundaryX) {
        this.grabPoints.splice(i, 1);
      }
    }

    // Cull interactive bodies and their associated Matter.js constraints
    for (let i = this.interactiveBodies.length - 1; i >= 0; i--) {
      const body = this.interactiveBodies[i];
      if (body.position.x < cullBoundaryX) {
        if (body._constraints) {
          for (let c = 0; c < body._constraints.length; c++) {
            Composite.remove(this.world, body._constraints[c]);
          }
        }
        Composite.remove(this.world, body);
        this.interactiveBodies.splice(i, 1);
      }
    }

    // Cull squishies
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const body = this.stars[i];
      if (body.position.x < cullBoundaryX) {
        Composite.remove(this.world, body);
        this.stars.splice(i, 1);
      }
    }

    // Cull foam blocks
    for (let i = this.foamBlocks.length - 1; i >= 0; i--) {
      const body = this.foamBlocks[i];
      if (body.position.x < cullBoundaryX) {
        Composite.remove(this.world, body);
        this.foamBlocks.splice(i, 1);
      }
    }
  }

  generateNextSegment() {
    const floorY = 900;
    const startX = this.lastGeneratedX;
    const width = 800; // standard segment width
    
    // Pick a random template from 0 to 4
    const choice = Math.floor(Math.random() * 8);

    // Randomize offsets for placement and spacing variations
    const rx = Math.floor((Math.random() - 0.5) * 70); // Horizontal offset
    const ry = Math.floor((Math.random() - 0.5) * 35); // Vertical/height offset
    const rw = Math.floor((Math.random() - 0.5) * 50); // Width offset

    switch (choice) {
      case 0:
        // Double Balance Beam (Parallel staggered layout)
        this.createPlatform(startX + 100, floorY, 200, 150, 'mat-ground');
        
        // Beam 1
        const beam1W = 160 + rw;
        this.createPlatform(startX + 260 + rx, floorY - 50 + ry, beam1W, 12, 'balance-beam');
        this.spawnSquishy(startX + 260 + rx, floorY - 110 + ry);

        // Beam 2 (Higher)
        const beam2W = 160 - rw;
        this.createPlatform(startX + 480 + rx, floorY - 110 + ry, beam2W, 12, 'balance-beam');
        this.spawnSquishy(startX + 480 + rx, floorY - 170 + ry);

        this.createPlatform(startX + 700, floorY, 200, 150, 'mat-ground');
        break;

      case 1:
        // Tumble Track Spring Floor (Speed Booster Track!)
        this.createPlatform(startX + width/2, floorY, width, 150, 'mat-ground');
        
        // Tumble Track overlay mat
        const trackW = 550 + rw;
        const trackX = startX + 400 + rx;
        const trackY = floorY - 10;
        this.createPlatform(trackX, trackY, trackW, 20, 'mat-tumble-track');

        // Spawning Chalk Cup booster at the end of the track to vault with speed
        this.spawnChalkCup(trackX + trackW/2 - 40, floorY - 50);

        // Trace of collectibles along the track
        for (let tx = trackX - trackW/2 + 50; tx < trackX + trackW/2 - 60; tx += 90) {
          this.spawnSquishy(tx, floorY - 60);
        }
        break;

      case 2:
        // Trampoline High Vault Launch
        this.createPlatform(startX + 140 + rw/2, floorY, 280 + rw, 150, 'mat-ground');
        
        // Trampoline
        const trampX = startX + 370 + rx;
        this.createTrampoline(trampX, floorY - 15, 110, 14);

        // Floating mat high in the air
        this.createPlatform(startX + 560 + rx, floorY - 170 + ry, 110, 20, 'floating-mat');
        this.spawnSquishy(startX + 560 + rx, floorY - 240 + ry);

        this.createPlatform(startX + 710 - rw/2, floorY, 180 - rw, 150, 'mat-ground');
        break;

      case 3:
        // Uneven Swing Bars Gap
        this.createPlatform(startX + 120 + rw/2, floorY, 240 + rw, 150, 'mat-ground');
        
        // Bar 1 (Low Bar)
        const bar1X = startX + 320 + rx;
        const bar1Y = floorY - 140 + ry;
        this.createPlatform(bar1X - 45, bar1Y + 90, 6, 180, 'bar-support-post');
        this.createPlatform(bar1X + 45, bar1Y + 90, 6, 180, 'bar-support-post');
        const bar1 = Bodies.rectangle(bar1X, bar1Y, 90, 10, { isStatic: true, isSensor: true, label: 'swing-bar' });
        this.staticBodies.push(bar1);
        Composite.add(this.world, bar1);
        for (let o = -30; o <= 30; o += 30) {
          this.grabPoints.push({ body: bar1, x: bar1X + o, y: bar1Y, radius: 12, label: 'Uneven Low Bar' });
        }

        // Bar 2 (High Bar)
        const bar2X = startX + 500 + rx;
        const bar2Y = floorY - 240 + ry;
        this.createPlatform(bar2X - 45, bar2Y + 160, 6, 320, 'bar-support-post');
        this.createPlatform(bar2X + 45, bar2Y + 160, 6, 320, 'bar-support-post');
        const bar2 = Bodies.rectangle(bar2X, bar2Y, 90, 10, { isStatic: true, isSensor: true, label: 'swing-bar' });
        this.staticBodies.push(bar2);
        Composite.add(this.world, bar2);
        for (let o = -30; o <= 30; o += 30) {
          this.grabPoints.push({ body: bar2, x: bar2X + o, y: bar2Y, radius: 12, label: 'Uneven High Bar' });
        }

        this.createPlatform(startX + 690 - rw/2, floorY, 220 - rw, 150, 'mat-ground');

        this.spawnSquishy(bar1X, bar1Y - 40);
        this.spawnSquishy(bar2X, bar2Y - 40);
        break;

      case 4:
        // Slide Mountain Tower & Launch
        this.createPlatform(startX + 140, floorY, 280, 150, 'mat-ground');
        
        // Ramping steps
        this.createPlatform(startX + 290 + rx, floorY - 60 + ry, 90, 120, 'mat-platform');
        this.createPlatform(startX + 380 + rx, floorY - 150 + ry, 90, 300, 'tower-block');

        // Slide going down
        const slidePlank = Bodies.rectangle(startX + 560 + rx, floorY - 80 + ry, 240, 12, {
          isStatic: true,
          angle: 0.52,
          friction: 0.01,
          label: 'giant-slide'
        });
        const slideBase = Bodies.rectangle(startX + 680 + rx, floorY - 30 + ry, 80, 12, { isStatic: true, label: 'slide-lip' });
        this.staticBodies.push(slidePlank, slideBase);
        Composite.add(this.world, [slidePlank, slideBase]);

        this.spawnSquishy(startX + 380 + rx, floorY - 190 + ry);
        this.spawnSquishy(startX + 500 + rx, floorY - 140 + ry);
        this.spawnSquishy(startX + 600 + rx, floorY - 90 + ry);
        break;

      case 5:
        // Pommel Horse Vault Step
        this.createPlatform(startX + 150, floorY, 300, 150, 'mat-ground');

        // Vaulting springboard
        this.createSpringboard(startX + 270 + rx, floorY - 20, 70, 10);

        // Pommel Horse obstacle
        const horseX = startX + 440 + rx;
        const horseY = floorY - 65 + ry;
        const pommelHorse = Bodies.rectangle(horseX, horseY + 130/2, 80, 130, {
          isStatic: true,
          label: 'pommel-horse'
        });
        this.staticBodies.push(pommelHorse);
        Composite.add(this.world, pommelHorse);

        this.createPlatform(startX + 650, floorY, 300, 150, 'mat-ground');

        // Squishies floating over the pommel horse
        this.spawnSquishy(horseX, horseY - 50);
        this.spawnSquishy(startX + 620, floorY - 70);
        break;

      case 6:
        // Uneven Bar Grid with floating Chalk Grip Cup booster
        this.createPlatform(startX + 100, floorY, 200, 150, 'mat-ground');

        // High Bar
        const highBarX = startX + 280 + rx;
        const highBarY = floorY - 230 + ry;
        this.createPlatform(highBarX - 40, highBarY + 150, 6, 300, 'bar-support-post');
        this.createPlatform(highBarX + 40, highBarY + 150, 6, 300, 'bar-support-post');
        const hb = Bodies.rectangle(highBarX, highBarY, 80, 10, { isStatic: true, isSensor: true, label: 'swing-bar' });
        this.staticBodies.push(hb);
        Composite.add(this.world, hb);
        for (let o = -25; o <= 25; o += 25) {
          this.grabPoints.push({ body: hb, x: highBarX + o, y: highBarY, radius: 12, label: 'High Bar' });
        }

        // Floating Chalk Cup in the gap
        this.spawnChalkCup(startX + 400 + rx, floorY - 170 + ry);

        // Low Bar
        const lowBarX = startX + 520 + rx;
        const lowBarY = floorY - 130 + ry;
        this.createPlatform(lowBarX - 40, lowBarY + 80, 6, 160, 'bar-support-post');
        this.createPlatform(lowBarX + 40, lowBarY + 80, 6, 160, 'bar-support-post');
        const lb = Bodies.rectangle(lowBarX, lowBarY, 80, 10, { isStatic: true, isSensor: true, label: 'swing-bar' });
        this.staticBodies.push(lb);
        Composite.add(this.world, lb);
        for (let o = -25; o <= 25; o += 25) {
          this.grabPoints.push({ body: lb, x: lowBarX + o, y: lowBarY, radius: 12, label: 'Low Bar' });
        }

        this.createPlatform(startX + 700, floorY, 200, 150, 'mat-ground');
        break;

      case 7:
        // Giant Vault Box Stack and trampoline exit
        this.createPlatform(startX + 100, floorY, 200, 150, 'mat-ground');

        // Vaulting springboard
        this.createSpringboard(startX + 180 + rx, floorY - 20, 70, 10);

        // Vaulting stack box
        const vaultBoxH = 220 + ry;
        this.createPlatform(startX + 350 + rx, floorY - vaultBoxH + 150/2, 100, vaultBoxH, 'tower-block');

        // Trampoline
        this.createTrampoline(startX + 520 + rx, floorY - 15, 90, 14);

        // Landing mat
        this.createPlatform(startX + 700, floorY, 200, 150, 'mat-ground');

        // High collectible path
        this.spawnSquishy(startX + 350 + rx, floorY - vaultBoxH - 40);
        this.spawnSquishy(startX + 520 + rx, floorY - 160);
        break;
    }

    // Keep ceiling generated infinitely along with the level
    this.createPlatform(startX + width/2, -20, width, 40, 'boundary-ceiling');

    this.lastGeneratedX += width;
  }

  // Remove collected squishy from the world
  respawnStar(starBody) {
    Composite.remove(this.world, starBody);
    const idx = this.stars.indexOf(starBody);
    if (idx !== -1) {
      this.stars.splice(idx, 1);
    }
  }
}
