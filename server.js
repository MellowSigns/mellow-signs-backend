// ===== MELLOW SIGNS - BACKEND UPLOAD SYSTEM (SIMPLIFIED) =====
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const ImageKit = require('imagekit');
const Airtable = require('airtable');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const brevo = require('@getbrevo/brevo');
require('dotenv').config();

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

// ===== CONFIGURAÇÃO DE SEGURANÇA E MIDDLEWARE =====
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS simplificado - permitir tudo temporariamente
app.use(cors());

// Rate limiting
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        error: 'Muitas tentativas de upload. Tente novamente em 15 minutos.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: false
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configurar charset UTF-8 para caracteres portugueses
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// ===== CONFIGURAÇÃO DOS SERVIÇOS =====
console.log('🔧 Configurando serviços...');

// ImageKit Configuration
let imagekit = null;
try {
    imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY || '',
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY || '',
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || ''
    });
    console.log('✅ ImageKit configurado');
} catch (error) {
    console.log('❌ Erro ImageKit:', error.message);
}

// Airtable Configuration  
let base = null;
try {
    if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
        base = new Airtable({
            apiKey: process.env.AIRTABLE_API_KEY
        }).base(process.env.AIRTABLE_BASE_ID);
        console.log('✅ Airtable configurado');
    }
} catch (error) {
    console.log('❌ Erro Airtable:', error.message);
}

// Brevo Configuration
let brevoApi = null;
try {
    if (process.env.BREVO_API_KEY) {
        brevoApi = new brevo.TransactionalEmailsApi();
        brevoApi.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
        console.log('✅ Brevo configurado');
    }
} catch (error) {
    console.log('❌ Erro Brevo:', error.message);
}

// ===== CONFIGURAÇÃO DO MULTER =====
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 
        'image/webp', 'application/pdf', 'text/plain'
    ];
    
    const fileExt = '.' + file.originalname.split('.').pop().toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.svg', '.webp', '.pdf', '.txt'];
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
        cb(null, true);
    } else {
        cb(new Error(`Tipo de ficheiro não suportado: ${file.mimetype}`), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 40 * 1024 * 1024,
        files: 10
    }
});

// ===== FUNÇÕES AUXILIARES =====
const generateOrderId = () => {
    const timestamp = Date.now(); // 13 dígitos
    const randomDigits = Math.floor(Math.random() * 10000).toString().padStart(4, '0'); // 4 dígitos
    return `${timestamp}${randomDigits}`;
};

const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const sanitizeFileName = (filename) => {
    return filename
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 100);
};

// Função para converter Buffer para base64
const bufferToBase64 = (buffer) => {
    return buffer.toString('base64');
};

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token de acesso necessário',
            code: 'MISSING_TOKEN'
        });
    }
    
    // Verificar token fixo (simples para formulário público)
    if (token !== process.env.API_TOKEN) {
        return res.status(403).json({
            success: false,
            error: 'Token inválido',
            code: 'INVALID_TOKEN'
        });
    }
    
    next();
};

// ===== FUNÇÕES PRINCIPAIS =====

async function sendEmailNotification(orderData, orderId, folderPath) {
    try {
        if (!brevoApi) {
            console.log('⚠️ Brevo não configurado, email não enviado');
            return;
        }

        const emailData = new brevo.SendSmtpEmail();
        emailData.subject = `Pedido ${orderId}`;
        emailData.to = [{ email: 'info@mellowsigns.com', name: 'Mellow Signs' }];
        emailData.sender = { email: 'info@mellowsigns.com', name: 'Mellow Signs' };
        
        // Corpo do email em HTML
        emailData.htmlContent = `
            <h2>Novo pedido recebido!</h2>
            <p><strong>ID Pedido:</strong> ${orderId}</p>
            <p><strong>Nome:</strong> ${orderData.nome}</p>
            <p><strong>Email:</strong> ${orderData.email}</p>
            <p><strong>Telefone:</strong> ${orderData.telefone || 'Não fornecido'}</p>
            <p><strong>Pedido:</strong> ${orderData.comentarios || 'Sem descrição'}</p>
            <p><strong>Ficheiros:</strong> <a href="${process.env.IMAGEKIT_URL_ENDPOINT}${folderPath}" target="_blank">Ver pasta do pedido</a></p>
            <hr>
            <p><em>Este email foi enviado automaticamente pelo sistema de pedidos.</em></p>
        `;

        const result = await brevoApi.sendTransacEmail(emailData);
        console.log('✅ Email enviado com sucesso:', result.messageId);
        
    } catch (error) {
        console.error('❌ Erro ao enviar email:', error.message);
        // Não falhar o processo se o email falhar
    }
}

async function uploadToImageKit(file, orderId, index) {
    try {
        const sanitizedName = sanitizeFileName(file.originalname);
        const fileName = `${orderId}_${index}_${sanitizedName}`;
        
        // Criar estrutura de pastas por data
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const folderPath = `/mellow-signs/orders/${today}/${orderId}`;
        
        console.log('Tentando upload ImageKit:', fileName, 'para pasta:', folderPath);

        // Converter buffer para base64 para ImageKit SDK v6
        const base64File = bufferToBase64(file.buffer);
        
        const uploadResponse = await imagekit.upload({
            file: base64File,
            fileName: fileName,
            folder: folderPath
        });

        console.log('Upload ImageKit sucesso:', uploadResponse.fileId);

        return {
            fileId: uploadResponse.fileId,
            fileName: uploadResponse.name,
            url: uploadResponse.url,
            thumbnailUrl: uploadResponse.thumbnailUrl,
            size: file.size,
            originalName: file.originalname,
            folderPath: folderPath
        };
    } catch (error) {
        console.error('Erro ImageKit upload:', error.message);
        throw new Error(`Upload falhou: ${error.message}`);
    }
}

async function createOrder(orderData, uploadedFiles) {
    try {
        const orderId = generateOrderId();
        console.log('Criando pedido com dados:', orderData);
        
        // Nova estrutura Airtable: apenas tabela "Pedidos"
        const orderDataToSend = {
            'ID Pedido': parseInt(orderId), // Campo número no Airtable
            'Nome': orderData.nome,
            'Email': orderData.email,
            'Telefone': orderData.telefone || '',
            'Data': new Date().toISOString().split('T')[0], // YYYY-MM-DD
            'Descrição': orderData.comentarios || ''
        };
        
        console.log('Dados do pedido a enviar:', JSON.stringify(orderDataToSend, null, 2));
        console.log('Tentando criar registo na tabela "Pedidos"');

        const orderRecord = await base('Pedidos').create(orderDataToSend);

        console.log('Pedido criado:', orderId);

        return {
            orderId: orderId,
            recordId: orderRecord.id,
            filesCount: uploadedFiles.length,
            folderPath: uploadedFiles.length > 0 ? uploadedFiles[0].folderPath : null
        };
    } catch (error) {
        console.error('Erro criar pedido:', error.message);
        throw new Error('Falha ao criar pedido no sistema');
    }
}

// ===== ROUTES =====

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            imagekit: imagekit ? 'connected' : 'not configured',
            airtable: base ? 'connected' : 'not configured',
            brevo: brevoApi ? 'connected' : 'not configured'
        }
    });
});

// Product types
app.get('/api/product-types', (req, res) => {
    res.status(200).json({
        success: true,
        data: [
            { value: 'neon-led', label: 'Néon LED' },
            { value: 'caixa-luz', label: 'Caixa de Luz' },
            { value: 'letras-monobloco', label: 'Letras Monobloco' },
            { value: 'logo-iluminado', label: 'Logótipo Iluminado' },
            { value: 'painel-retroiluminado', label: 'Painel Retroiluminado' },
            { value: 'outro', label: 'Outro / Consultar' }
        ]
    });
});

// Upload endpoint
app.post('/api/upload', uploadLimiter, authenticateToken, upload.array('ficheiros', 10), async (req, res) => {
    let uploadedFiles = [];
    let orderId = null;

    try {
        // Validações básicas
        const { nome, email, telefone, comentarios } = req.body;
        
        if (!nome || !email) {
            return res.status(400).json({
                success: false,
                error: 'Nome e email são obrigatórios',
                code: 'MISSING_REQUIRED_FIELDS'
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                error: 'Email inválido',
                code: 'INVALID_EMAIL'
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Pelo menos um ficheiro é obrigatório',
                code: 'NO_FILES'
            });
        }

        console.log('Processando upload para:', email);

        // 1. Gerar ID do pedido
        orderId = generateOrderId();

        // 2. Upload ficheiros
        const uploadPromises = req.files.map((file, index) => 
            uploadToImageKit(file, orderId, index)
        );
        
        uploadedFiles = await Promise.all(uploadPromises);

        // 3. Criar pedido
        const order = await createOrder({
            nome, email, telefone, comentarios
        }, uploadedFiles);

        // 4. Enviar email de notificação
        await sendEmailNotification({
            nome, email, telefone, comentarios
        }, orderId, order.folderPath);

        // 5. Resposta
        res.status(200).json({
            success: true,
            message: 'Upload realizado com sucesso!',
            data: {
                orderId: orderId,
                recordId: order.recordId,
                files: uploadedFiles.map(file => ({
                    fileName: file.fileName,
                    originalName: file.originalName,
                    url: file.url,
                    thumbnailUrl: file.thumbnailUrl,
                    size: file.size
                })),
                filesCount: uploadedFiles.length,
                folderPath: order.folderPath,
                nextSteps: 'A nossa equipa irá analisar o seu pedido e contactá-lo em breve.'
            }
        });

        console.log('Upload completo:', orderId);

    } catch (error) {
        console.error('Erro upload:', error.message);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Erro interno no servidor',
            code: 'INTERNAL_SERVER_ERROR',
            orderId: orderId || 'N/A'
        });
    }
});

// Status endpoint
app.get('/api/status/:orderId', async (req, res) => {
    try {
        if (!base) {
            return res.status(503).json({
                success: false,
                error: 'Serviço não disponível',
                code: 'SERVICE_UNAVAILABLE'
            });
        }

        const { orderId } = req.params;
        
        const orders = await base('Pedidos').select({
            filterByFormula: `{ID Pedido} = "${orderId}"`
        }).firstPage();

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pedido não encontrado',
                code: 'ORDER_NOT_FOUND'
            });
        }

        const order = orders[0];
        const filesMetadata = JSON.parse(order.fields['Ficheiros Metadata'] || '[]');

        res.status(200).json({
            success: true,
            data: {
                orderId: order.fields['ID Pedido'],
                status: order.fields['Status'],
                tipoProduto: order.fields['Tipo Produto'],
                dataUpload: order.fields['Data Upload'],
                numeroFicheiros: order.fields['Número de Ficheiros'],
                files: filesMetadata
            }
        });

    } catch (error) {
        console.error('Erro status:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao verificar status',
            code: 'STATUS_CHECK_FAILED'
        });
    }
});

// Error handling
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Ficheiro demasiado grande. Máximo: 40MB',
                code: 'FILE_TOO_LARGE'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Demasiados ficheiros. Máximo: 10',
                code: 'TOO_MANY_FILES'
            });
        }
    }

    console.error('Erro:', error);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_SERVER_ERROR'
    });
});

// 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint não encontrado',
        code: 'NOT_FOUND'
    });
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log(`
    🚀 Servidor iniciado na porta ${PORT}
    📡 Health: http://localhost:${PORT}/health
    🖼️ ImageKit: ${imagekit ? 'OK' : 'NÃO CONFIGURADO'}
    📊 Airtable: ${base ? 'OK' : 'NÃO CONFIGURADO'}
    📧 Brevo: ${brevoApi ? 'OK' : 'NÃO CONFIGURADO'}
    `);
});
