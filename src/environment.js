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

  // Called in game loop to infinitely generate segments ahead and delete off-screen assets behind
  updateLevel(playerX) {
    // 1. Generate new content ahead (player is 1200px close to the edge)
    if (playerX > this.lastGeneratedX - 1200) {
      this.generateNextSegment();
    }

    // 2. Clean up old elements to maintain lightweight execution
    const cullBoundaryX = playerX - 1800;
    
    // Cull static bodies
    for (let i = this.staticBodies.length - 1; i >= 0; i--) {
      const body = this.staticBodies[i];
      if (body.position.x < cullBoundaryX && body.label !== 'boundary-wall' && body.label !== 'boundary-ceiling') {
        Composite.remove(this.world, body);
        this.staticBodies.splice(i, 1);
      }
    }

    // Cull interactive bodies
    for (let i = this.interactiveBodies.length - 1; i >= 0; i--) {
      const body = this.interactiveBodies[i];
      if (body.position.x < cullBoundaryX) {
        // Also remove dynamic grab points associated with swinging rings
        this.grabPoints = this.grabPoints.filter(gp => gp.body !== body);
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
    const choice = Math.floor(Math.random() * 5);

    switch (choice) {
      case 0:
        // Flat platform with Hurdles/Beams
        this.createPlatform(startX + width/2, floorY, width, 150, 'mat-ground');
        
        // Add vertical obstacle hurdles
        this.createPlatform(startX + 250, floorY - 40, 20, 80, 'bar-support-post');
        this.createPlatform(startX + 550, floorY - 50, 16, 100, 'bar-support-post');

        // Squishies floating above hurdles
        this.spawnSquishy(startX + 250, floorY - 120);
        this.spawnSquishy(startX + 550, floorY - 140);
        this.spawnSquishy(startX + 400, floorY - 60);
        break;

      case 1:
        // Gap Jumps
        this.createPlatform(startX + 120, floorY, 240, 150, 'mat-ground');
        
        // Floating platform mats in the air gap
        this.createPlatform(startX + 400, floorY - 90, 120, 20, 'floating-mat');
        this.createPlatform(startX + 560, floorY - 180, 100, 20, 'floating-mat');

        this.createPlatform(startX + 720, floorY, 160, 150, 'mat-ground');

        // Squishies leading across the jump
        this.spawnSquishy(startX + 400, floorY - 150);
        this.spawnSquishy(startX + 560, floorY - 240);
        this.spawnSquishy(startX + 720, floorY - 80);
        break;

      case 2:
        // Trampoline Launch
        this.createPlatform(startX + 150, floorY, 300, 150, 'mat-ground');
        
        // Trampoline at the edge
        this.createTrampoline(startX + 380, floorY - 15, 120, 14);

        // Gap after trampoline
        this.createPlatform(startX + 680, floorY, 240, 150, 'mat-ground');

        // High arch of squishy collectibles
        for (let i = 0; i < 5; i++) {
          const sx = startX + 380 + i * 70;
          const sy = floorY - 180 - Math.sin((i / 4) * Math.PI) * 140;
          this.spawnSquishy(sx, sy);
        }
        break;

      case 3:
        // Swing Bar Gap
        this.createPlatform(startX + 120, floorY, 240, 150, 'mat-ground');
        
        // Swing high bar centered over the gap
        const barX = startX + 400;
        const barY = floorY - 200;
        
        this.createPlatform(barX - 60, barY + 140, 6, 280, 'bar-support-post');
        this.createPlatform(barX + 60, barY + 140, 6, 280, 'bar-support-post');
        
        const bar = Bodies.rectangle(barX, barY, 120, 10, {
          isStatic: true,
          isSensor: true,
          label: 'swing-bar'
        });
        this.staticBodies.push(bar);
        Composite.add(this.world, bar);

        // Add grab anchors along the bar
        for (let offset = -50; offset <= 50; offset += 20) {
          this.grabPoints.push({
            body: bar,
            x: barX + offset,
            y: barY,
            radius: 12,
            label: 'High Bar'
          });
        }

        // Landing platform
        this.createPlatform(startX + 680, floorY, 240, 150, 'mat-ground');

        // Squishies below and after swing bar
        this.spawnSquishy(barX, barY - 40);
        this.spawnSquishy(startX + 580, floorY - 100);
        this.spawnSquishy(startX + 680, floorY - 80);
        break;

      case 4:
        // Slide Mountain Tower & Launch
        this.createPlatform(startX + 150, floorY, 300, 150, 'mat-ground');
        
        // Ramping steps
        this.createPlatform(startX + 300, floorY - 60, 100, 120, 'mat-platform');
        this.createPlatform(startX + 400, floorY - 160, 100, 320, 'tower-block');

        // Slide going down
        const slidePlank = Bodies.rectangle(startX + 580, floorY - 90, 240, 12, {
          isStatic: true,
          angle: 0.52, // Slide down angle
          friction: 0.01,
          label: 'giant-slide'
        });
        
        const slideBase = Bodies.rectangle(startX + 700, floorY - 30, 80, 12, {
          isStatic: true,
          label: 'slide-lip'
        });

        this.staticBodies.push(slidePlank, slideBase);
        Composite.add(this.world, [slidePlank, slideBase]);

        // Collection trace along the slide
        this.spawnSquishy(startX + 400, floorY - 200);
        this.spawnSquishy(startX + 520, floorY - 150);
        this.spawnSquishy(startX + 600, floorY - 100);
        this.spawnSquishy(startX + 700, floorY - 80);
        break;
    }

    // Keep ceiling generated infinitely along with the level
    this.createPlatform(startX + width/2, -20, width, 40, 'boundary-ceiling');

    this.lastGeneratedX += width;
  }

  // Remove collected squishy from the world
  respawnStar(starBody) {
    Composite.remove(this.world, starBody);
    this.stars = this.stars.filter(s => s !== starBody);
  }
}
