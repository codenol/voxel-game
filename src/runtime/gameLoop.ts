export interface GameLoopOptions {
  fixedStepSeconds?: number;
  maxFrameSeconds?: number;
  maxStepsPerFrame?: number;
  update: (deltaSeconds: number) => void;
  render: (alpha: number) => void;
}

export class GameLoop {
  private readonly fixedStepSeconds: number;
  private readonly maxFrameSeconds: number;
  private readonly maxStepsPerFrame: number;
  private readonly update: (deltaSeconds: number) => void;
  private readonly render: (alpha: number) => void;
  private accumulator = 0;
  private previousTime = 0;
  private rafId = 0;
  private running = false;

  constructor(options: GameLoopOptions) {
    this.fixedStepSeconds = options.fixedStepSeconds ?? 1 / 60;
    this.maxFrameSeconds = options.maxFrameSeconds ?? 0.25;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 5;
    this.update = options.update;
    this.render = options.render;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.previousTime = performance.now();
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    window.cancelAnimationFrame(this.rafId);
  }

  private tick = (time: number) => {
    if (!this.running) {
      return;
    }

    const frameSeconds = Math.min(
      (time - this.previousTime) / 1000,
      this.maxFrameSeconds
    );
    this.previousTime = time;
    this.accumulator += frameSeconds;

    let steps = 0;
    while (
      this.accumulator >= this.fixedStepSeconds &&
      steps < this.maxStepsPerFrame
    ) {
      this.update(this.fixedStepSeconds);
      this.accumulator -= this.fixedStepSeconds;
      steps += 1;
    }

    if (steps === this.maxStepsPerFrame) {
      this.accumulator = 0;
    }

    this.render(this.accumulator / this.fixedStepSeconds);
    this.rafId = window.requestAnimationFrame(this.tick);
  };
}
