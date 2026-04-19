import { SchedulerService } from '../services/scheduler.service';

export class SchedulerCommand {
  private schedulerService: SchedulerService;

  constructor() {
    this.schedulerService = new SchedulerService();
  }

  async run(): Promise<void> {
    await this.schedulerService.runScheduledSyncs();
  }
}

