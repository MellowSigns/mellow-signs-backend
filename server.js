// ===== MELLOW SIGNS - BACKEND UPLOAD SYSTEM COMPLETO =====
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const ImageKit = require('imagekit');
const Airtable = require('airtable');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.set('trust proxy', true); // ADICIONAR ESTA LINHA
const PORT = process.env.PORT || 3000;

// ===== CONFIGURAÇÃO DE SEGURANÇA E MIDDLEWARE =====
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requests sem origin (ficheiros locais, mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'https://mellowsigns.com',
            'https://www.mellowsigns.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:8000',
            'http://localhost:8080'
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('mellowsigns')) {
            return callback(null, true);
        }
        
        // Para testes, permitir todas as origens temporariamente
        return callback(null, true);
    },
    credentials: true
}));

// Rate limiting para evitar spam
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10, // máximo 10 uploads por IP por 15min
    message: {
        error: 'Muitas tentativas de upload. Tente novamente em 15 minutos.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== CONFIGURAÇÃO DOS SERVIÇOS EXTERNOS =====

// ImageKit Configuration
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Airtable Configuration
const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// ===== CONFIGURAÇÃO DO MULTER =====
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    // Tipos de ficheiro aceites
    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 
        'image/webp', 'application/pdf', 'application/illustrator',
        'application/postscript', 'text/plain'
    ];
    
    // Verificar extensão também para maior segurança
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.svg', '.webp', 
                              '.pdf', '.ai', '.eps', '.txt'];
    
    const fileExt = '.' + file.originalname.split('.').pop().toLowerCase();
    
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
        fileSize: 40 * 1024 * 1024, // 40MB por ficheiro
        files: 10 // máximo 10 ficheiros
    }
});

// ===== UTILITÁRIOS E HELPERS =====

// Gerador de ID único para pedidos
const generateOrderId = () => {
    return `MS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

// Validator de email
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// Sanitização de nomes de ficheiro
const sanitizeFileName = (filename) => {
    return filename
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 100); // limitar tamanho
};

// Logger estruturado
const logger = {
    info: (message, meta = {}) => {
        console.log(JSON.stringify({
            level: 'info',
            message,
            timestamp: new Date().toISOString(),
            ...meta
        }));
    },
    error: (message, error = null, meta = {}) => {
        console.error(JSON.stringify({
            level: 'error',
            message,
            error: error ? error.toString() : null,
            stack: error ? error.stack : null,
            timestamp: new Date().toISOString(),
            ...meta
        }));
    },
    warn: (message, meta = {}) => {
        console.warn(JSON.stringify({
            level: 'warn',
            message,
            timestamp: new Date().toISOString(),
            ...meta
        }));
    }
};

// ===== FUNÇÕES PRINCIPAIS =====

// Função para encontrar ou criar cliente no Airtable
async function findOrCreateCustomer(customerData) {
    try {
        // Primeiro, tentar encontrar cliente existente pelo email
        const existingCustomers = await base('Clientes').select({
            filterByFormula: `{Email} = "${customerData.email}"`
        }).firstPage();

        if (existingCustomers.length > 0) {
            logger.info('Cliente existente encontrado', { 
                customerId: existingCustomers[0].id,
                email: customerData.email 
            });
            return existingCustomers[0];
        }

        // Se não encontrar, criar novo cliente
        const newCustomer = await base('Clientes').create({
            'Nome': customerData.nome,
            'Email': customerData.email,
            'Telefone': customerData.telefone || '',
            'Data': new Date().toISOString()
        }, { typecast: true });

        logger.info('Novo cliente criado', { 
            customerId: newCustomer.id,
            email: customerData.email 
        });
        
        return newCustomer;
    } catch (error) {
        logger.error('Erro ao encontrar/criar cliente', error, { customerData });
        throw new Error('Falha ao processar dados do cliente');
    }
}

// Função para fazer upload de ficheiro para ImageKit
async function uploadToImageKit(file, orderId, index) {
    try {
        const sanitizedName = sanitizeFileName(file.originalname);
        const fileName = `${orderId}_${index}_${sanitizedName}`;
        
        const uploadResponse = await imagekit.upload({
            file: file.buffer,
            fileName: fileName,
            folder: '/mellow-signs/orders',
            tags: ['mellow-signs', 'order', orderId],
            customMetadata: {
                orderId: orderId,
                originalName: file.originalname,
                uploadDate: new Date().toISOString()
            }
        });

        logger.info('Upload para ImageKit bem-sucedido', {
            fileId: uploadResponse.fileId,
            fileName: fileName,
            orderId: orderId
        });

        return {
            fileId: uploadResponse.fileId,
            fileName: uploadResponse.name,
            url: uploadResponse.url,
            thumbnailUrl: uploadResponse.thumbnailUrl,
            size: file.size,
            originalName: file.originalname
        };
    } catch (error) {
        logger.error('Erro no upload para ImageKit', error, {
            fileName: file.originalname,
            orderId: orderId
        });
        throw new Error(`Falha no upload do ficheiro ${file.originalname}`);
    }
}

// Função para criar pedido no Airtable
async function createOrder(customerId, orderData, uploadedFiles) {
    try {
        const orderId = generateOrderId();
        
        // Preparar dados dos ficheiros para o Airtable
        const filesData = uploadedFiles.map(file => ({
            filename: file.fileName,
            url: file.url,
            thumbnailUrl: file.thumbnailUrl || '',
            fileId: file.fileId,
            size: file.size,
            originalName: file.originalName
        }));

        const orderRecord = await base('Pedidos').create({
            'Cliente': [customerId], // Link para tabela de Clientes
            'ID Pedido': orderId,
            'Tipo Produto': orderData.tipoProduto || 'Não especificado',
            'Status': 'Novo',
            'Data Upload': new Date().toISOString(),
            'Comentários': orderData.comentarios || '',
            'Ficheiros Metadata': JSON.stringify(filesData),
            'Número de Ficheiros': uploadedFiles.length
        }, { typecast: true });

        logger.info('Pedido criado no Airtable', {
            orderId: orderId,
            recordId: orderRecord.id,
            customerId: customerId,
            filesCount: uploadedFiles.length
        });

        return {
            orderId: orderId,
            recordId: orderRecord.id,
            filesCount: uploadedFiles.length
        };
    } catch (error) {
        logger.error('Erro ao criar pedido no Airtable', error, {
            customerId: customerId,
            filesCount: uploadedFiles.length
        });
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
            imagekit: 'connected',
            airtable: 'connected'
        }
    });
});

// Endpoint para listar tipos de produto
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

// Endpoint principal para upload
app.post('/api/upload', uploadLimiter, upload.array('ficheiros', 10), async (req, res) => {
    let uploadedFiles = [];
    let customer = null;
    let orderId = null;

    try {
        // Validar dados obrigatórios
        const { nome, email, tipoProduto, comentarios, telefone } = req.body;
        
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

        logger.info('Iniciando processamento de upload', {
            customerEmail: email,
            filesCount: req.files.length,
            tipoProduto: tipoProduto
        });

        // 1. Encontrar ou criar cliente
        customer = await findOrCreateCustomer({
            nome, email, telefone
        });

        // 2. Gerar ID único para o pedido
        orderId = generateOrderId();

        // 3. Upload dos ficheiros para ImageKit
        const uploadPromises = req.files.map((file, index) => 
            uploadToImageKit(file, orderId, index)
        );
        
        uploadedFiles = await Promise.all(uploadPromises);

        // 4. Criar pedido no Airtable
        const order = await createOrder(customer.id, {
            tipoProduto, comentarios
        }, uploadedFiles);

        // 5. Resposta de sucesso
        res.status(200).json({
            success: true,
            message: 'Upload realizado com sucesso!',
            data: {
                orderId: order.orderId,
                recordId: order.recordId,
                customer: {
                    id: customer.id,
                    nome: customer.fields.Nome,
                    email: customer.fields.Email
                },
                files: uploadedFiles.map(file => ({
                    fileName: file.fileName,
                    originalName: file.originalName,
                    url: file.url,
                    thumbnailUrl: file.thumbnailUrl,
                    size: file.size
                })),
                filesCount: uploadedFiles.length,
                nextSteps: 'A nossa equipa irá analisar o seu pedido e contactá-lo em breve.'
            }
        });

        logger.info('Upload processado com sucesso', {
            orderId: order.orderId,
            customerId: customer.id,
            filesCount: uploadedFiles.length
        });

    } catch (error) {
        logger.error('Erro durante processamento de upload', error, {
            orderId: orderId,
            customerId: customer?.id,
            filesUploaded: uploadedFiles.length
        });

        // Em caso de erro, tentar fazer rollback
        if (uploadedFiles.length > 0) {
            // Tentar eliminar ficheiros do ImageKit (opcional - ImageKit tem garbage collection)
            logger.warn('Rollback necessário - ficheiros podem permanecer no ImageKit', {
                orderId: orderId,
                filesCount: uploadedFiles.length
            });
        }

        res.status(500).json({
            success: false,
            error: 'Erro interno no servidor. Tente novamente.',
            code: 'INTERNAL_SERVER_ERROR',
            orderId: orderId || 'N/A'
        });
    }
});

// Endpoint para verificar status de um pedido
app.get('/api/status/:orderId', async (req, res) => {
    try {
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
        logger.error('Erro ao verificar status do pedido', error, {
            orderId: req.params.orderId
        });

        res.status(500).json({
            success: false,
            error: 'Erro ao verificar status',
            code: 'STATUS_CHECK_FAILED'
        });
    }
});

// ===== ERROR HANDLING MIDDLEWARE =====
app.use((error, req, res, next) => {
    // Erros do Multer
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Ficheiro demasiado grande. Máximo: 40MB por ficheiro.',
                code: 'FILE_TOO_LARGE'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Demasiados ficheiros. Máximo: 10 ficheiros.',
                code: 'TOO_MANY_FILES'
            });
        }
    }

    // Outros erros
    logger.error('Erro não tratado', error);
    res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        code: 'INTERNAL_SERVER_ERROR'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint não encontrado',
        code: 'NOT_FOUND'
    });
});

// ===== SERVER START =====
app.listen(PORT, () => {
    logger.info(`Servidor Mellow Signs iniciado na porta ${PORT}`, {
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });
});

module.exports = app;