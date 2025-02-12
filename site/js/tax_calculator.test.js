const TaxCalculator = require('./tax_calculator.js');

// Örnek test verisi - Aylık Yİ-UFE verileri
const SAMPLE_YIUFE_DATA = {
    '202212': 100.00,
    '202301': 200.00,
    '202302': 300.00,
    '202303': 400.00,
    '202304': 500.00,
    '202305': 600.00,
    '202306': 700.00,
    '202402': 800.00,
    '202406': 900.00,
};

// Örnek test verisi - Günlük TCMB kurları
const SAMPLE_TCMB_RATES = {
    '2023-01-14': 10.00,
    '2023-02-14': 15.00,
    '2023-03-14': 20.00,
    '2023-04-14': 25.00,
    '2023-05-14': 30.00,
    '2023-06-14': 35.00,
    '2023-07-14': 140.00,
    '2024-03-14': 145.00,
    '2024-07-14': 150.00,

};

describe('TaxCalculator', () => {
    let calculator;
    let warnings = [];

    beforeEach(() => {
        warnings = [];
        calculator = new TaxCalculator(
            SAMPLE_YIUFE_DATA,
            SAMPLE_TCMB_RATES,
            '2023',
            0.20,
            (warning) => warnings.push(warning)
        );
    });

    test('doğru değerlerle başlatılmalı', () => {
        expect(calculator.yiufeData).toBe(SAMPLE_YIUFE_DATA);
        expect(calculator.tcmbRates).toBe(SAMPLE_TCMB_RATES);
        expect(calculator.vergiDonemi).toBe('2023');
        expect(calculator.vergiOrani).toBe(0.20);
        expect(calculator.purchases).toEqual([]);
        expect(warnings).toEqual([]);
    });

    test('önceki döviz kurunu doğru almalı', () => {
        const rate = calculator.getPreviousExchangeRate('15/03/23 10:10:00');
        expect(rate).toBe(20.00); 
        expect(warnings).toEqual([]);
    });

    test('geçersiz döviz kuru tarihi için hata fırlatmalı', () => {
        expect(() => {
            calculator.getPreviousExchangeRate('16/12/22 10:10:00');
        }).toThrow();
        expect(warnings).toEqual([]);
    });

    test('önceki Yİ-UFE değerini doğru almalı', () => {
        const yiufe = calculator.getPreviousYiufe('15/03/23');
        expect(yiufe).toBe(300.00); // Should get February value
        expect(warnings).toEqual([]);
    });

    test('geçersiz Yİ-UFE dönemi için hata fırlatmalı', () => {
        expect(() => {
            calculator.getPreviousYiufe('16/12/22');
        }).toThrow();
        expect(warnings).toEqual([]);
    });

    test('alış işlemini doğru işlemeli', () => {
        const result = calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1.5',
            '220.22',
            '10'
        );

        expect(result.type).toBe('purchase');
        expect(result.data.amount).toBe(1.5);
        expect(result.data.originalPrice).toBe(220.22);
        expect(calculator.purchases.length).toBe(1);
        expect(warnings).toEqual([]);
    });

    test('kârlı bir alış-satış döngüsünü doğru işlemeli', () => {
        // Mart ayında ilk alış
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '550',
            '1.00',
            '10'
        );

        // Sonra Temmuz'da satış
        const result = calculator.addTransaction(
            '15/07/23 10:00:00',
            'VOOG',
            'Satış',
            '441.00',
            '1.0',
            '10'
        );

        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(1);
        expect(result.details[0].amount).toBe(441.00);
        expect(result.details[0].buyPrice).toBe(1.00);
        expect(result.details[0].sellPrice).toBe(1.00);
        expect(result.details[0].buyYiufe).toBe(300.00); 
        expect(result.details[0].sellYiufe).toBe(700.00); 
        expect(result.details[0].buyExchangeRate).toBe(20.00); 
        expect(result.details[0].sellExchangeRate).toBe(140.00); 
        expect(result.summary.taxableAmount).toBe(41160);
        expect(warnings).toEqual([]);
    });

    test('kârsız bir alış-satış için zararı doğru işlemeli', () => {
        // Mart ayında ilk alış
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '550.00',
            '1.0',
            '10'
        );

        // Sonra Mayıs'ta satış
        const result = calculator.addTransaction(
            '15/05/23 10:00:00',
            'VOOG',
            'Satış',
            '441.00',
            '1.0',
            '10'
        );

        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(1);
        expect(result.details[0].amount).toBe(441.00);
        expect(result.details[0].buyPrice).toBe(1.00);
        expect(result.details[0].sellPrice).toBe(1.00);
        expect(result.details[0].buyYiufe).toBe(300.00); 
        expect(result.details[0].sellYiufe).toBe(500.00); 
        expect(result.details[0].buyExchangeRate).toBe(20.00); 
        expect(result.details[0].sellExchangeRate).toBe(30.00); 
        expect(result.details[0].taxableAmount).toBe(result.details[0].adjustedProfit);
        expect(result.summary.taxableAmount).toBe(result.summary.adjustedProfit);
        expect(result.summary.taxableAmount).toBe(result.summary.adjustedProfit);
        expect(result.summary.adjustedProfit).toBe(-1470);
        expect(warnings).toEqual([]);
    });
    
    test('birden fazla alış ve satışı doğru işlemeli', () => {
        // Farklı fiyatlardan çoklu alışlar
        calculator.addTransaction('15/03/23 10:00:00', 'VOOG', 'Alış', '1.0', '220.22', '10');
        calculator.addTransaction('15/04/23 10:00:00', 'VOOG', 'Alış', '1.0', '230.00', '10');
        
        // Sell more than one buy's worth
        const result = calculator.addTransaction('15/05/23 10:00:00', 'VOOG', 'Satış', '1.5', '250.00', '10');
        
        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(2); // Should use two buy transactions
        expect(calculator.purchases.length).toBe(1); // Should have 0.5 VOOG left from second purchase
    });

    test('bir alış ve iki satışı doğru işlemeli', () => {
        // Mart'ta 1000 birim al
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1000',
            '1.00',
            '10'
        );

        // Mayıs'ta ilk 400 birimlik satış
        const result1 = calculator.addTransaction(
            '15/05/23 10:00:00',
            'VOOG',
            'Satış',
            '400',
            '1.0',
            '10'
        );

        // Temmuz'da ikinci 500 birimlik satış
        const result2 = calculator.addTransaction(
            '15/07/23 10:00:00',
            'VOOG',
            'Satış',
            '441',
            '1.0',
            '10'
        );

        // İlk satış sonuçlarını kontrol et
        expect(result1.type).toBe('sale');
        expect(result1.details.length).toBe(1);
        expect(result1.details[0].amount).toBe(400);
        expect(result1.details[0].buyYiufe).toBe(300.00);
        expect(result1.details[0].sellYiufe).toBe(500.00);
        expect(result1.details[0].buyExchangeRate).toBe(20.00);
        expect(result1.details[0].sellExchangeRate).toBe(30.00);
        expect(result1.details[0].taxableAmount).toBe(result1.details[0].adjustedProfit);
        expect(result1.summary.taxableAmount).toBe(result1.summary.adjustedProfit);

        // İkinci satış sonuçlarını kontrol et
        expect(result2.type).toBe('sale');
        expect(result2.details.length).toBe(1);
        expect(result2.details[0].amount).toBe(441.0);
        expect(result2.details[0].buyYiufe).toBe(300.00);
        expect(result2.details[0].sellYiufe).toBe(700.00);
        expect(result2.details[0].buyExchangeRate).toBe(20.00);
        expect(result2.details[0].sellExchangeRate).toBe(140.00);
        expect(result2.details[0].taxableAmount).toBe(result2.details[0].adjustedProfit);
        expect(result2.summary.taxableAmount).toBe(result2.summary.adjustedProfit);
        expect(warnings).toEqual([]);
    });

    test('zararı olan işlemler vergilendirilebilir tutarı azaltmalı', () => {
        // Mart'ta ilk alış
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1000',
            '1.00',
            '10'
        );

        // Sonra Mart'ta satış (zarar)
        let result = calculator.addTransaction(
            '15/03/23 10:01:00',
            'VOOG',
            'Satış',
            '500.00',
            '0.2', // Zarar için daha düşük fiyat
            '10'
        );

        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(1);
        expect(result.details[0].amount).toBe(500.00);
        expect(result.details[0].buyPrice).toBe(1.00);
        expect(result.details[0].sellPrice).toBe(0.20);
        expect(result.details[0].buyYiufe).toBe(300.00); 
        expect(result.details[0].sellYiufe).toBe(300.00); 
        expect(result.details[0].buyExchangeRate).toBe(20.00); 
        expect(result.details[0].sellExchangeRate).toBe(20.00); 
        expect(result.details[0].adjustedProfit).toBe(-8000);
        expect(result.details[0].taxableAmount).toBe(-8000); 
        expect(result.summary.taxableAmount).toBe(-8000);

        // Sonra Temmuz'da satış (kar)
        result = calculator.addTransaction(
            '15/07/23 10:00:00',
            'VOOG',
            'Satış',
            '441.00',
            '1.0', // Kar için daha yüksek fiyat
            '10'
        );

        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(1);
        expect(result.details[0].amount).toBe(441.00);
        expect(result.details[0].buyPrice).toBe(1.00);
        expect(result.details[0].sellPrice).toBe(1.0);
        expect(result.details[0].buyYiufe).toBe(300.00); 
        expect(result.details[0].sellYiufe).toBe(700.00); 
        expect(result.details[0].buyExchangeRate).toBe(20.00); 
        expect(result.details[0].sellExchangeRate).toBe(140.00); 
        expect(result.details[0].adjustedProfit).toBeGreaterThan(0); // Should be positive
        expect(result.details[0].taxableAmount).toBe(result.details[0].adjustedProfit);
        expect(result.summary.taxableAmount).toBe(41160);
        expect(result.summary.taxableAmount).toBe(result.summary.adjustedProfit);
        expect(warnings).toEqual([]);
    });

    test('satış miktarı iki alıştan hesaplanması gerekiyorsa iki detay oluşturmalı', () => {
        // Mart'ta ilk alış
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '240',
            '1.00',
            '10'
        );

        calculator.addTransaction(
            '15/04/23 10:00:00',
            'VOOG',
            'Alış',
            '201',
            '1.00',
            '10'
        );

        // Then sell in July
        const result = calculator.addTransaction(
            '15/07/23 10:00:00',
            'VOOG',
            'Satış',
            '441.00',
            '1.0',
            '10'
        );

        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(2);
        expect(result.details[0].amount).toBe(240.00);
        expect(result.details[0].buyPrice).toBe(1.00);
        expect(result.details[0].sellPrice).toBe(1.00);
        expect(result.details[0].buyYiufe).toBe(300.00); 
        expect(result.details[0].sellYiufe).toBe(700.00); 
        expect(result.details[0].buyExchangeRate).toBe(20.00); 
        expect(result.details[0].sellExchangeRate).toBe(140.00); 

        expect(result.details[1].amount).toBe(201.00);
        expect(result.details[1].buyPrice).toBe(1.00);
        expect(result.details[1].sellPrice).toBe(1.00);
        expect(result.details[1].buyYiufe).toBe(400.00); 
        expect(result.details[1].sellYiufe).toBe(700.00); 
        expect(result.details[1].buyExchangeRate).toBe(25.00); 
        expect(result.details[1].sellExchangeRate).toBe(140.00); 

        expect(result.summary.taxableAmount).toBe(41746.25);
        expect(warnings).toEqual([]);
    });

    test('farklı vergi döneminde satış yapılırsa vergi olmamalı', () => {
        const calculator2 = new TaxCalculator(
            SAMPLE_YIUFE_DATA,
            SAMPLE_TCMB_RATES,
            '2024',
            0.20
        );
        // First buy in March
        calculator2.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '550',
            '1.00',
            '10'
        );

        // Then sell in July
        let result1 = calculator2.addTransaction(
            '15/07/23 10:00:00',
            'VOOG',
            'Satış',
            '441.00',
            '1.0',
            '10'
        );        

        expect(result1.summary.taxableAmount).toBe(0);
        expect(warnings).toEqual([]);
    });

    test('hesaplayıcı durumunu sıfırlamalı', () => {
        calculator.addTransaction('15/03/23 10:00:00', 'VOOG', 'Alış', '1.0', '220.22', '10');
        expect(calculator.purchases.length).toBe(1);
        
        calculator.reset();
        expect(calculator.purchases.length).toBe(0);
    });

    test('kalan tam miktarı satmayı doğru işlemeli', () => {
        // 1000 birim al
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1000',
            '1.00',
            '10'
        );

        // 600 birim sat
        calculator.addTransaction(
            '15/05/23 10:00:00',
            'VOOG',
            'Satış',
            '600',
            '1.0',
            '10'
        );

        // Kalan 400 birimi sat
        const result = calculator.addTransaction(
            '15/07/23 10:00:00',
            'VOOG',
            'Satış',
            '400',
            '1.0',
            '10'
        );

        expect(result.type).toBe('sale');
        expect(calculator.purchases.length).toBe(0); // Should have no remaining purchases
        expect(warnings).toEqual([]);
    });

    test('mevcut miktardan fazla satış yapmaya çalışınca uyarı vermelidir', () => {
        const warnings = [];
        calculator = new TaxCalculator(
            SAMPLE_YIUFE_DATA,
            SAMPLE_TCMB_RATES,
            '2023',
            0.20,
            (warning) => warnings.push(warning)
        );

        // 1000 birim al
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1000',
            '1.00',
            '10'
        );

        // 1001 birim satmaya çalış
        calculator.addTransaction(
            '15/05/23 10:00:00',
            'VOOG',
            'Satış',
            '1001',
            '1.0',
            '10'
        );

        expect(warnings).toHaveLength(1);
    });

    test('iki satışla mevcut miktardan fazla satış yapmaya çalışınca uyarı vermelidir', () => {

        const warnings = [];
        calculator = new TaxCalculator(
            SAMPLE_YIUFE_DATA,
            SAMPLE_TCMB_RATES,
            '2023',
            0.20,
            (warning) => warnings.push(warning)
        );
        // 1000 birim al
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1000',
            '1.00',
            '10'
        );
        calculator.addTransaction(
            '15/05/23 10:00:00',
            'VOOG',
            'Satış',
            '500',
            '1.0',
            '10'
        );
        // Try to sell 1001 units
        calculator.addTransaction(
            '15/05/23 10:00:00',
            'VOOG',
            'Satış',
            '501',
            '1.0',
            '10'
        );

        expect(warnings).toHaveLength(1);
    });

    test('farklı sembolleri bağımsız olarak işlemeli', () => {
        // VOOG al
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1000',
            '1.00',
            '10'
        );

        // AAPL al
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'AAPL',
            'Alış',
            '500',
            '1.00',
            '10'
        );

        // VOOG sat
        const result1 = calculator.addTransaction(
            '15/07/23 10:00:00',
            'VOOG',
            'Satış',
            '441',
            '1.0',
            '10'
        );

        // AAPL sat
        const result2 = calculator.addTransaction(
            '15/07/23 10:00:00',
            'AAPL',
            'Satış',
            '441',
            '1.0',
            '10'
        );

        expect(result1.details[0].symbol).toBe('VOOG');
        expect(result2.details[0].symbol).toBe('AAPL');
        expect(calculator.purchases.length).toBe(2); // Should have remaining of both symbols
        expect(warnings).toEqual([]);
    });

    test('calculateTotalTaxableProfit geçersiz verileri doğru işlemeli', () => {
        const invalidData = [
            ['15/03/23 10:00:00', '', 'VOOG'],
            [],
            null,
            ['15/03/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '100', '1.00', '10']
        ];

        const result = calculator.calculateTotalTaxableProfit(invalidData);
        
        expect(result).toBeDefined();
        expect(result.allTransactions).toBeInstanceOf(Array);
        expect(result.allTransactions.length).toBe(1);
        expect(result.totalTaxableProfit).toBe(0);
    });

    test('calculateTotalTaxableProfit farklı vergi yıllarını doğru işlemeli', () => {
        const calculator2024 = new TaxCalculator(
            SAMPLE_YIUFE_DATA,
            SAMPLE_TCMB_RATES,
            '2024',
            0.20
        );

        const multiYearData = [
            ['15/03/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '100', '1.00', '10'],
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '50', '1.00', '10'],
            ['15/03/24 10:00:00', '', 'AAPL', 'Alış', '', '', '', '', '200', '1.00', '10'],
            ['15/07/24 10:00:00', '', 'AAPL', 'Satış', '', '', '', '', '100', '1.00', '10']
        ];

        const result2023 = calculator.calculateTotalTaxableProfit(multiYearData);
        const result2024 = calculator2024.calculateTotalTaxableProfit(multiYearData);
        
        expect(result2023.allTransactions.filter(t => t.vergiDonemi === '2023').length).toBeGreaterThan(0);
        expect(result2024.allTransactions.filter(t => t.vergiDonemi === '2024').length).toBeGreaterThan(0);
        expect(result2023.totalTaxableProfit).not.toBe(result2024.totalTaxableProfit);
    });

    test('calculateTotalTaxableProfit kayıpları ve kazançları birlikte doğru işlemeli', () => {
        const testData = [
            ['15/03/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '100', '1.00', '10'],
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '50', '1.50', '10'], // Kazanç
            ['15/03/23 10:00:00', '', 'AAPL', 'Alış', '', '', '', '', '100', '2.00', '10'],
            ['15/07/23 10:00:00', '', 'AAPL', 'Satış', '', '', '', '', '100', '1.50', '10']  // Kayıp
        ];

        const result = calculator.calculateTotalTaxableProfit(testData);
        
        expect(result).toBeDefined();
        expect(result.allTransactions).toBeDefined();
        expect(result.totalTaxableProfit).toBeDefined();
        
        // Enflasyon ve döviz kurları dikkate alınarak kazanç ve kayıp hesaplamalarını düzelt
        const gainTransaction = (50 * 1.50 * 140) - (50 * 1.00 * 20 * (700 / 300)); // Enflasyon ve döviz kurları dikkate alınarak ayarlandı
        const lossTransaction = (100 * 1.50 * 140) - (100 * 2.00 * 20 * (700 / 300)); // Enflasyon ve döviz kurları dikkate alınarak ayarlandı
        const expectedTotalTaxableProfit = gainTransaction + lossTransaction;

        // Toplam vergilendirilebilir karın yeniden hesaplanan beklenen değere eşit olduğunu doğrula
        expect(result.totalTaxableProfit).toBeCloseTo(expectedTotalTaxableProfit, 2);
    });

    test('calculateTotalTaxableProfit boş veri setini doğru işlemeli', () => {
        const emptyData = [];
        const result = calculator.calculateTotalTaxableProfit(emptyData);
        expect(result.totalTaxableProfit).toBe(0);
        expect(result.allTransactions.length).toBe(0);
    });

    test('calculateTotalTaxableProfit sadece alış işlemlerini doğru işlemeli', () => {
        const purchaseOnlyData = [
            ['15/03/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '100', '1.00', '10'],
            ['15/04/23 10:00:00', '', 'AAPL', 'Alış', '', '', '', '', '200', '2.00', '20']
        ];
        const result = calculator.calculateTotalTaxableProfit(purchaseOnlyData);
        expect(result.totalTaxableProfit).toBe(0);
    });

    test('calculateTotalTaxableProfit alış yapılmadan satış yapmaya çalışınca hata vermelidir', () => {
        const saleOnlyData = [
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '50', '1.50', '10'],
            ['15/08/23 10:00:00', '', 'AAPL', 'Satış', '', '', '', '', '100', '1.50', '10']
        ];
        expect(() => calculator.calculateTotalTaxableProfit(saleOnlyData)).toThrow();
    });

    test('calculateTotalTaxableProfit farklı döviz kurları ile doğru işlemeli', () => {
        const differentRatesData = [
            ['15/03/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '100', '1.00', '10'],
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '50', '1.50', '10'],
            ['15/03/24 10:00:00', '', 'AAPL', 'Alış', '', '', '', '', '200', '2.00', '20'],
            ['15/07/24 10:00:00', '', 'AAPL', 'Satış', '', '', '', '', '100', '2.50', '20']
        ];
        const result = calculator.calculateTotalTaxableProfit(differentRatesData);
        expect(result.totalTaxableProfit).toBeDefined();
    });

    test('calculateTotalTaxableProfit farklı enflasyon oranları ile doğru işlemeli', () => {
        const differentInflationData = [
            ['15/03/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '100', '1.00', '10'],
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '50', '1.50', '10'],
            ['15/03/24 10:00:00', '', 'AAPL', 'Alış', '', '', '', '', '200', '2.00', '20'],
            ['15/07/24 10:00:00', '', 'AAPL', 'Satış', '', '', '', '', '100', '2.50', '20']
        ];
        const result = calculator.calculateTotalTaxableProfit(differentInflationData);
        const voogSell = result.allTransactions.find(t => t['2'] === 'VOOG' && t[3] === 'Satış');
        expect(result.totalTaxableProfit).toBe(voogSell.adjustedProfit); // AAPL satış işlemi 2024 yılında yapıldığı için profite katılmamalı
    });

    test('calculateTotalTaxableProfit negatif miktar veya fiyatları doğru işlemeli', () => {
        const negativeData = [
            ['15/03/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '-100', '1.00', '10'],
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '50', '-1.50', '10']
        ];
        expect(() => calculator.calculateTotalTaxableProfit(negativeData)).toThrow(`Negatif miktar veya fiyat geçersizdir: ${negativeData[0]}`);
    });

    test('calculateTotalTaxableProfit büyük veri setini doğru işlemeli', () => {
        const largeBuyData = [];
        for (let i = 0; i < 1000; i++) {
            largeBuyData.push(['15/03/23 10:00:00', '', 'VOOG', 'Alış' , '', '', '', '', '100', '1.00', '10'])
        }
        const largeSellData = [];
        for (let i = 0; i < 1000; i++) {
            largeSellData.push(['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '50', '1.50', '10'])
        }
        const largeData = [...largeBuyData, ...largeSellData];

        const result = calculator.calculateTotalTaxableProfit(largeData);
        expect(result.totalTaxableProfit).toBeCloseTo(8166666.666, 2);
    });

    test('calculateTotalTaxableProfit kar durumunda Yİ-ÜFE artışı %10 veya daha fazla olduğunda enflasyon düzeltmesi yapmalı', () => {
        // Test için özel Yİ-ÜFE verileri oluştur
        const testYiufeData = {
            '202301': 100.00,  // Ocak değeri
            '202306': 109.00,  // %9 artış - düzeltme yapılmamalı
            '202309': 110.00   // %10 artış - düzeltme yapılmalı
        };
        const testTcmbRates = {
            '2023-02-14': 100,
            '2023-07-14': 200,
            '2023-10-14': 200
        };

        const calculator = new TaxCalculator(
            testYiufeData,
            testTcmbRates
        );

        // Test verisi: Ocak'ta alış, Temmuz ve Ağustos'ta satış
        const testData = [
            ['15/02/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '2000', '1.00', '10'],
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '1000', '1.00', '10'], // yiufe %9 artış
            ['15/10/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '1000', '1.00', '10']  // yiufe %10 artış
        ];

        const result = calculator.calculateTotalTaxableProfit(testData);
        
        // İşlemleri bul
        const temmuzSatisi = result.allTransactions.find(t => t.type === 'split' && t[0].includes('15/07/23'));
        const ekimSatisi = result.allTransactions.find(t => t.type === 'split' && t[0].includes('15/10/23'));

        // 100 * 1.00 * 2000 - 100 * 1.00 * 1000
        const expectedTemmuzAdjustedProfit = 100000 
        // 100 * 1.00 * 2000 - 100 * 1.00 * 1000 * (110 / 100)
        const expectedEkimAdjustedProfit = 90000 
        // Temmuz satışında (<%10 artış) enflasyon düzeltmesi yapılmamalı
        expect(temmuzSatisi.adjustedProfit).toBeCloseTo(expectedTemmuzAdjustedProfit, 2);

        // Ekim satışında (>=%10 artış) enflasyon düzeltmesi yapılmalı
        expect(ekimSatisi.adjustedProfit).toBeCloseTo(expectedEkimAdjustedProfit, 2);
    });


    test('calculateTotalTaxableProfit zarar durumunda Yİ-ÜFE artışı %10 veya daha fazla olduğunda enflasyon düzeltmesi yapmalı', () => {
        // Test için özel Yİ-ÜFE verileri oluştur
        const testYiufeData = {
            '202301': 100.00,  // Ocak değeri
            '202306': 109.00,  // %9 artış - düzeltme yapılmamalı
            '202309': 110.00   // %10 artış - düzeltme yapılmalı
        };
        const testTcmbRates = {
            '2023-02-14': 200,
            '2023-07-14': 100,
            '2023-10-14': 100
        };

        const calculator = new TaxCalculator(
            testYiufeData,
            testTcmbRates
        );

        // Test verisi: Ocak'ta alış, Temmuz ve Ağustos'ta satış
        const testData = [
            ['15/02/23 10:00:00', '', 'VOOG', 'Alış', '', '', '', '', '2000', '1.00', '10'],
            ['15/07/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '1000', '1.00', '10'], // yiufe %9 artış
            ['15/10/23 10:00:00', '', 'VOOG', 'Satış', '', '', '', '', '1000', '1.00', '10']  // yiufe %10 artış
        ];

        const result = calculator.calculateTotalTaxableProfit(testData);
        
        // İşlemleri bul
        const temmuzSatisi = result.allTransactions.find(t => t.type === 'split' && t[0].includes('15/07/23'));
        const ekimSatisi = result.allTransactions.find(t => t.type === 'split' && t[0].includes('15/10/23'));

        // 100 * 1.00 * 1000 - 100 * 1.00 * 2000
        const expectedTemmuzAdjustedProfit = -100000 
        // 100 * 1.00 * 1000 - 100 * 1.00 * 2000 * (110 / 100)
        const expectedEkimAdjustedProfit = -120000
        // Temmuz satışında (<%10 artış) enflasyon düzeltmesi yapılmamalı
        expect(temmuzSatisi.adjustedProfit).toBeCloseTo(expectedTemmuzAdjustedProfit); 

        // Ekim satışında (>=%10 artış) enflasyon düzeltmesi yapılmalı
        expect(ekimSatisi.adjustedProfit).toBeCloseTo(expectedEkimAdjustedProfit, 2);
    });


}); 
