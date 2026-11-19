import { Module } from '@nestjs/common';
import { ActivitiesController } from './activity.controller';
import { ActivitiesRepository } from './activity.repository';
import { ActivitiesService } from './activity.service';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivitiesRepository],
})
export class ActivitiesModule {}
