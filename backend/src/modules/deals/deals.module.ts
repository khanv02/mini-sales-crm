import { Module } from '@nestjs/common';
import { DealsController } from './deal.controller';
import { DealsRepository } from './deal.repository';
import { DealsService } from './deal.service';

@Module({
  controllers: [DealsController],
  providers: [DealsService, DealsRepository],
})
export class DealsModule {}
