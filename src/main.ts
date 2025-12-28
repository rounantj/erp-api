import * as dotenv from "dotenv";
import { NestFactory } from "@nestjs/core";
import {
  BadRequestException,
  NestApplicationOptions,
  ValidationPipe,
} from "@nestjs/common";
import { json } from "body-parser";
process.env.TZ = "UTC";
process.env.TZH = "+00:00";

async function bootstrap() {
  dotenv.config();

  const { AppModule } = await import("./app.module");

  const settings: NestApplicationOptions = {};
  if (process.env.ENABLE_JSON_LOG == "true") {
    settings.logger = console;
  }

  const app = await NestFactory.create(AppModule, { cors: true });

  // Aumenta o limite do body-parser para aceitar uploads de imagens em base64
  app.use(json({ limit: "50mb" }));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      skipMissingProperties: true,
      exceptionFactory: (errors) => {
        throw new BadRequestException(errors);
      },
    })
  );

  // Allow CORS from any origin
  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: "*",
  });

  await app.listen(process.env.PORT || 3009);
}
bootstrap();
