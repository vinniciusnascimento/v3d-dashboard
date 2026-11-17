# Acesso ao painel V3D

## Configurar o MySQL

1. No mesmo banco de dados usado pelo painel, execute o arquivo `backend/auth-schema.sql`. Ele cria as tabelas de usuários, sessões e controle de tentativas.
2. Gere o hash da senha com `node backend/hash-password.js`. Digite a senha no terminal e copie o hash exibido.
3. No MySQL, execute o comando abaixo com o nome de usuário e o hash gerado. Use até 64 caracteres no nome, com letras minúsculas, números, ponto, hífen ou sublinhado.

```sql
INSERT INTO dashboard_users (username, password_hash)
VALUES ('seu_usuario', 'COLE_O_HASH_AQUI');
```

O painel aceita apenas contas já cadastradas no banco. Para trocar a senha, gere um novo hash e atualize a coluna `password_hash`. Para desativar uma conta, defina `active = 0`. Para reativar uma conta desativada, apague primeiro as sessões daquele usuário em `dashboard_sessions` e defina `active = 1`. As sessões expiram após oito horas.

## Abrir o painel

Com as variáveis `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` configuradas no ambiente ou em `backend/.env`, execute `npm install` e `npm start`. Abra `http://localhost:5000`. Se abrir pelo Go Live na porta 5500, a p?gina redireciona para o servidor do painel na porta 5000.

Na Vercel, configure as mesmas variáveis, execute o SQL no banco e crie o primeiro usuário antes de publicar a versão.