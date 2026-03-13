const crypto = require('crypto');
const User = require('../models/User');
const Referral = require('../models/Referral');
const ReferralConversion = require('../models/ReferralConversion');
const { REFERRAL_REWARD_DAYS } = require('../config/billingConfig');
const subscriptionService = require('./subscription.service');

const generateReferralCode = () => `NF${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const ensureReferralForUser = async (user) => {
    if (!user.referralCode) {
        user.referralCode = generateReferralCode();
        await user.save({ validateBeforeSave: false });
    }

    await Referral.findOneAndUpdate(
        { ownerUserId: user._id },
        {
            $setOnInsert: {
                ownerUserId: user._id,
                code: user.referralCode,
                isActive: true
            },
            $set: { code: user.referralCode }
        },
        { upsert: true, new: true }
    );

    return user.referralCode;
};

const validateReferralCode = async ({ referralCode, userId }) => {
    const normalized = String(referralCode || '').trim().toUpperCase();
    if (!normalized) return null;

    const referral = await Referral.findOne({ code: normalized, isActive: true });
    if (!referral) throw new Error('Invalid referral code');

    if (String(referral.ownerUserId) === String(userId)) {
        throw new Error('Self referral is not allowed');
    }

    return referral;
};

const grantReferralRewardForPayment = async (paymentDoc) => {
    if (!paymentDoc?.referredByUserId) return null;

    const existingForReferredUser = await ReferralConversion.findOne({
        referredUserId: paymentDoc.userId
    });
    if (existingForReferredUser) {
        return null;
    }

    const conversion = await ReferralConversion.create({
        referrerUserId: paymentDoc.referredByUserId,
        referredUserId: paymentDoc.userId,
        paymentId: paymentDoc._id,
        rewardDaysGranted: REFERRAL_REWARD_DAYS,
        rewardDaysRevoked: 0,
        status: 'granted'
    });

    await subscriptionService.activateProForDays(
        paymentDoc.referredByUserId,
        REFERRAL_REWARD_DAYS,
        paymentDoc._id
    );

    await Referral.updateOne(
        { ownerUserId: paymentDoc.referredByUserId },
        {
            $inc: {
                totalConversions: 1,
                totalRewardDaysGranted: REFERRAL_REWARD_DAYS
            }
        }
    );

    return conversion;
};

const revokeReferralRewardForRefund = async (paymentDoc) => {
    const conversion = await ReferralConversion.findOne({
        paymentId: paymentDoc._id,
        status: 'granted'
    });
    if (!conversion) return null;

    await subscriptionService.revokeDays(conversion.referrerUserId, conversion.rewardDaysGranted);

    conversion.status = 'revoked';
    conversion.rewardDaysRevoked = conversion.rewardDaysGranted;
    await conversion.save();

    await Referral.updateOne(
        { ownerUserId: conversion.referrerUserId },
        { $inc: { totalRewardDaysRevoked: conversion.rewardDaysGranted } }
    );

    return conversion;
};

module.exports = {
    ensureReferralForUser,
    validateReferralCode,
    grantReferralRewardForPayment,
    revokeReferralRewardForRefund
};
