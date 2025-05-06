const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Модель для десериализации ответа
class ApiResponse {
    constructor(status, data = null) {
        this.status = status;
        this.data = data ? new ResponseData(data) : null;
    }
}

class ResponseData {
    constructor(data) {
        this.count = data.count || 0;
        this.items = data.items ? data.items.map(item => new SourceItem(item)) : [];
    }
}

class SourceItem {
    constructor(item) {
        this.source = new Source(item.source);
        this.hits = new Hits(item.hits);
    }
}

class Source {
    constructor(source) {
        this.database = source.database || '';
        this.collection = source.collection || '';
    }
}

class Hits {
    constructor(hits) {
        this.hits_count = hits.hits_count || 0;
        this.too_many_docs = hits.too_many_docs || false;
        this.count = hits.count || 0;
        this.items = hits.items ? hits.items.map(hit => new HitItem(hit)) : [];
    }
}

class HitItem {
    constructor(hit) {
        this._id = hit._id ? new Id(hit._id) : null;
        this.full_name = hit.full_name || '';
        this.birth_date = hit.birth_date || '';
        this.region = hit.region || '';
        this.ip_date = hit.ip_date || '';
        this.bailiff_department = hit.bailiff_department || '';
        this.enforcement_proceedings = hit.enforcement_proceedings || '';
        this.reason = hit.reason || '';
        this.debt_amount = hit.debt_amount || '';
        this.inn = hit.inn || '';
        this._score = hit._score || 0;
        this.citizenship = hit.citizenship || '';
        this.gender = hit.gender || '';
        this.contacts = hit.contacts ? new Contacts(hit.contacts) : null;
        this.name = hit.name || '';
        this.surname = hit.surname || '';
        this.middle_name = hit.middle_name || '';
        this.born_location = hit.born_location || '';
        this.phone = hit.phone || '';
        this.code_podr = hit.code_podr || '';
    }
}

class Id {
    constructor(id) {
        this.$oid = id.$oid || '';
    }
}

class Contacts {
    constructor(contacts) {
        this.main = new MainContacts(contacts.main || {});
    }
}

class MainContacts {
    constructor(main) {
        this.phones = main.phones || [];
    }
}

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
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
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjcmVhdGVkX2F0IjoxNzQ2MjkzNDIzLCJhcHBfaWQiOjE3NDYyOTM0MjN9.PwJNoOHX-eyViz7VxxbYipRLHJr60U9iXHQQln7blPM',
                'Content-Type': 'application/json'
            }
        });

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

app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});