const TaxCalculator = require('./tax_calculator.js');

// Sample test data - Monthly YI-UFE data
const SAMPLE_YIUFE_DATA = {
    '202212': 1128.45,
    '202301': 1093.93,
    '202302': 1240.44,
    '202303': 1389.40,
    '202304': 1451.36,
    '202305': 1591.71,
    '202306': 1600.43
};

// Sample test data - Daily TCMB rates
const SAMPLE_TCMB_RATES = {
    '2023-01-14': 18.79,
    '2023-02-14': 18.84,
    '2023-03-14': 18.97,
    '2023-04-14': 19.35,
    '2023-05-14': 19.48,
    '2023-06-14': 19.56,
    '2023-07-14': 19.62
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

    test('should initialize with correct values', () => {
        expect(calculator.yiufeData).toBe(SAMPLE_YIUFE_DATA);
        expect(calculator.tcmbRates).toBe(SAMPLE_TCMB_RATES);
        expect(calculator.vergiDonemi).toBe('2023');
        expect(calculator.vergiOrani).toBe(0.20);
        expect(calculator.purchases).toEqual([]);
    });

    test('should get previous exchange rate correctly', () => {
        const rate = calculator.getPreviousExchangeRate('15/03/23 10:10:00');
        expect(rate).toBe(18.97); 
    });

    test('should throw error for invalid exchange rate date', () => {
        expect(() => {
            calculator.getPreviousExchangeRate('16/12/22 10:10:00');
        }).toThrow();
    });

    test('should get previous YI-UFE value correctly', () => {
        const yiufe = calculator.getPreviousYiufe('15/03/23');
        expect(yiufe).toBe(1240.44); // Should get February value
    });

    test('should throw error for invalid YI-UFE period', () => {
        expect(() => {
            calculator.getPreviousYiufe('16/12/22');
        }).toThrow();
    });

    test('should process a buy transaction correctly', () => {
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

    test('should process a complete buy-sell cycle correctly', () => {
        // First buy in March
        calculator.addTransaction(
            '15/03/23 10:00:00',
            'VOOG',
            'Alış',
            '1.5',
            '220.22',
            '10'
        );

        // Then sell in May
        const result = calculator.addTransaction(
            '15/05/23 10:00:00',
            'VOOG',
            'Satış',
            '1.0',
            '250.00',
            '10'
        );

        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(1);
        expect(result.details[0].amount).toBe(1.0);
        expect(result.details[0].buyPrice).toBe(220.22);
        expect(result.details[0].sellPrice).toBe(250.00);
        expect(result.details[0].buyYiufe).toBe(1240.44); 
        expect(result.details[0].sellYiufe).toBe(1451.36); 
        expect(result.details[0].buyExchangeRate).toBe(18.97); 
        expect(result.details[0].sellExchangeRate).toBe(19.48); 
        console.log(result);
        expect(result.summary.taxableAmount).toBe(0);
        expect(calculator.purchases.length).toBe(1); 
    });

    test('should handle multiple buys and sells correctly', () => {
        // Multiple buys at different prices
        calculator.addTransaction('15/03/23 10:00:00', 'VOOG', 'Alış', '1.0', '220.22', '10');
        calculator.addTransaction('15/04/23 10:00:00', 'VOOG', 'Alış', '1.0', '230.00', '10');
        
        // Sell more than one buy's worth
        const result = calculator.addTransaction('15/05/23 10:00:00', 'VOOG', 'Satış', '1.5', '250.00', '10');
        
        expect(result.type).toBe('sale');
        expect(result.details.length).toBe(2); // Should use two buy transactions
        expect(calculator.purchases.length).toBe(1); // Should have 0.5 VOOG left from second purchase
    });

    test('should handle tax period changes', () => {
        calculator.addTransaction('15/03/23 10:00:00', 'VOOG', 'Alış', '1.0', '220.22', '10');
        
        // Sell in current tax period
        let result1 = calculator.addTransaction('15/05/23 10:00:00', 'VOOG', 'Satış', '0.5', '250.00', '10');
        expect(result1.summary.taxableAmount).toBe(0);
        
        // Change tax period
        calculator.setVergiDonemi('2024');
        
        // Sell in different tax period
        let result2 = calculator.addTransaction('15/05/23 10:00:00', 'VOOG', 'Satış', '0.5', '250.00', '10');
        expect(result2.summary.taxableAmount).toBe(0);
    });

    test('should reset calculator state', () => {
        calculator.addTransaction('15/03/23 10:00:00', 'VOOG', 'Alış', '1.0', '220.22', '10');
        expect(calculator.purchases.length).toBe(1);
        
        calculator.reset();
        expect(calculator.purchases.length).toBe(0);
    });
}); 