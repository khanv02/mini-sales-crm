import { Logger } from '@nestjs/common';
import { DomainEventBus, type DomainEvent } from '../../src/common/events/domain-event-bus';

const payload = {
  dealId: 'deal-1',
  fromStageId: 'stage-1',
  toStageId: 'stage-2',
  position: '1.5000000000',
  version: 2,
  ownerId: 'user-1',
  actorId: 'user-1',
};

describe('DomainEventBus', () => {
  it('publishes an envelope with id, timestamp, org, type and payload', async () => {
    const bus = new DomainEventBus();

    const event = await bus.publish('deal.moved', 'org-1', payload);

    expect(event).toMatchObject({
      orgId: 'org-1',
      type: 'deal.moved',
      payload,
    });
    expect(event.eventId).toEqual(expect.any(String));
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
  });

  it('delivers events to subscribers until they unsubscribe', async () => {
    const bus = new DomainEventBus();
    const received: DomainEvent[] = [];
    const unsubscribe = bus.subscribe('deal.moved', (event) => {
      received.push(event);
    });

    await bus.publish('deal.moved', 'org-1', payload);
    unsubscribe();
    await bus.publish('deal.moved', 'org-1', payload);

    expect(received).toHaveLength(1);
    expect(received[0]?.payload).toEqual(payload);
  });

  it('only delivers to the subscribed event type', async () => {
    const bus = new DomainEventBus();
    const moved = jest.fn();
    const assigned = jest.fn();
    bus.subscribe('deal.moved', moved);
    bus.subscribe('deal.assigned', assigned);

    await bus.publish('deal.assigned', 'org-1', {
      dealId: 'deal-1',
      fromOwnerId: 'user-1',
      toOwnerId: 'user-2',
      version: 2,
      actorId: 'user-3',
    });

    expect(assigned).toHaveBeenCalledTimes(1);
    expect(moved).not.toHaveBeenCalled();
  });

  it('swallows and logs handler failures so the caller never sees them', async () => {
    const bus = new DomainEventBus();
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const healthy = jest.fn();
    bus.subscribe('deal.moved', () => {
      throw new Error('listener boom');
    });
    bus.subscribe('deal.moved', healthy);

    await expect(bus.publish('deal.moved', 'org-1', payload)).resolves.toMatchObject({
      type: 'deal.moved',
    });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('deal.moved'));
    errorSpy.mockRestore();
  });

  it('publishes without subscribers', async () => {
    const bus = new DomainEventBus();

    await expect(bus.publish('deal.moved', 'org-1', payload)).resolves.toMatchObject({
      eventId: expect.any(String),
    });
  });
});
