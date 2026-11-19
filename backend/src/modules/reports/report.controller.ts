import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  reportSummaryQuerySchema,
  type ReportSummary,
  type ReportSummaryQuery,
} from '@pulse/shared';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ReportService } from './report.service';

/** FR-08: every role reads the dashboard; Sales are scoped to their own figures by the service. */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get('summary')
  summary(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportSummaryQuerySchema)) query: ReportSummaryQuery,
  ): Promise<ReportSummary> {
    return this.reports.summary(actor, query);
  }
}
