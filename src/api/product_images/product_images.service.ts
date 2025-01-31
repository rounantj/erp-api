import { ProductImages } from "@/domain/entities/product_image.entity";
import { UnitOfWorkService } from "@/infra/unit-of-work";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ProductImagesService {
  constructor(private uow: UnitOfWorkService) {}

  async create(productImages: ProductImages) {
    return await this.uow.productImagesRepository.create(productImages);
  }
  async getAll() {
    return await this.uow.productImagesRepository.find();
  }
  async getOne(eanProduct: string) {
    return await this.uow.productImagesRepository.findOne({
      where: {
        ean: eanProduct,
      },
    });
  }
  async delete(eanProduct: string) {
    return await this.uow.productImagesRepository.delete(eanProduct);
  }
}
