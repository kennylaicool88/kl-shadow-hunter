// Keyboard / mouse state with pointer lock. Gameplay code polls this each frame.

const BLOCKED_KEYS = new Set(['Tab', 'Space', 'ControlLeft', 'ControlRight', 'KeyB']);

export class InputManager {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed since last endFrame()
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.onLockChange = null;
    this.onLockError = null;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (this.locked && (BLOCKED_KEYS.has(e.code) || e.ctrlKey)) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.clear());

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseButtons.add(e.button);
      this.mousePressed.add(e.button);
    });
    document.addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Ignore absurd spikes some browsers emit right after locking.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.clear();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockError) this.onLockError();
    });
  }

  requestLock() {
    try {
      const p = this.element.requestPointerLock({ unadjustedMovement: false });
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (this.onLockError) this.onLockError();
        });
      }
    } catch {
      if (this.onLockError) this.onLockError();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.enabled && this.keys.has(code);
  }

  wasPressed(code) {
    return this.enabled && this.pressed.has(code);
  }

  mouseDown(button) {
    return this.enabled && this.mouseButtons.has(button);
  }

  mouseWasPressed(button) {
    return this.enabled && this.mousePressed.has(button);
  }

  consumeMouse() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.mouseButtons.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
