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

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      skipMissingProperties: true,
      exceptionFactory: (errors) => {
        throw new BadRequestException(errors);
      },
    })
  );

  if (process.env.ENABLE_HTTP_TRACING == "true") {
    app.use(json());
  }

  // Allow CORS from any origin
  app.enableCors({
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: "*",
  });

  await app.listen(process.env.SERVER_PORT || 3009);
}
bootstrap();
