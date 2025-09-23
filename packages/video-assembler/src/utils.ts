// Simple semaphore for concurrency control
export class Semaphore {
  private tasks: (() => void)[] = [];
  private count: number;
  private max: number;

  constructor(max: number) {
    this.max = max;
    this.count = 0;
  }

  async acquire(): Promise<() => void> {
    if (this.count < this.max) {
      this.count++;
      return () => {
        this.count--;
        this.next();
      };
    }
    return new Promise(resolve => {
      this.tasks.push(() => {
        this.count++;
        resolve(() => {
          this.count--;
          this.next();
        });
      });
    });
  }

  private next() {
    if (this.tasks.length > 0 && this.count < this.max) {
      const task = this.tasks.shift();
      if (task) task();
    }
  }
}
