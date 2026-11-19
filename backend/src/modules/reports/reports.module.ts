import { Module } from '@nestjs/common';
import { NoopReportCache, REPORT_CACHE } from '../../common/cache/report-cache';
import { ReportController } from './report.controller';
import { ReportRepository } from './report.repository';
import { ReportService } from './report.service';

/** FR-08 dashboard summary; 007 swaps the no-op cache for the Redis provider. */
@Module({
  controllers: [ReportController],
  providers: [
    ReportService,
    ReportRepository,
    { provide: REPORT_CACHE, useClass: NoopReportCache },
  ],
})
export class ReportsModule {}
