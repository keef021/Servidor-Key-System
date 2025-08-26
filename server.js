// Configuração inicial
require('dotenv').config();
const express = require('express');
const fs = require('fs-extra');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONETIZZY_TOKEN = process.env.MONETIZZY_TOKEN;

// Validação do token na inicialização
if (!MONETIZZY_TOKEN) {
    console.error('ERRO: MONETIZZY_TOKEN não encontrado no arquivo .env');
    process.exit(1);
}

// Middlewares
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware para logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Arquivo que guarda as keys
const KEYS_FILE = path.join(__dirname, 'keys.json');
let keys = [];

// Carregar keys existentes
async function loadKeys() {
    try {
        if (await fs.pathExists(KEYS_FILE)) {
            keys = await fs.readJson(KEYS_FILE);
            console.log(`${keys.length} keys carregadas do arquivo`);
        } else {
            // Criar arquivo vazio se não existir
            await fs.writeJson(KEYS_FILE, []);
            console.log('Arquivo de keys criado');
        }
    } catch (error) {
        console.error('Erro ao carregar keys:', error.message);
        keys = [];
    }
}

// Salvar keys no arquivo
async function saveKeys() {
    try {
        await fs.writeJson(KEYS_FILE, keys, { spaces: 2 });
    } catch (error) {
        console.error('Erro ao salvar keys:', error.message);
        throw new Error('Falha ao salvar keys');
    }
}

// Gerar key única
function generateKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `${timestamp}-${random}`;
}

// Validar URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Limpar keys expiradas (keys não utilizadas após 24h)
function cleanExpiredKeys() {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const initialCount = keys.length;
    
    keys = keys.filter(keyObj => {
        if (keyObj.used) return true; // Manter keys usadas para histórico
        if (!keyObj.createdAt) return true; // Manter keys antigas sem timestamp
        return keyObj.createdAt > oneDayAgo;
    });
    
    if (keys.length !== initialCount) {
        console.log(`${initialCount - keys.length} keys expiradas removidas`);
        saveKeys().catch(console.error);
    }
}

// -------------------- Endpoints -------------------- //

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Key System Monetizzy rodando!',
        timestamp: new Date().toISOString(),
        totalKeys: keys.length,
        usedKeys: keys.filter(k => k.used).length
    });
});

// Status das keys
app.get('/status', (req, res) => {
    const stats = {
        total: keys.length,
        used: keys.filter(k => k.used).length,
        available: keys.filter(k => !k.used).length,
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

// Gerar key (apenas via Monetizzy, POST)
app.post('/gerar', async (req, res) => {
    try {
        const { monetizzyToken, link } = req.body;

        // Validações
        if (!monetizzyToken) {
            return res.status(400).json({ 
                success: false,
                error: "Token Monetizzy é obrigatório" 
            });
        }

        if (monetizzyToken !== MONETIZZY_TOKEN) {
            return res.status(403).json({ 
                success: false,
                error: "Token inválido" 
            });
        }

        if (!link) {
            return res.status(400).json({ 
                success: false,
                error: "Link é obrigatório" 
            });
        }

        if (!isValidUrl(link)) {
            return res.status(400).json({ 
                success: false,
                error: "URL inválida" 
            });
        }

        // Criar link encurtado no Monetizzy
        const response = await axios.post('https://api.monetizzy.com/api/shorten/link', {
            link: link.trim(),
            domain: 'ufly.monetizzy.com',
            type: 4
        }, {
            headers: { 
                'Authorization': `Bearer ${MONETIZZY_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10 segundos timeout
        });

        if (response.data?.shortened_url) {
            const key = generateKey();
            const keyObject = {
                key,
                used: false,
                createdAt: Date.now(),
                shortLink: response.data.shortened_url,
                originalLink: link.trim()
            };
            
            keys.push(keyObject);
            await saveKeys();
            
            console.log(`Nova key gerada: ${key}`);
            
            return res.json({ 
                success: true,
                key, 
                shortLink: response.data.shortened_url,
                createdAt: new Date().toISOString()
            });
        } else {
            return res.status(400).json({ 
                success: false,
                error: "Erro ao gerar link encurtado" 
            });
        }

    } catch (err) {
        console.error('Erro ao gerar key:', err.message);
        
        if (err.code === 'ECONNABORTED') {
            return res.status(408).json({ 
                success: false,
                error: "Timeout na API Monetizzy" 
            });
        }
        
        if (err.response?.status === 401) {
            return res.status(401).json({ 
                success: false,
                error: "Token Monetizzy inválido ou expirado" 
            });
        }
        
        return res.status(500).json({ 
            success: false,
            error: "Erro interno do servidor",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Validar key (Roblox, POST)
app.post('/validar', async (req, res) => {
    try {
        const { key } = req.body;
        
        if (!key) {
            return res.status(400).json({ 
                valid: false, 
                message: "Key é obrigatória" 
            });
        }

        const found = keys.find(k => k.key === key.trim());

        if (!found) {
            console.log(`Key não encontrada: ${key}`);
            return res.status(404).json({ 
                valid: false, 
                message: "Key não encontrada" 
            });
        }

        if (found.used) {
            console.log(`Key já utilizada: ${key}`);
            return res.json({ 
                valid: false, 
                message: "Key já foi utilizada" 
            });
        }

        // Verificar se a key expirou (24h)
        if (found.createdAt && (Date.now() - found.createdAt) > (24 * 60 * 60 * 1000)) {
            console.log(`Key expirada: ${key}`);
            return res.json({ 
                valid: false, 
                message: "Key expirada" 
            });
        }

        // Marcar como usada
        found.used = true;
        found.usedAt = Date.now();
        await saveKeys();
        
        console.log(`Key validada com sucesso: ${key}`);
        
        res.json({ 
            valid: true, 
            message: "Key válida!",
            usedAt: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Erro ao validar key:', error.message);
        res.status(500).json({ 
            valid: false, 
            message: "Erro interno do servidor" 
        });
    }
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: "Endpoint não encontrado",
        availableEndpoints: [
            'GET /',
            'GET /status',
            'POST /gerar',
            'POST /validar'
        ]
    });
});

// Middleware para tratamento de erros
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({ 
        error: "Erro interno do servidor" 
    });
});

// Inicialização do servidor
async function startServer() {
    try {
        await loadKeys();
        
        // Limpeza automática a cada hora
        setInterval(cleanExpiredKeys, 60 * 60 * 1000);
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
            console.log(`📊 ${keys.length} keys carregadas`);
            console.log(`⏰ Limpeza automática de keys ativada`);
        });
        
    } catch (error) {
        console.error('Erro ao inicializar servidor:', error.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Encerrando servidor...');
    await saveKeys();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Encerrando servidor...');
    await saveKeys();
    process.exit(0);
});

// Iniciar servidor
startServer();
