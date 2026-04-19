import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      message: 'Corpus API',
      version: 'v1',
      endpoints: {
        activities: '/v1/activities',
        metrics: '/v1/metrics',
        summary: '/v1/summary',
        ingest: '/v1/ingest',
        fitnesssyncer: '/v1/fitnesssyncer',
        ask: '/v1/ask',
      },
    };
  }
}
