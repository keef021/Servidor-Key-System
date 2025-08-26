const express = require('express');
const fs = require('fs-extra');
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const KEYS_FILE = './keys.json';
let keys = [];
if (fs.existsSync(KEYS_FILE)) {
    keys = fs.readJsonSync(KEYS_FILE);
}

function saveKeys() {
    fs.writeJsonSync(KEYS_FILE, keys);
}

function generateKey() {
    return crypto.randomBytes(4).toString('hex') + '-' + crypto.randomBytes(4).toString('hex');
}

// -------------------- Endpoints -------------------- //

// Gerar key (apenas via Monetizzy)
app.post('/gerar', async (req, res) => {
    const { monetizzyToken, link } = req.body;

    if (!monetizzyToken) return res.status(403).json({ error: "Token não fornecido" });

    try {
        // Criar link encurtado no Monetizzy
        const response = await axios.post('https://api.monetizzy.com/api/shorten/link', {
            link,
            domain: 'ufly.monetizzy.com',
            type: 4
        }, {
            headers: { 'Authorization': `Bearer ${monetizzyToken}` }
        });

        // Link encurtado válido → gera key
        if (response.data?.shortened_url) {
            const key = generateKey();
            keys.push({ key, used: false });
            saveKeys();
            return res.json({ key, shortLink: response.data.shortened_url });
        } else {
            return res.status(400).json({ error: "Erro ao gerar link" });
        }

    } catch (err) {
        return res.status(500).json({ error: "Erro na API Monetizzy", details: err.message });
    }
});

// Validar key (Roblox)
app.post('/validar', (req, res) => {
    const { key } = req.body;
    const found = keys.find(k => k.key === key);

    if (!found) return res.status(404).json({ valid: false });
    if (found.used) return res.json({ valid: false, message: "Key já usada" });

    found.used = true;
    saveKeys();
    res.json({ valid: true });
});

// Health check
app.get('/', (req, res) => res.send("Key System Monetizzy rodando!"));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
    
