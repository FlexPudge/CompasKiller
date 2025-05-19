require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'https://your-app-domain.timeweb.cloud');
    next();
});

app.options('/api/search', (req, res) => {
    res.status(200).end();
});

// Маршрут для поиска по API
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
            }
        });

        const apiResponse = {
            status: response.data.status || 'success',
            data: response.data.data
        };

        const resultText = `${new Date().toISOString()} - INNFL: ${query} - Result: ${JSON.stringify(apiResponse)}\n`;
        fs.appendFileSync(path.join(__dirname, 'results.txt'), resultText, 'utf8');

        res.json(apiResponse);
    } catch (error) {
        console.error('Ошибка при запросе к API:', error.message);
        const apiResponse = { status: 'error', data: null };
        const errorText = `${new Date().toISOString()} - INNFL: ${query} - Error: ${error.message}\n`;
        fs.appendFileSync(path.join(__dirname, 'results.txt'), errorText, 'utf8');
        res.status(500).json(apiResponse);
    }
});

// Функция для запроса к HH.ru с повторными попытками
const fetchVacancies = async (url, retries = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Маршрут для страницы парсера HH.ru
app.get('/hh-parser', async (req, res) => {
    try {
        const city = req.query.city || '1'; // Москва по умолчанию
        const dateRange = req.query.dateRange || '7'; // 7 дней по умолчанию

        // Справочник городов
        const cities = [
            { id: '1', name: 'Москва' },
            { id: '2', name: 'Санкт-Петербург' },
            { id: '3', name: 'Екатеринбург' },
            { id: '4', name: 'Новосибирск' },
            { id: '66', name: 'Казань' }
        ];

        // Вычисление даты начала
        const now = new Date();
        const dateFrom = new Date(now.setDate(now.getDate() - parseInt(dateRange))).toISOString().split('T')[0];

        // Запрос к HH.ru API
        const url = `https://api.hh.ru/vacancies?text=юрист&area=${city}&date_from=${dateFrom}&per_page=100`;
        const data = await fetchVacancies(url);

        // Обработка вакансий
        let vacancies = data.items || [];
        if (!vacancies.length) {
            fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()} - HH: Вакансии не найдены\n`);
        }

        // Формирование CSV
        const csvData = vacancies.map(v => ({
            ID: v.id,
            Название: v.name,
            Компания: v.employer.name,
            Город: v.area.name,
            Зарплата: v.salary ? `${v.salary.from || ''} - ${v.salary.to || ''} ${v.salary.currency || ''}` : 'Не указана',
            Дата_публикации: new Date(v.published_at).toLocaleString('ru-RU')
        }));

        if (csvData.length === 0) {
            fs.writeFileSync('vacancies.csv', '');
            fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()} - HH: CSV не сформирован\n`);
        } else {
            const csvString = await new Promise((resolve, reject) => {
                stringify(csvData, {
                    header: true,
                    columns: ['ID', 'Название', 'Компания', 'Город', 'Зарплата', 'Дата_публикации'],
                    quoted: true
                }, (err, output) => {
                    if (err) reject(err);
                    resolve(output);
                });
            });
            fs.writeFileSync('vacancies.csv', csvString);
            fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()} - HH: CSV сформирован, ${csvData.length} записей\n`);
        }

        // Рендеринг страницы
        res.sendFile(path.join(__dirname, 'public', 'hh-parser.html'));
    } catch (error) {
        console.error('Ошибка при парсинге HH:', error.message);
        fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()} - HH: Ошибка - ${error.message}\n`);
        res.status(500).send(`
            <html>
                <head><title>Ошибка</title></head>
                <body>
                    <h1>Ошибка при получении вакансий</h1>
                    <p>Не удалось загрузить данные. Попробуйте позже или измените фильтры.</p>
                    <a href="/hh-parser">Вернуться к парсеру</a> | <a href="/">На главную</a>
                </body>
            </html>
        `);
    }
});

// Маршрут для скачивания CSV
app.get('/download-vacancies', (req, res) => {
    const file = path.join(__dirname, 'vacancies.csv');
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
        res.download(file, 'vacancies.csv', (err) => {
            if (err) {
                console.error('Ошибка при скачивании CSV:', err.message);
                fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()} - HH: Ошибка скачивания CSV - ${err.message}\n`);
                res.status(500).send('Ошибка при скачивании файла');
            }
        });
    } else {
        fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()} - HH: CSV пуст или не существует\n`);
        res.status(404).send('Файл не найден или пуст');
    }
});

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});