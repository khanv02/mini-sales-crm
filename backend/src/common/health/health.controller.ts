import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { HealthReport } from '@pulse/shared';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOkResponse({ description: 'Process alive' })
  live(): { status: 'ok' } {
    return this.health.live();
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Database and Redis are ready' })
  @ApiServiceUnavailableResponse({ description: 'A dependency is unavailable' })
  ready(): Promise<HealthReport> {
    return this.health.ready();
  }
}
