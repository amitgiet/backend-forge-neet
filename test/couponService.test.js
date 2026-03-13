jest.mock('../src/models/Coupon', () => ({
    findOne: jest.fn()
}));

jest.mock('../src/models/CouponRedemption', () => ({
    countDocuments: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn()
}));

const Coupon = require('../src/models/Coupon');
const CouponRedemption = require('../src/models/CouponRedemption');
const { validateCouponForUser } = require('../src/services/coupon.service');

describe('coupon.service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns zero discount when code is empty', async () => {
        const result = await validateCouponForUser({
            code: '',
            userId: 'u1',
            planCode: 'PRO_MONTHLY',
            baseAmountPaise: 14900
        });

        expect(result.discountAmountPaise).toBe(0);
        expect(result.finalAmountPaise).toBe(14900);
    });

    test('throws when coupon is missing', async () => {
        Coupon.findOne.mockResolvedValue(null);

        await expect(
            validateCouponForUser({
                code: 'SAVE20',
                userId: 'u1',
                planCode: 'PRO_MONTHLY',
                baseAmountPaise: 14900
            })
        ).rejects.toThrow('Invalid coupon code');
    });

    test('applies percent with max cap', async () => {
        const now = Date.now();
        Coupon.findOne.mockResolvedValue({
            _id: 'c1',
            code: 'SAVE20',
            discountPercent: 20,
            maxDiscountPaise: 1000,
            minOrderAmountPaise: 0,
            validFrom: new Date(now - 1000),
            validTill: new Date(now + 1000),
            applicablePlanCodes: ['PRO_MONTHLY'],
            currentUses: 0,
            maxTotalUses: 10,
            maxUsesPerUser: 1
        });
        CouponRedemption.countDocuments.mockResolvedValue(0);

        const result = await validateCouponForUser({
            code: 'SAVE20',
            userId: 'u1',
            planCode: 'PRO_MONTHLY',
            baseAmountPaise: 14900
        });

        expect(result.discountAmountPaise).toBe(1000);
        expect(result.finalAmountPaise).toBe(13900);
    });
});
