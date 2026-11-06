import * as THREE from 'three';

const GEAR_RATIOS = [3.6, 2.2, 1.5, 1.1, 0.85]; // max speeds per gear derived below
const GEAR_MAX = [38, 65, 92, 122, 155]; // km/h top of each gear
const MAX_SPEED = 150 / 3.6;
const REV_MAX = 30 / 3.6;
const STEP = 1 / 120;

export class CarController {
  constructor(car, world) {
    this.car = car;
    this.world = world;
    this.dim = car.dimensions || { length: 3.9, width: 1.6, wheelRadius: 0.3, wheelBase: 2.36 };
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3(); // world xz velocity (y unused)
    this.quat = new THREE.Quaternion();
    this._heading = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this._gear = 'N';
    this._rpm = 800;
    this._onRoad = true;
    this._inWater = false;
    this.wheelSpin = 0;
    this.braking = false;
    this._pitch = 0;
    this._roll = 0;
    this._tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
    this.reset();
  }

  reset() {
    const s = this.world.spawn;
    this._heading = s.heading || 0;
    this.pos.set(s.x, this.world.getHeightAt(s.x, s.z), s.z);
    this.vel.set(0, 0, 0);
    this.yawRate = 0;
    this.steerAngle = 0;
    this._pitch = 0;
    this._roll = 0;
    this._gear = 'N';
    this._rpm = 800;
    this._applyTransform(1);
  }

  get speed() { return this.vel.length() * Math.sign(this._fwdSpeed()) ; }
  get speedKmh() { return Math.abs(this.speed) * 3.6; }
  get position() { return this.pos; }
  get heading() { return this._heading; }
  get onRoad() { return this._onRoad; }
  get inWater() { return this._inWater; }
  get gear() { return this._gear; }
  get rpm() { return this._rpm; }

  _fwdSpeed() {
    const h = this._heading;
    return this.vel.x * Math.sin(h) + this.vel.z * Math.cos(h);
  }

  update(dt, input = {}) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    this._acc = (this._acc || 0) + dt;
    while (this._acc >= STEP) {
      this._acc -= STEP;
      this._step(STEP, input);
    }
    this._applyTransform(Math.min(1, dt * 12));
    this.car.setBrakeLights && this.car.setBrakeLights(this.braking);
  }

  _step(dt, input) {
    const w = this.world;
    const th = THREE.MathUtils.clamp(input.throttle || 0, 0, 1);
    const br = THREE.MathUtils.clamp(input.brake || 0, 0, 1);
    const steerIn = THREE.MathUtils.clamp(input.steer || 0, -1, 1);
    const hb = !!input.handbrake;

    const h = this._heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h); // right (+X at h=0)
    let vf = this.vel.x * fx + this.vel.z * fz;
    let vl = this.vel.x * rx + this.vel.z * rz;

    const onRoad = w.isOnRoad(this.pos.x, this.pos.z);
    const inWater = w.isWater(this.pos.x, this.pos.z);
    this._onRoad = onRoad;
    this._inWater = inWater;
    const surf = inWater ? 0.25 : onRoad ? 1 : 0.6;

    // Engine / brake
    let force = 0; // N per kg (acceleration)
    this.braking = false;
    const kmh = Math.abs(vf) * 3.6;
    if (th > 0) {
      if (vf < -0.5) { force = -Math.sign(vf) * 12 * th; this.braking = true; }
      else {
        const topFrac = Math.max(0, 1 - Math.pow(Math.abs(vf) / MAX_SPEED, 3));
        const gi = this._gearIndex(kmh);
        const gearBoost = 1 + (4 - gi) * 0.18;
        force = 4.2 * gearBoost * th * topFrac * (onRoad ? 1 : 0.8);
        if (kmh < 5) force = 5 * th;
      }
    }
    if (br > 0) {
      if (vf > 0.5) { force -= 11 * br; this.braking = true; }
      else if (vf > -REV_MAX) {
        const f = 3.0 * br * Math.max(0, 1 - Math.abs(vf) / REV_MAX);
        force -= f;
        if (vf > -0.5 && th === 0) this.braking = vf > 0.1;
      }
      else force += 3;
    }
    if (th === 0 && br === 0 && Math.abs(vf) < 0.3) vf *= 0.9;

    // Resistances
    const drag = 0.00042 * vf * Math.abs(vf);
    const roll = (onRoad ? 0.18 : 0.9) * Math.sign(vf) * Math.min(1, Math.abs(vf));
    let resist = drag + roll * 1;
    if (inWater) resist += 3.5 * vf + 0.5 * Math.sign(vf);
    // Slope gravity
    const n = w.getNormalAt(this.pos.x, this.pos.z);
    const slope = 9.81 * (n.x * fx + n.z * fz) / Math.max(0.3, n.y);
    let acc = force - resist + slope;
    if (hb) acc -= Math.sign(vf) * Math.min(4, Math.abs(vf) / dt * 0.5);
    const vf0 = vf;
    vf += acc * dt;
    if (th === 0 && br === 0 && Math.sign(vf) !== Math.sign(vf0) && Math.abs(vf0) < 1) vf = 0;
    if (br > 0 && th === 0 && vf0 > 0 && vf < 0 && vf0 < 1) vf = 0;
    vf = Math.max(vf, -REV_MAX);
    if (vf > MAX_SPEED) vf = MAX_SPEED;

    // Steering
    const speedAbs = Math.abs(vf);
    const maxDeg = THREE.MathUtils.lerp(35, 8, THREE.MathUtils.clamp(speedAbs / 38, 0, 1));
    const target = -steerIn * THREE.MathUtils.degToRad(maxDeg);
    this.steerAngle += (target - this.steerAngle) * Math.min(1, dt * 8);

    // Lateral grip
    let grip = 11 * surf;
    if (hb) grip *= 0.18;
    const slipFrac = Math.min(1, Math.abs(vl) / 6);
    grip *= 1 - 0.35 * slipFrac;
    const dvl = Math.min(Math.abs(vl), grip * dt);
    vl -= Math.sign(vl) * dvl;

    // Yaw (bicycle model)
    const L = this.dim.wheelBase;
    let targetYaw = (vf / L) * Math.tan(this.steerAngle);
    if (hb && speedAbs > 4) targetYaw *= 1.5;
    const maxLat = 8.5 * surf * (hb ? 1.5 : 1);
    const yawLimit = Math.min(2.2, maxLat / Math.max(speedAbs, 1));
    targetYaw = THREE.MathUtils.clamp(targetYaw, -yawLimit, yawLimit);
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, dt * (hb ? 4 : 10));
    this._heading += this.yawRate * dt;
    // Sign: steerAngle positive = turn left (heading increases)

    // Rebuild velocity in new heading frame (velocity vector keeps direction partially)
    const h2 = this._heading;
    const fx2 = Math.sin(h2), fz2 = Math.cos(h2);
    const rx2 = Math.cos(h2), rz2 = -Math.sin(h2);
    // convert lateral component: keep world velocity so slip arises
    const wvx = fx * vf + rx * vl, wvz = fz * vf + rz * vl;
    // world velocity is kept; the heading change creates slip which grip removes next step
    // (blend a little of forward alignment to keep speed in corners)
    const nvf = wvx * fx2 + wvz * fz2;
    const nvl = wvx * rx2 + wvz * rz2;
    const align = hb ? 0 : 0.5;
    const fwdKeep = vf * align + nvf * (1 - align);
    this.vel.set(fx2 * fwdKeep + rx2 * nvl, 0, fz2 * fwdKeep + rz2 * nvl);

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // Clamp to world
    const maxR = (w.radius || 500) * 1.3;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > maxR) {
      const k = maxR / d;
      this.pos.x *= k; this.pos.z *= k;
      this.vel.multiplyScalar(0.9);
    }

    this.wheelSpin += (keepSign(vf) * Math.abs(vf) * dt) / this.dim.wheelRadius;

    // Gear / rpm
    this._updateGear(vf, th);
  }

  _gearIndex(kmh) {
    for (let i = 0; i < 5; i++) if (kmh < GEAR_MAX[i]) return i;
    return 4;
  }

  _updateGear(vf, th) {
    const kmh = Math.abs(vf) * 3.6;
    let target;
    if (vf < -0.5) { this._gear = 'R'; target = 800 + (kmh / REV_MAX / 3.6) * 3000; }
    else if (kmh < 1 && th === 0) { this._gear = 'N'; target = 800; }
    else {
      const gi = this._gearIndex(kmh);
      this._gear = String(gi + 1);
      const lo = gi === 0 ? 0 : GEAR_MAX[gi - 1] * 0.7;
      const hi = GEAR_MAX[gi];
      const f = THREE.MathUtils.clamp((kmh - lo) / (hi - lo), 0, 1);
      target = 1800 + f * 4700;
      if (gi === 0) target = 800 + f * 5700;
    }
    if (th > 0 && kmh < 3) target = Math.max(target, 800 + th * 3500);
    target = THREE.MathUtils.clamp(target, 800, 6500);
    this._rpm += (target - this._rpm) * 0.08;
  }

  _applyTransform(smooth) {
    const w = this.world;
    const h = this._heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const hl = this.dim.wheelBase / 2, hw = this.dim.width / 2;
    const hAt = (a, b) => w.getHeightAt(this.pos.x + fx * a + rx * b, this.pos.z + fz * a + rz * b);
    const fl = hAt(hl, -hw), fr = hAt(hl, hw), rl = hAt(-hl, -hw), rr = hAt(-hl, hw);
    const front = (fl + fr) / 2, rear = (rl + rr) / 2;
    const right = (fr + rr) / 2, left = (fl + rl) / 2;
    const pitchT = Math.atan2(rear - front, this.dim.wheelBase); // nose up negative x-rot
    const rollT = Math.atan2(right - left, this.dim.width);
    this._pitch += (pitchT - this._pitch) * smooth;
    this._roll += (rollT - this._roll) * smooth;
    const avg = (fl + fr + rl + rr) / 4;
    this.pos.y = avg;
    const g = this.car.group;
    g.position.copy(this.pos);
    this._tmpE.set(this._pitch, h, this._roll, 'YXZ');
    this.quat.setFromEuler(this._tmpE);
    g.quaternion.copy(this.quat);
    const pivots = this.car.steerPivots || [];
    for (const p of pivots) p.rotation.y = this.steerAngle;
    const wheels = this.car.wheels || [];
    for (const wh of wheels) wh.rotation.x = this.wheelSpin;
  }
}

function keepSign(v) { return v < 0 ? -1 : 1; }
