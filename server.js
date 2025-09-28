// ===== MELLOW SIGNS - BACKEND UPLOAD SYSTEM (SIMPLIFIED) =====
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
    }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    return `MS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
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

// ===== FUNÇÕES PRINCIPAIS =====

async function findOrCreateCustomer(customerData) {
    try {
        const existingCustomers = await base('Clientes').select({
            filterByFormula: `{Email} = "${customerData.email}"`
        }).firstPage();

        if (existingCustomers.length > 0) {
            console.log('Cliente existente encontrado');
            return existingCustomers[0];
        }

        const newCustomer = await base('Clientes').create({
            'Nome': customerData.nome,
            'Email': customerData.email,
            'Telefone': customerData.telefone || '',
            'Data': new Date().toISOString()
        }, { typecast: true });

        console.log('Novo cliente criado');
        return newCustomer;
    } catch (error) {
        console.error('Erro cliente:', error.message);
        throw new Error('Falha ao processar dados do cliente');
    }
}

async function uploadToImageKit(file, orderId, index) {
    try {
        const sanitizedName = sanitizeFileName(file.originalname);
        const fileName = `${orderId}_${index}_${sanitizedName}`;
        
        console.log('Tentando upload ImageKit:', fileName);

        const uploadResponse = await imagekit.upload({
            file: file.buffer,
            fileName: fileName,
            folder: '/mellow-signs/orders'
        });

        console.log('Upload ImageKit sucesso:', uploadResponse.fileId);

        return {
            fileId: uploadResponse.fileId,
            fileName: uploadResponse.name,
            url: uploadResponse.url,
            thumbnailUrl: uploadResponse.thumbnailUrl,
            size: file.size,
            originalName: file.originalname
        };
    } catch (error) {
        console.error('Erro ImageKit upload:', error.message);
        throw new Error(`Upload falhou: ${error.message}`);
    }
}

async function createOrder(customerId, orderData, uploadedFiles) {
    try {
        const orderId = generateOrderId();
        
        const filesData = uploadedFiles.map(file => ({
            filename: file.fileName,
            url: file.url,
            thumbnailUrl: file.thumbnailUrl || '',
            fileId: file.fileId,
            size: file.size,
            originalName: file.originalName
        }));

        const orderRecord = await base('Pedidos').create({
            'Cliente': [customerId],
            'ID Pedido': orderId,
            'Tipo Produto': orderData.tipoProduto || 'Não especificado',
            'Status': 'Novo',
            'Data Upload': new Date().toISOString(),
            'Comentários': orderData.comentarios || '',
            'Ficheiros Metadata': JSON.stringify(filesData),
            'Número de Ficheiros': uploadedFiles.length
        }, { typecast: true });

        console.log('Pedido criado:', orderId);

        return {
            orderId: orderId,
            recordId: orderRecord.id,
            filesCount: uploadedFiles.length
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
            airtable: base ? 'connected' : 'not configured'
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
app.post('/api/upload', uploadLimiter, upload.array('ficheiros', 10), async (req, res) => {
    let uploadedFiles = [];
    let customer = null;
    let orderId = null;

    try {
        // Validações básicas
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

        console.log('Processando upload para:', email);

        // 1. Cliente
        customer = await findOrCreateCustomer({ nome, email, telefone });

        // 2. ID do pedido
        orderId = generateOrderId();

        // 3. Upload ficheiros
        const uploadPromises = req.files.map((file, index) => 
            uploadToImageKit(file, orderId, index)
        );
        
        uploadedFiles = await Promise.all(uploadPromises);

        // 4. Criar pedido
        const order = await createOrder(customer.id, {
            tipoProduto, comentarios
        }, uploadedFiles);

        // 5. Resposta
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

        console.log('Upload completo:', order.orderId);

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
    `);
});
