import { Module } from "@nestjs/common";
import { SubscriptionController } from "./subscription.controller";
import { WebhookController } from "./webhook.controller";
import { SubscriptionService } from "./subscription.service";
import { AsaasService } from "./asaas.service";
import { FeatureService } from "./feature.service";
import { UnitOfWorkService } from "@/infra/unit-of-work";

@Module({
  controllers: [SubscriptionController, WebhookController],
  providers: [
    SubscriptionService,
    AsaasService,
    FeatureService,
    UnitOfWorkService,
  ],
  exports: [SubscriptionService, AsaasService, FeatureService],
})
export class SubscriptionModule {}

