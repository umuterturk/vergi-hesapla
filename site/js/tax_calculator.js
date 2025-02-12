class TaxCalculator {
    constructor(yiufeData, tcmbRates, vergiDonemi, vergiOrani, warningCallback = null) {
        this.yiufeData = yiufeData;
        this.tcmbRates = tcmbRates;
        this.vergiDonemi = vergiDonemi;
        this.vergiOrani = vergiOrani;
        this.purchases = [];
        this.warningCallback = warningCallback;
    }

    
    getPreviousExchangeRate(fullDateStr) {
        const dateStr = fullDateStr.split(' ')[0];
        // Tarih dizesini gün, ay ve yıl olarak ayır
        const [day, month, year] = dateStr.split('/');
        const date = new Date(20 + year, month-1, day); // javascript date GG
        // 1 gun onceki tarih
        date.setDate(date.getDate() - 1);
        
        // Format date manually to YYYY-MM-DD
        const formattedYear = date.getFullYear();
        const formattedMonth = String(date.getMonth() + 1).padStart(2, '0');
        const formattedDay = String(date.getDate()).padStart(2, '0');
        const prevDateStr = `${formattedYear}-${formattedMonth}-${formattedDay}`;

        if (this.tcmbRates[prevDateStr]) {
            return this.tcmbRates[prevDateStr];
        }
    
        throw new Error(`Tarih için döviz kuru bulunamadı: ${fullDateStr} ${dateStr} ${prevDateStr} ${date} ${this.tcmbRates}`);
    }

    // Önceki ayın Yİ-UFE değerini almak için
    getPreviousYiufe(fullDateStr) {
        const dateStr = fullDateStr.split(' ')[0];
        // Tarih dizesini gün, ay ve yıl olarak ayır
        const [day, month, year] = dateStr.split('/');
        const currentDate = new Date(20 + year, month - 1, day);
        
        const prevDate = new Date(currentDate);
        prevDate.setMonth(prevDate.getMonth() - 1);
        
        const prevMonth = (prevDate.getMonth() + 1).toString().padStart(2, '0');
        const prevYear = prevDate.getFullYear();
        
        const key = `${prevYear}${prevMonth}`;
        const yiufeValue = this.yiufeData[key];
        
        if (!yiufeValue) {
            throw new Error(`Dönem için Yİ-UFE verisi bulunamadı: ${prevYear}-${prevMonth}`);
        }
        
        return yiufeValue;
    }

    // İşlem ekleme (alış veya satış)
    addTransaction(date, symbol, orderType, amount, price, fee) {
        if (!amount || amount === '0' || price === '-') {
            return null; // Geçersiz miktar veya fiyat
        }

        const exchangeRate = this.getPreviousExchangeRate(date);
        
        amount = parseFloat(amount);
        price = parseFloat(price);
        fee = parseFloat(fee) || 0;
        
        const priceInTRY = price * exchangeRate;
        const feeInTRY = fee * exchangeRate;

        if (orderType === 'Alış') {
            const purchase = {
                date,
                symbol,
                amount,
                price: priceInTRY,
                fee: feeInTRY,
                exchangeRate,
                originalPrice: price
            };
            this.purchases.push(purchase);
            return { type: 'purchase', data: purchase };
        } else if (orderType === 'Satış') {
            return this.calculateProfit(date, symbol, amount, priceInTRY, feeInTRY, price);
        }
        
        return null; // Geçersiz işlem türü
    }

    // Satış işlemi için kar hesaplama
    calculateProfit(sellDate, symbol, sellAmount, sellPriceTRY, sellFeeTRY, sellPriceUSD) {
        const sellExchangeRate = this.getPreviousExchangeRate(sellDate);
        let remainingSellAmount = sellAmount;
        let profitDetails = [];
        let totalProfit = 0;
        let totalAdjustedProfit = 0;
        let totalTaxableAmount = 0;
        
        const availablePurchases = this.purchases.filter(p => p.symbol === symbol);
        
        if (availablePurchases.length === 0) {
            throw new Error(`${symbol} için ${sellDate} eşleşen alış bulunamadı, eksik ekstre yüklemiş olabilirsiniz.`);
        }

        // Mevcutta satış adedi kadar alış var mı kontrol et
        const totalAvailable = availablePurchases.reduce((sum, p) => sum + (p.amount - (p.usedAmount || 0)), 0);
        if (sellAmount - totalAvailable > 0.0001) {
            const warning = `${symbol} için ${sellDate} tarihinde satış adedi ${sellAmount} iken yalnızca ${totalAvailable} adet mevcut, eksik ekstre yüklemiş olabilirsiniz.`;
            if (this.warningCallback) {
                this.warningCallback(warning);
            }
        }

        let purchaseIndex = 0;
        let partialCount = 0;
        while (remainingSellAmount > 0 && purchaseIndex < availablePurchases.length) {
            const purchase = availablePurchases[purchaseIndex];
            const availableAmount = purchase.amount - (purchase.usedAmount || 0);
            
            if (availableAmount <= 0) {
                purchaseIndex++;
                continue;
            }

            const usedAmount = Math.min(remainingSellAmount, availableAmount);
            
            const partialSellFee = partialCount === 0 ? sellFeeTRY : 0;
            const partialBuyFee = partialCount === 0 ? purchase.fee : 0;

            const sellValue = usedAmount * sellPriceTRY;
            const buyValue = usedAmount * purchase.price;
            
            const buyYiufe = this.getPreviousYiufe(purchase.date);
            const sellYiufe = this.getPreviousYiufe(sellDate);
            
            const inflationRate = sellYiufe / buyYiufe;
            const inflationIncrease = ((sellYiufe - buyYiufe) / buyYiufe) * 100;
            
            // Yİ-ÜFE artışı %10 veya üzerinde ise enflasyon düzeltmesi uygula
            const adjustedBuyValue = inflationIncrease >= 10 ? buyValue * inflationRate : buyValue;
            
            const profit = sellValue - buyValue;
            const adjustedProfit = sellValue - adjustedBuyValue;

            const [day, month, year] = sellDate.split(' ')[0].split('/');
            const saleYear = "20" + year;
            const taxableAmount = saleYear === this.vergiDonemi ? adjustedProfit : 0;
            totalTaxableAmount += taxableAmount;
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
                buyExchangeRate: purchase.exchangeRate,
                sellExchangeRate: sellExchangeRate,
                taxableAmount: taxableAmount,
                tax: taxableAmount * this.vergiOrani
            });

            purchase.usedAmount = (purchase.usedAmount || 0) + usedAmount;
            totalProfit += profit;
            totalAdjustedProfit += adjustedProfit;
            remainingSellAmount -= usedAmount;
            
            if (remainingSellAmount > 0) {
                purchaseIndex++;
            }
            partialCount++;
        }

        // Tamamen kullanılan alışları kaldır
        this.purchases = this.purchases.filter(p => (p.usedAmount || 0) < p.amount);
        
        return {
            type: 'sale',
            details: profitDetails,
            summary: {
                rawProfit: totalProfit,
                adjustedProfit: totalAdjustedProfit,
                taxableAmount: totalTaxableAmount,
                tax: totalTaxableAmount * this.vergiOrani
            }
        };
    }

    // Hesaplayıcı durumunu sıfırlama
    reset() {
        this.purchases = [];
    }

    // Vergi dönemini güncelleme
    setVergiDonemi(vergiDonemi) {
        this.vergiDonemi = vergiDonemi;
    }

    // Vergi oranını güncelleme
    setVergiOrani(vergiOrani) {
        this.vergiOrani = vergiOrani;
    }

    calculateTotalTaxableProfit(data) {
        let allTransactions = [];
        let totalTaxableProfit = 0;
    
        // Tüm işlemleri işleme
        for (let row of data) {
            // Null check ve işlem durumu kontrolü
            if (!row || row.length < 11) {
                console.warn("Geçersiz veya gerçekleşmemiş işlem:", row);
                continue;
            }
    
            // Sayısal değerlerin kontrolü
            const amount = parseFloat(row[8]);
            const price = parseFloat(row[9]);
            const fee = parseFloat(row[10] || '0');
    
            if (amount && amount !== 0 && !isNaN(price)) {
                // Check for negative amounts or prices
                if (amount < 0 || price < 0) {
                    throw new Error(`Negatif miktar veya fiyat geçersizdir: ${row}`);
                }

                const result = this.addTransaction(
                    row[0],           // tarih
                    row[2],           // sembol
                    row[3],           // işlem tipi
                    amount.toString(), // miktar
                    price.toString(),  // fiyat
                    fee.toString()    // komisyon
                );
                
                if (result) {
                    if (result.type === 'purchase') {
                        allTransactions.push({
                            ...row,
                            type: 'original',
                            vergiDonemi: "20" + row[0].split('/')[2].split(' ')[0]
                        });
                    } else if (result.type === 'sale') {
                        const [day, month, year] = row[0].split(' ')[0].split('/');
                        const islemYili = "20" + year;
                        
                        result.details.forEach(detail => {
                            totalTaxableProfit += detail.taxableAmount || 0;
                            
                            const transaction = {
                                ...row,
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
                            };
                            allTransactions.push(transaction);
                        });
                    }
                }
            }
        }
        return { allTransactions, totalTaxableProfit };
    }
}

// Dışa aktarma için modül
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaxCalculator;
} 