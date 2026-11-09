import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker, type JobsOptions, type Processor, type WorkerOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { ENV_TOKEN } from '../config/env.module';
import type { Env } from '../config/env';
import { LOGGER_TOKEN, type Logger } from '../logging/logging.module';
import { DEFAULT_JOB_OPTIONS, redisConnectionFromUrl, SYSTEM_QUEUE } from './queue.config';

@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly connection: RedisOptions;
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];

  constructor(
    @Inject(ENV_TOKEN) env: Env,
    @Inject(LOGGER_TOKEN) private readonly logger: Logger,
  ) {
    this.connection = redisConnectionFromUrl(env.REDIS_URL);
  }

  getDefaultJobOptions(): JobsOptions {
    return { ...DEFAULT_JOB_OPTIONS };
  }

  getQueue(name: string = SYSTEM_QUEUE): Queue {
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    this.queues.set(name, queue);
    return queue;
  }

  addJob(name: string, jobName: string, data: unknown, options?: JobsOptions): Promise<unknown> {
    return this.getQueue(name).add(jobName, data, options);
  }

  createWorker<DataType = unknown, ResultType = unknown>(
    name: string,
    processor: Processor<DataType, ResultType, string>,
    options: Partial<WorkerOptions> = {},
  ): Worker<DataType, ResultType, string> {
    const worker = new Worker(name, processor, {
      connection: this.connection,
      concurrency: 1,
      ...options,
    });
    worker.on('failed', (job, error) => {
      this.logger.warn(
        { queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: error.message },
        'queue job failed',
      );
    });
    this.workers.push(worker);
    return worker;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
    await Promise.allSettled([...this.queues.values()].map((queue) => queue.close()));
    this.workers.length = 0;
    this.queues.clear();
  }
}
