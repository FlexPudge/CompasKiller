require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ExcelJS = require('exceljs');
const fetch = require('node-fetch');
const { stringify } = require('csv-stringify');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Настройка Multer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
}).single('excelFile');

// Хранилище данных
let webhooks = [];
let excelData = [];
let excelFileName = null;

// Функция нормализации телефона
const normalizePhone = (phone) => phone.replace(/[\s+()-]/g, '');

// Функция логирования
const logToFile = (message) => {
    fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()}: ${message}\n`);
};

// Функция для запроса к HH.ru
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

// Маршрут для поиска по API (pipegen)
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

        logToFile(`INNFL: ${query} - Result: ${JSON.stringify(apiResponse)}`);
        res.json(apiResponse);
    } catch (error) {
        console.error('Ошибка при запросе к API:', error.message);
        const apiResponse = { status: 'error', data: null };
        logToFile(`INNFL: ${query} - Error: ${error.message}`);
        res.status(500).json(apiResponse);
    }
});

// Главная страница (pipegen)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница вебхуков (HTML из webhook_server.js)
app.get('/webhooks', (req, res) => {
    const webhookTableRows = webhooks.length === 0
        ? '<tr><td colspan="5">Вебхуки пока не получены</td></tr>'
        : webhooks.map(w => `
            <tr>
                <td>${w.id}</td>
                <td>${w.phone}</td>
                <td>${w.title}</td>
                <td>${w.comments}</td>
                <td>${w.timestamp}</td>
            </tr>
        `).join('');

    res.send(`
        <html>
            <head>
                <title>Сервер для обработки вебхуков</title>
                <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
                <h1>Сервер для обработки вебхуков</h1>
                <p>Отправляйте запросы на /webhook с параметрами fields[PHONE][0][VALUE], fields[TITLE], fields[COMMENTS]</p>
                <p><a href="/hh-parser">Перейти к Парсеру HH</a> | <a href="/">Вернуться на главную</a></p>
                <form id="webhook-form" enctype="multipart/form-data">
                    <input type="file" name="excelFile" accept=".xlsx, .xls">
                    <input type="submit" value="Загрузить Excel">
                </form>
                <p id="excel-status">${excelFileName ? `Excel-файл загружен: ${excelFileName}` : 'Excel-файл не загружен'}</p>
                <h2>Полученные вебхуки</h2>
                <table class="webhook-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Телефон</th>
                            <th>Заголовок</th>
                            <th>Комментарий</th>
                            <th>Время</th>
                        </tr>
                    </thead>
                    <tbody id="webhook-table-body">${webhookTableRows}</tbody>
                </table>
                <script src="/script.js"></script>
            </body>
        </html>
    `);
});

// Маршрут для загрузки Excel
app.post('/webhook-upload', upload, async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            logToFile('Ошибка: Файл не загружен');
            return res.status(400).send('Файл не загружен');
        }

        excelFileName = file.originalname;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer);
        const worksheet = workbook.getWorksheet(1);
        excelData = [];

        worksheet.eachRow({ includeEmpty: false }, (row) => {
            excelData.push({
                phone: row.getCell(1).value?.toString() || 'N/A',
                name: row.getCell(2).value?.toString() || 'N/A',
                company: row.getCell(3).value?.toString() || 'N/A'
            });
        });

        logToFile(`Загружен Excel-файл: ${excelFileName}, данные: ${JSON.stringify(excelData)}`);
        res.redirect('/webhooks');
    } catch (error) {
        logToFile(`Ошибка при обработке файла: ${error.message}`);
        res.status(500).send('Ошибка при обработке файла');
    }
});

// Маршрут для вебхуков
app.all('/webhook', async (req, res) => {
    try {
        const phone = normalizePhone(
            req.body?.fields?.PHONE?.[0]?.VALUE ||
            req.query?.fields?.PHONE?.[0]?.VALUE ||
            'N/A'
        );
        const title = req.body?.fields?.TITLE || req.query?.fields?.TITLE || 'N/A';
        const comments = req.body?.fields?.COMMENTS || req.query?.fields?.COMMENTS || 'N/A';

        const webhook = {
            id: webhooks.length + 1,
            phone,
            title,
            comments,
            timestamp: new Date().toLocaleString('ru-RU')
        };
        webhooks.push(webhook);
        logToFile(`Получен вебхук (${req.method}): ${JSON.stringify(webhook)}`);

        const match = excelData.find(row => normalizePhone(row.phone) === phone);
        if (match) {
            const bitrixUrl = 'https://kelin.bitrix24.ru/rest/334/7b2r5tgugcg0bpsg/crm.lead.add.json';
            const bitrixData = {
                FIELDS: {
                    TITLE: match.company,
                    NAME: match.name,
                    PHONE: [{ VALUE: match.phone }]
                }
            };

            // Закомментировано, так как URL недействителен
            /*
            try {
                await axios.post(bitrixUrl, bitrixData);
                logToFile(`Отправлен вебхук в Bitrix24: ${JSON.stringify(bitrixData)}`);
            } catch (error) {
                logToFile(`Ошибка при отправке в Bitrix24: ${error.message}`);
            }
            */
        } else {
            logToFile(`Совпадений телефона в Excel не найдено: ${phone}`);
        }

        res.status(200).json({ message: 'Вебхук успешно получен' });
    } catch (error) {
        logToFile(`Ошибка при обработке вебхука: ${error.message}`);
        res.status(500).send('Ошибка при обработке вебхука');
    }
});

// Маршрут для парсера HH.ru
app.get('/hh-parser', async (req, res) => {
    try {
        const city = req.query.city || '1';
        const dateRange = req.query.dateRange || '7';

        const cities = [
            { id: '1', name: 'Москва' },
            { id: '2', name: 'Санкт-Петербург' },
            { id: '3', name: 'Екатеринбург' },
            { id: '4', name: 'Новосибирск' },
            { id: '66', name: 'Казань' }
        ];

        const now = new Date();
        const dateFrom = new Date(now.setDate(now.getDate() - parseInt(dateRange))).toISOString().split('T')[0];

        const url = `https://api.hh.ru/vacancies?text=юрист&area=${city}&date_from=${dateFrom}&per_page=100`;
        const data = await fetchVacancies(url);

        let vacancies = data.items || [];
        if (!vacancies.length) {
            logToFile('HH: Вакансии не найдены');
        }

        const tableRows = vacancies.length === 0
            ? '<tr><td colspan="6">Вакансии не найдены для заданных параметров</td></tr>'
            : vacancies.map(v => `
                <tr>
                    <td>${v.id}</td>
                    <td>${v.name}</td>
                    <td>${v.employer.name}</td>
                    <td>${v.area.name}</td>
                    <td>${v.salary ? `${v.salary.from || ''} - ${v.salary.to || ''} ${v.salary.currency || ''}` : 'Не указана'}</td>
                    <td>${new Date(v.published_at).toLocaleString('ru-RU')}</td>
                </tr>
            `).join('');

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
            logToFile('HH: CSV не сформирован');
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
            logToFile(`HH: CSV сформирован, ${csvData.length} записей`);
        }

        res.send(`
            <html>
                <head>
                    <title>Парсер HH: Вакансии юристов</title>
                    <link rel="stylesheet" href="/styles.css">
                </head>
                <body>
                    <h1>Парсер HH: Вакансии юристов</h1>
                    <p><a href="/webhooks">Вернуться на главную</a></p>
                    <form action="/hh-parser" method="get">
                        <label for="city">Город:</label>
                        <select name="city" id="city">
                            ${cities.map(c => `<option value="${c.id}" ${c.id === city ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                        <label for="dateRange">Период:</label>
                        <select name="dateRange" id="dateRange">
                            <option value="1" ${dateRange === '1' ? 'selected' : ''}>1 день</option>
                            <option value="7" ${dateRange === '7' ? 'selected' : ''}>7 дней</option>
                            <option value="30" ${dateRange === '30' ? 'selected' : ''}>30 дней</option>
                        </select>
                        <input type="submit" value="Применить фильтры">
                    </form>
                    <p><a href="/download-vacancies">Скачать таблицу (CSV)</a></p>
                    <table class="webhook-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Название</th>
                                <th>Компания</th>
                                <th>Город</th>
                                <th>Зарплата</th>
                                <th>Дата публикации</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </body>
            </html>
        `);
    } catch (error) {
        logToFile(`HH: Ошибка - ${error.message}`);
        res.status(500).send(`
            <html>
                <head><title>Ошибка</title></head>
                <body>
                    <h1>Ошибка при получении вакансий</h1>
                    <p>Не удалось загрузить данные. Попробуйте позже или измените фильтры.</p>
                    <a href="/hh-parser">Вернуться к парсеру</a> | <a href="/webhooks">На главную</a>
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
                logToFile(`HH: Ошибка скачивания CSV - ${err.message}`);
                res.status(500).send('Ошибка при скачивании файла');
            }
        });
    } else {
        logToFile('HH: CSV пуст или не существует');
        res.status(404).send('Файл не найден или пуст');
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});