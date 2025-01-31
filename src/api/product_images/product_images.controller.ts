import {
    Body,
    Controller,
    Delete,
    Get,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '@/domain/auth/jwt-auth.guard'
import { ProductImagesService } from './product_images.service'
import { ProductImages } from '@/domain/entities/product_image.entity'

@Controller('product_images')
export class ProductImagesController {
    constructor(private productImagesService: ProductImagesService) {}

    @UseGuards(JwtAuthGuard)
    @Post()
    create(@Request() req: any, @Body() productImages: ProductImages) {
        return this.productImagesService.create(productImages)
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    getAll() {
        return this.productImagesService.getAll()
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    getOne(@Request() req: any, @Query() eanProduct: string) {
        return this.productImagesService.getOne(eanProduct)
    }

    @UseGuards(JwtAuthGuard)
    @Delete()
    delete(@Request() req: any, @Query() eanProduct: string) {
        return this.productImagesService.delete(eanProduct)
    }
}
