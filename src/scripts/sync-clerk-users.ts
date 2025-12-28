/**
 * Script de migração para sincronizar usuários existentes com Clerk
 * 
 * Este script busca todos os usuários do banco de dados e os sincroniza com Clerk.
 * IMPORTANTE: Este script deve ser executado manualmente após configurar o Clerk.
 * 
 * Para executar:
 * tsx src/scripts/sync-clerk-users.ts
 */

import "reflect-metadata";
import * as dotenv from "dotenv";
import { createClerkClient } from "@clerk/backend";
import { DataSource } from "typeorm";
import { User } from "../domain/entities/user.entity";
import { Company } from "../domain/entities/company.entity";

dotenv.config();

// Helper para substituir strings
function replaceAll(str: string, search: string, replace: string): string {
  return str.split(search).join(replace);
}

async function syncClerkUsers() {
  // Criar conexão com o banco de dados usando configuração simples
  const dataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [User, Company],
    synchronize: false,
    logging: false,
    ssl: process.env.SSL_CA
      ? {
          ca: Buffer.from(replaceAll(process.env.SSL_CA, "\\n", "\n"), "utf8"),
          rejectUnauthorized: false,
        }
      : false,
  });

  try {
    await dataSource.initialize();
    console.log("✅ Conexão com banco de dados estabelecida");

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY não configurada no ambiente");
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });

    // Buscar todos os usuários ativos
    const userRepository = dataSource.getRepository(User);
    const users = await userRepository.find({
      where: { is_active: true },
    });

    console.log(`📋 Encontrados ${users.length} usuários para sincronizar`);

    let syncedCount = 0;
    let createdCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        if (!user.email) {
          console.log(`⚠️  Usuário ${user.id} não tem email, pulando...`);
          continue;
        }

        // Verificar se usuário já existe no Clerk
        const clerkUsers = await clerk.users.getUserList({
          emailAddress: [user.email],
        });

        let clerkUser = clerkUsers.data.find(
          (u: any) => u.emailAddresses?.[0]?.emailAddress === user.email
        );

        if (!clerkUser) {
          // Criar usuário no Clerk
          console.log(`➕ Criando usuário no Clerk: ${user.email}`);
          try {
            clerkUser = await clerk.users.createUser({
              emailAddress: [user.email],
              firstName: user.name?.split(" ")[0] || user.username,
              lastName: user.name?.split(" ").slice(1).join(" ") || "",
              skipPasswordChecks: true,
              skipPasswordRequirement: true,
            });
            createdCount++;
            console.log(`✅ Usuário criado no Clerk: ${user.email}`);
          } catch (error: any) {
            if (error.errors?.[0]?.code === "form_identifier_exists") {
              // Usuário já existe, buscar novamente
              const retryList = await clerk.users.getUserList({
                emailAddress: [user.email],
              });
              clerkUser = retryList.data.find(
                (u: any) => u.emailAddresses?.[0]?.emailAddress === user.email
              );
              if (!clerkUser) {
                throw new Error("Usuário não encontrado após criação");
              }
            } else {
              throw error;
            }
          }
        } else {
          console.log(`✓ Usuário já existe no Clerk: ${user.email}`);
        }

        // Aqui você pode adicionar a lógica para vincular clerkId ao usuário no banco
        // quando o campo clerkId for adicionado à entidade User
        // Exemplo:
        // user.clerkId = clerkUser.id;
        // await userRepository.save(user);

        syncedCount++;
      } catch (error: any) {
        console.error(`❌ Erro ao sincronizar usuário ${user.email}:`, error.message);
        errorCount++;
      }
    }

    console.log("\n📊 Resumo da sincronização:");
    console.log(`   ✅ Sincronizados: ${syncedCount}`);
    console.log(`   ➕ Criados no Clerk: ${createdCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);

    await dataSource.destroy();
    console.log("\n✅ Script finalizado");
  } catch (error) {
    console.error("❌ Erro fatal:", error);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(1);
  }
}

// Executar o script
syncClerkUsers();

