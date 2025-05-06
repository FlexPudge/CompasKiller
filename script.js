document.querySelectorAll('.header-left button').forEach(button => {
    button.addEventListener('click', function() {
        document.querySelectorAll('.header-left button').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
    });
});

const createSegment = document.querySelector('.create-segment');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');

createSegment.addEventListener('click', function() {
    fileInput.click();
});

fileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const content = document.querySelector('.content');
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="title">${file.name}</div>
            <button class="delete-btn">Удалить</button>
        `;
        content.appendChild(card);

        card.querySelector('.delete-btn').addEventListener('click', function() {
            card.remove();
            fileInfo.style.display = 'none';
        });

        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const firstRow = jsonData[0];

            console.log('Первая строка:', firstRow);

            const innflIndex = firstRow.indexOf("ИННФЛ руководителя");
            if (innflIndex !== -1) {
                const columnData = jsonData.slice(1).map(row => row[innflIndex] || '');
                console.log('Столбец "ИННФЛ руководителя":', columnData);

                // Добавление нового столбца "Phone"
                const phoneIndex = firstRow.length; // Новый столбец в конце
                firstRow.push("Phone"); // Добавляем заголовок в первую строку

                // Массив промисов для всех запросов
                const fetchPromises = columnData.map((innfl, index) => {
                    if (innfl) {
                        return fetch(`/api/search?q=${encodeURIComponent(innfl)}`, {
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                            .then(response => {
                                if (!response.ok) {
                                    throw new Error(`HTTP error! status: ${response.status}`);
                                }
                                return response.json();
                            })
                            .then(data => {
                                const apiResponse = new ApiResponse(
                                    data.status || 'success',
                                    data.data
                                );
                                console.log(`Ответ для INNFL ${innfl} (элемент ${index + 1}):`, apiResponse);

                                // Поиск номеров телефона, начинающихся с +7
                                let phones = [];
                                if (apiResponse.data && apiResponse.data.items) {
                                    for (let item of apiResponse.data.items) {
                                        if (item.hits && item.hits.items) {
                                            for (let hit of item.hits.items) {
                                                if (hit.contacts && hit.contacts.main && hit.contacts.main.phones) {
                                                    phones = phones.concat(
                                                        hit.contacts.main.phones.filter(phone => phone && phone.startsWith('+7'))
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                                // Записываем первый найденный номер с +7 или "Не найден"
                                jsonData[index + 1][phoneIndex] = phones.length > 0 ? phones[0] : 'Не найден';
                            })
                            .catch(error => {
                                console.error(`Ошибка при запросе для INNFL ${innfl} (элемент ${index + 1}):`, error);
                                jsonData[index + 1][phoneIndex] = 'Ошибка';
                            });
                    }
                    return Promise.resolve(); // Для пустых или недействительных innfl
                });

                // Ждем завершения всех запросов перед сохранением
                Promise.all(fetchPromises).then(() => {
                    // Преобразование данных обратно в рабочую книгу и сохранение
                    const newWorksheet = XLSX.utils.aoa_to_sheet(jsonData);
                    workbook.Sheets[firstSheetName] = newWorksheet;
                    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
                    const blob = new Blob([new Uint8Array(wbout)], { type: 'application/octet-stream' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `updated_${file.name}`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                });
            }

            const rowCount = jsonData.length - 1;

            fileInfo.style.display = 'block';
            fileInfo.innerHTML = `
                <h3>Информация о файле</h3>
                <p>Название: ${file.name}</p>
                <p>Размер: ${(file.size / 1024).toFixed(2)} КБ</p>
                <p>Количество строк: ${rowCount}</p>
            `;
        };
        reader.readAsArrayBuffer(file);

        fileInput.value = '';
    }
});

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