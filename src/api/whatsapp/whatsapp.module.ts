import { Module } from "@nestjs/common";
import { StorageService } from "@/infra/storage.service";
import { SubscriptionModule } from "../subscription/subscription.module";
import { AiReplyService } from "./ai/ai-reply.service";
import { ConnectionService } from "./connection.service";
import { EvolutionClient } from "./evolution.client";
import { BusinessHoursService } from "./hours/business-hours.service";
import { IncomingMediaService } from "./incoming-media.service";
import { IngestService } from "./ingest.service";
import { JobQueueService } from "./job-queue.service";
import { MessagingService } from "./messaging.service";
import { NotificationsService } from "./orders/notifications.service";
import { WhatsappOrdersService } from "./orders/orders.service";
import { CatalogService } from "./products/catalog.service";
import { ProductImagesService } from "./products/product-images.service";
import { SettingsService } from "./settings.service";
import { WhatsappAccessGuard } from "./whatsapp-access.guard";
import { WhatsappDb } from "./whatsapp-db";
import { WhatsappWebhookController } from "./whatsapp-webhook.controller";
import { WhatsappWorkerService } from "./whatsapp-worker.service";
import { WhatsappController } from "./whatsapp.controller";

@Module({
  imports: [SubscriptionModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [
    WhatsappDb,
    StorageService,
    EvolutionClient,
    JobQueueService,
    SettingsService,
    BusinessHoursService,
    CatalogService,
    MessagingService,
    IngestService,
    IncomingMediaService,
    WhatsappOrdersService,
    NotificationsService,
    ProductImagesService,
    AiReplyService,
    ConnectionService,
    WhatsappAccessGuard,
    WhatsappWorkerService,
  ],
})
export class WhatsappModule {}
