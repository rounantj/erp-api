import { DataSourceOptions, DataSource, ColumnType } from "typeorm";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import * as dotenv from "dotenv";
import { replaceAll } from "@/helpers/string.service";

const DB_APP_NAME = "erp_api";
dotenv.config();

const IN_CONTAINER = process.env.IN_CONTAINER == "1";

const dbconfig = (executedByTypeOrmCli: boolean) => {
  let entitiesPath = "./dist/domain/entities/**/*.entity.js";
  let migrationsPath = `./dist/migrations/**/*.js`;

  if (IN_CONTAINER) {
    entitiesPath = "./domain/entities/**/*.entity.js";
    migrationsPath = `./migrations/**/*.js`;
  }

  if (executedByTypeOrmCli) {
    entitiesPath = "src/domain/entities/**/*.entity.ts";
    migrationsPath = `src/migrations/**/*.ts`;
  }

  const dataSource = {
    name: "default",
    type: "postgres",
    entities: [entitiesPath],
    migrations: [migrationsPath],
    timezone: "America/Sao_Paulo", // Define o timezone correto
    synchronize: false,
    poolSize: 50,
    keepConnectionAlive: false,
    migrationsRun: true,
    logging: false,
    applicationName: DB_APP_NAME,
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT ?? 25060,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: {
      ca: Buffer.from(replaceAll(process.env.SSL_CA, "\\n", "\n"), "utf8"),
      rejectUnauthorized: false,
    },
    extra: {
      options: "-c timezone=America/Sao_Paulo",
    },
    types: ["vector"],
  } as DataSourceOptions;
  return dataSource;
};

class MyDataSource extends DataSource {
  constructor() {
    super(dbconfig(true));
    this.driver.supportedDataTypes.push("jsonb" as ColumnType);
    this.driver.withLengthColumnTypes.push("jsonb" as ColumnType);
  }
}

export const myCustomDataSource = new MyDataSource();

export const typeormConfig = () => {
  return dbconfig(false) as TypeOrmModuleOptions;
};
