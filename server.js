// ===== MELLOW SIGNS - BACKEND UPLOAD SYSTEM =====
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
const PORT = process.env.PORT || 3000;

// ===== CONFIGURAÇÃO BÁSICA =====
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://mellowsigns.com', 'https://www.mellowsigns.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== CONFIGURAÇÃO DOS SERVIÇOS =====
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

const base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

// ===== ROUTES BÁSICAS =====
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

app.get('/api/product-types', (req, res) => {
    res.status(200).json({
        success: true,
        data: [
            { value: 'neon-led', label: 'Néon LED' },
            { value: 'caixa-luz', label: 'Caixa de Luz' },
            { value: 'letras-monobloco', label: 'Letras Monobloco' },
            { value: 'logo-iluminado', label: 'Logótipo Iluminado' },
            { value: 'outro', label: 'Outro / Consultar' }
        ]
    });
});

// ===== SERVIDOR =====
app.listen(PORT, () => {
    console.log(`Servidor Mellow Signs iniciado na porta ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
});

module.exports = app;