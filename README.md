# 🌟 Mellow Signs - Backend Upload System

Sistema de backend Node.js/Express para upload de ficheiros para ImageKit, registo de pedidos no Airtable e envio de emails via Brevo.

## 🚀 Funcionalidades

- ✅ Upload de ficheiros múltiplos (até 10 ficheiros, 40MB cada)
- ✅ Integração com ImageKit SDK v6 para armazenamento de ficheiros
- ✅ Organização automática de ficheiros por data: `/mellow-signs/orders/YYYY-MM-DD/[ID-Pedido]/`
- ✅ Integração com Airtable para gestão de pedidos
- ✅ Envio automático de emails via Brevo para info@mellowsigns.com
- ✅ Geração de IDs únicos: timestamp + 4 dígitos aleatórios
- ✅ Autenticação JWT simples com token fixo
- ✅ Suporte completo UTF-8 para caracteres portugueses
- ✅ Rate limiting e validações de segurança
- ✅ Formulário HTML de teste com drag-and-drop
- ✅ Formulário Shopify integrado com upload de ficheiros

## 📋 Pré-requisitos

- Node.js 16+ 
- Conta ImageKit (gratuita)
- Conta Airtable (gratuita)
- Conta Brevo (gratuita)
- Railway account (para deploy)

## ⚙️ Configuração

### 1. Instalar Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
```bash
# Copiar arquivo de exemplo
cp env.example .env

# Editar .env com suas credenciais
```

### 3. Credenciais Necessárias

#### ImageKit
1. Aceda a [ImageKit Dashboard](https://imagekit.io/dashboard/developer/api-keys)
2. Copie:
   - Public Key
   - Private Key  
   - URL Endpoint

#### Airtable
1. Aceda a [Airtable](https://airtable.com/create/tokens)
2. Crie um Personal Access Token
3. Copie o Base ID da sua base

#### Brevo
1. Aceda a [Brevo Dashboard](https://app.brevo.com/settings/keys/api)
2. Crie uma API Key
3. Copie a chave para a variável `BREVO_API_KEY`

### 4. Estrutura Airtable

Crie uma única tabela na sua base:

**Tabela "Pedidos":**
- ID Pedido (Number, Primary Key)
- Nome (Single line text)
- Email (Email)
- Telefone (Phone number)
- Data (Date)
- Descrição (Long text)

### 5. Estrutura ImageKit

Os ficheiros são organizados automaticamente:
```
/mellow-signs/orders/
├── 2024-01-15/
│   ├── 1729353600001234/
│   │   ├── 1729353600001234_0_logo.jpg
│   │   └── 1729353600001234_1_especificacoes.pdf
│   └── 1729353600005678/
└── 2024-01-16/
    └── 1729440000001234/
```

## 🏃‍♂️ Executar Localmente

```bash
# Modo desenvolvimento
npm run dev

# Modo produção
npm start

# Verificar saúde do servidor
npm run health
```

O servidor estará disponível em: `http://localhost:3000`

## 🧪 Testar o Sistema

### 1. Abrir Formulário de Teste
Abra o arquivo `test-form.html` no seu navegador.

### 2. Configurar Token
No arquivo `test-form.html`, linha 200, substitua:
```javascript
const API_TOKEN = 'your_fixed_api_token_here';
```
Pelo token configurado no seu `.env`.

### 3. Testar Upload
1. Preencha o formulário
2. Arraste ficheiros para a zona de upload
3. Clique em "Enviar Pedido"
4. Verifique se aparece mensagem de sucesso

## 📡 Endpoints da API

### Health Check
```
GET /health
```
Verifica se o servidor e serviços estão funcionando.

### Upload de Ficheiros
```
POST /api/upload
Authorization: Bearer <API_TOKEN>
Content-Type: multipart/form-data
```

**Campos obrigatórios:**
- `nome` (string)
- `email` (string)
- `ficheiros` (array de ficheiros)

**Campos opcionais:**
- `telefone` (string)
- `comentarios` (string)

### Verificar Status do Pedido
```
GET /api/status/:orderId
```

## 🔧 Problemas Resolvidos

### 1. ImageKit Buffer Error
- ✅ Convertido `file.buffer` para base64 antes do upload
- ✅ ImageKit SDK v6 aceita base64 string

### 2. Caracteres Portugueses
- ✅ Adicionado charset UTF-8 nos headers
- ✅ Caracteres especiais (ã, ç, é) preservados

### 3. Autenticação JWT
- ✅ Implementado middleware de autenticação
- ✅ Token fixo para formulário público
- ✅ Proteção do endpoint `/api/upload`

## 🚀 Deploy no Railway

1. Conecte o repositório ao Railway
2. Adicione as variáveis de ambiente nas configurações
3. O deploy é automático

## 📱 Integração Shopify

### Formulário Shopify Atualizado

O ficheiro `Form Base Code/contact-form-updated.liquid` contém um formulário completo que:

1. **Mantém a estética original** do tema Shopify
2. **Adiciona campo de upload** de ficheiros
3. **Inclui validações** JavaScript inline
4. **Envia dados** para o Railway backend
5. **Mostra mensagens** de sucesso/erro

### Como Usar

1. Copie o conteúdo de `contact-form-updated.liquid`
2. Substitua o ficheiro `contact-form.liquid` no seu tema
3. Configure as variáveis no script:
   ```javascript
   const API_URL = 'https://mellow-signs-backend.railway.app/api/upload';
   const API_TOKEN = 'your_api_token_here';
   ```
4. Teste no preview do Shopify

### Campos do Formulário

- **Nome** (obrigatório)
- **Email** (obrigatório)  
- **Telefone** (opcional)
- **Descrição do Pedido** (opcional)
- **Ficheiro** (obrigatório) - JPG, PNG, PDF

## 🛠️ Desenvolvimento

### Estrutura do Projeto
```
├── server.js                           # Servidor principal
├── package.json                        # Dependências
├── env.example                         # Template de configuração
├── test-form.html                      # Formulário de teste
├── Form Base Code/
│   ├── contact-form-updated.liquid     # Formulário Shopify completo
│   ├── contact-form.liquid            # Formulário original
│   ├── contact-form-submit-button.liquid
│   └── section.liquid
└── README.md                          # Esta documentação
```

### Scripts Disponíveis
- `npm start` - Iniciar servidor
- `npm run dev` - Modo desenvolvimento com nodemon
- `npm run health` - Verificar saúde do servidor
- `npm test` - Executar testes
- `npm run lint` - Verificar código

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do servidor
2. Teste o endpoint `/health`
3. Verifique as credenciais no `.env`
4. Consulte os logs do Railway

---

**Mellow Signs** - Sinalética luminosa personalizada ✨
