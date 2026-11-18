import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller';
import { PipelineRepository } from './pipeline.repository';
import { PipelineService } from './pipeline.service';

@Module({
  controllers: [PipelineController],
  providers: [PipelineService, PipelineRepository],
})
export class PipelineModule {}
