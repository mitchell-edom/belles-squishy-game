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
    const envH = this.environment.height;
    
    const drawScrollHills = (parallaxFactor, baseHeight, amplitude, color) => {
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      
      const scrollX = this.camera.x * parallaxFactor;
      const segmentSize = 400;
      
      const startX = Math.floor((this.camera.x - 200) / segmentSize) * segmentSize;
      const endX = startX + width + segmentSize * 2;
      
      this.ctx.moveTo(startX, envH);
      for (let x = startX; x <= endX; x += 50) {
        const y = envH - baseHeight + Math.sin((x + scrollX) * 0.001) * amplitude + Math.cos((x + scrollX) * 0.002) * (amplitude/2);
        this.ctx.lineTo(x, y);
      }
      this.ctx.lineTo(endX, envH);
      this.ctx.closePath();
      this.ctx.fill();
    };

    drawScrollHills(0.65, 380, 110, '#0e0b1f');
    drawScrollHills(0.45, 260, 60, '#15132c');

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    const starOffset = this.camera.x * 0.8;
    for (let i = 0; i < 20; i++) {
      const sx = (i * 240 - starOffset) % (width + 400) + this.camera.x - 200;
      const sy = 100 + Math.sin(i * 1.5) * 80;
      this.ctx.fillRect(sx, sy, 2, 2);
    }

    this.ctx.restore();
  }

  drawStaticEnvironment() {
    this.ctx.save();
    
    this.environment.staticBodies.forEach(body => {
      const label = body.label || '';
      const vertices = body.vertices;

      this.ctx.beginPath();
      this.ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        this.ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      this.ctx.closePath();

      if (label === 'mat-ground') {
        const grad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[2].y);
        grad.addColorStop(0, '#5b21b6'); 
        grad.addColorStop(1, '#3b0764');
        this.ctx.fillStyle = grad;
        this.ctx.fill();

        this.ctx.strokeStyle = '#a78bfa';
        this.ctx.lineWidth = 3;
        this.ctx.stroke();

        this.ctx.strokeStyle = 'rgba(167, 139, 250, 0.25)';
        this.ctx.lineWidth = 1.5;
        const matWidth = vertices[1].x - vertices[0].x;
        const segmentCount = Math.floor(matWidth / 120);
        for (let i = 1; i < segmentCount; i++) {
          const sx = vertices[0].x + (matWidth / segmentCount) * i;
          this.ctx.beginPath();
          this.ctx.moveTo(sx, vertices[0].y + 3);
          this.ctx.lineTo(sx, vertices[2].y - 3);
          this.ctx.stroke();
        }

        this.ctx.fillStyle = '#1e1b4b';
        for (let i = 0; i < segmentCount; i++) {
          const hx = vertices[0].x + (matWidth / segmentCount) * i + 40;
          this.ctx.fillRect(hx, vertices[0].y + 12, 14, 4);
        }
      } 
      else if (label === 'floating-mat' || label === 'mat-platform') {
        this.ctx.fillStyle = '#1e40af'; 
        this.ctx.fill();
        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        this.ctx.fillStyle = '#fbbf24';
        this.ctx.fillRect(vertices[0].x + 12, vertices[0].y + 6, 8, 3);
        this.ctx.fillRect(vertices[1].x - 20, vertices[0].y + 6, 8, 3);
      }
      else if (label === 'balance-beam') {
        const beamGrad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[2].y);
        beamGrad.addColorStop(0, '#eab308'); 
        beamGrad.addColorStop(0.5, '#ca8a04');
        beamGrad.addColorStop(1, '#854d0e');
        this.ctx.fillStyle = beamGrad;
        this.ctx.fill();

        this.ctx.strokeStyle = '#713f12';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.fillStyle = '#475569'; 
        const legH = 900 - vertices[2].y;
        this.ctx.fillRect(vertices[0].x + 35, vertices[2].y, 10, legH);
        this.ctx.fillRect(vertices[1].x - 45, vertices[2].y, 10, legH);
        
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(vertices[0].x + 20, 900 - 10, 40, 10);
        this.ctx.fillRect(vertices[1].x - 60, 900 - 10, 40, 10);
      }
      else if (label === 'swing-bar') {
        const barGrad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[0].x, vertices[2].y);
        barGrad.addColorStop(0, '#f1f5f9');
        barGrad.addColorStop(0.5, '#94a3b8');
        barGrad.addColorStop(1, '#475569');
        this.ctx.fillStyle = barGrad;
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 1;
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
          this.ctx.arc(vertices[0].x + 3, vertices[0].y + ny, 2, 0, Math.PI*2);
          this.ctx.fill();
        }

        if (vertices[2].y >= 890) {
          this.ctx.fillStyle = '#334155';
          this.ctx.fillRect(vertices[0].x - 12, 900 - 12, 30, 12);
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
      else if (label.includes('tower')) {
        const grad = this.ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[2].x, vertices[2].y);
        grad.addColorStop(0, '#111827');
        grad.addColorStop(1, '#030712');
        this.ctx.fillStyle = grad;
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#3f3f46';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();
      }
      else {
        this.ctx.fillStyle = '#0f172a';
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
  drawSquishyToy(ctx, typeId, radius) {
    ctx.save();
    
    // Scale drawings so they look correct based on requested size (standard radius is 14px)
    const scale = radius / 14;
    ctx.scale(scale, scale);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;

    // Helper: Draw isometric 3D Cubes (Nice Cubes)
    const drawIsometricCube = (cx, cy, size, colTop, colFront, colSide) => {
      const h = size / 2;
      const wRad = size * 0.86;

      // Top face
      ctx.fillStyle = colTop;
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + wRad, cy - h);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - wRad, cy - h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Front Face
      ctx.fillStyle = colFront;
      ctx.beginPath();
      ctx.moveTo(cx - wRad, cy - h);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - wRad, cy + h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right Face
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

    // 0. NICE CUBE NEEDOH (Translucent Glassmorphic 3D Blue Cube)
    if (typeId === 0) {
      drawIsometricCube(0, -3, 13, 'rgba(125, 211, 252, 0.9)', 'rgba(56, 189, 248, 0.9)', 'rgba(2, 132, 199, 0.9)');
      
      // Glossy highlight shine
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
      // Shaded Eyes bulging
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(-7, -13, 5, 0, Math.PI*2);
      ctx.arc(7, -13, 5, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-7, -13, 1.8, 0, Math.PI*2);
      ctx.arc(7, -13, 1.8, 0, Math.PI*2);
      ctx.fill();

      // Specular eye spot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-8, -14, 0.8, 0, Math.PI*2);
      ctx.arc(6, -14, 0.8, 0, Math.PI*2);
      ctx.fill();

      // Shaded egg body
      const frogGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      frogGrad.addColorStop(0, '#4ade80');
      frogGrad.addColorStop(1, '#15803d');
      ctx.fillStyle = frogGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      // Belly
      ctx.fillStyle = '#f0fdf4';
      ctx.beginPath();
      ctx.ellipse(0, 6, 8, 6.5, 0, 0, Math.PI*2);
      ctx.fill();

      // Smile
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -1, 3.2, 0.2, Math.PI - 0.2);
      ctx.stroke();

      // Pink blush
      ctx.fillStyle = 'rgba(244, 63, 94, 0.4)';
      ctx.beginPath();
      ctx.arc(-8, 1, 2, 0, Math.PI*2);
      ctx.arc(8, 1, 2, 0, Math.PI*2);
      ctx.fill();
    }
    // 2. CAM CAT SQUISH (Cream Shaded Cat Mochi)
    else if (typeId === 2) {
      // Ears
      ctx.fillStyle = '#ca8a04';
      ctx.beginPath();
      ctx.moveTo(-10, -8); ctx.lineTo(-14, -20); ctx.lineTo(-3, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, -8); ctx.lineTo(14, -20); ctx.lineTo(3, -12); ctx.closePath();
      ctx.fill(); ctx.stroke();

      // 3D Shaded body
      const catGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      catGrad.addColorStop(0, '#fef3c7');
      catGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = catGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      // Cat Stripes
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-3, -14, 6, 3);
      ctx.fillRect(-8, -13, 3, 2);
      ctx.fillRect(5, -13, 3, 2);

      // Face
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
    }
    // 3. NEEDOH GUMDROP (Pink Volumetric Gumdrop)
    else if (typeId === 3) {
      const gdGrad = ctx.createRadialGradient(0, -6, 2, 0, 1, 15);
      gdGrad.addColorStop(0, '#f472b6'); 
      gdGrad.addColorStop(1, '#be185d');
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

      // Highlight cap
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.ellipse(0, -9, 4, 2, 0, 0, Math.PI*2);
      ctx.fill();

      // Smiley face
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
    }
    // 4. CONNOR COW SQUISH (Cow Volumetric egg)
    else if (typeId === 4) {
      // Ears & Horns
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.ellipse(-14, -6, 5, 3, -0.4, 0, Math.PI*2);
      ctx.ellipse(14, -6, 5, 3, 0.4, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(-7, -13); ctx.quadraticCurveTo(-11, -20, -11, -15); ctx.lineTo(-4, -13);
      ctx.moveTo(7, -13); ctx.quadraticCurveTo(11, -20, 11, -15); ctx.lineTo(4, -13);
      ctx.fill(); ctx.stroke();

      // Volumetric Body
      const cowGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      cowGrad.addColorStop(0, '#ffffff');
      cowGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = cowGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      // Spot patches
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(-7, -9, 4, 0, Math.PI*2);
      ctx.ellipse(8, 2, 5, 7, 0.4, 0, Math.PI*2);
      ctx.fill();

      // 3D snout
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

      // Eyes
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
        
        // Specular dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 2, 1.2, 0, Math.PI*2);
        ctx.fill();
      };
      drawShadedBall(-5, 5, '#ff7043', '#d84315'); // Orange
      drawShadedBall(5, 5, '#a7f3d0', '#047857');  // Green
      drawShadedBall(0, -4, '#f472b6', '#be185d'); // Pink
    }
    // 6. SHAGGY NEEDOH (Yellow Shaded Core with strands)
    else if (typeId === 6) {
      const shGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, 11);
      shGrad.addColorStop(0, '#fef08a');
      shGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = shGrad;
      
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      // Shaggy rubber strands
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.8;
      for (let a = 0; a < Math.PI*2; a += 0.28) {
        const startX = Math.cos(a) * 11;
        const startY = Math.sin(a) * 11;
        const endX = Math.cos(a) * 15.5;
        const endY = Math.sin(a) * 15.5;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Shag tip bead
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(endX, endY, 1.1, 0, Math.PI*2);
        ctx.fill();
      }

      // Face
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(-3, -2, 1.2, Math.PI, 0);
      ctx.arc(3, -2, 1.2, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 1.5, 2.2, 0, Math.PI);
      ctx.stroke();
    }
    // 7. ARCHIE AXOLOTL SQUISH (Volumetric Pink Axolotl)
    else if (typeId === 7) {
      // Frilly red gills
      ctx.fillStyle = '#f43f5e';
      for (let i = 0; i < 3; i++) {
        const offset = i * 6 - 6;
        ctx.beginPath(); ctx.ellipse(-15, offset, 7, 3, -0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(15, offset, 7, 3, 0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      }

      // Shaded egg body
      const axGrad = ctx.createRadialGradient(-3, -3, 2, 0, 1, 15);
      axGrad.addColorStop(0, '#fecdd3');
      axGrad.addColorStop(1, '#db2777');
      ctx.fillStyle = axGrad;

      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 15, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();

      // Face
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
    }
    // 8. GOLDEN NICE CUBE (Holographic Chrome Gold Cube)
    else if (typeId === 8) {
      drawIsometricCube(0, -3, 13, '#fde047', '#eab308', '#ca8a04');
      
      // Shiny reflections
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(-8, -12);
      ctx.lineTo(0, -8);
      ctx.lineTo(-4, -1);
      ctx.closePath();
      ctx.fill();

      // 4-point sparkle cross stars
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
      this.drawSquishyToy(this.ctx, typeId, 14);

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

      this.drawSquishyToy(this.ctx, p.toyType, 10);

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
