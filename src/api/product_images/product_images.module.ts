import { Module } from '@nestjs/common'
import { ProductImagesController } from './product_images.controller'
import { UnitOfWorkService } from '@/infra/unit-of-work'
import { ProductImagesService } from './product_images.service'

@Module({
    providers: [ProductImagesService, UnitOfWorkService],
    controllers: [ProductImagesController],
})
export class ProductImagesModule {}
