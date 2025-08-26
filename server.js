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

// Página inicial com visual bonito
app.get('/', (req, res) => {
    const stats = {
        total: keys.length,
        used: keys.filter(k => k.used).length,
        available: keys.filter(k => !k.used).length
    };
    
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Key System Monetizzy</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                color: #ffffff;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                padding: 40px;
                max-width: 600px;
                width: 100%;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                text-align: center;
                animation: fadeIn 1s ease-out;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(30px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .logo {
                font-size: 2.5rem;
                font-weight: bold;
                margin-bottom: 10px;
                background: linear-gradient(45deg, #ffffff, #cccccc);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .subtitle {
                font-size: 1.2rem;
                color: #cccccc;
                margin-bottom: 30px;
            }
            
            .status-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 20px;
                margin: 30px 0;
            }
            
            .stat-card {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 15px;
                padding: 20px;
                transition: all 0.3s ease;
            }
            
            .stat-card:hover {
                background: rgba(255, 255, 255, 0.1);
                transform: translateY(-5px);
            }
            
            .stat-number {
                font-size: 2rem;
                font-weight: bold;
                color: #ffffff;
                margin-bottom: 5px;
            }
            
            .stat-label {
                font-size: 0.9rem;
                color: #cccccc;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            .status-indicator {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                margin: 20px 0;
                padding: 10px 20px;
                background: rgba(0, 255, 0, 0.1);
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 25px;
                color: #00ff00;
                font-weight: bold;
            }
            
            .status-dot {
                width: 10px;
                height: 10px;
                background: #00ff00;
                border-radius: 50%;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }
            
            .endpoints {
                margin-top: 30px;
                text-align: left;
            }
            
            .endpoints h3 {
                color: #ffffff;
                margin-bottom: 15px;
                text-align: center;
            }
            
            .endpoint {
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 10px 15px;
                margin-bottom: 10px;
                font-family: 'Courier New', monospace;
                color: #cccccc;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .method {
                background: #333;
                color: #fff;
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 0.8rem;
                font-weight: bold;
            }
            
            .method.get { background: #4CAF50; }
            .method.post { background: #2196F3; }
            
            .footer {
                margin-top: 30px;
                color: #888;
                font-size: 0.9rem;
            }
            
            @media (max-width: 768px) {
                .container { padding: 20px; }
                .logo { font-size: 2rem; }
                .status-grid { grid-template-columns: 1fr; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🔑 KeySystem</div>
            <div class="subtitle">Sistema de Chaves Monetizzy</div>
            
            <div class="status-indicator">
                <div class="status-dot"></div>
                Sistema Online
            </div>
            
            <div class="status-grid">
                <div class="stat-card">
                    <div class="stat-number">${stats.total}</div>
                    <div class="stat-label">Total de Keys</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.used}</div>
                    <div class="stat-label">Keys Utilizadas</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${stats.available}</div>
                    <div class="stat-label">Keys Disponíveis</div>
                </div>
            </div>
            
            <div class="endpoints">
                <h3>📡 Endpoints Disponíveis</h3>
                <div class="endpoint">
                    <span><span class="method get">GET</span> /</span>
                    <span>Página inicial</span>
                </div>
                <div class="endpoint">
                    <span><span class="method get">GET</span> /gerar</span>
                    <span>Interface de geração</span>
                </div>
                <div class="endpoint">
                    <span><span class="method post">POST</span> /gerar</span>
                    <span>Gerar nova key</span>
                </div>
                <div class="endpoint">
                    <span><span class="method post">POST</span> /validar</span>
                    <span>Validar key existente</span>
                </div>
                <div class="endpoint">
                    <span><span class="method get">GET</span> /status</span>
                    <span>Status do sistema (JSON)</span>
                </div>
            </div>
            
            <div class="footer">
                🕒 Última atualização: ${new Date().toLocaleString('pt-BR')}
            </div>
        </div>
    </body>
    </html>`;
    
    res.send(html);
});

// Página de geração de keys
app.get('/gerar', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Gerar Key - Monetizzy</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
                color: #ffffff;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                padding: 40px;
                max-width: 500px;
                width: 100%;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
                animation: fadeIn 1s ease-out;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(30px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            
            .logo {
                font-size: 2.5rem;
                font-weight: bold;
                margin-bottom: 10px;
                background: linear-gradient(45deg, #ffffff, #cccccc);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .subtitle {
                font-size: 1.1rem;
                color: #cccccc;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            label {
                display: block;
                margin-bottom: 8px;
                color: #cccccc;
                font-weight: 500;
            }
            
            input[type="text"], input[type="url"] {
                width: 100%;
                padding: 15px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                color: #ffffff;
                font-size: 16px;
                transition: all 0.3s ease;
            }
            
            input[type="text"]:focus, input[type="url"]:focus {
                outline: none;
                border-color: rgba(255, 255, 255, 0.5);
                background: rgba(255, 255, 255, 0.1);
                box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
            }
            
            input::placeholder {
                color: #888;
            }
            
            .btn {
                width: 100%;
                padding: 15px;
                background: linear-gradient(45deg, #333, #555);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                color: #ffffff;
                font-size: 16px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
                margin-top: 10px;
            }
            
            .btn:hover {
                background: linear-gradient(45deg, #444, #666);
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
            }
            
            .btn:active {
                transform: translateY(0);
            }
            
            .btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }
            
            .result {
                margin-top: 20px;
                padding: 20px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                display: none;
            }
            
            .result.success {
                border-color: rgba(0, 255, 0, 0.3);
                background: rgba(0, 255, 0, 0.05);
            }
            
            .result.error {
                border-color: rgba(255, 0, 0, 0.3);
                background: rgba(255, 0, 0, 0.05);
            }
            
            .key-display {
                background: rgba(0, 0, 0, 0.3);
                padding: 15px;
                border-radius: 8px;
                margin: 10px 0;
                font-family: 'Courier New', monospace;
                font-size: 1.1rem;
                word-break: break-all;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .copy-btn {
                padding: 8px 15px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 5px;
                color: #ffffff;
                cursor: pointer;
                font-size: 0.9rem;
                margin-top: 10px;
            }
            
            .copy-btn:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            
            .loading {
                display: none;
                text-align: center;
                margin-top: 20px;
            }
            
            .spinner {
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top: 3px solid #ffffff;
                width: 30px;
                height: 30px;
                animation: spin 1s linear infinite;
                margin: 0 auto 10px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .back-btn {
                display: inline-block;
                margin-bottom: 20px;
                padding: 10px 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 20px;
                color: #ffffff;
                text-decoration: none;
                transition: all 0.3s ease;
            }
            
            .back-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                transform: translateX(-5px);
            }
            
            @media (max-width: 768px) {
                .container { padding: 20px; }
                .logo { font-size: 2rem; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <a href="/" class="back-btn">← Voltar ao Início</a>
            
            <div class="header">
                <div class="logo">🔑 Gerar Key</div>
                <div class="subtitle">Sistema Monetizzy</div>
            </div>
            
            <form id="keyForm">
                <div class="form-group">
                    <label for="token">🔐 Token Monetizzy:</label>
                    <input type="text" id="token" name="token" placeholder="Digite seu token Monetizzy" required>
                </div>
                
                <div class="form-group">
                    <label for="link">🔗 Link para Encurtar:</label>
                    <input type="url" id="link" name="link" placeholder="https://exemplo.com/seu-link" required>
                </div>
                
                <button type="submit" class="btn" id="generateBtn">
                    ✨ Gerar Key
                </button>
            </form>
            
            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>Gerando sua key...</p>
            </div>
            
            <div class="result" id="result">
                <div id="resultContent"></div>
            </div>
        </div>
        
        <script>
            document.getElementById('keyForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const form = e.target;
                const formData = new FormData(form);
                const token = formData.get('token');
                const link = formData.get('link');
                
                const generateBtn = document.getElementById('generateBtn');
                const loading = document.getElementById('loading');
                const result = document.getElementById('result');
                const resultContent = document.getElementById('resultContent');
                
                // Show loading
                generateBtn.disabled = true;
                loading.style.display = 'block';
                result.style.display = 'none';
                
                try {
                    const response = await fetch('/gerar', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            monetizzyToken: token,
                            link: link
                        })
                    });
                    
                    const data = await response.json();
                    
                    loading.style.display = 'none';
                    result.style.display = 'block';
                    
                    if (data.success) {
                        result.className = 'result success';
                        resultContent.innerHTML = \`
                            <h3 style="color: #00ff00; margin-bottom: 15px;">✅ Key Gerada com Sucesso!</h3>
                            <p><strong>Sua Key:</strong></p>
                            <div class="key-display">\${data.key}</div>
                            <button class="copy-btn" onclick="copyToClipboard('\${data.key}')">📋 Copiar Key</button>
                            <p style="margin-top: 15px;"><strong>Link Encurtado:</strong></p>
                            <div class="key-display"><a href="\${data.shortLink}" target="_blank" style="color: #cccccc;">\${data.shortLink}</a></div>
                            <button class="copy-btn" onclick="copyToClipboard('\${data.shortLink}')">📋 Copiar Link</button>
                            <p style="margin-top: 10px; font-size: 0.9rem; color: #888;">
                                Criado em: \${new Date(data.createdAt).toLocaleString('pt-BR')}
                            </p>
                        \`;
                    } else {
                        result.className = 'result error';
                        resultContent.innerHTML = \`
                            <h3 style="color: #ff6b6b; margin-bottom: 15px;">❌ Erro ao Gerar Key</h3>
                            <p>\${data.error || 'Erro desconhecido'}</p>
                        \`;
                    }
                } catch (error) {
                    loading.style.display = 'none';
                    result.style.display = 'block';
                    result.className = 'result error';
                    resultContent.innerHTML = \`
                        <h3 style="color: #ff6b6b; margin-bottom: 15px;">❌ Erro de Conexão</h3>
                        <p>Não foi possível conectar ao servidor. Tente novamente.</p>
                    \`;
                } finally {
                    generateBtn.disabled = false;
                }
            });
            
            function copyToClipboard(text) {
                navigator.clipboard.writeText(text).then(() => {
                    // Show toast notification
                    const toast = document.createElement('div');
                    toast.style.cssText = \`
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: rgba(0, 255, 0, 0.2);
                        border: 1px solid rgba(0, 255, 0, 0.5);
                        color: #00ff00;
                        padding: 10px 20px;
                        border-radius: 5px;
                        z-index: 1000;
                        animation: fadeIn 0.3s ease-out;
                    \`;
                    toast.textContent = '✅ Copiado!';
                    document.body.appendChild(toast);
                    
                    setTimeout(() => {
                        toast.remove();
                    }, 2000);
                });
            }
        </script>
    </body>
    </html>`;
    
    res.send(html);
});

// Status das keys (JSON)
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
