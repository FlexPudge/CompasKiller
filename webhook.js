const ExcelJS = require('exceljs');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

let excelData = [];
let excelFileName = null;
let webhooks = [];

// Функция нормализации телефона
const normalizePhone = (phone) => phone.replace(/[\s+()-]/g, '');

// Функция логирования
const logToFile = (message) => {
    fs.appendFileSync(path.join(__dirname, 'results.txt'), `${new Date().toISOString()}: ${message}\n`);
};

// Обработка загрузки Excel
async function processExcel(file) {
    try {
        if (!file) {
            logToFile('Ошибка: Файл не загружен');
            throw new Error('Файл не загружен');
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
        return { success: true, fileName: excelFileName };
    } catch (error) {
        logToFile(`Ошибка при обработке файла: ${error.message}`);
        throw error;
    }
}

// Обработка вебхука
async function processWebhook(data) {
    try {
        const phone = normalizePhone(
            data?.fields?.PHONE?.[0]?.VALUE || 'N/A'
        );
        const title = data?.fields?.TITLE || 'N/A';
        const comments = data?.fields?.COMMENTS || 'N/A';

        const webhook = {
            id: webhooks.length + 1,
            phone,
            title,
            comments,
            timestamp: new Date().toLocaleString('ru-RU')
        };

        webhooks.push(webhook);
        logToFile(`Получен вебхук: ${JSON.stringify(webhook)}`);

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

            try {
                await axios.post(bitrixUrl, bitrixData);
                logToFile(`Отправлен вебхук в Bitrix24: ${JSON.stringify(bitrixData)}`);
            } catch (error) {
                logToFile(`Ошибка при отправке в Bitrix24: ${error.message}`);
            }
        } else {
            logToFile(`Совпадений телефона в Excel не найдено: ${phone}`);
        }

        return webhook;
    } catch (error) {
        logToFile(`Ошибка при обработке вебхука: ${error.message}`);
        throw error;
    }
}

// Получение списка вебхуков
function getWebhooks() {
    return webhooks;
}

module.exports = { processExcel, processWebhook, getWebhooks };