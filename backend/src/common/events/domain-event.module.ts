import { Global, Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';

/** Global so feature modules can publish domain events without importing it everywhere. */
@Global()
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class DomainEventModule {}
