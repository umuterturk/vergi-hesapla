// Global calculator instance
let calculator = null;

let activeWarnings = new Set(); // To store unique warnings

// Güvenli bir şekilde sayısal değerleri formatla
function formatNumber(value, decimals = 2) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return parseFloat(value).toFixed(decimals);
}

document.getElementById('uploadPdf').addEventListener('change', function(event) {
    const files = event.target.files;
    const fileCounter = document.getElementById('fileCounter');
    
    if (files.length > 0) {
        // Hata mesajını ve önceki tabloyu temizle
        document.getElementById('tableContainer').innerHTML = '';
        
        // Dosya sayacını güncelle
        fileCounter.innerHTML = `
            <i class="fas fa-file-pdf"></i>
            ${files.length} adet ekstre yüklendi
        `;
        fileCounter.className = 'file-counter success';
        
        let allData = [];
        let processedFiles = 0;

        // Mevcut ayarlarla hesaplayıcıyı sıfırla
        const vergiDonemi = document.getElementById('vergiDonemi').value;
        const vergiOrani = parseFloat(document.getElementById('vergiOrani').value) / 100;
        calculator = new TaxCalculator(
            YIUFE_DATA, 
            TCMB_RATES, 
            vergiDonemi, 
            vergiOrani,
            showWarning // Pass the UI warning function
        );

        for (let file of files) {
            const reader = new FileReader();
            reader.onload = function() {
                extractInvestmentTable(reader.result, allData, () => {
                    processedFiles++;
                    if (processedFiles === files.length) {
                        // Verileri kronolojik olarak sırala
                        allData.sort((a, b) => parseDate(a[0]) - parseDate(b[0]));
                        displayTable(allData);
                    }
                });
            };
            reader.readAsArrayBuffer(file);
        }
    } else {
        // Hiçbir dosya seçilmediğinde sayacı temizle
        fileCounter.innerHTML = '';
        fileCounter.className = 'file-counter';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const disclaimerAccepted = localStorage.getItem('disclaimerAccepted');
    const disclaimerVersion = '2.0';
    const disclaimerContainer = document.getElementById('disclaimerContainer');
    
    if (disclaimerAccepted === disclaimerVersion) {
        document.getElementById('disclaimerAccept').checked = true;
        document.getElementById('uploadPdf').disabled = false;
        disclaimerContainer.classList.add('accepted');
    }
});

document.getElementById('disclaimerAccept').addEventListener('change', function() {
    const disclaimerContainer = document.getElementById('disclaimerContainer');
    
    if (this.checked) {
        localStorage.setItem('disclaimerAccepted', '2.0');
        document.getElementById('uploadPdf').disabled = false;
        disclaimerContainer.classList.add('accepted');
    } else {
        localStorage.removeItem('disclaimerAccepted');
        document.getElementById('uploadPdf').disabled = true;
        disclaimerContainer.classList.remove('accepted');
    }
});

// Dosya yükleme alanına tıklandığında kontrol
document.querySelector('.file-upload-label').addEventListener('click', function(e) {
    const disclaimerAccepted = document.getElementById('disclaimerAccept').checked;
    
    if (!disclaimerAccepted) {
        e.preventDefault();
        showPopup();
    }
});

function showPopup() {
    document.getElementById('popup').style.display = 'flex';
}

function closePopup() {
    document.getElementById('popup').style.display = 'none';
    // Sorumluluk beyanına kaydır
    document.querySelector('.disclaimer').scrollIntoView({ 
        behavior: 'smooth',
        block: 'center'
    });
}

// Popup dışına tıklandığında kapatma
document.getElementById('popup').addEventListener('click', function(e) {
    if (e.target === this) {
        closePopup();
    }
});

function debug_log(message) {
    if (DEBUG_MODE) {
        console.log(message);
    }
}

async function extractInvestmentTable(pdfData, allData, callback) {
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    let extractedText = "";

    debug_log("PDF Yüklendi. Toplam sayfa sayısı:", pdf.numPages);

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map(item => item.str).join(" ");

        debug_log(`--- Sayfa ${i} İçeriği ---`);
        debug_log(textItems);

        extractedText += textItems + " ";
    }

    let match = extractedText.match(/YATIRIM İŞLEMLERİ\s+\(.*?\)\s+\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{2}\/\d{2}\s+(.*?)\s+HESAP İŞLEMLERİ/);
    if (match && match[1]) {
        let tableText = match[1].trim();
        debug_log("Çıkarılan Tablo Metni:", tableText);
        let parsedData = parseTableData(tableText);
        allData.push(...parsedData);
    } else {
        debug_log("Bu dosyada yatırım işlemi bulunamadı.");
    }

    callback();
}

function parseTableData(tableText) {
    let datePattern = /\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/g;
    let matches = [...tableText.matchAll(datePattern)];
    
    let structuredData = [];
    debug_log("Bulunan tarih eşleşmeleri:", matches); // Debug için

    matches.forEach((match, index) => {
        let date = match[0];
        let start = match.index + match[0].length;
        let end = (index < matches.length - 1) ? matches[index + 1].index : tableText.length;
        
        let rowContent = tableText.substring(start, end).trim();
        let rowData = rowContent.split(/\s{2,}/);
        rowData.unshift(date);

        // Veri doğrulama
        if (rowData.length < 11) {
            console.warn("Eksik veri:", rowData);
            return;
        }

        // Virgülü nokta yap ve sayısal değerleri temizle
        for (let i = 6; i <= 11; i++) {
            if (rowData[i]) {
                rowData[i] = rowData[i].replace(/[^\d,.-]/g, '').replace(',', '.');
            }
        }

        debug_log("İşlenmiş satır:", rowData); // Debug için
        structuredData.push(rowData);
    });

    return structuredData;
}

function parseDate(dateString) {
    const [day, month, year, time] = dateString.split(/\/|\s+/);
    const [hour, minute, second] = time.split(":");
    const fullYear = `20${year}`; // "24" -> "2024" dönüşümü

    return new Date(fullYear, month - 1, day, hour, minute, second);
}

// YI-ÜFE verilerini işlemek için yardımcı fonksiyonlar
function parseYiufeData(yiufeText) {
    const lines = yiufeText.trim().split('\n').slice(1); // Başlığı atla
    const yiufeMap = new Map();
    
    lines.forEach(line => {
        const [date, value] = line.split('\t');
        const [month, year] = date.split('-');
        const key = `${year}${month.padStart(2, '0')}`;
        yiufeMap.set(key, parseFloat(value));
    });
    
    return yiufeMap;
}

function displayTable(data) {
    // Clear warnings when starting new calculation
    activeWarnings.clear();
    
    debug_log("Gelen veri:", data);
    
    // Verileri daha sonra kullanmak için sakla
    lastProcessedData = data;
    
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    const vergiOrani = parseFloat(document.getElementById('vergiOrani').value) / 100;
    
    // Mevcut ayarlarla hesaplayıcıyı sıfırla
    calculator = new TaxCalculator(
        YIUFE_DATA, 
        TCMB_RATES, 
        vergiDonemi, 
        vergiOrani,
        showWarning // Pass the UI warning function
    );
    
    try {
        const { allTransactions, totalTaxableProfit } = calculator.calculateTotalTaxableProfit(data, calculator);
        debug_log("İşlenmiş işlemler:", allTransactions);

        if (allTransactions.length === 0) {
            showError("İşlenebilecek işlem bulunamadı.");
            return;
        }

        // Özet HTML oluşturma
        let summaryHtml = `
        <div class="summary-container">
            <strong>Toplam Vergiye Tabi Kazanç (TL): 
                <span class="${totalTaxableProfit >= 0 ? 'positive-value' : 'negative-value'}">
                    ${formatNumber(totalTaxableProfit)}
                </span>
            </strong>
            <strong>Ödenecek Vergi (%${vergiOrani * 100}) (TL): 
                <span class="${totalTaxableProfit >= 0 ? 'negative-value' : 'positive-value'}">
                    ${formatNumber(totalTaxableProfit * vergiOrani)}
                </span>
            </strong>
            <strong>Vergi Sonrası Toplam Kazanç (TL): 
                <span class="${(totalTaxableProfit * (1 - vergiOrani)) >= 0 ? 'positive-value' : 'negative-value'}">
                    ${formatNumber(totalTaxableProfit * (1 - vergiOrani))}
                </span>
            </strong>
        </div>
        <div class="table-container">
    `;

        // Tablo HTML'ini oluştur
        let tableHtml = `<div class="table-container">`;
        tableHtml += createTableHeader();

        // İşlemleri tabloya ekle
        allTransactions.forEach(transaction => {
            tableHtml += createTableRow(transaction);
        });

        tableHtml += `</tbody></table></div>`;

        // HTML'i sayfaya ekle
        document.getElementById('tableContainer').innerHTML = summaryHtml + tableHtml;

    } catch (error) {
        console.error("Hesaplama hatası:", error);
        showError("Hesaplama sırasında bir hata oluştu: " + error.message);
    }
}

function createTableHeader() {
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    return `<table>
        <thead class="sticky-header">
            <tr>
                <th colspan="23" style="text-align: center; background-color: #e6e6e6;">
                    USD BAZLI YATIRIM İŞLEMLERİ ${vergiDonemi}
                </th>
            </tr>
            <tr>
                <th>Tarih</th>
                <th>Vergi Dönemi</th>
                <th>İşlem Türü</th>
                <th>Sembol</th>
                <th>İşlem Tipi</th>
                <th>İşlem Durumu</th>
                <th>Para Birimi</th>
                <th>Adet</th>
                <th>Ortalama İşlem Fiyatı (USD)</th>
                <th>İşlem Ücreti (USD)</th>
                <th>İşlem Tutarı (USD)</th>
                <th>İşlem Tutarı (TL)</th>
                <th>Alış Tarihi</th>
                <th>Alış Fiyatı (USD)</th>
                <th>Alış Kuru (TL/USD)</th>
                <th>Alış Yİ-ÜFE</th>
                <th>Satış Kuru (TL/USD)</th>
                <th>Satış Yİ-ÜFE</th>
                <th>Yİ-ÜFE Değişimi</th>
                <th>Nominal Alım Tutarı (TL)</th>
                <th>Reel Alım Tutarı (TL)</th>
                <th>Vergiye Tabi Kazanç (TL)</th>
                <th>Vergi (TL)</th>
            </tr>
        </thead>
        <tbody>`;
}

function createTableRow(transaction) {
    const isSale = transaction.type === 'split';  // 'isSatis' yerine 'isSale' kullanılacak
    
    // Kur ve Yİ-ÜFE değerlerini güvenli bir şekilde al
    const buyExchangeRate = isSale && transaction.buyExchangeRate ? formatNumber(transaction.buyExchangeRate, 4) : '-';
    const sellExchangeRate = isSale && transaction.sellExchangeRate ? formatNumber(transaction.sellExchangeRate, 4) : '-';
    const buyYiufe = isSale && transaction.buyYiufe ? formatNumber(transaction.buyYiufe, 2) : '-';
    const sellYiufe = isSale && transaction.sellYiufe ? formatNumber(transaction.sellYiufe, 2) : '-';
    
    // Yİ-ÜFE değişim oranını hesapla
    let yiufeChange = '-';
    let isInflationAdjusted = false;
    if (isSale && buyYiufe !== '-' && sellYiufe !== '-') {
        const buyYiufeVal = parseFloat(transaction.buyYiufe);
        const sellYiufeVal = parseFloat(transaction.sellYiufe);
        if (!isNaN(buyYiufeVal) && !isNaN(sellYiufeVal) && buyYiufeVal !== 0) {
            const changePercent = ((sellYiufeVal - buyYiufeVal) / buyYiufeVal) * 100;
            yiufeChange = formatNumber(changePercent, 2) + '%';
            isInflationAdjusted = changePercent > 10;
        }
    }
    
    // İşlem Tutarı hesapla (USD ve TL cinsinden)
    let islemTutariUSD = '-';
    let islemTutariTL = '-';
    if (isSale) {
        const amount = parseFloat(transaction.amount);
        const price = parseFloat(transaction[9]);
        const exchangeRate = parseFloat(transaction.sellExchangeRate);
        if (!isNaN(amount) && !isNaN(price)) {
            islemTutariUSD = formatNumber(amount * price);
            if (!isNaN(exchangeRate)) {
                islemTutariTL = formatNumber(amount * price * exchangeRate);
            }
        }
    } else {
        const amount = parseFloat(transaction[8]);
        const price = parseFloat(transaction[9]);
        const exchangeRate = parseFloat(transaction.buyExchangeRate);
        if (!isNaN(amount) && !isNaN(price)) {
            islemTutariUSD = formatNumber(amount * price);
            if (!isNaN(exchangeRate)) {
                islemTutariTL = formatNumber(amount * price * exchangeRate);
            }
        }
    }
    
    // Nominal ve Reel Alım Tutarı hesapla
    let nominalBuyValue = '-';
    let reelBuyValue = '-';
    let vergiyeTabiKazanc = '-';
    
    if (isSale) {
        const amount = parseFloat(transaction.amount);
        const buyPrice = parseFloat(transaction.buyPrice);
        const buyRate = parseFloat(transaction.buyExchangeRate);
        const buyYiufeVal = parseFloat(transaction.buyYiufe);
        const sellYiufeVal = parseFloat(transaction.sellYiufe);
        
        if (!isNaN(amount) && !isNaN(buyPrice) && !isNaN(buyRate)) {
            const nominal = amount * buyPrice * buyRate;
            nominalBuyValue = formatNumber(nominal);
            
            if (!isNaN(buyYiufeVal) && !isNaN(sellYiufeVal) && buyYiufeVal !== 0) {
                const yiufeChange = ((sellYiufeVal - buyYiufeVal) / buyYiufeVal) * 100;
                
                const satisTutari = parseFloat(islemTutariTL);
                let kazanc = 0;
                
                if (yiufeChange > 10) {
                    const reelAlimTutari = nominal * (sellYiufeVal / buyYiufeVal);
                    reelBuyValue = formatNumber(reelAlimTutari);
                    kazanc = satisTutari - reelAlimTutari;
                } else {
                    reelBuyValue = nominalBuyValue;
                    kazanc = satisTutari - nominal;
                }
                
                // Show all taxable amounts, including negative ones
                vergiyeTabiKazanc = formatNumber(kazanc);
            }
        }
    }
    
    // Vergi hesaplama
    const vergiOrani = parseFloat(document.getElementById('vergiOrani').value) / 100;
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    let vergiTutari = '-';
    
    if (isSale) {
        const [day, month, year] = transaction[0].split(' ')[0].split('/');
        const satisYili = "20" + year;
        
        if (vergiyeTabiKazanc !== '-') {
            if (satisYili === vergiDonemi) {
                vergiTutari = (parseFloat(vergiyeTabiKazanc) * vergiOrani).toFixed(2);
            } else {
                vergiTutari = `0 (${vergiDonemi} için)`;
            }
        }
    }

    // Vergi tutarı için stil belirleme
    const vergiStyle = vergiTutari !== '-' && !vergiTutari.includes('için') && parseFloat(vergiTutari) !== 0 
        ? parseFloat(vergiTutari) < 0 ? 'style="color: #28a745; font-weight: bold;"' : 'style="color: #dc3545; font-weight: bold;"' 
        :  '';

    // Adet değerini tabloda gösterirken 2 hane, veri olarak tam haliyle sakla
    const amount = isSale ? transaction.amount : transaction[8];
    const displayAmount = formatNumber(amount, 2);
    const actualAmount = amount;  // Orijinal değeri koru

    return `<tr>
        <td>${transaction[0]}</td>
        <td>${isSale ? transaction.vergiDonemi : '-'}</td>
        <td>${transaction[1]}</td>
        <td>${transaction[2]}</td>
        <td>${transaction[3]}</td>
        <td>${transaction[4]}</td>
        <td>${transaction[5] || 'USD'}</td>
        <td data-value="${actualAmount}">${displayAmount}</td>
        <td>${formatNumber(transaction[9])}</td>
        <td>${formatNumber(transaction[10] || 0)}</td>
        <td>${islemTutariUSD}</td>
        <td>${islemTutariTL}</td>
        <td>${isSale ? transaction.buyDate : '-'}</td>
        <td>${isSale ? formatNumber(transaction.buyPrice) : '-'}</td>
        <td>${buyExchangeRate}</td>
        <td>${buyYiufe}</td>
        <td>${sellExchangeRate}</td>
        <td>${sellYiufe}</td>
        <td style="color: ${isInflationAdjusted ? '#28a745' : 'inherit'}">${yiufeChange}</td>
        <td>${nominalBuyValue}</td>
        <td>${reelBuyValue}</td>
        <td>${vergiyeTabiKazanc}</td>
        <td ${vergiStyle}>${vergiTutari}</td>
    </tr>`;
}

// Vergi dönemi güncelleme işlemi
document.getElementById('vergiDonemi').addEventListener('change', function() {
    if (calculator && lastProcessedData) {
        displayTable(lastProcessedData);
    }
});

// Vergi oranı güncelleme işlemi
document.getElementById('vergiOrani').addEventListener('change', function() {
    if (calculator && lastProcessedData) {
        displayTable(lastProcessedData);
    }
});

// CSV indirme işlemi
function downloadCSV() {
    const table = document.querySelector('table');
    let csv = [];
    
    // Başlıkları al
    const headers = [];
    table.querySelectorAll('tr:nth-child(2) th').forEach(header => {
        headers.push(header.textContent);
    });
    csv.push(headers.join(','));
    
    // Verileri al
    table.querySelectorAll('tbody tr').forEach(row => {
        const rowData = [];
        row.querySelectorAll('td').forEach((cell, index) => {
            // Adet kolonu için data-value kullan
            let value;
            if (index === 7) { // Adet kolonu
                value = cell.getAttribute('data-value') || cell.textContent;
            } else {
                value = cell.textContent;
            }
            
            // Virgülleri ve tırnak işaretlerini kontrol et
            value = value.replace(/"/g, '""');
            if (value.includes(',')) {
                value = `"${value}"`;
            }
            rowData.push(value);
        });
        csv.push(rowData.join(','));
    });
    
    // CSV dosyasını oluştur ve indir
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    
    link.href = URL.createObjectURL(blob);
    link.download = `usd_bazli_yatirim_islemleri_${vergiDonemi}.csv`;
    link.click();
}

// Excel indirme işlemi
function downloadExcel() {
    const table = document.querySelector('table');
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    const wb = XLSX.utils.book_new();
    
    // Tabloyu işle ve Adet kolonunu data-value'dan al
    const rows = [];
    const headerRow = Array.from(table.querySelectorAll('tr:nth-child(2) th')).map(th => th.textContent);
    rows.push(headerRow);
    
    table.querySelectorAll('tbody tr').forEach(tr => {
        const row = Array.from(tr.querySelectorAll('td')).map((td, index) => {
            if (index === 7) { // Adet kolonu
                return td.getAttribute('data-value') || td.textContent;
            }
            return td.textContent;
        });
        rows.push(row);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    // Excel dosyasını oluştur
    XLSX.utils.book_append_sheet(wb, ws, 'USD Bazlı Yatırım İşlemleri');
    
    // İndir
    XLSX.writeFile(wb, `usd_bazli_yatirim_islemleri_${vergiDonemi}.xlsx`);
}

document.addEventListener('DOMContentLoaded', function() {
    if (SHOW_BUY_ME_COFFEE) {
        const coffeeButton = document.getElementById('coffeeButton');
        if (coffeeButton) {
            coffeeButton.style.display = 'flex';
        }
    }

    // İndirme butonlarını başlangıçta gizle
    const downloadButtons = document.querySelectorAll('.download-button');
    downloadButtons.forEach(button => {
        button.style.display = 'none';
    });
});

function showError(message, showMail = true) {
    const container = document.getElementById('tableContainer');
    container.innerHTML = `
        <div class="error-message" style="color: #dc3545; padding: 20px; text-align: center; border: 1px solid #dc3545; border-radius: 4px; margin: 20px 0;">
            <p>😟 ${message}</p>
            ${showMail ? '<p>Sorunuz varsa <a href="https://x.com/@CodeOnBrew">x.com/@CodeOnBrew</a> adresine ulaşabilirsiniz.</p>' : ''}
        </div>
    `;
}

function showWarning(message) {
    activeWarnings.add(message);
    updateWarningsDisplay();
}

function updateWarningsDisplay() {
    const existingWarnings = document.getElementById('warningsContainer');
    if (existingWarnings) {
        existingWarnings.remove();
    }
    
    if (activeWarnings.size === 0) return;

    const warningsHtml = `
        <div id="warningsContainer" class="warnings-container">
            ${Array.from(activeWarnings).map(warning => `
                <div class="warning-alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>${warning}</span>
                    <button onclick="dismissWarning('${warning.replace(/'/g, "\\'")}')" class="dismiss-warning">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('')}
            ${activeWarnings.size > 1 ? `
                <button onclick="dismissAllWarnings()" class="dismiss-all-warnings">
                    Tüm Uyarıları Kapat
                </button>
            ` : ''}
        </div>
    `;

    const tableContainer = document.getElementById('tableContainer');
    tableContainer.insertAdjacentHTML('afterbegin', warningsHtml);
}

function dismissWarning(warning) {
    activeWarnings.delete(warning);
    updateWarningsDisplay();
}

function dismissAllWarnings() {
    activeWarnings.clear();
    updateWarningsDisplay();
}

// Make functions available globally
window.dismissWarning = dismissWarning;
window.dismissAllWarnings = dismissAllWarnings;

// Add this to your file processing function to clear warnings
function processFiles(files) {
    // Clear any existing warnings when starting new calculation
    const warningPopup = document.getElementById('warningPopup');
    warningPopup.style.display = 'none';
    
    // ... rest of your file processing code ...
}
