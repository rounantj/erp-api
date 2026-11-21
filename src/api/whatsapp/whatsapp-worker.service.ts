import { Injectable, OnModuleInit } from "@nestjs/common";
import { AiReplyService } from "./ai/ai-reply.service";
import { IncomingMediaService } from "./incoming-media.service";
import { JobQueueService } from "./job-queue.service";
import { NotificationsService } from "./orders/notifications.service";
import { ProductImagesService } from "./products/product-images.service";

@Injectable()
export class WhatsappWorkerService implements OnModuleInit {
  constructor(
    private readonly jobs: JobQueueService,
    private readonly media: IncomingMediaService,
    private readonly ai: AiReplyService,
    private readonly notifications: NotificationsService,
    private readonly productImages: ProductImagesService
  ) {}

  onModuleInit() {
    this.jobs.register("media", (data, ctx) => this.media.processMedia(data, ctx));
    this.jobs.register("classify-from-me", (data) => this.media.classifyFromMe(data));
    this.jobs.register("ai-reply", (data) => this.ai.reply(data.conversationId));
    this.jobs.register("notification", (data, ctx) => this.notifications.process(data, ctx.isLastAttempt));
    this.jobs.register("product-image", (data) => this.productImages.processLookup(data));
    this.jobs.every(60_000, () => this.notifications.sweepPending());
  }
}
