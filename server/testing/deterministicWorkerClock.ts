export class DeterministicWorkerClock {
  private current: Date;
  constructor(private readonly initial: string) { this.current = new Date(initial); }
  now = (): Date => new Date(this.current);
  iso = (): string => this.current.toISOString();
  advanceMinutes(minutes: number): string {
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60) throw new RangeError("minutes must be an integer between 1 and 1440");
    this.current = new Date(this.current.getTime() + minutes * 60_000);
    return this.iso();
  }
  reset(): void { this.current = new Date(this.initial); }
}
