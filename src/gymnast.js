import Matter from 'matter-js';
import { gameAudio } from './audio';

const { Body, Bodies, Constraint, Composite } = Matter;

export class Gymnast {
  constructor(world, x, y) {
    this.world = world;
    this.joints = {}; 
    this.parts = {};  
    this.grabConstraints = { left: null, right: null }; 
    this.grounded = false;
    this.crashImpact = 0;
    this.headHistory = [];
    
    // Customize attributes (updated by game.js)
    this.customization = {
      skinColor: '#ffdbac',
      hairColor: '#e0a96d',
      hairStyle: 'pony', 
      outfitColor: '#db2777', 
      hat: 'none', 
      hasCape: false
    };

    this.width = 22;
    this.height = 54;

    // Movement & Animation States
    this.state = 'idle'; // idle, run, jump, fall, tuck, split, layout, wipeout, swing, cartwheel, handstand, roll
    this.visualAngle = 0;
    this.targetVisualAngle = 0;
    this.runFrame = 0;
    
    const group = Body.nextGroup(true);
    this.createPhysicsBody(x, y, group);
  }

  createPhysicsBody(x, y, group) {
    // Single solid body for player collision
    this.body = Bodies.rectangle(x, y, this.width, this.height, {
      inertia: Infinity, // Lock rotation completely for stable platformer control
      friction: 0.05,    // Low friction to slide cleanly along mats
      frictionAir: 0.01,
      restitution: 0,    // Controlled landing bounce
      collisionFilter: { group: group },
      label: 'gymnast-body'
    });

    // Map parts for compatibility with existing game loops
    this.parts = {
      chest: this.body,
      pelvis: this.body,
      head: this.body, 
      lLowerLeg: this.body,
      rLowerLeg: this.body
    };

    // Initialize flowing cape particles
    this.createCape(x, y, group);

    Composite.add(this.world, this.body);
  }

  createCape(x, y, group) {
    this.capeSegments = [];
    this.capeConstraints = [];

    const segmentsCount = 5;
    const segmentWidth = 14;
    const segmentHeight = 8;

    let lastSegment = this.body;

    for (let i = 0; i < segmentsCount; i++) {
      const segment = Bodies.rectangle(
        x - 10, 
        y + i * segmentHeight, 
        segmentWidth - i * 1.5, 
        segmentHeight, 
        {
          collisionFilter: { group: group },
          density: 0.0001, // extremely light
          frictionAir: 0.08,
          label: 'gymnast-cape'
        }
      );
      this.capeSegments.push(segment);
      Composite.add(this.world, segment);

      // Connect segment
      const c = Constraint.create({
        bodyA: lastSegment,
        pointA: i === 0 ? { x: -8, y: -10 } : { x: 0, y: segmentHeight/2 },
        bodyB: segment,
        pointB: { x: 0, y: -segmentHeight/2 },
        stiffness: 0.5,
        length: 2,
        label: `cape-constraint-${i}`
      });
      this.capeConstraints.push(c);
      Composite.add(this.world, c);
      lastSegment = segment;
    }
  }

  // Returns hands position relative to body center
  getHandPositions() {
    const pos = this.body.position;
    const angle = this.visualAngle;

    // Hands are drawn raised or extended depending on state
    // For bar grabbing calculation: reach state extends hands above the head
    let leftHandOffset = { x: -12, y: -24 };
    let rightHandOffset = { x: 12, y: -24 };

    if (this.state === 'reach' || this.state === 'swing') {
      leftHandOffset = { x: -6, y: -34 };
      rightHandOffset = { x: 6, y: -34 };
    } else if (this.state === 'split') {
      leftHandOffset = { x: -24, y: 0 };
      rightHandOffset = { x: 24, y: 0 };
    }

    // Apply rotation transformation to local hand offsets
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const rotateOffset = (offset) => ({
      x: pos.x + (offset.x * cos - offset.y * sin),
      y: pos.y + (offset.x * sin + offset.y * cos)
    });

    return {
      left: rotateOffset(leftHandOffset),
      right: rotateOffset(rightHandOffset)
    };
  }

  setPose(poseName) {
    if (this.state === 'wipeout') return; // Cannot change pose if wiped out
    this.state = poseName;
  }

  updateMuscles() {
    // Record history for ponytail sways
    this.headHistory.push({
      x: this.body.position.x,
      y: this.body.position.y,
      angle: this.visualAngle
    });
    if (this.headHistory.length > 20) {
      this.headHistory.shift();
    }

    // In our new direct platformer, updateMuscles handles rotation animation
    if (this.state === 'wipeout') {
      this.visualAngle = Math.PI / 2; // Flat on back
      return;
    }

    // Tick run animation frames
    if (this.state === 'run' && this.grounded) {
      this.runFrame += 0.22;
    }

    // Snap upright on ground only when in standard running/idle states
    if (this.grounded && (this.state === 'run' || this.state === 'idle')) {
      let target = Math.round(this.visualAngle / (Math.PI * 2)) * (Math.PI * 2);
      this.visualAngle += (target - this.visualAngle) * 0.2;
    }
  }

  grab(side, targetBody, point) {
    if (this.grabConstraints[side]) return; // Already grabbing on this side

    const handPos = this.getHandPositions()[side];
    
    // We attach the main body directly to the bar
    const localHandOffset = {
      x: handPos.x - this.body.position.x,
      y: handPos.y - this.body.position.y
    };

    const localTargetOffset = targetBody.isStatic 
      ? { x: point.x - targetBody.position.x, y: point.y - targetBody.position.y }
      : { x: 0, y: 0 };

    this.grabConstraints[side] = Constraint.create({
      bodyA: this.body,
      pointA: localHandOffset,
      bodyB: targetBody,
      pointB: localTargetOffset,
      stiffness: 0.85,
      length: 5,
      label: `grab-${side}`
    });

    Composite.add(this.world, this.grabConstraints[side]);
    this.state = 'swing';
    gameAudio.playGrab();
  }

  release(side) {
    if (side === 'both') {
      this.release('left');
      this.release('right');
      return;
    }

    if (this.grabConstraints[side]) {
      Composite.remove(this.world, this.grabConstraints[side]);
      this.grabConstraints[side] = null;
    }

    if (!this.grabConstraints.left && !this.grabConstraints.right && this.state === 'swing') {
      this.state = 'jump';
    }
  }

  isGrabbing() {
    return !!(this.grabConstraints.left || this.grabConstraints.right);
  }

  resetPosition(x, y) {
    this.release('both');
    this.state = 'idle';
    this.visualAngle = 0;
    this.runFrame = 0;
    this.grounded = false;
    this.crashImpact = 0;

    Body.setVelocity(this.body, { x: 0, y: 0 });
    Body.setAngularVelocity(this.body, 0);
    Body.setAngle(this.body, 0);
    Body.setPosition(this.body, { x, y });

    // Reset cape segments
    this.capeSegments.forEach((seg, idx) => {
      Body.setVelocity(seg, { x: 0, y: 0 });
      Body.setAngularVelocity(seg, 0);
      Body.setAngle(seg, 0);
      Body.setPosition(seg, { x: x - 10, y: y + idx * 8 });
    });
  }

  applyJumpPush() {
    if (this.grounded && this.state !== 'wipeout') {
      // Forceful upward impulse
      Body.setVelocity(this.body, { x: this.body.velocity.x, y: -13.5 });
      this.state = 'jump';
      this.grounded = false;
      gameAudio.playBoing();
      return true;
    }
    return false;
  }
}
