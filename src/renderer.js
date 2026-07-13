import Matter from 'matter-js';

// Polyfill roundRect for older browser rendering engines
if (typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
    if (!radii) radii = 0;
    if (typeof radii === 'number') {
      radii = [radii, radii, radii, radii];
    } else if (Array.isArray(radii)) {
      if (radii.length === 1) radii = [radii[0], radii[0], radii[0], radii[0]];
      else if (radii.length === 2) radii = [radii[0], radii[1], radii[0], radii[1]];
      else if (radii.length === 3) radii = [radii[0], radii[1], radii[2], radii[1]];
    } else {
      radii = [0, 0, 0, 0];
    }
    
    const r0 = radii[0];
    const r1 = radii[1];
    const r2 = radii[2];
    const r3 = radii[3];
    
    this.beginPath();
    this.moveTo(x + r0, y);
    this.lineTo(x + w - r1, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r1);
    this.lineTo(x + w, y + h - r2);
    this.quadraticCurveTo(x + w, y + h, x + w - r2, y + h);
    this.lineTo(x + r3, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r3);
    this.lineTo(x, y + r0);
    this.quadraticCurveTo(x, y, x + r0, y);
    this.closePath();
  };
}

export class CustomRenderer {
  constructor(canvas, world, gymnast, environment) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.gymnast = gymnast;
    this.environment = environment;

    // Viewport camera
    this.camera = {
      x: 0,
      y: 0,
      zoom: 1,
      targetZoom: 1
    };

    // Standard particles (sparkles, confetti)
    this.particles = [];

    // Bouncing physical squishy spill particles
    this.spillParticles = [];
    
    // Ghost trail
    this.trail = [];
    this.maxTrailLength = 7;

    // Popups
    this.popups = [];
    
    // Screenshake
    this.shakeIntensity = 0;
    this.shakeDecay = 0.93;
  }

  spawnConfetti(x, y, count = 20) {
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#eab308'];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.8) * 8 - 2,
        size: 5 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.18,
        type: 'confetti',
        life: 0,
        maxLife: 60 + Math.random() * 50
      });
    }
  }

  spawnSparkles(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 3.5,
        color: '#fef08a', 
        alpha: 1,
        type: 'sparkle',
        life: 0,
        maxLife: 25 + Math.random() * 20
      });
    }
  }

  spawnDust(x, y, count = 8) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 2.5,
        vy: -Math.random() * 1.5,
        size: 7 + Math.random() * 6,
        color: 'rgba(255, 255, 255, 0.18)',
        alpha: 0.5,
        type: 'dust',
        life: 0,
        maxLife: 35 + Math.random() * 15
      });
    }
  }

  spawnPhysicalSpill(x, y, count, toyTypes) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const force = 5 + Math.random() * 7;
      
      const skinRand = Math.random();
      let skin = 'normal';
      if (skinRand < 0.15) skin = 'glitter';
      else if (skinRand < 0.25) skin = 'metallic';
      else if (skinRand < 0.30) skin = 'galaxy';

      this.spillParticles.push({
        x,
        y: y - 10,
        vx: Math.cos(angle) * force,
        vy: Math.sin(angle) * force,
        toyType: toyTypes[i % toyTypes.length],
        toySkin: skin,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.22,
        bounceCount: 0,
        life: 0,
        maxLife: 150
      });
    }
  }

  spawnTextPopup(x, y, text, color = '#ffffff') {
    this.popups.push({
      x,
      y: y - 40,
      text,
      color,
      alpha: 1,
      vy: -1.3,
      life: 0,
      maxLife: 75
    });
  }

  triggerShake(intensity) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  updateCamera(width, height) {
    const target = this.gymnast.body.position;
    const velocity = this.gymnast.body.velocity;

    let targetX = target.x - width * 0.35;
    let targetY = target.y - height * 0.6;

    targetX = Math.max(0, targetX);
    targetY = Math.max(0, Math.min(this.environment.height - height, targetY));

    this.camera.x += (targetX - this.camera.x) * 0.08;
    this.camera.y += (targetY - this.camera.y) * 0.08;

    const speed = Math.abs(velocity.x);
    let scale = 1.0 - (speed * 0.007);
    scale = Math.max(0.78, Math.min(1.05, scale));

    this.camera.targetZoom = scale;
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * 0.05;
  }

  render(width, height) {
    this.updateCamera(width, height);

    this.ctx.fillStyle = '#0a0d17';
    this.ctx.fillRect(0, 0, width, height);

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0.1) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= this.shakeDecay;
    }

    this.ctx.save();
    
    const centerCamX = this.camera.x + width / 2 + shakeX;
    const centerCamY = this.camera.y + height / 2 + shakeY;
    
    this.ctx.translate(width / 2, height / 2);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);
    this.ctx.translate(-centerCamX, -centerCamY);

    this.drawParallaxBackground(width, height);
    this.drawStaticEnvironment();
    this.drawInteractiveEnvironment();
    this.drawGhostTrail();
    this.drawSpillParticles();
    this.drawGymnast();
    this.drawStars();
    this.drawParticles();
    this.drawPopups();

    this.ctx.restore();
  }

  drawParallaxBackground(width, height) {
    this.ctx.save();
    
    // Fill the gym background wall
    this.ctx.fillStyle = '#181424'; // Sleek deep gymnasium slate-plum
    this.ctx.fillRect(this.camera.x - 200, 0, width + 400, height);

    const startX = Math.floor((this.camera.x - 200) / 600) * 600;
    const endX = startX + width + 800;

    // Draw horizontal wooden plank wall segments
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    this.ctx.lineWidth = 2;
    for (let wy = 80; wy < 850; wy += 80) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.camera.x - 200, wy);
      this.ctx.lineTo(this.camera.x + width + 200, wy);
      this.ctx.stroke();
    }

    // Draw gymnasium elements in parallax (windows, banners, posters)
    for (let x = startX; x <= endX; x += 600) {
      // 1. Vertical wall pillars/columns
      this.ctx.fillStyle = '#100c18';
      this.ctx.fillRect(x - 20, 0, 40, 900);
      
      // Pillar highlights
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      this.ctx.fillRect(x - 20, 0, 6, 900);

      // 2. High Arch Windows (alternating with banners)
      const isWindow = (x / 600) % 2 === 0;
      if (isWindow) {
        const winX = x + 300;
        const winY = 220;
        const winW = 120;
        const winH = 260;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(winX, winY, winW / 2, Math.PI, 0);
        this.ctx.lineTo(winX + winW / 2, winY + winH);
        this.ctx.lineTo(winX - winW / 2, winY + winH);
        this.ctx.closePath();

        const skyGrad = this.ctx.createLinearGradient(winX, winY - 60, winX, winY + winH);
        skyGrad.addColorStop(0, '#c084fc');
        skyGrad.addColorStop(1, '#6366f1');
        this.ctx.fillStyle = skyGrad;
        this.ctx.fill();

        this.ctx.strokeStyle = '#0a0710';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        this.ctx.strokeStyle = '#0a0710';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(winX, winY - 60);
        this.ctx.lineTo(winX, winY + winH);
        this.ctx.moveTo(winX - winW/2, winY + 80);
        this.ctx.lineTo(winX + winW/2, winY + 80);
        this.ctx.moveTo(winX - winW/2, winY + 170);
        this.ctx.lineTo(winX + winW/2, winY + 170);
        this.ctx.stroke();

        // Volumetric light beam
        const beamGrad = this.ctx.createLinearGradient(winX, winY, winX + 80, winY + winH + 200);
        beamGrad.addColorStop(0, 'rgba(192, 132, 252, 0.12)');
        beamGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
        this.ctx.fillStyle = beamGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(winX - winW / 2, winY + winH);
        this.ctx.lineTo(winX - winW / 2 + 100, winY + winH + 320);
        this.ctx.lineTo(winX + winW / 2 + 200, winY + winH + 320);
        this.ctx.lineTo(winX + winW / 2, winY + winH);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();
      } else {
        // Gymnastics Banners
        const banX = x + 300;
        const banY = 160;
        const banW = 100;
        const banH = 140;

        this.ctx.fillStyle = '#a855f7';
        this.ctx.beginPath();
        this.ctx.moveTo(banX - banW/2, banY);
        this.ctx.lineTo(banX + banW/2, banY);
        this.ctx.lineTo(banX + banW/2, banY + banH);
        this.ctx.lineTo(banX, banY + banH - 20);
        this.ctx.lineTo(banX - banW/2, banY + banH);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = '#fde047';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.fillStyle = '#fde047';
        this.ctx.font = 'bold 8px Courier New';
        this.ctx.textAlign = 'center';
        
        const texts = ["SQUISHY", "GYM", "ARENA"];
        texts.forEach((txt, idx) => {
          this.ctx.fillText(txt, banX, banY + 45 + idx * 15);
        });
        
        this.ctx.beginPath();
        this.ctx.arc(banX, banY + 25, 4, 0, Math.PI*2);
        this.ctx.fill();
        this.ctx.restore();
      }

      // 3. Hanging Gymnastics Rings (Background decorations)
      const ringX = x + 150;
      this.ctx.strokeStyle = '#4b5563';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(ringX - 10, 0); this.ctx.lineTo(ringX - 10, 450);
      this.ctx.moveTo(ringX + 10, 0); this.ctx.lineTo(ringX + 10, 450);
      this.ctx.stroke();

      this.ctx.strokeStyle = '#ca8a04';
      this.ctx.lineWidth = 3.5;
      this.ctx.beginPath();
      this.ctx.arc(ringX - 10, 456, 9, 0, Math.PI*2);
      this.ctx.arc(ringX + 10, 456, 9, 0, Math.PI*2);
      this.ctx.stroke();

      // 4. Squishy Collectible Posters!
      const postX = x + 450;
      const postY = 440;
      const postW = 75;
      const postH = 110;
      
      const posterType = ((Math.floor(x / 600) % 22) + 22) % 22;

      const posterGrad = this.ctx.createRadialGradient(postX, postY, 5, postX, postY, postW/2);
      posterGrad.addColorStop(0, '#2d1e3d');
      posterGrad.addColorStop(1, '#0e0b16');
      this.ctx.fillStyle = posterGrad;
      this.ctx.fillRect(postX - postW/2, postY - postH/2, postW, postH);

      this.ctx.strokeStyle = '#b45309';
      this.ctx.lineWidth = 4;
      this.ctx.strokeRect(postX - postW/2, postY - postH/2, postW, postH);
      
      this.ctx.strokeStyle = '#fbbf24';
      this.ctx.lineWidth = 1.0;
      this.ctx.strokeRect(postX - postW/2 + 2, postY - postH/2 + 2, postW - 4, postH - 4);

      this.ctx.save();
      this.ctx.translate(postX, postY - 12);
      const rotationAngle = (Date.now() * 0.0009 + (x * 0.1)) % (Math.PI * 2);
      this.drawSquishyToy(this.ctx, posterType, 18, rotationAngle, 'normal');
      this.ctx.restore();

      const names = [
        'Nice Cube', 'Wendy Frog', 'Cam Cat', 'Gumdrop', 'Connor Cow', 
        'Teenie NeeDoh', 'Shaggy NeeDoh', 'Archie Axolotl', 'Golden Cube',
        'Red Dumpling', 'Orange Dumpling', 'Yellow Dumpling', 'Green Dumpling',
        'Blue Dumpling', 'Purple Dumpling', 'Pink Dumpling', 'UV Dumpling',
        'Rainbow Dumpling', 'Golden Dumpling', 'Gummy Bear', 'Fuzz Ball', 'Colour Change'
      ];
      
      this.ctx.save();
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.font = 'bold 7px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(names[posterType].toUpperCase(), postX, postY + 38);
      
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.font = 'italic 5px sans-serif';
      this.ctx.fillText("COLLECTIBLE POSTER", postX, postY + 47);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  drawStaticEnvironment() {
    this.ctx.save();
    
    this.environment.staticBodies.forEach(body => {
      const label = body.label || '';
      const vertices = body.vertices;

      if (label.includes('boundary')) return;

      this.ctx.beginPath();
      this.ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        this.ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      this.ctx.closePath();

      if (label === 'mat-ground') {
        const grad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[2].y);
        grad.addColorStop(0, '#1d4ed8');
        grad.addColorStop(1, '#1e3a8a');
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        this.ctx.strokeStyle = '#3b82f6';
        this.ctx.lineWidth = 3.5;
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 1.5;
        const matWidth = vertices[1].x - vertices[0].x;
        const segmentCount = Math.floor(matWidth / 150);
        for (let i = 1; i < segmentCount; i++) {
          const sx = vertices[0].x + (matWidth / segmentCount) * i;
          this.ctx.beginPath();
          this.ctx.moveTo(sx, vertices[0].y + 4);
          this.ctx.lineTo(sx, vertices[2].y - 4);
          this.ctx.stroke();

          this.ctx.fillStyle = '#0f172a';
          this.ctx.fillRect(sx - 10, vertices[0].y + 24, 20, 6);
        }

        this.ctx.fillStyle = '#fbbf24';
        for (let i = 0; i < segmentCount; i++) {
          const hx = vertices[0].x + (matWidth / segmentCount) * i + 50;
          this.ctx.fillRect(hx, vertices[0].y + 12, 16, 4);
        }
      } 
      else if (label === 'floating-mat' || label === 'mat-platform') {
        const matH = vertices[2].y - vertices[0].y;

        const grad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[2].y);
        grad.addColorStop(0, '#e11d48');
        grad.addColorStop(1, '#9f1239');
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        this.ctx.strokeStyle = '#fda4af';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        this.ctx.fillStyle = '#fef08a';
        this.ctx.fillRect(vertices[0].x + 8, vertices[0].y + 6, 12, 3);
        this.ctx.fillRect(vertices[1].x - 20, vertices[0].y + 6, 12, 3);

        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(vertices[0].x + 6, vertices[0].y + matH/2 - 4, 3, 8);
        this.ctx.fillRect(vertices[1].x - 9, vertices[0].y + matH/2 - 4, 3, 8);
      }
      else if (label === 'balance-beam') {
        const beamGrad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[2].y);
        beamGrad.addColorStop(0, '#f59e0b');
        beamGrad.addColorStop(0.5, '#d97706');
        beamGrad.addColorStop(1, '#78350f');
        this.ctx.fillStyle = beamGrad;
        this.ctx.fill();

        this.ctx.strokeStyle = '#451a03';
        this.ctx.lineWidth = 2.0;
        this.ctx.stroke();

        this.ctx.fillStyle = '#475569'; 
        const legH = 900 - vertices[2].y;
        this.ctx.fillRect(vertices[0].x + 30, vertices[2].y, 12, legH);
        this.ctx.fillRect(vertices[1].x - 42, vertices[2].y, 12, legH);
        
        this.ctx.fillStyle = '#0f172a';
        this.ctx.fillRect(vertices[0].x + 16, 900 - 12, 40, 12);
        this.ctx.fillRect(vertices[1].x - 56, 900 - 12, 40, 12);
      }
      else if (label === 'swing-bar') {
        const barGrad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[2].y);
        barGrad.addColorStop(0, '#f1f5f9');
        barGrad.addColorStop(0.5, '#cbd5e1');
        barGrad.addColorStop(1, '#64748b');
        this.ctx.fillStyle = barGrad;
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();
      }
      else if (label === 'bar-support-post') {
        this.ctx.fillStyle = '#64748b';
        this.ctx.fill();

        this.ctx.strokeStyle = '#475569';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        this.ctx.fillStyle = '#1e293b';
        const height = vertices[2].y - vertices[0].y;
        const notchStep = 25;
        for (let ny = 15; ny < height - 10; ny += notchStep) {
          this.ctx.beginPath();
          this.ctx.arc(vertices[0].x + 3, vertices[0].y + ny, 2.5, 0, Math.PI*2);
          this.ctx.fill();
        }

        if (vertices[2].y >= 890) {
          this.ctx.fillStyle = '#334155';
          this.ctx.fillRect(vertices[0].x - 14, 900 - 14, 34, 14);
        }
      }
      else if (label === 'giant-slide') {
        const grad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[2].x, vertices[2].y);
        grad.addColorStop(0, '#0284c7');
        grad.addColorStop(1, '#0369a1');
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();
      }
      else if (label.includes('tower') || label.includes('platform')) {
        const padHeight = 24;
        const widthBox = vertices[1].x - vertices[0].x;
        const heightBox = vertices[2].y - vertices[0].y;

        const baseGrad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y + padHeight, vertices[0].x, vertices[2].y);
        baseGrad.addColorStop(0, '#d97706');
        baseGrad.addColorStop(1, '#78350f');
        this.ctx.fillStyle = baseGrad;
        this.ctx.fill();

        const cushionGrad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[0].y + padHeight);
        cushionGrad.addColorStop(0, '#ec4899');
        cushionGrad.addColorStop(1, '#be185d');
        this.ctx.fillStyle = cushionGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(vertices[0].x, vertices[0].y);
        this.ctx.lineTo(vertices[1].x, vertices[1].y);
        this.ctx.lineTo(vertices[1].x, vertices[1].y + padHeight);
        this.ctx.lineTo(vertices[0].x, vertices[0].y + padHeight);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.strokeStyle = '#fbcfe8';
        this.ctx.lineWidth = 1.8;
        this.ctx.stroke();

        this.ctx.fillStyle = '#451a03';
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1.0;
        for (let py = padHeight + 35; py < heightBox - 15; py += 45) {
          this.ctx.beginPath();
          this.ctx.moveTo(vertices[0].x, vertices[0].y + py);
          this.ctx.lineTo(vertices[1].x, vertices[0].y + py);
          this.ctx.stroke();

          this.ctx.fillRect(vertices[0].x + widthBox/2 - 25, vertices[0].y + py - 18, 50, 8);
        }
      }
      else {
        this.ctx.fillStyle = '#1e1b4b';
        this.ctx.fill();
      }
    });
    
    this.ctx.restore();
  }

  drawInteractiveEnvironment() {
    this.ctx.save();

    this.environment.interactiveBodies.forEach(body => {
      const v = body.vertices;
      const x = body.position.x;
      const y = body.position.y;

      if (body.label === 'trampoline-bed') {
        this.ctx.beginPath();
        this.ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) this.ctx.lineTo(v[i].x, v[i].y);
        this.ctx.closePath();

        this.ctx.fillStyle = '#0f172a';
        this.ctx.fill();
        this.ctx.strokeStyle = '#1e3a8a'; 
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        const w = v[1].x - v[0].x;
        const springCount = 14;
        this.ctx.strokeStyle = '#94a3b8'; 
        this.ctx.lineWidth = 1.2;
        
        for (let i = 0; i < springCount; i++) {
          const sx = v[0].x + (w / springCount) * i;
          
          this.ctx.beginPath();
          this.ctx.moveTo(sx, v[0].y);
          this.ctx.lineTo(sx - 3, v[0].y + 4);
          this.ctx.lineTo(sx + 3, v[0].y + 8);
          this.ctx.lineTo(sx, v[0].y + 12);
          this.ctx.stroke();
        }
      }
      else if (body.label === 'springboard-plank') {
        this.ctx.beginPath();
        this.ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) this.ctx.lineTo(v[i].x, v[i].y);
        this.ctx.closePath();
        
        this.ctx.fillStyle = '#ca8a04'; 
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#1e293b'; 
        this.ctx.lineWidth = 3.5;
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.translate(x + 10, y + 10);
        this.ctx.strokeStyle = '#64748b'; 
        this.ctx.lineWidth = 2.2;
        
        const drawCoil = (cx) => {
          this.ctx.beginPath();
          this.ctx.moveTo(cx, 12);
          this.ctx.bezierCurveTo(cx - 8, 8, cx + 8, 4, cx, 0);
          this.ctx.bezierCurveTo(cx - 8, -4, cx + 8, -8, cx, -12);
          this.ctx.stroke();
        };
        drawCoil(-12);
        drawCoil(12);
        this.ctx.restore();
      }
      else if (body.label === 'swinging-ring') {
        this.ctx.save();
        this.ctx.strokeStyle = '#1e293b'; 
        this.ctx.lineWidth = 3.5;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 180); 
        this.ctx.lineTo(x, y - 16);
        this.ctx.stroke();

        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillRect(x - 3, y - 60, 6, 8);
        this.ctx.restore();

        this.ctx.beginPath();
        this.ctx.arc(x, y, 16, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#d2b48c'; 
        this.ctx.lineWidth = 5;
        this.ctx.stroke();

        this.ctx.strokeStyle = '#a16207'; 
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }
    });

    this.ctx.restore();
  }

  // PREMIUM VOLUMETRIC 3D SHADED TOY ART
  drawSquishyToy(ctx, typeId, radius, rotationAngle = 0, skin = 'normal') {
    ctx.save();
    
    // Scale drawings so they look correct based on requested size (standard radius is 14px)
    const scale = radius / 14;
    ctx.scale(scale, scale);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;

    // Y-rotation projection depth offsets
    const faceDx = Math.sin(rotationAngle) * 7.5;
    const faceScaleX = Math.cos(rotationAngle);

    // Helper: Draw isometric 3D Cubes (Nice Cubes)
    const drawIsometricCube = (cx, cy, size, colTop, colFront, colSide) => {
      const h = size / 2;
      const wRad = size * 0.86;

      ctx.fillStyle = colTop;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + wRad, cy - h);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - wRad, cy - h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = colFront;
      ctx.beginPath();
      ctx.moveTo(cx - wRad, cy - h);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - wRad, cy + h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = colSide;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + wRad, cy - h);
      ctx.lineTo(cx + wRad, cy + h);
      ctx.lineTo(cx, cy + size);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Face details on front-left quadrant
      ctx.strokeStyle = '#041f30';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.arc(cx - size * 0.4, cy + h * 0.3, 1.5, Math.PI, 0);
      ctx.arc(cx - size * 0.1, cy + h * 0.5, 1.5, Math.PI, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx - size * 0.25, cy + h * 0.9, 1.8, 0, Math.PI);
      ctx.stroke();
    };

    // Helper: Real-time 3D projected rotating cube (painter's algorithm)
    const drawRotatedCube = (cx, cy, size, colTop, colFront, colSide, angle) => {
      const vertices = [
        {x: -1, y: -1, z: -1},
        {x: 1, y: -1, z: -1},
        {x: 1, y: 1, z: -1},
        {x: -1, y: 1, z: -1},
        {x: -1, y: -1, z: 1},
        {x: 1, y: -1, z: 1},
        {x: 1, y: 1, z: 1},
        {x: -1, y: 1, z: 1}
      ];
      const pitch = 0.48; // Y-tilt angle
      const rotated = vertices.map(v => {
        let x1 = v.x * Math.cos(angle) - v.z * Math.sin(angle);
        let z1 = v.x * Math.sin(angle) + v.z * Math.cos(angle);
        let y2 = v.y * Math.cos(pitch) - z1 * Math.sin(pitch);
        let z2 = v.y * Math.sin(pitch) + z1 * Math.cos(pitch);
        return {x: x1 * size, y: y2 * size, z: z2};
      });
      const projected = rotated.map(r => {
        return {x: cx + r.x * 0.9, y: cy + r.y * 0.9, z: r.z};
      });
      const faces = [
        {indices: [0, 1, 2, 3], color: colTop, name: 'top'},
        {indices: [4, 5, 6, 7], color: colTop, name: 'bottom'},
        {indices: [0, 1, 5, 4], color: colFront, name: 'front'},
        {indices: [2, 3, 7, 6], color: colFront, name: 'back'},
        {indices: [1, 2, 6, 5], color: colSide, name: 'right'},
        {indices: [0, 3, 7, 4], color: colSide, name: 'left'}
      ];
      faces.forEach(f => {
        f.avgZ = f.indices.reduce((sum, idx) => sum + rotated[idx].z, 0) / 4;
      });
      faces.sort((a, b) => b.avgZ - a.avgZ);
      
      faces.forEach(f => {
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.moveTo(projected[f.indices[0]].x, projected[f.indices[0]].y);
        for(let i = 1; i < 4; i++) {
          ctx.lineTo(projected[f.indices[i]].x, projected[f.indices[i]].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    };

    // 0. NICE CUBE NEEDOH (Translucent Glassmorphic 3D Blue Cube)
    if (typeId === 0) {
      let colTopOuter = 'rgba(125, 211, 252, 0.45)';
      let colFrontOuter = 'rgba(56, 189, 248, 0.45)';
      let colSideOuter = 'rgba(2, 132, 199, 0.45)';
      
      let colTopInner = 'rgba(255, 255, 255, 0.85)';
      let colFrontInner = 'rgba(240, 249, 255, 0.85)';
      let colSideInner = 'rgba(224, 242, 254, 0.85)';

      if (skin === 'glitter') {
        colTopOuter = 'rgba(251, 207, 232, 0.45)';
        colFrontOuter = 'rgba(244, 114, 182, 0.45)';
        colSideOuter = 'rgba(219, 39, 119, 0.45)';
        colTopInner = 'rgba(244, 114, 182, 0.85)';
        colFrontInner = 'rgba(219, 39, 119, 0.85)';
        colSideInner = 'rgba(190, 24, 74, 0.85)';
      } else if (skin === 'metallic') {
        colTopOuter = 'rgba(248, 250, 252, 0.45)';
        colFrontOuter = 'rgba(226, 232, 240, 0.45)';
        colSideOuter = 'rgba(148, 163, 184, 0.45)';
        colTopInner = 'rgba(241, 245, 249, 0.85)';
        colFrontInner = 'rgba(203, 213, 225, 0.85)';
        colSideInner = 'rgba(148, 163, 184, 0.85)';
      } else if (skin === 'galaxy') {
        colTopOuter = 'rgba(168, 85, 247, 0.45)';
        colFrontOuter = 'rgba(99, 102, 241, 0.45)';
        colSideOuter = 'rgba(49, 46, 129, 0.45)';
        colTopInner = 'rgba(129, 140, 248, 0.85)';
        colFrontInner = 'rgba(79, 70, 229, 0.85)';
        colSideInner = 'rgba(49, 46, 129, 0.85)';
      }

      if (rotationAngle !== 0) {
        drawRotatedCube(0, -3, 8.5, colTopInner, colFrontInner, colSideInner, rotationAngle);
        drawRotatedCube(0, -3, 13, colTopOuter, colFrontOuter, colSideOuter, rotationAngle);
      } else {
        drawIsometricCube(0, -3, 8.5, colTopInner, colFrontInner, colSideInner);
        drawIsometricCube(0, -3, 13, colTopOuter, colFrontOuter, colSideOuter);
      }
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(-8, -12);
      ctx.lineTo(0, -8);
      ctx.lineTo(-4, -1);
      ctx.closePath();
      ctx.fill();
    }
    // 1. WENDY FROG SQUISH (Volumetric Green Mochi Spherical Animal)
    else if (typeId === 1) {
      let color1 = '#4ade80';
      let color2 = '#15803d';
      let eyeColor = '#22c55e';
      
      if (skin === 'glitter') {
        color1 = '#fbcfe8'; color2 = '#db2777'; eyeColor = '#faa2c1';
      } else if (skin === 'metallic') {
        color1 = '#f8fafc'; color2 = '#64748b'; eyeColor = '#cbd5e1';
      } else if (skin === 'galaxy') {
        color1 = '#c084fc'; color2 = '#312e81'; eyeColor = '#818cf8';
      }

      // 3D projected bulging eyes
      const eyeLX = -7 * faceScaleX + faceDx;
      const eyeRX = 7 * faceScaleX + faceDx;

      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(eyeLX, -13, 5, 0, Math.PI*2);
      ctx.arc(eyeRX, -13, 5, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(eyeLX, -13, 1.8, 0, Math.PI*2);
      ctx.arc(eyeRX, -13, 1.8, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeLX - 0.8, -13.8, 0.8, 0, Math.PI*2);
      ctx.arc(eyeRX - 0.8, -13.8, 0.8, 0, Math.PI*2);
      ctx.fill();

      const frogGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      frogGrad.addColorStop(0, color1);
      frogGrad.addColorStop(1, color2);
      ctx.fillStyle = frogGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = '#f0fdf4';
        ctx.beginPath();
        ctx.ellipse(0, 6, 8, 6.5, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, -1, 3.2, 0.2, Math.PI - 0.2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(-8, 1, 2, 0, Math.PI*2);
        ctx.arc(8, 1, 2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }
    }
    // 2. CAM CAT SQUISH (Cream Shaded Cat Mochi)
    else if (typeId === 2) {
      let color1 = '#fef3c7';
      let color2 = '#d97706';
      let earColor = '#ca8a04';
      
      if (skin === 'glitter') {
        color1 = '#fce7f3'; color2 = '#c2185b'; earColor = '#f472b6';
      } else if (skin === 'metallic') {
        color1 = '#f1f5f9'; color2 = '#475569'; earColor = '#cbd5e1';
      } else if (skin === 'galaxy') {
        color1 = '#e0e7ff'; color2 = '#3730a3'; earColor = '#6366f1';
      }

      const earLX = -10 * faceScaleX + faceDx;
      const earRX = 10 * faceScaleX + faceDx;

      ctx.fillStyle = earColor;
      ctx.beginPath();
      ctx.moveTo(earLX, -8); ctx.lineTo(earLX - 4, -20); ctx.lineTo(earLX + 7, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(earRX, -8); ctx.lineTo(earRX + 4, -20); ctx.lineTo(earRX - 7, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();

      const catGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      catGrad.addColorStop(0, color1);
      catGrad.addColorStop(1, color2);
      ctx.fillStyle = catGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = '#b45309';
        ctx.fillRect(-3, -14, 6, 3);
        ctx.fillRect(-8, -13, 3, 2);
        ctx.fillRect(5, -13, 3, 2);

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-5, -2, 1.6, 0, Math.PI*2);
        ctx.arc(5, -2, 1.6, 0, Math.PI*2);
        ctx.fill();
        
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(-1, 1, 1, 0, Math.PI);
        ctx.arc(1, 1, 1, 0, Math.PI);
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(-8, 1, 2, 0, Math.PI*2);
        ctx.arc(8, 1, 2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }
    }
    // 3. NEEDOH GUMDROP (Pink Volumetric Gumdrop)
    else if (typeId === 3) {
      let color1 = '#f472b6';
      let color2 = '#be185d';
      
      if (skin === 'glitter') {
        color1 = '#faa2c1'; color2 = '#c2255c';
      } else if (skin === 'metallic') {
        color1 = '#f1f5f9'; color2 = '#64748b';
      } else if (skin === 'galaxy') {
        color1 = '#c084fc'; color2 = '#1e1b4b';
      }

      const gdGrad = ctx.createRadialGradient(0, -6, 2, 0, 1, 15);
      gdGrad.addColorStop(0, color1); 
      gdGrad.addColorStop(1, color2);
      ctx.fillStyle = gdGrad;
      
      ctx.beginPath();
      ctx.moveTo(-13, 14);
      ctx.lineTo(13, 14);
      ctx.quadraticCurveTo(11, -3, 6, -11);
      ctx.quadraticCurveTo(0, -15, -6, -11);
      ctx.quadraticCurveTo(-11, -3, -13, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, -9, 4, 2, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#4c0519';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(-4, -1, 1.5, Math.PI, 0);
        ctx.arc(4, -1, 1.5, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 2.5, 2, 0, Math.PI);
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(-8, 1, 2, 0, Math.PI*2);
        ctx.arc(8, 1, 2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }
    }
    // 4. CONNOR COW SQUISH (Cow Volumetric egg)
    else if (typeId === 4) {
      let color1 = '#ffffff';
      let color2 = '#94a3b8';
      let spotColor = '#334155';
      
      if (skin === 'glitter') {
        color1 = '#fdf2f8'; color2 = '#f472b6'; spotColor = '#db2777';
      } else if (skin === 'metallic') {
        color1 = '#f8fafc'; color2 = '#cbd5e1'; spotColor = '#475569';
      } else if (skin === 'galaxy') {
        color1 = '#f5f3ff'; color2 = '#a855f7'; spotColor = '#312e81';
      }

      const earLX = -14 * faceScaleX + faceDx;
      const earRX = 14 * faceScaleX + faceDx;
      const hornLX = -7 * faceScaleX + faceDx;
      const hornRX = 7 * faceScaleX + faceDx;

      ctx.fillStyle = spotColor;
      ctx.beginPath();
      ctx.ellipse(earLX, -6, 5, 3, -0.4, 0, Math.PI*2);
      ctx.ellipse(earRX, -6, 5, 3, 0.4, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(hornLX, -13); ctx.quadraticCurveTo(hornLX - 4, -20, hornLX - 4, -15); ctx.lineTo(hornLX + 3, -13);
      ctx.moveTo(hornRX, -13); ctx.quadraticCurveTo(hornRX + 4, -20, hornRX + 4, -15); ctx.lineTo(hornRX - 3, -13);
      ctx.fill(); ctx.stroke();

      const cowGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      cowGrad.addColorStop(0, color1);
      cowGrad.addColorStop(1, color2);
      ctx.fillStyle = cowGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = spotColor;
        ctx.beginPath();
        ctx.arc(-7, -9, 4, 0, Math.PI*2);
        ctx.ellipse(8, 2, 5, 7, 0.4, 0, Math.PI*2);
        ctx.fill();

        const snoutGrad = ctx.createLinearGradient(0, 0, 0, 8);
        snoutGrad.addColorStop(0, '#ffe4e6');
        snoutGrad.addColorStop(1, '#fda4af');
        ctx.fillStyle = snoutGrad;
        ctx.beginPath();
        ctx.ellipse(0, 4, 8, 5, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.arc(-2.5, 4, 0.8, 0, Math.PI*2);
        ctx.arc(2.5, 4, 0.8, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-5, -2, 1.6, 0, Math.PI*2);
        ctx.arc(5, -2, 1.6, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(-8, 1, 2, 0, Math.PI*2);
        ctx.arc(8, 1, 2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }
    }
    // 5. TEENIE NEEDOHS (Three Volumetric neon spheres)
    else if (typeId === 5) {
      const drawShadedBall = (cx, cy, col1, col2) => {
        const ballGrad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 7);
        ballGrad.addColorStop(0, col1);
        ballGrad.addColorStop(1, col2);
        ctx.fillStyle = ballGrad;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 2, 1.2, 0, Math.PI*2);
        ctx.fill();
      };

      if (skin === 'glitter') {
        drawShadedBall(-5 + faceDx, 5, '#fda4af', '#f43f5e');
        drawShadedBall(5 + faceDx, 5, '#fbcfe8', '#db2777');
        drawShadedBall(0 + faceDx, -4, '#fce7f3', '#c2185b');
      } else if (skin === 'metallic') {
        drawShadedBall(-5 + faceDx, 5, '#f1f5f9', '#94a3b8');
        drawShadedBall(5 + faceDx, 5, '#e2e8f0', '#64748b');
        drawShadedBall(0 + faceDx, -4, '#cbd5e1', '#475569');
      } else if (skin === 'galaxy') {
        drawShadedBall(-5 + faceDx, 5, '#c084fc', '#4c1d95');
        drawShadedBall(5 + faceDx, 5, '#a5b4fc', '#312e81');
        drawShadedBall(0 + faceDx, -4, '#ddd6fe', '#5b21b6');
      } else {
        drawShadedBall(-5 + faceDx, 5, '#ff7043', '#d84315');
        drawShadedBall(5 + faceDx, 5, '#a7f3d0', '#047857');
        drawShadedBall(0 + faceDx, -4, '#f472b6', '#be185d');
      }
    }
    // 6. SHAGGY NEEDOH (Yellow Shaded Core with strands)
    else if (typeId === 6) {
      let color1 = '#fef08a';
      let color2 = '#d97706';
      let strandColor = '#eab308';
      let tipColor = '#facc15';

      if (skin === 'glitter') {
        color1 = '#fbcfe8'; color2 = '#db2777'; strandColor = '#f472b6'; tipColor = '#fda4af';
      } else if (skin === 'metallic') {
        color1 = '#f8fafc'; color2 = '#64748b'; strandColor = '#cbd5e1'; tipColor = '#e2e8f0';
      } else if (skin === 'galaxy') {
        color1 = '#c084fc'; color2 = '#312e81'; strandColor = '#818cf8'; tipColor = '#a5b4fc';
      }

      const shGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, 11);
      shGrad.addColorStop(0, color1);
      shGrad.addColorStop(1, color2);
      ctx.fillStyle = shGrad;
      
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = strandColor;
      ctx.lineWidth = 1.8;
      for (let a = 0; a < Math.PI*2; a += 0.28) {
        const curAngle = a + rotationAngle;
        const startX = Math.cos(curAngle) * 11;
        const startY = Math.sin(curAngle) * 11;
        const endX = Math.cos(curAngle) * 15.5;
        const endY = Math.sin(curAngle) * 15.5;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.fillStyle = tipColor;
        ctx.beginPath();
        ctx.arc(endX, endY, 1.1, 0, Math.PI*2);
        ctx.fill();
      }

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(-3, -2, 1.2, Math.PI, 0);
        ctx.arc(3, -2, 1.2, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 1.5, 2.2, 0, Math.PI);
        ctx.stroke();

        ctx.restore();
      }
    }
    // 7. ARCHIE AXOLOTL SQUISH (Volumetric Pink Axolotl)
    else if (typeId === 7) {
      let color1 = '#fecdd3';
      let color2 = '#db2777';
      let gillColor = '#f43f5e';

      if (skin === 'glitter') {
        color1 = '#fdf2f8'; color2 = '#be185d'; gillColor = '#ec4899';
      } else if (skin === 'metallic') {
        color1 = '#f1f5f9'; color2 = '#475569'; gillColor = '#cbd5e1';
      } else if (skin === 'galaxy') {
        color1 = '#c084fc'; color2 = '#312e81'; gillColor = '#6366f1';
      }

      const gillLX = -15 * faceScaleX + faceDx;
      const gillRX = 15 * faceScaleX + faceDx;

      ctx.fillStyle = gillColor;
      for (let i = 0; i < 3; i++) {
        const offset = i * 6 - 6;
        ctx.beginPath(); ctx.ellipse(gillLX, offset, 7, 3, -0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(gillRX, offset, 7, 3, 0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      }

      const axGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      axGrad.addColorStop(0, color1);
      axGrad.addColorStop(1, color2);
      ctx.fillStyle = axGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-6, -2, 2.2, 0, Math.PI*2);
        ctx.arc(6, -2, 2.2, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(-0.8, 2, 1, 0, Math.PI);
        ctx.arc(0.8, 2, 1, 0, Math.PI);
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
        ctx.beginPath();
        ctx.arc(-8, 1, 2.2, 0, Math.PI*2);
        ctx.arc(8, 1, 2.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }
    }
    // 8. GOLDEN NICE CUBE (Holographic Chrome Gold Cube)
    else if (typeId === 8) {
      let colTopOuter = 'rgba(254, 240, 138, 0.45)';
      let colFrontOuter = 'rgba(234, 179, 8, 0.45)';
      let colSideOuter = 'rgba(202, 138, 4, 0.45)';
      
      let colTopInner = '#fde047';
      let colFrontInner = '#eab308';
      let colSideInner = '#ca8a04';

      if (skin === 'glitter') {
        colTopOuter = 'rgba(251, 207, 232, 0.45)';
        colFrontOuter = 'rgba(244, 114, 182, 0.45)';
        colSideOuter = 'rgba(219, 39, 119, 0.45)';
        colTopInner = '#f472b6';
        colFrontInner = '#be185d';
        colSideInner = '#9d174d';
      } else if (skin === 'metallic') {
        colTopOuter = 'rgba(255, 255, 255, 0.45)';
        colFrontOuter = 'rgba(226, 232, 240, 0.45)';
        colSideOuter = 'rgba(148, 163, 184, 0.45)';
        colTopInner = '#ffffff';
        colFrontInner = '#cbd5e1';
        colSideInner = '#94a3b8';
      } else if (skin === 'galaxy') {
        colTopOuter = 'rgba(168, 85, 247, 0.45)';
        colFrontOuter = 'rgba(99, 102, 241, 0.45)';
        colSideOuter = 'rgba(49, 46, 129, 0.45)';
        colTopInner = '#fbbf24';
        colFrontInner = '#ca8a04';
        colSideInner = '#854d0e';
      }

      if (rotationAngle !== 0) {
        drawRotatedCube(0, -3, 8.5, colTopInner, colFrontInner, colSideInner, rotationAngle);
        drawRotatedCube(0, -3, 13, colTopOuter, colFrontOuter, colSideOuter, rotationAngle);
      } else {
        drawIsometricCube(0, -3, 8.5, colTopInner, colFrontInner, colSideInner);
        drawIsometricCube(0, -3, 13, colTopOuter, colFrontOuter, colSideOuter);
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(-8, -12);
      ctx.lineTo(0, -8);
      ctx.lineTo(-4, -1);
      ctx.closePath();
      ctx.fill();

      const drawSparkleCross = (sx, sy) => {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx - 3.5, sy); ctx.lineTo(sx + 3.5, sy);
        ctx.moveTo(sx, sy - 3.5); ctx.lineTo(sx, sy + 3.5);
        ctx.stroke();
      };
      drawSparkleCross(8, -8);
      drawSparkleCross(-7, 8);
    }

    // Helper: Draw volumetric dumpling shapes
    const drawDumplingShape = (cx, cy, col1, col2) => {
      let fillVal = col1;
      if (typeof col1 === 'string') {
        const dumpGrad = ctx.createRadialGradient(cx - 3, cy - 3, 2, cx, cy, 14);
        dumpGrad.addColorStop(0, col1);
        dumpGrad.addColorStop(1, col2);
        fillVal = dumpGrad;
      }
      ctx.fillStyle = fillVal;
      
      ctx.beginPath();
      ctx.moveTo(cx - 13, cy + 9);
      ctx.bezierCurveTo(cx - 13, cy + 18, cx + 13, cy + 18, cx + 13, cy + 9);
      ctx.quadraticCurveTo(cx + 12, cy - 2, cx + 6, cy - 11);
      ctx.lineTo(cx + 4, cy - 8);
      ctx.lineTo(cx + 1, cy - 12);
      ctx.lineTo(cx - 1, cy - 8);
      ctx.lineTo(cx - 4, cy - 12);
      ctx.lineTo(cx - 6, cy - 8);
      ctx.quadraticCurveTo(cx - 12, cy - 2, cx - 13, cy + 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw glitter sparkles inside the dumpling body
      if (skin === 'glitter') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 6, cy + 2, 1.2, 0, Math.PI*2);
        ctx.arc(cx + 6, cy + 6, 1.0, 0, Math.PI*2);
        ctx.arc(cx + 3, cy - 3, 1.3, 0, Math.PI*2);
        ctx.arc(cx - 2, cy + 8, 1.0, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.arc(cx - 8, cy - 2, 0.8, 0, Math.PI*2);
        ctx.arc(cx + 8, cy + 2, 0.8, 0, Math.PI*2);
        ctx.arc(cx - 3, cy + 4, 0.9, 0, Math.PI*2);
        ctx.fill();
      }

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        // Fold lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 7);
        ctx.quadraticCurveTo(cx - 4, cy, cx - 7, cy + 7);
        ctx.moveTo(cx, cy - 8);
        ctx.quadraticCurveTo(cx, cy, cx, cy + 8);
        ctx.moveTo(cx + 3, cy - 7);
        ctx.quadraticCurveTo(cx + 4, cy, cx + 7, cy + 7);
        ctx.stroke();

        // Face
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(cx - 4, cy + 3, 1.5, 0, Math.PI*2);
        ctx.arc(cx + 4, cy + 3, 1.5, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(cx, cy + 4, 1.8, 0, Math.PI);
        ctx.stroke();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
        ctx.beginPath();
        ctx.arc(cx - 7, cy + 5, 1.5, 0, Math.PI*2);
        ctx.arc(cx + 7, cy + 5, 1.5, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }
    };

    // 9..18 Dumpling Skin Mapping
    let dCol1 = null;
    let dCol2 = null;
    let isRainbow = false;
    let isGold = false;

    if (typeId === 9) { dCol1 = '#faa2a2'; dCol2 = '#e03131'; }
    else if (typeId === 10) { dCol1 = '#ffd8a8'; dCol2 = '#f76707'; }
    else if (typeId === 11) { dCol1 = '#ffec99'; dCol2 = '#f59f00'; }
    else if (typeId === 12) { dCol1 = '#b2f2bb'; dCol2 = '#2b8a3e'; }
    else if (typeId === 13) { dCol1 = '#a5d8ff'; dCol2 = '#1c7ed6'; }
    else if (typeId === 14) { dCol1 = '#eebefa'; dCol2 = '#ae3ec9'; }
    else if (typeId === 15) { dCol1 = '#ffdeeb'; dCol2 = '#f783ac'; }
    else if (typeId === 16) { dCol1 = '#f5f3ff'; dCol2 = '#6366f1'; }
    else if (typeId === 17) { isRainbow = true; }
    else if (typeId === 18) { isGold = true; }

    if (skin === 'metallic') {
      dCol1 = '#f1f5f9'; dCol2 = '#64748b'; isRainbow = false; isGold = false;
    } else if (skin === 'galaxy') {
      dCol1 = '#c084fc'; dCol2 = '#312e81'; isRainbow = false; isGold = false;
    }

    if (typeId >= 9 && typeId <= 18) {
      if (typeId === 16 && skin === 'normal') {
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#d946ef';
      }
      
      let fillGrad = null;
      if (isRainbow) {
        const rbGrad = ctx.createLinearGradient(-13, -10, 13, 10);
        rbGrad.addColorStop(0, '#ff6b6b');
        rbGrad.addColorStop(0.2, '#fcc419');
        rbGrad.addColorStop(0.4, '#51cf66');
        rbGrad.addColorStop(0.6, '#339af0');
        rbGrad.addColorStop(0.8, '#cc5de8');
        rbGrad.addColorStop(1.0, '#ff8787');
        fillGrad = rbGrad;
      } else if (isGold) {
        const goldGrad = ctx.createLinearGradient(-13, -10, 13, 10);
        goldGrad.addColorStop(0, '#fff3bf');
        goldGrad.addColorStop(0.5, '#f59f00');
        goldGrad.addColorStop(1, '#fcc419');
        fillGrad = goldGrad;
      } else {
        fillGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 14);
        fillGrad.addColorStop(0, dCol1);
        fillGrad.addColorStop(1, dCol2);
      }

      drawDumplingShape(0, -2, fillGrad, fillGrad);

      if (typeId === 16 && skin === 'normal') {
        ctx.fillStyle = '#d946ef';
        ctx.beginPath();
        ctx.arc(-8, -4, 1.2, 0, Math.PI*2);
        ctx.arc(8, -4, 1.2, 0, Math.PI*2);
        ctx.fill();
      }

      if (isGold) {
        const drawSparkleCross = (sx, sy) => {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(sx - 3.5, sy); ctx.lineTo(sx + 3.5, sy);
          ctx.moveTo(sx, sy - 3.5); ctx.lineTo(sx, sy + 3.5);
          ctx.stroke();
        };
        drawSparkleCross(8, -8);
        drawSparkleCross(-7, 8);
      }
    }

    // 19. GUMMY BEAR NEEDOH (Translucent bear squishy)
    else if (typeId === 19) {
      let color1 = 'rgba(239, 68, 68, 0.85)';
      let color2 = 'rgba(185, 28, 28, 0.9)';
      let muzzleColor = '#ffb3b3';

      if (skin === 'glitter') {
        color1 = 'rgba(244, 63, 94, 0.85)'; color2 = 'rgba(190, 24, 93, 0.9)'; muzzleColor = '#fbcfe8';
      } else if (skin === 'metallic') {
        color1 = 'rgba(241, 245, 249, 0.85)'; color2 = 'rgba(100, 116, 139, 0.9)'; muzzleColor = '#e2e8f0';
      } else if (skin === 'galaxy') {
        color1 = 'rgba(168, 85, 247, 0.85)'; color2 = 'rgba(76, 29, 149, 0.9)'; muzzleColor = '#ddd6fe';
      }

      const earLX = -8 * faceScaleX + faceDx;
      const earRX = 8 * faceScaleX + faceDx;
      const armLX = -12 * faceScaleX + faceDx;
      const armRX = 12 * faceScaleX + faceDx;
      const legLX = -7 * faceScaleX + faceDx;
      const legRX = 7 * faceScaleX + faceDx;

      ctx.fillStyle = color2;
      ctx.beginPath();
      ctx.arc(earLX, -12, 4.5, 0, Math.PI*2);
      ctx.arc(earRX, -12, 4.5, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(armLX, 1, 4.2, 2.5, -0.4, 0, Math.PI*2);
      ctx.ellipse(armRX, 1, 4.2, 2.5, 0.4, 0, Math.PI*2);
      ctx.ellipse(legLX, 13, 4.5, 3.2, 0.2, 0, Math.PI*2);
      ctx.ellipse(legRX, 13, 4.5, 3.2, -0.2, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      const bearGrad = ctx.createRadialGradient(-3, -4, 2, 0, 1, 15);
      bearGrad.addColorStop(0, color1);
      bearGrad.addColorStop(1, color2);
      ctx.fillStyle = bearGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 10.5, 13.5, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.ellipse(0, 5, 6.5, 5, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = muzzleColor;
        ctx.beginPath();
        ctx.ellipse(0, 1, 4.2, 2.8, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, -0.8, 1.1, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(0, -0.2); ctx.lineTo(0, 1.2);
        ctx.arc(-0.8, 1.2, 0.8, 0, Math.PI);
        ctx.arc(0.8, 1.2, 0.8, 0, Math.PI);
        ctx.stroke();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-4, -3, 1.3, 0, Math.PI*2);
        ctx.arc(4, -3, 1.3, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = 'rgba(244, 63, 94, 0.3)';
        ctx.beginPath();
        ctx.arc(-6, -0.5, 1.2, 0, Math.PI*2);
        ctx.arc(6, -0.5, 1.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }

      if (skin === 'glitter') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-4, -8, 0.8, 0, Math.PI*2);
        ctx.arc(5, 5, 0.7, 0, Math.PI*2);
        ctx.arc(-5, 8, 0.9, 0, Math.PI*2);
        ctx.fill();
      }
    }
    // 20. FUZZ BALL NEEDOH (Fuzzy stress ball)
    else if (typeId === 20) {
      let color1 = '#67e8f9';
      let color2 = '#0891b2';
      let strandColor = '#06b6d4';

      if (skin === 'glitter') {
        color1 = '#fbcfe8'; color2 = '#db2777'; strandColor = '#ec4899';
      } else if (skin === 'metallic') {
        color1 = '#f1f5f9'; color2 = '#475569'; strandColor = '#94a3b8';
      } else if (skin === 'galaxy') {
        color1 = '#c084fc'; color2 = '#312e81'; strandColor = '#6366f1';
      }

      const fzGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, 11.5);
      fzGrad.addColorStop(0, color1);
      fzGrad.addColorStop(1, color2);
      ctx.fillStyle = fzGrad;
      
      ctx.beginPath();
      ctx.arc(0, 0, 11.5, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = strandColor;
      ctx.lineWidth = 0.85;
      for (let a = 0; a < Math.PI*2; a += 0.08) {
        const lengthMod = 2.5 + Math.sin(a * 14 + Date.now() * 0.008) * 0.9;
        const curAngle = a + rotationAngle;
        const startX = Math.cos(curAngle) * 11.5;
        const startY = Math.sin(curAngle) * 11.5;
        const endX = Math.cos(curAngle) * (11.5 + lengthMod);
        const endY = Math.sin(curAngle) * (11.5 + lengthMod);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = '#083344';
        ctx.beginPath();
        ctx.arc(-4, -1, 1.4, 0, Math.PI*2);
        ctx.arc(4, -1, 1.4, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#083344';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(0, 0.5, 1.8, 0, Math.PI);
        ctx.stroke();

        ctx.restore();
      }

      if (skin === 'glitter') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-3, 3, 0.8, 0, Math.PI*2);
        ctx.arc(4, -4, 0.8, 0, Math.PI*2);
        ctx.fill();
      }
    }
    // 21. COLOUR CHANGE NEEDOH (Green to Pink dynamic shift)
    else if (typeId === 21) {
      const timeMs = Date.now();
      const shift = (Math.sin(timeMs * 0.0035) + 1) / 2;

      let color1, color2;
      if (skin === 'normal') {
        const r1 = Math.floor(34 * (1 - shift) + 244 * shift);
        const g1 = Math.floor(211 * (1 - shift) + 63 * shift);
        const b1 = Math.floor(129 * (1 - shift) + 94 * shift);
        color1 = `rgb(${r1}, ${g1}, ${b1})`;

        const r2 = Math.floor(16 * (1 - shift) + 190 * shift);
        const g2 = Math.floor(120 * (1 - shift) + 24 * shift);
        const b2 = Math.floor(60 * (1 - shift) + 70 * shift);
        color2 = `rgb(${r2}, ${g2}, ${b2})`;
      } else if (skin === 'glitter') {
        const r1 = Math.floor(244 * (1 - shift) + 253 * shift);
        const g1 = Math.floor(63 * (1 - shift) + 224 * shift);
        const b1 = Math.floor(94 * (1 - shift) + 71 * shift);
        color1 = `rgb(${r1}, ${g1}, ${b1})`;

        const r2 = Math.floor(190 * (1 - shift) + 202 * shift);
        const g2 = Math.floor(24 * (1 - shift) + 138 * shift);
        const b2 = Math.floor(74 * (1 - shift) + 4 * shift);
        color2 = `rgb(${r2}, ${g2}, ${b2})`;
      } else if (skin === 'metallic') {
        const r1 = Math.floor(241 * (1 - shift) + 234 * shift);
        const g1 = Math.floor(245 * (1 - shift) + 179 * shift);
        const b1 = Math.floor(249 * (1 - shift) + 8 * shift);
        color1 = `rgb(${r1}, ${g1}, ${b1})`;

        const r2 = Math.floor(148 * (1 - shift) + 161 * shift);
        const g2 = Math.floor(163 * (1 - shift) + 98 * shift);
        const b2 = Math.floor(184 * (1 - shift) + 7 * shift);
        color2 = `rgb(${r2}, ${g2}, ${b2})`;
      } else if (skin === 'galaxy') {
        const r1 = Math.floor(99 * (1 - shift) + 219 * shift);
        const g1 = Math.floor(102 * (1 - shift) + 39 * shift);
        const b1 = Math.floor(241 * (1 - shift) + 119 * shift);
        color1 = `rgb(${r1}, ${g1}, ${b1})`;

        const r2 = Math.floor(49 * (1 - shift) + 131 * shift);
        const g2 = Math.floor(46 * (1 - shift) + 24 * shift);
        const b2 = Math.floor(129 * (1 - shift) + 86 * shift);
        color2 = `rgb(${r2}, ${g2}, ${b2})`;
      }

      const ccGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      ccGrad.addColorStop(0, color1);
      ccGrad.addColorStop(1, color2);
      ctx.fillStyle = ccGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      if (faceScaleX >= 0) {
        ctx.save();
        ctx.translate(faceDx, 0);
        ctx.scale(faceScaleX, 1);

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-5, -2, 1.6, 0, Math.PI*2);
        ctx.arc(5, -2, 1.6, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0.5, 3.0, 0, Math.PI);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(-5.8, -2.8, 0.6, 0, Math.PI*2);
        ctx.arc(4.2, -2.8, 0.6, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      }

      if (skin === 'glitter') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-5, 4, 0.8, 0, Math.PI*2);
        ctx.arc(5, -4, 0.8, 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // DETAILED GLOWING RADIAL AURAS IN COLLECTIBLES
  drawStars() {
    this.ctx.save();
    this.environment.stars.forEach(squishy => {
      const { x, y } = squishy.position;
      const typeId = squishy.toyType || 0;
      const skin = squishy.toySkin || 'normal';
      
      const bob = Math.sin(Date.now() * 0.003 + x * 0.015) * 5;
      
      this.ctx.save();
      this.ctx.translate(x, y + bob);
      
      // AURA RADIAL ENGINE (Render behind the toy)
      if (skin !== 'normal') {
        this.ctx.save();
        const auraRadius = 26;
        const auraGrad = this.ctx.createRadialGradient(0, 0, 4, 0, 0, auraRadius);
        
        if (skin === 'glitter') {
          auraGrad.addColorStop(0, 'rgba(244, 63, 94, 0.45)'); // pink core
          auraGrad.addColorStop(0.7, 'rgba(236, 72, 153, 0.15)');
          auraGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
        } else if (skin === 'metallic') {
          auraGrad.addColorStop(0, 'rgba(241, 245, 249, 0.5)'); // silver core
          auraGrad.addColorStop(0.7, 'rgba(148, 163, 184, 0.18)');
          auraGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
        } else if (skin === 'galaxy') {
          auraGrad.addColorStop(0, 'rgba(168, 85, 247, 0.55)'); // purple core
          auraGrad.addColorStop(0.6, 'rgba(99, 102, 241, 0.22)'); // indigo mid
          auraGrad.addColorStop(1, 'rgba(99, 102, 241, 0)');
          
          // Draw spinning galaxy planetary ring
          this.ctx.strokeStyle = 'rgba(192, 132, 252, 0.35)';
          this.ctx.lineWidth = 1.5;
          this.ctx.save();
          this.ctx.rotate(Date.now() * 0.0015);
          this.ctx.beginPath();
          this.ctx.ellipse(0, 0, 22, 6, 0.2, 0, Math.PI*2);
          this.ctx.stroke();
          this.ctx.restore();
        }
        
        this.ctx.fillStyle = auraGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, auraRadius, 0, Math.PI*2);
        this.ctx.fill();
        this.ctx.restore();
      }

      // Draw the 3D Shaded Toy
      this.drawSquishyToy(this.ctx, typeId, 14, 0, skin);

      // Render skin accents on top
      if (skin === 'glitter') {
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        // Sparkle flares
        this.ctx.moveTo(-8, -8); this.ctx.lineTo(-4, -8);
        this.ctx.moveTo(-6, -10); this.ctx.lineTo(-6, -6);
        this.ctx.moveTo(6, 6); this.ctx.lineTo(10, 6);
        this.ctx.moveTo(8, 4); this.ctx.lineTo(8, 8);
        this.ctx.stroke();
      } 
      else if (skin === 'metallic') {
        // High specular chrome highlight line
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.beginPath();
        this.ctx.moveTo(-9, -9);
        this.ctx.lineTo(-2, -9);
        this.ctx.lineTo(-6, 9);
        this.ctx.lineTo(-13, 9);
        this.ctx.closePath();
        this.ctx.fill();
      }
      else if (skin === 'galaxy') {
        // Floating space stars
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(-7, 7, 1.2, 0, Math.PI*2);
        this.ctx.arc(7, -7, 1.2, 0, Math.PI*2);
        this.ctx.fill();
      }

      this.ctx.restore();
    });
    this.ctx.restore();
  }

  drawSpillParticles() {
    this.ctx.save();
    
    for (let i = this.spillParticles.length - 1; i >= 0; i--) {
      const p = this.spillParticles[i];
      const skin = p.toySkin || 'normal';
      
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25; 
      p.vx *= 0.98; 
      p.rotation += p.rotSpeed;

      const floorLevel = 900 - 10;
      if (p.y >= floorLevel) {
        p.y = floorLevel;
        p.vy = -p.vy * 0.45; 
        p.vx *= 0.75;
        p.bounceCount++;
      }

      p.life++;
      const alpha = 1 - (p.life / p.maxLife);

      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);

      // Draw glows for rare skin particle scatters
      if (skin !== 'normal') {
        const auraGrad = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
        if (skin === 'glitter') {
          auraGrad.addColorStop(0, 'rgba(244, 63, 94, 0.4)');
          auraGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        } else if (skin === 'metallic') {
          auraGrad.addColorStop(0, 'rgba(241, 245, 249, 0.4)');
          auraGrad.addColorStop(1, 'rgba(241, 245, 249, 0)');
        } else if (skin === 'galaxy') {
          auraGrad.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
          auraGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        }
        this.ctx.fillStyle = auraGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 18, 0, Math.PI*2);
        this.ctx.fill();
      }

      this.drawSquishyToy(this.ctx, p.toyType, 10, p.rotation || 0, p.toySkin || 'normal');

      // Accent overlays
      if (skin === 'glitter') {
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 0.8;
        this.ctx.beginPath();
        this.ctx.moveTo(-5, -5); this.ctx.lineTo(-2, -5);
        this.ctx.moveTo(-3.5, -6.5); this.ctx.lineTo(-3.5, -3.5);
        this.ctx.stroke();
      } 
      else if (skin === 'metallic') {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.beginPath();
        this.ctx.moveTo(-6, -6);
        this.ctx.lineTo(-1, -6);
        this.ctx.lineTo(-4, 6);
        this.ctx.lineTo(-9, 6);
        this.ctx.closePath();
        this.ctx.fill();
      }

      this.ctx.restore();

      if (p.life >= p.maxLife) {
        this.spillParticles.splice(i, 1);
      }
    }

    this.ctx.restore();
  }

  drawGhostTrail() {
    const gymnast = this.gymnast;
    if (gymnast.grounded || gymnast.state === 'idle' || gymnast.state === 'run') {
      this.trail = [];
      return;
    }

    const pos = gymnast.body.position;
    this.trail.push({ x: pos.x, y: pos.y, angle: gymnast.visualAngle, state: gymnast.state });
    
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    this.ctx.save();
    this.trail.forEach((t, i) => {
      const alpha = (i / this.trail.length) * 0.2;
      this.ctx.globalAlpha = alpha;
      this.ctx.save();
      this.ctx.translate(t.x, t.y);
      this.ctx.rotate(t.angle);
      
      this.drawGymnastModel(t.state, 'rgba(168, 85, 247, 0.45)', true);
      
      this.ctx.restore();
    });
    this.ctx.restore();
  }

  drawGymnast() {
    const gymnast = this.gymnast;
    const cust = gymnast.customization;

    if (cust.hasCape && gymnast.capeSegments.length > 0) {
      this.ctx.save();
      
      const capeGrad = this.ctx.createLinearGradient(
        gymnast.body.position.x, gymnast.body.position.y,
        gymnast.capeSegments[gymnast.capeSegments.length - 1].position.x,
        gymnast.capeSegments[gymnast.capeSegments.length - 1].position.y
      );
      capeGrad.addColorStop(0, '#f43f5e');
      capeGrad.addColorStop(1, '#fb923c');

      this.ctx.fillStyle = capeGrad;
      this.ctx.strokeStyle = '#b91c1c';
      this.ctx.lineWidth = 1.8;

      this.ctx.beginPath();
      const attachPt = gymnast.body.position;
      this.ctx.moveTo(attachPt.x - 6, attachPt.y - 12);
      
      gymnast.capeSegments.forEach((seg, i) => {
        const rSideX = seg.position.x + (14 - i * 1.5)/2;
        this.ctx.lineTo(rSideX, seg.position.y);
      });

      const lastSeg = gymnast.capeSegments[gymnast.capeSegments.length - 1];
      this.ctx.lineTo(lastSeg.position.x, lastSeg.position.y + 4);

      for (let i = gymnast.capeSegments.length - 1; i >= 0; i--) {
        const seg = gymnast.capeSegments[i];
        const lSideX = seg.position.x - (14 - i * 1.5)/2;
        this.ctx.lineTo(lSideX, seg.position.y);
      }

      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.ctx.save();
    this.ctx.translate(gymnast.body.position.x, gymnast.body.position.y);
    this.ctx.rotate(gymnast.visualAngle);

    this.drawGymnastModel(gymnast.state, cust.outfitColor, false);

    this.ctx.restore();
    this.drawGripIndicators();
  }

  // ADVANCED FORWARD KINEMATICS SKELETAL RIG SYSTEM
  drawGymnastModel(state, outfitColor, isTrailSilhouette = false) {
    const cust = this.gymnast.customization;
    
    // Core color settings
    const skinColor = isTrailSilhouette ? 'rgba(168, 85, 247, 0.25)' : cust.skinColor;
    const hairColor = isTrailSilhouette ? 'rgba(168, 85, 247, 0.25)' : cust.hairColor;
    const bodyOutfitColor = isTrailSilhouette ? 'rgba(168, 85, 247, 0.25)' : outfitColor;
    const slipperColor = isTrailSilhouette ? 'rgba(168, 85, 247, 0.25)' : '#ffffff';

    const swingFactor = Math.sin(this.gymnast.runFrame);

    // Tapered capsule helper
    const drawTaperedCapsule = (x, y, wTop, wBot, h, angle, color) => {
      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(angle);
      
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      
      const rTop = wTop / 2;
      const rBot = wBot / 2;
      const hHalf = h / 2;
      
      this.ctx.arc(0, -hHalf + rTop, rTop, Math.PI, 0);
      this.ctx.lineTo(rBot, hHalf - rBot);
      this.ctx.arc(0, hHalf - rBot, rBot, 0, Math.PI);
      this.ctx.lineTo(-rTop, -hHalf + rTop);
      
      this.ctx.closePath();
      this.ctx.fill();

      if (!isTrailSilhouette) {
        this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();
      }
      this.ctx.restore();
    };

    // Foot slippers
    const drawSlipper = (x, y, angle, color) => {
      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(angle);
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 5, 8, 0.2, 0, Math.PI*2);
      this.ctx.fill();
      if (!isTrailSilhouette) {
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.1;
        this.ctx.stroke();
      }
      this.ctx.restore();
    };

    // SKELETAL LINKAGE RESOLUTION ENGINE (Hip/Knee/Ankle & Shoulder/Elbow/Hand)
    const drawSkeletalLimb = (startX, startY, thighAngle, thighLen, thighW1, thighW2, calfAngleOffset, calfLen, calfW1, calfW2, footSlipperColor = null) => {
      // 1. Thigh end joint (Knee)
      const kneeX = startX + Math.sin(thighAngle) * thighLen;
      const kneeY = startY + Math.cos(thighAngle) * thighLen;
      
      // 2. Calf end joint (Ankle)
      const absoluteCalfAngle = thighAngle + calfAngleOffset;
      const ankleX = kneeX + Math.sin(absoluteCalfAngle) * calfLen;
      const ankleY = kneeY + Math.cos(absoluteCalfAngle) * calfLen;
      
      // 3. Draw Thigh (tapered capsule)
      this.ctx.fillStyle = skinColor;
      this.ctx.beginPath();
      const thighAnglePerp = thighAngle + Math.PI/2;
      const r1 = thighW1 / 2;
      const r2 = thighW2 / 2;
      this.ctx.moveTo(startX - Math.sin(thighAnglePerp)*r1, startY - Math.cos(thighAnglePerp)*r1);
      this.ctx.arc(startX, startY, r1, thighAnglePerp + Math.PI, thighAnglePerp);
      this.ctx.lineTo(kneeX + Math.sin(thighAnglePerp)*r2, kneeY + Math.cos(thighAnglePerp)*r2);
      this.ctx.arc(kneeX, kneeY, r2, thighAnglePerp, thighAnglePerp + Math.PI);
      this.ctx.closePath();
      this.ctx.fill();
      if (!isTrailSilhouette) {
        this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();
      }

      // 4. Draw Calf (tapered capsule)
      this.ctx.beginPath();
      const calfAnglePerp = absoluteCalfAngle + Math.PI/2;
      const r3 = calfW1 / 2;
      const r4 = calfW2 / 2;
      this.ctx.moveTo(kneeX - Math.sin(calfAnglePerp)*r3, kneeY - Math.cos(calfAnglePerp)*r3);
      this.ctx.arc(kneeX, kneeY, r3, calfAnglePerp + Math.PI, calfAnglePerp);
      this.ctx.lineTo(ankleX + Math.sin(calfAnglePerp)*r4, ankleY + Math.cos(calfAnglePerp)*r4);
      this.ctx.arc(ankleX, ankleY, r4, calfAnglePerp, calfAnglePerp + Math.PI);
      this.ctx.closePath();
      this.ctx.fill();
      if (!isTrailSilhouette) {
        this.ctx.stroke();
      }

      // 5. Draw foot slipper or hand oval
      if (footSlipperColor) {
        drawSlipper(ankleX, ankleY, absoluteCalfAngle, footSlipperColor);
      } else {
        this.ctx.fillStyle = skinColor;
        this.ctx.beginPath();
        this.ctx.ellipse(ankleX, ankleY, 3.5, 4.2, absoluteCalfAngle, 0, Math.PI*2);
        this.ctx.fill();
        if (!isTrailSilhouette) {
          this.ctx.stroke();
        }
      }
    };

    // Draw Torso & Head first (z-index baseline)
    const torsoW1 = 20;
    const torsoW2 = 14;
    const torsoH = 28;
    drawTaperedCapsule(0, -2, torsoW1, torsoW2, torsoH, 0, bodyOutfitColor);
    
    // Head placement (neck is at y:-14)
    this.drawHead(0, -16, skinColor, hairColor, (state === 'wipeout' ? 'splatted' : (state === 'tuck' ? 'tucked' : 'happy')), isTrailSilhouette);

    // SKELETAL CONFIGURATION SWITCHBOARD
    if (state === 'tuck' || state === 'roll') {
      // Legs Curled Up Tight
      drawSkeletalLimb(-6, 4, -1.2, 17, 12, 9, 1.8, 15, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 4, -1.2, 17, 12, 9, 1.8, 15, 9, 6.5, slipperColor);
      
      // Arms wrapped around
      drawSkeletalLimb(-9, -10, 0.6, 16, 8, 6.5, 1.2, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, 0.6, 16, 8, 6.5, 1.2, 14, 6.5, 5, null);
    } 
    else if (state === 'split') {
      // Horizontal Wide Splits
      drawSkeletalLimb(-6, 6, -Math.PI/2 - 0.1, 19, 12, 9, 0, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 6, Math.PI/2 + 0.1, 19, 12, 9, 0, 16, 9, 6.5, slipperColor);
      
      // Arms wide
      drawSkeletalLimb(-9, -10, -Math.PI/2, 16, 8, 6.5, 0, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, Math.PI/2, 16, 8, 6.5, 0, 14, 6.5, 5, null);
    }
    else if (state === 'layout' || state === 'handstand') {
      // Straight legs
      drawSkeletalLimb(-5, 8, 0, 18, 12, 9, 0, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(5, 8, 0, 18, 12, 9, 0, 16, 9, 6.5, slipperColor);

      // Arms extended straight up above head
      drawSkeletalLimb(-9, -10, Math.PI - 0.1, 16, 8, 6.5, 0, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, Math.PI + 0.1, 16, 8, 6.5, 0, 14, 6.5, 5, null);
    }
    else if (state === 'cartwheel') {
      // Star Shape
      drawSkeletalLimb(-6, 7, -0.6, 18, 12, 9, 0, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 7, 0.6, 18, 12, 9, 0, 16, 9, 6.5, slipperColor);

      // Arms spread wide
      drawSkeletalLimb(-9, -10, -2.1, 16, 8, 6.5, 0, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, 2.1, 16, 8, 6.5, 0, 14, 6.5, 5, null);
    }
    else if (state === 'front-aerial') {
      // Split legs walkover style
      drawSkeletalLimb(-6, 6, -0.9, 18, 12, 9, 0.4, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 6, 0.9, 18, 12, 9, 0.2, 16, 9, 6.5, slipperColor);
      
      // Flying arched arms
      drawSkeletalLimb(-9, -10, 1.2, 16, 8, 6.5, 0.4, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, -1.2, 16, 8, 6.5, -0.4, 14, 6.5, 5, null);
    }
    else if (state === 'side-aerial') {
      // Star legs splits
      drawSkeletalLimb(-6, 7, -1.1, 18, 12, 9, 0, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 7, 1.1, 18, 12, 9, 0, 16, 9, 6.5, slipperColor);
      
      // Arched wings arms at sides (not pointing down)
      drawSkeletalLimb(-9, -10, -1.3, 16, 8, 6.5, 0.3, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, 1.3, 16, 8, 6.5, -0.3, 14, 6.5, 5, null);
    }
    else if (state === 'front-handspring') {
      // Arched legs vaults
      drawSkeletalLimb(-5, 7, 0.25, 18, 12, 9, 0.35, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(5, 7, 0.25, 18, 12, 9, 0.35, 16, 9, 6.5, slipperColor);
      
      // Hands extended down to push off
      drawSkeletalLimb(-9, -10, 1.4, 16, 8, 6.5, 0.2, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, -1.4, 16, 8, 6.5, -0.2, 14, 6.5, 5, null);
    }
    else if (state === 'back-handspring') {
      // Arched legs vaults
      drawSkeletalLimb(-5, 7, 0.25, 18, 12, 9, 0.35, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(5, 7, 0.25, 18, 12, 9, 0.35, 16, 9, 6.5, slipperColor);
      
      // Hands reached back to ground
      drawSkeletalLimb(-9, -10, -1.4, 16, 8, 6.5, -0.2, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, 1.4, 16, 8, 6.5, 0.2, 14, 6.5, 5, null);
    }
    else if (state === 'wipeout') {
      // Bent chaotically
      drawSkeletalLimb(-6, 6, 0.8, 18, 12, 9, 1.2, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 6, -0.6, 18, 12, 9, 0.8, 16, 9, 6.5, slipperColor);
      
      drawSkeletalLimb(-9, -10, -1.2, 16, 8, 6.5, -0.6, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, 1.3, 16, 8, 6.5, 0.4, 14, 6.5, 5, null);
    }
    else if (state === 'run' && this.gymnast.grounded) {
      // Dynamic Running Legs stride
      const leftThighAngle = 0.7 * swingFactor;
      const leftCalfAngle = swingFactor > 0 ? 0.4 * swingFactor + 0.25 : 0.05;
      
      const rightThighAngle = -0.7 * swingFactor;
      const rightCalfAngle = swingFactor < 0 ? -0.4 * swingFactor + 0.25 : 0.05;

      drawSkeletalLimb(-6, 8, leftThighAngle, 18, 12, 9, leftCalfAngle, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 8, rightThighAngle, 18, 12, 9, rightCalfAngle, 16, 9, 6.5, slipperColor);

      // Cycling Arms
      drawSkeletalLimb(-9, -10, 0.6 * swingFactor, 16, 8, 6.5, 0.2, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, -0.6 * swingFactor, 16, 8, 6.5, -0.2, 14, 6.5, 5, null);
    }
    else if (state === 'swing') {
      // High Bar Hanging
      drawSkeletalLimb(-6, 8, 0.1, 18, 12, 9, 0.05, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 8, 0.1, 18, 12, 9, 0.05, 16, 9, 6.5, slipperColor);

      // Arms straight up holding bar
      drawSkeletalLimb(-9, -10, Math.PI, 16, 8, 6.5, 0, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, Math.PI, 16, 8, 6.5, 0, 14, 6.5, 5, null);
    }
    else {
      // Idle / Default Air Jump state
      drawSkeletalLimb(-6, 8, 0.05, 18, 12, 9, 0.02, 16, 9, 6.5, slipperColor);
      drawSkeletalLimb(6, 8, -0.05, 18, 12, 9, -0.02, 16, 9, 6.5, slipperColor);

      // relaxed arms
      drawSkeletalLimb(-9, -10, 0.25, 16, 8, 6.5, 0.15, 14, 6.5, 5, null);
      drawSkeletalLimb(9, -10, -0.25, 16, 8, 6.5, -0.15, 14, 6.5, 5, null);
    }

    // Leotard Pattern decoration overlay (gradient & mini chest gold star)
    if (!isTrailSilhouette && state !== 'wipeout') {
      this.ctx.save();
      this.ctx.fillStyle = '#f59e0b'; 
      this.ctx.beginPath();
      const cx = 0;
      const cy = -6;
      this.ctx.moveTo(cx, cy - 4);
      for (let i = 0; i < 5; i++) {
        this.ctx.lineTo(cx + Math.sin(i * 1.25) * 4, cy - Math.cos(i * 1.25) * 4);
      }
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  drawHead(hx, hy, skinColor, hairColor, expression, isTrailSilhouette) {
    this.ctx.save();
    this.ctx.translate(hx, hy);

    this.ctx.beginPath();
    this.ctx.arc(0, 0, 11, 0, Math.PI * 2);
    this.ctx.fillStyle = skinColor;
    this.ctx.fill();
    if (!isTrailSilhouette) {
      this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    }

    const style = this.gymnast.customization.hairStyle;
    const hHistory = this.gymnast.headHistory;

    if (!isTrailSilhouette && style === 'pony' && hHistory.length > 8) {
      this.ctx.fillStyle = hairColor;
      
      const getTrailPos = (offsetIndex) => {
        const past = hHistory[hHistory.length - 1 - offsetIndex] || hHistory[0];
        const current = hHistory[hHistory.length - 1];
        
        const dx = past.x - current.x;
        const dy = past.y - current.y;
        
        const cos = Math.cos(-current.angle);
        const sin = Math.sin(-current.angle);
        
        return {
          x: dx * cos - dy * sin,
          y: dx * sin + dy * cos
        };
      };

      const p1 = getTrailPos(2);
      const p2 = getTrailPos(5);
      const p3 = getTrailPos(8);

      const rootX = -9;
      const rootY = -2;

      this.ctx.save();
      this.ctx.fillStyle = '#ec4899';
      this.ctx.beginPath();
      this.ctx.arc(rootX, rootY, 3, 0, Math.PI*2);
      this.ctx.fill();
      this.ctx.fillStyle = hairColor;

      this.ctx.beginPath();
      this.ctx.arc(rootX + p1.x * 0.4, rootY + p1.y * 0.4 - 2, 5, 0, Math.PI*2);
      this.ctx.fill();
      
      this.ctx.beginPath();
      this.ctx.arc(rootX + p2.x * 0.7 - 2, rootY + p2.y * 0.7 - 1, 4.2, 0, Math.PI*2);
      this.ctx.fill();
      
      this.ctx.beginPath();
      this.ctx.arc(rootX + p3.x * 0.9 - 4, rootY + p3.y * 0.9 + 1, 3.2, 0, Math.PI*2);
      this.ctx.fill();
      this.ctx.restore();
    }

    this.ctx.fillStyle = hairColor;
    if (style === 'buns') {
      this.ctx.beginPath();
      this.ctx.arc(-8, -8, 4.5, 0, Math.PI*2);
      this.ctx.arc(8, -8, 4.5, 0, Math.PI*2);
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(0, -3, 11, Math.PI, Math.PI * 2);
      this.ctx.fill();
    } else if (style === 'curly') {
      for (let a = 0; a < Math.PI * 2; a += 0.7) {
        const px = Math.cos(a) * 10.5;
        const py = Math.sin(a) * 10.5;
        if (py < 2 || px < -2) {
          this.ctx.beginPath();
          this.ctx.arc(px, py - 2.5, 4.5, 0, Math.PI*2);
          this.ctx.fill();
        }
      }
    } else {
      this.ctx.beginPath();
      this.ctx.arc(0, -2, 11.5, Math.PI * 0.95, Math.PI * 2.05);
      this.ctx.fill();
    }

    if (!isTrailSilhouette) {
      this.drawFace(expression);

      const hat = this.gymnast.customization.hat;
      if (hat !== 'none') {
        this.drawHat(hat);
      }
    }

    this.ctx.restore();
  }

  drawFace(expression) {
    this.ctx.save();
    this.ctx.strokeStyle = '#0f172a';
    this.ctx.lineWidth = 1.6;
    this.ctx.fillStyle = '#0f172a';

    const eyeLX = 2;
    const eyeRX = 7.5;
    const eyeY = -1;

    if (expression === 'splatted') {
      const drawX = (cx, cy) => {
        this.ctx.beginPath();
        this.ctx.moveTo(cx - 2, cy - 2);
        this.ctx.lineTo(cx + 2, cy + 2);
        this.ctx.moveTo(cx + 2, cy - 2);
        this.ctx.lineTo(cx - 2, cy + 2);
        this.ctx.stroke();
      };
      drawX(eyeLX, eyeY);
      drawX(eyeRX, eyeY);

      this.ctx.beginPath();
      this.ctx.moveTo(3, 5);
      this.ctx.lineTo(6.5, 4.5);
      this.ctx.stroke();
    }
    else if (expression === 'tucked') {
      this.ctx.beginPath();
      this.ctx.arc(eyeLX, eyeY, 2.2, Math.PI, 0);
      this.ctx.arc(eyeRX, eyeY, 2.2, Math.PI, 0);
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.arc(4.7, 4.5, 1.6, 0, Math.PI*2);
      this.ctx.stroke();
    }
    else {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(eyeLX, eyeY, 2.6, 0, Math.PI * 2);
      this.ctx.arc(eyeRX, eyeY, 2.6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#0f172a';
      this.ctx.beginPath();
      this.ctx.arc(eyeLX + 0.5, eyeY, 1.2, 0, Math.PI*2);
      this.ctx.arc(eyeRX + 0.5, eyeY, 1.2, 0, Math.PI*2);
      this.ctx.fill();

      this.ctx.fillStyle = 'rgba(244, 63, 94, 0.42)';
      this.ctx.beginPath();
      this.ctx.arc(eyeLX - 2, eyeY + 2.5, 1.8, 0, Math.PI*2);
      this.ctx.arc(eyeRX + 2, eyeY + 2.5, 1.8, 0, Math.PI*2);
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.arc(4.7, 3, 2.6, 0.2, Math.PI - 0.2);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  drawHat(hatType) {
    this.ctx.save();
    this.ctx.translate(0, -10);

    if (hatType === 'crown') {
      this.ctx.fillStyle = '#fbbf24';
      this.ctx.strokeStyle = '#d97706';
      this.ctx.lineWidth = 1;
      
      this.ctx.beginPath();
      this.ctx.moveTo(-9, 0);
      this.ctx.lineTo(-9, -7);
      this.ctx.lineTo(-4.5, -3);
      this.ctx.lineTo(0, -9);
      this.ctx.lineTo(4.5, -3);
      this.ctx.lineTo(9, -7);
      this.ctx.lineTo(9, 0);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
    }
    else if (hatType === 'chef') {
      this.ctx.fillStyle = '#f8fafc';
      this.ctx.strokeStyle = '#cbd5e1';
      this.ctx.lineWidth = 1;

      this.ctx.beginPath();
      this.ctx.roundRect(-7, -2, 14, 3, 1);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.arc(-4, -7, 5.5, 0, Math.PI*2);
      this.ctx.arc(4, -7, 5.5, 0, Math.PI*2);
      this.ctx.arc(0, -11, 6.5, 0, Math.PI*2);
      this.ctx.fill();
      this.ctx.stroke();
    }
    else if (hatType === 'party') {
      this.ctx.fillStyle = '#ec4899';
      this.ctx.strokeStyle = '#c084fc';
      this.ctx.lineWidth = 1;

      this.ctx.beginPath();
      this.ctx.moveTo(-7, 0);
      this.ctx.lineTo(0, -16);
      this.ctx.lineTo(7, 0);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#fbbf24';
      this.ctx.beginPath();
      this.ctx.arc(0, -17, 3, 0, Math.PI*2);
      this.ctx.fill();
    }
    else if (hatType === 'mask') {
      this.ctx.translate(0, 7.5);
      this.ctx.fillStyle = '#06b6d4';
      
      this.ctx.beginPath();
      this.ctx.ellipse(2, 1, 6.5, 3.5, 0.1, 0, Math.PI*2);
      this.ctx.ellipse(7.5, 1, 6.5, 3.5, -0.1, 0, Math.PI*2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  drawGripIndicators() {
    const hands = this.gymnast.getHandPositions();
    const grips = this.gymnast.grabConstraints;

    this.ctx.save();
    if (grips.left) {
      this.ctx.strokeStyle = '#22c55e';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([2, 2]);
      this.ctx.beginPath();
      this.ctx.arc(hands.left.x, hands.left.y, 8, 0, Math.PI*2);
      this.ctx.stroke();
    }
    if (grips.right) {
      this.ctx.strokeStyle = '#22c55e';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([2, 2]);
      this.ctx.beginPath();
      this.ctx.arc(hands.right.x, hands.right.y, 8, 0, Math.PI*2);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawParticles() {
    this.ctx.save();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      p.x += p.vx;
      p.y += p.vy;
      
      if (p.type === 'confetti') {
        p.vy += 0.1;
        p.vx *= 0.98;
        p.rotation += p.rotSpeed;
      } else if (p.type === 'dust') {
        p.vy *= 0.95;
        p.vx *= 0.95;
        p.size += 0.22;
      } else if (p.type === 'sparkle') {
        p.vy *= 0.96;
        p.vx *= 0.96;
      }

      p.life++;
      p.alpha = 1 - (p.life / p.maxLife);

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;

      if (p.type === 'confetti') {
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        this.ctx.fillRect(-p.size/2, -p.size/4, p.size, p.size/2);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    this.ctx.restore();
  }

  drawPopups() {
    this.ctx.save();
    
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.y += p.vy;
      p.life++;
      p.alpha = 1 - (p.life / p.maxLife);

      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;
      this.ctx.font = 'bold 22px "Outfit", sans-serif';
      this.ctx.textAlign = 'center';
      
      this.ctx.shadowBlur = 4;
      this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      
      this.ctx.fillText(p.text, p.x, p.y);

      if (p.life >= p.maxLife) {
        this.popups.splice(i, 1);
      }
    }

    this.ctx.restore();
  }
}
