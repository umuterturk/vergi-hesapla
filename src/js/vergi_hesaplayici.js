const DEBUG_MODE = false;
const SHOW_BUY_ME_COFFEE = true;

const YIUFE_DATA = {};

const TCMB_RATES = {};

document.getElementById('uploadPdf').addEventListener('change', function(event) {
    const files = event.target.files;
    if (files.length > 0) {
        let allData = [];
        let processedFiles = 0;

        for (let file of files) {
            const reader = new FileReader();
            reader.onload = function() {
                extractInvestmentTable(reader.result, allData, () => {
                    processedFiles++;
                    if (processedFiles === files.length) {
                        // Tarihleri doğru parse et ve tarihsel olarak sırala
                        allData.sort((a, b) => parseDate(a[0]) - parseDate(b[0]));
                        displayTable(allData);
                    }
                });
            };
            reader.readAsArrayBuffer(file);
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const disclaimerAccepted = localStorage.getItem('disclaimerAccepted');
    const disclaimerVersion = '1.0';
    
    if (disclaimerAccepted === disclaimerVersion) {
        document.getElementById('disclaimerAccept').checked = true;
        document.getElementById('uploadPdf').disabled = false;
    }
});

document.getElementById('disclaimerAccept').addEventListener('change', function() {
    if (this.checked) {
        localStorage.setItem('disclaimerAccepted', '1.0');
        document.getElementById('uploadPdf').disabled = false;
    } else {
        localStorage.removeItem('disclaimerAccepted');
        document.getElementById('uploadPdf').disabled = true;
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
    // Sorumluluk beyanına scroll et
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

    matches.forEach((match, index) => {
        let date = match[0];
        let start = match.index + match[0].length;
        let end = (index < matches.length - 1) ? matches[index + 1].index : tableText.length;
        
        let rowContent = tableText.substring(start, end).trim();
        let rowData = rowContent.split(/\s{2,}/);
        rowData.unshift(date);

        // Virgülü nokta yap
        for (let i = 6; i <= 11; i++) {
            if (rowData[i]) {
                rowData[i] = rowData[i].replace(',', '.');
            }
        }

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

// FIFO 
class FifoCalculator {
    constructor() {
        this.purchases = [];
        this.yiufeData = YIUFE_DATA;
        this.exchangeRates = TCMB_RATES;
        
    }

    // Bir önceki iş gününün dolar kurunu bul
    getPreviousExchangeRate(dateStr) {
        const [day, month, year] = dateStr.split('/');
        const currentDate = new Date(20 + year, month - 1, day);
        
        // Bir gün öncesinden başlayarak geriye doğru kur ara
        for (let i = 1; i <= 10; i++) { // En fazla 10 gün geriye git
            const prevDate = new Date(currentDate);
            prevDate.setDate(prevDate.getDate() - i);
            
            const prevDateStr = prevDate.toISOString().split('T')[0]; // YYYY-MM-DD formatı
            if (this.exchangeRates[prevDateStr]) {
                debug_log(`Kur bulundu: ${prevDateStr} -> ${this.exchangeRates[prevDateStr]}`);
                return this.exchangeRates[prevDateStr];
            }
        }
        
        showError(`${dateStr} tarihine ait döviz kuru bulunamadı. Lütfen TCMB kurlarının yüklendiğinden emin olun.`);
        return null;
    }

    // Bir önceki ayın Yİ-ÜFE değerini bul
    getPreviousYiufe(dateStr) {
        const [day, month, year] = dateStr.split(' ')[0].split('/');
        const currentDate = new Date(20 + year, month - 1, day);
        
        // Bir ay öncesinin Yİ-ÜFE değerini al
        const prevDate = new Date(currentDate);
        prevDate.setMonth(prevDate.getMonth() - 1);
        
        const prevMonth = (prevDate.getMonth() + 1).toString().padStart(2, '0');
        const prevYear = prevDate.getFullYear();
        
        const key = `${prevYear}${prevMonth}`;
        const yiufeValue = this.yiufeData[key];
        
        if (!yiufeValue) {
            showError(`${prevYear}-${prevMonth} dönemine ait Yİ-ÜFE verisi bulunamadı. Lütfen Yİ-ÜFE verilerinin yüklendiğinden emin olun.`);
            return null;
        }
        
        debug_log(`Yİ-ÜFE bulundu: ${key} -> ${yiufeValue}`);
        return yiufeValue;
    }

    addTransaction(date, type, symbol, orderType, amount, price, fee, currency = 'USD') {
        const exchangeRate = this.getPreviousExchangeRate(date.split(' ')[0]);
        
        if (!exchangeRate) {
            return null;
        }
        
        if (!amount || amount === '0' || price === '-') {
            debug_log('İşlem atlandı:', { date, type, symbol, amount });
            return null;
        }

        amount = parseFloat(amount);
        price = parseFloat(price);
        fee = parseFloat(fee) || 0;
        
        const priceInTRY = price * exchangeRate;
        const feeInTRY = fee * exchangeRate;

        if (orderType === 'Alış') {
            // Alış işlemlerini purchases listesine ekle
            this.purchases.push({
                date,
                symbol,
                amount,
                price: priceInTRY,
                fee: feeInTRY,
                exchangeRate,
                originalPrice: price // USD cinsinden orijinal fiyat
            });
            debug_log('Alış Kaydedildi:', {
                date,
                symbol,
                amount,
                priceInTRY,
                feeInTRY
            });
            return null;
        } else if (orderType === 'Satış') {
            return this.calculateProfit(date, symbol, amount, priceInTRY, feeInTRY, price);
        }
        
        return null;
    }

    calculateProfit(sellDate, symbol, sellAmount, sellPriceTRY, sellFeeTRY, sellPriceUSD) {
        debug_log('Satış Hesaplama Başladı:', {
            sellDate, symbol, sellAmount, sellPriceTRY, sellFeeTRY
        });

        // Satış için kur kontrolü
        const sellExchangeRate = this.getPreviousExchangeRate(sellDate.split(' ')[0]);
        if (!sellExchangeRate) {
            return null;
        }

        let remainingSellAmount = sellAmount;
        let profitDetails = [];
        let totalProfit = 0;
        let totalAdjustedProfit = 0;
        let usedPurchases = [];
        
        // Aynı semboldeki alışları bul
        const availablePurchases = this.purchases.filter(p => p.symbol === symbol);
        
        if (availablePurchases.length === 0) {
            console.error('Satış için uygun alış bulunamadı:', symbol);
            return null;
        }

        let purchaseIndex = 0;
        
        // Satışı parçalara ayır
        while (remainingSellAmount > 0 && purchaseIndex < availablePurchases.length) {
            const purchase = availablePurchases[purchaseIndex];
            const availableAmount = purchase.amount - (purchase.usedAmount || 0);
            
            if (availableAmount <= 0) {
                purchaseIndex++;
                continue;
            }

            const usedAmount = Math.min(remainingSellAmount, availableAmount);
            
            // Bu parça için komisyonları oranla
            const partialSellFee = sellFeeTRY * (usedAmount / sellAmount);
            const partialBuyFee = purchase.fee * (usedAmount / purchase.amount);
            
            // Satış ve alış tutarları (TRY)
            const sellValue = usedAmount * sellPriceTRY;
            const buyValue = usedAmount * purchase.price;
            
            // Yİ-ÜFE değerleri
            const buyYiufe = this.getPreviousYiufe(purchase.date);
            const sellYiufe = this.getPreviousYiufe(sellDate);
            
            if (!buyYiufe || !sellYiufe) {
                return null;
            }

            const inflationRate = sellYiufe / buyYiufe;
            
            // Enflasyon düzeltmeli değerler
            const adjustedBuyValue = buyValue * inflationRate;
            
            // Kar hesaplaması
            const profit = sellValue - buyValue - partialSellFee - partialBuyFee;
            const adjustedProfit = sellValue - adjustedBuyValue - partialSellFee - (partialBuyFee * inflationRate);

            // Kurları al
            const buyExchangeRate = purchase.exchangeRate;
            const sellExchangeRate = this.getPreviousExchangeRate(sellDate.split(' ')[0]);

            profitDetails.push({
                buyDate: purchase.date,
                sellDate: sellDate,
                symbol: symbol,
                amount: usedAmount,
                buyPrice: purchase.originalPrice,
                sellPrice: sellPriceUSD,
                buyValue: buyValue,
                sellValue: sellValue,
                buyFee: partialBuyFee,
                sellFee: partialSellFee,
                profit: profit,
                adjustedProfit: adjustedProfit,
                buyYiufe: buyYiufe,
                sellYiufe: sellYiufe,
                inflationRate: inflationRate,
                buyExchangeRate: buyExchangeRate,
                sellExchangeRate: sellExchangeRate
            });

            // Kullanılan alış miktarını güncelle
            purchase.usedAmount = (purchase.usedAmount || 0) + usedAmount;
            usedPurchases.push(purchase);

            totalProfit += profit;
            totalAdjustedProfit += adjustedProfit;
            remainingSellAmount -= usedAmount;
            
            if (remainingSellAmount > 0) {
                purchaseIndex++;
            }
        }

        // Tamamen kullanılmış alışları listeden çıkar
        this.purchases = this.purchases.filter(p => (p.usedAmount || 0) < p.amount);
        
        return {
            details: profitDetails,
            rawProfit: totalProfit,
            adjustedProfit: totalAdjustedProfit,
            taxableAmount: Math.max(0, totalAdjustedProfit)
        };
    }
}

function displayTable(data) {
    const calculator = new FifoCalculator();
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    const vergiOrani = parseFloat(document.getElementById('vergiOrani').value) / 100;
    
    let totalTaxableProfit = 0;
    let allTransactions = [];
    let hasError = false;
    
    // Tüm alışları işle
    for (let row of data) {
        if (row[3] === 'Alış' && row[8] && row[8] !== '0' && row[9] !== '-') {
            const result = calculator.addTransaction(
                row[0], row[1], row[2], row[3], row[8], row[9], row[10], 'USD'
            );
            
            // Eğer işlem başarısız olduysa (null döndüyse ve hata mesajı gösterildiyse)
            if (result === null && document.querySelector('.error-message')) {
                hasError = true;
                break;
            }

            const [day, month, year] = row[0].split(' ')[0].split('/');
            const islemYili = "20" + year;
            allTransactions.push({
                ...row,
                type: 'original',
                vergiDonemi: islemYili
            });
        }
    }
    
    // Hata varsa işlemleri sonlandır
    if (hasError) {
        return;
    }
    
    // Tüm satışları işle ve parçala
    for (let row of data) {
        if (row[3] === 'Satış' && row[8] && row[8] !== '0' && row[9] !== '-') {
            const [day, month, year] = row[0].split(' ')[0].split('/');
            const islemYili = "20" + year;
            const result = calculator.addTransaction(
                row[0], row[1], row[2], row[3], row[8], row[9], row[10], 'USD'
            );
            
            // Eğer işlem başarısız olduysa (null döndüyse ve hata mesajı gösterildiyse)
            if (result === null && document.querySelector('.error-message')) {
                hasError = true;
                break;
            }
            
            if (result && result.details) {
                result.details.forEach(detail => {
                    // Vergiye tabi kazancı hesapla - sadece seçili dönem için
                    let taxableAmount = 0;
                    if (islemYili === vergiDonemi && detail.adjustedProfit > 0) {
                        taxableAmount = detail.adjustedProfit;
                    }
                    totalTaxableProfit += taxableAmount;

                    const newRow = [...row];
                    allTransactions.push({
                        ...newRow,
                        type: 'split',
                        vergiDonemi: islemYili,
                        amount: detail.amount,
                        buyDate: detail.buyDate,
                        buyPrice: detail.buyPrice,
                        adjustedProfit: detail.adjustedProfit,
                        buyExchangeRate: detail.buyExchangeRate,
                        sellExchangeRate: detail.sellExchangeRate,
                        buyYiufe: detail.buyYiufe,
                        sellYiufe: detail.sellYiufe,
                        buyValue: detail.buyValue
                    });
                });
            }
        }
    }
    
    // Hata varsa işlemleri sonlandır
    if (hasError) {
        return;
    }

    // Tabloyu oluştur
    let html = createTableHeader();
    let tableTotalTaxableProfit = 0;
    
    for (let transaction of allTransactions) {
        const rowHtml = createTableRow(transaction);
        html += rowHtml;
        
        // Tablodaki vergiye tabi kazanç değerini topla
        if (transaction.type === 'split') {
            const vergiyeTabiKazancStr = rowHtml.match(/td>([0-9.]+)<\/td>\s*<\/tr>$/)?.[1];
            if (vergiyeTabiKazancStr && vergiyeTabiKazancStr !== '0.00') {
                tableTotalTaxableProfit += parseFloat(vergiyeTabiKazancStr);
            }
        }
    }
    
    html += createTableFooter(tableTotalTaxableProfit);
    
    document.getElementById('tableContainer').innerHTML = html;
}

function createTableHeader() {
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    return `<table>
        <thead>
            <tr>
                <th colspan="22" style="text-align: center; background-color: #e6e6e6;">
                    USD BAZLI YATIRIM İŞLEMLERİ ${vergiDonemi} YILI
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
                <th>Gerçekleşen Adet</th>
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
            </tr>
        </thead>
        <tbody>`;
}

function createTableRow(transaction) {
    const isSale = transaction.type === 'split';  // 'isSatis' yerine 'isSale' kullanılacak
    
    // Güvenli bir şekilde sayısal değerleri formatla
    const formatNumber = (value, decimals = 2) => {
        if (value === null || value === undefined || isNaN(value)) return '-';
        return parseFloat(value).toFixed(decimals);
    };

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
                
                // Sadece kar varsa vergiye tabi kazanç olarak göster
                vergiyeTabiKazanc = kazanc > 0 ? formatNumber(kazanc) : '0.00';
            }
        }
    }
    
    return `<tr>
        <td>${transaction[0]}</td>
        <td>${isSale ? transaction.vergiDonemi : '-'}</td>
        <td>${transaction[1]}</td>
        <td>${transaction[2]}</td>
        <td>${transaction[3]}</td>
        <td>${transaction[4]}</td>
        <td>${transaction[5] || 'USD'}</td>
        <td>${isSale ? formatNumber(transaction.amount, 8) : formatNumber(transaction[8], 8)}</td>
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
    </tr>`;
}

function createTableFooter(totalTaxableProfit) {
    const vergiOrani = parseFloat(document.getElementById('vergiOrani').value) / 100;
    return `</tbody></table>
        <div class="summary-container">
            <strong>Toplam Vergiye Tabi Kazanç (TL): 
                <span class="${totalTaxableProfit >= 0 ? 'positive-value' : 'negative-value'}">
                    ${totalTaxableProfit.toFixed(2)}
                </span>
            </strong>
            <strong>Ödenecek Vergi (%${vergiOrani * 100}) (TL): 
                <span style="color: #dc3545">
                    ${(totalTaxableProfit * vergiOrani).toFixed(2)}
                </span>
            </strong>
        </div>`;
}

// Vergi dönemi değiştiğinde tabloyu güncelle
document.getElementById('vergiDonemi').addEventListener('change', function() {
    const files = document.getElementById('uploadPdf').files;
    if (files.length > 0) {
        let allData = [];
        let processedFiles = 0;

        for (let file of files) {
            const reader = new FileReader();
            reader.onload = function() {
                extractInvestmentTable(reader.result, allData, () => {
                    processedFiles++;
                    if (processedFiles === files.length) {
                        allData.sort((a, b) => parseDate(a[0]) - parseDate(b[0]));
                        displayTable(allData);
                    }
                });
            };
            reader.readAsArrayBuffer(file);
        }
    }
});

// Vergi oranı değiştiğinde tabloyu güncelle
document.getElementById('vergiOrani').addEventListener('change', function() {
    const files = document.getElementById('uploadPdf').files;
    if (files.length > 0) {
        let allData = [];
        let processedFiles = 0;

        for (let file of files) {
            const reader = new FileReader();
            reader.onload = function() {
                extractInvestmentTable(reader.result, allData, () => {
                    processedFiles++;
                    if (processedFiles === files.length) {
                        allData.sort((a, b) => parseDate(a[0]) - parseDate(b[0]));
                        displayTable(allData);
                    }
                });
            };
            reader.readAsArrayBuffer(file);
        }
    } else {
        // Dosya yüklü ve tablo zaten oluşturulmuşsa sadece özet kısmını güncelle
        const summaryContainer = document.querySelector('.summary-container');
        if (summaryContainer) {
            const totalTaxableProfit = parseFloat(summaryContainer.querySelector('span').textContent);
            const vergiOrani = parseFloat(document.getElementById('vergiOrani').value) / 100;
            
            summaryContainer.innerHTML = `
                <strong>Toplam Vergiye Tabi Kazanç (TL): 
                    <span class="${totalTaxableProfit >= 0 ? 'positive-value' : 'negative-value'}">
                        ${totalTaxableProfit.toFixed(2)}
                    </span>
                </strong>
                <strong>Ödenecek Vergi (%${vergiOrani * 100}) (TL): 
                    <span style="color: #dc3545">
                        ${(totalTaxableProfit * vergiOrani).toFixed(2)}
                    </span>
                </strong>
            `;
        }
    }
});

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
        row.querySelectorAll('td').forEach(cell => {
            // Virgülleri ve tırnak işaretlerini kontrol et
            let value = cell.textContent.replace(/"/g, '""');
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

function downloadExcel() {
    const table = document.querySelector('table');
    const vergiDonemi = document.getElementById('vergiDonemi').value;
    const wb = XLSX.utils.book_new();
    
    // Başlık satırını atla ve verileri al
    const ws = XLSX.utils.table_to_sheet(table, {
        raw: true,
        display: false
    });
    
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
});

function showError(message) {
    const container = document.getElementById('tableContainer');
    container.innerHTML = `
        <div class="error-message" style="color: #dc3545; padding: 20px; text-align: center; border: 1px solid #dc3545; border-radius: 4px; margin: 20px 0;">
            <p>😟 ${message}</p>
            <p>şuraya mail atabilirsiniz: <a href="mailto:umuterturk@gmail.com">umuterturk@gmail.com</a></p>
        </div>
    `;
}
