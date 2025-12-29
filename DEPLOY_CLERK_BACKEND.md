# Deploy Backend - Clerk Configuration

## Variáveis de Ambiente

No ambiente de produção, você precisa configurar:

```env
CLERK_SECRET_KEY=sk_live_...
```

**Onde configurar:**

### Opção 1: Arquivo .env de produção

Adicione ao arquivo `.env` do backend:

```env
CLERK_SECRET_KEY=sk_live_YOUR_PRODUCTION_SECRET_KEY_HERE
```

### Opção 2: Variáveis de ambiente do servidor/plataforma

Configure na plataforma onde o backend está hospedado (Heroku, AWS, etc):

```
CLERK_SECRET_KEY=sk_live_YOUR_PRODUCTION_SECRET_KEY_HERE
```

## Verificação

Após configurar, verifique se está funcionando:

1. O servidor deve iniciar sem erros relacionados ao Clerk
2. Os endpoints `/auth/clerk/sync` e `/auth/clerk/verify` devem estar disponíveis
3. Teste fazendo uma requisição para sincronizar um usuário

## Teste Rápido

Para testar se a configuração está correta, você pode fazer uma requisição de teste:

```bash
curl -X POST https://loja-api.fofa.app.br/auth/clerk/verify \
  -H "Authorization: Bearer YOUR_CLERK_TOKEN" \
  -H "Content-Type: application/json"
```

## Importante

- Use `sk_live_...` para produção (não `sk_test_...`)
- **NUNCA** commite a Secret Key no código ou repositório
- A Secret Key deve estar apenas nas variáveis de ambiente
- Após alterar a variável, reinicie o servidor

