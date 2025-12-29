# Script de Sincronização de Usuários com Clerk

Este script sincroniza os usuários existentes do banco de dados com o Clerk.

## Pré-requisitos

1. A variável de ambiente `CLERK_SECRET_KEY` deve estar configurada no arquivo `.env`
2. As variáveis de ambiente do banco de dados devem estar configuradas:
   - `DB_HOST`
   - `DB_PORT`
   - `DB_USERNAME`
   - `DB_PASSWORD`
   - `DB_DATABASE`

## Como executar

### Opção 1: Usando npm script (recomendado)

```bash
cd erp-api
npm run sync-clerk-users
```

### Opção 2: Executar diretamente com tsx

```bash
cd erp-api
tsx src/scripts/sync-clerk-users.ts
```

## O que o script faz

1. Conecta ao banco de dados PostgreSQL
2. Busca todos os usuários ativos (`is_active: true`)
3. Para cada usuário:
   - Verifica se já existe no Clerk (pelo email)
   - Se não existir, cria um novo usuário no Clerk
   - Se já existir, apenas registra que foi sincronizado
4. Exibe um relatório com:
   - Quantidade de usuários sincronizados
   - Quantidade de usuários criados no Clerk
   - Quantidade de erros encontrados

## Notas importantes

- O script cria usuários no Clerk, mas **não vincula o `clerkId` no banco de dados** (isso requer adicionar o campo `clerkId` na entidade User)
- Usuários sem email são ignorados
- O script é idempotente: pode ser executado múltiplas vezes sem criar duplicatas


