const TaxCalculator = require('./tax_calculator.js');

// Örnek test verisi - Aylık Yİ-UFE verileri
const SAMPLE_YIUFE_DATA = {
    '202212': 100.00,
    '202301': 200.00,
    '202302': 300.00,
    '202303': 400.00,
    '202304': 500.00,
    '202305': 600.00,
    '202306': 700.00
};

// Örnek test verisi - Günlük TCMB kurları
const SAMPLE_TCMB_RATES = {
    '2023-01-14': 10.00,
    '2023-02-14': 15.00,
    '2023-03-14': 20.00,
    '2023-04-14': 25.00,
    '2023-05-14': 30.00,
    '2023-06-14': 35.00,
    '2023-07-14': 140.00
};

describe('TaxCalculator', () => {
    let calculator;

    beforeEach(() => {
        calculator = new TaxCalculator(
            SAMPLE_YIUFE_DATA,
            SAMPLE_TCMB_RATES,
            '2023',
            0.20
        );
    });

    test('doğru değerlerle başlatılmalı', () => {
        expect(calculator.yiufeData).toBe(SAMPLE_YIUFE_DATA);
        expect(calculator.tcmbRates).toBe(SAMPLE_TCMB_RATES);
        expect(calculator.vergiDonemi).toBe('2023');
        expect(calculator.vergiOrani).toBe(0.20);
        expect(calculator.purchases).toEqual([]);
    });

    test('önceki döviz kurunu doğru almalı', () => {
        const rate = calculator.getPreviousExchangeRate('15/03/23 10:10:00');
        expect(rate).toBe(20.00); 
    });

    test('geçersiz döviz kuru tarihi için hata fırlatmalı', () => {
        expect(() => {
            calculator.getPreviousExchangeRate('16/12/22 10:10:00');
        }).toThrow();
    });

    test('önceki Yİ-UFE değerini doğru almalı', () => {
        const yiufe = calculator.getPreviousYiufe('15/03/23');
        expect(yiufe).toBe(300.00); // Should get February value
    });

    test('geçersiz Yİ-UFE dönemi için hata fırlatmalı', () => {
        expect(() => {
            calculator.getPreviousYiufe('16/12/22');
        }).toThrow();
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
    });

    test('kârsız bir alış-satış döngüsünü doğru işlemeli', () => {
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
        expect(result.summary.taxableAmount).toBe(0);
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
        expect(result1.summary.taxableAmount).toBe(0);

        // İkinci satış sonuçlarını kontrol et
        expect(result2.type).toBe('sale');
        expect(result2.details.length).toBe(1);
        expect(result2.details[0].amount).toBe(441.0);
        expect(result2.details[0].buyYiufe).toBe(300.00);
        expect(result2.details[0].sellYiufe).toBe(700.00);
        expect(result2.details[0].buyExchangeRate).toBe(20.00);
        expect(result2.details[0].sellExchangeRate).toBe(140.00);
        expect(result2.summary.taxableAmount).toBe(41160);
    });

    test('kârsız işlemler aynı sembol olsa bile vergilendirilebilir tutarı değiştirmemeli', () => {
        // Mart'ta ilk alış
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1000',
            '1.00',
            '10'
        );

        // Sonra Mart'ta satış
        let result = calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Satış',
            '500.00',
            '1.0',
            '10'
        );

        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(1);
        expect(result.details[0].amount).toBe(500.00);
        expect(result.details[0].buyPrice).toBe(1.00);
        expect(result.details[0].sellPrice).toBe(1.00);
        expect(result.details[0].buyYiufe).toBe(300.00); 
        expect(result.details[0].sellYiufe).toBe(300.00); 
        expect(result.details[0].buyExchangeRate).toBe(20.00); 
        expect(result.details[0].sellExchangeRate).toBe(20.00); 
        expect(result.details[0].taxableAmount).toBe(0); 
        expect(result.summary.taxableAmount).toBe(0);


        // Sonra Temmuz'da satış
        result = calculator.addTransaction(
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
        expect(result.details[0].taxableAmount).toBe(41160); 
        expect(result.summary.taxableAmount).toBe(41160);
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
    });

    test('mevcut miktardan fazla satış yapmaya çalışınca hata fırlatmalı', () => {
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
        expect(() => {
            calculator.addTransaction(
                '15/05/23 10:00:00',
                'VOOG',
                'Satış',
                '1001',
                '1.0',
                '10'
            );
        }).toThrow();
    });

    test('iki satışla mevcut miktardan fazla satış yapmaya çalışınca hata fırlatmalı', () => {
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
        expect(() => {
            calculator.addTransaction(
                '15/05/23 10:00:00',
                'VOOG',
                'Satış',
                '501',
                '1.0',
                '10'
            );
        }).toThrow();
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
    });
}); 