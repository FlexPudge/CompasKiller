document.querySelectorAll('.header-left button').forEach(button => {
    button.addEventListener('click', function() {
        document.querySelectorAll('.header-left button').forEach(btn => btn.classList.remove('active'));
        this.classList.add('active');
    });
});

// Логика для pipegen (загрузка Excel с ИННФЛ)
const createSegment = document.querySelector('.create-segment');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');

if (createSegment && fileInput && fileInfo) {
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

                    const phoneIndex = firstRow.length;
                    firstRow.push("Phone");

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
                                    return response.text();
                                })
                                .then(text => {
                                    console.log(`Ответ для INNFL ${innfl} (элемент ${index + 1}):`, text);

                                    const phoneRegex = /"phone":\s*"\+7\d+"/g;
                                    const matches = [...text.matchAll(phoneRegex)];
                                    let phones = matches.map(match => match[0].replace(/"phone":\s*"/, '').replace(/"/, ''));

                                    jsonData[index + 1][phoneIndex] = phones.length > 0 ? phones.join(', ') : 'Не найден';
                                })
                                .catch(error => {
                                    console.error(`Ошибка при запросе для INNFL ${innfl} (элемент ${index + 1}):`, error);
                                    jsonData[index + 1][phoneIndex] = 'Ошибка';
                                });
                        }
                        return Promise.resolve();
                    });

                    Promise.all(fetchPromises).then(() => {
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
}

// Логика для страницы /webhooks
if (window.location.pathname === '/webhooks') {
    const webhookForm = document.getElementById('webhook-form');
    const excelStatus = document.getElementById('excel-status');
    const webhookTableBody = document.getElementById('webhook-table-body');

    if (webhookForm && excelStatus && webhookTableBody) {
        webhookForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const formData = new FormData(webhookForm);

            fetch('/webhook-upload', {
                method: 'POST',
                body: formData
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Ошибка загрузки файла');
                    }
                    return response.text();
                })
                .then(() => {
                    window.location.reload(); // Обновляем страницу для отображения статуса
                })
                .catch(error => {
                    excelStatus.textContent = `Ошибка: ${error.message}`;
                    excelStatus.style.color = 'red';
                });
        });
    }
}