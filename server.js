require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://your-app-domain.timeweb.cloud');
    next();
});

app.options('/api/search', (req, res) => {
    res.status(200).end();
});

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Параметр q обязателен' });
    }

    try {
        const response = await axios.get(`https://api.usersbox.ru/v1/search?q=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${process.env.API_TOKEN}`,
                'Content-Type': 'application/json'
            }});

        const apiResponse = new ApiResponse(
            response.data.status || 'success',
            response.data.data
        );

        const resultText = `${new Date().toISOString()} - INNFL: ${query} - Result: ${JSON.stringify(apiResponse)}\n`;
        fs.appendFileSync(path.join(__dirname, 'results.txt'), resultText, 'utf8');

        res.json(apiResponse);
    } catch (error) {
        console.error('Ошибка при запросе к API:', error.message);
        const apiResponse = new ApiResponse('error');
        const errorText = `${new Date().toISOString()} - INNFL: ${query} - Error: ${error.message}\n`;
        fs.appendFileSync(path.join(__dirname, 'results.txt'), errorText, 'utf8');
        res.status(500).json(apiResponse);
    }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});