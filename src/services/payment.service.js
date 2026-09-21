/**
 * Razorpay Payment Gateway Service
 * Manages Razorpay SDK initialization, Order creation, and HMAC SHA256 Signature Verification.
 */
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../config/mysql');

class PaymentService {
  constructor() {
    this.razorpayInstance = null;
  }

  /**
   * Get or initialize Razorpay SDK Instance
   */
  getRazorpayInstance() {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;

    if (!key_id || !key_secret || key_id.startsWith('rzp_test_kiaan_')) {
      return null; // Fallback to mock / test order mode if keys are placeholders
    }

    if (!this.razorpayInstance) {
      this.razorpayInstance = new Razorpay({
        key_id,
        key_secret
      });
    }

    return this.razorpayInstance;
  }

  /**
   * Create Razorpay Order
   * @param {number} amountInPaise
   * @param {string} currency
   * @param {object} notes
   */
  async createOrder(amountInPaise, currency = 'INR', notes = {}) {
    const instance = this.getRazorpayInstance();

    if (instance) {
      const options = {
        amount: Math.round(amountInPaise),
        currency,
        receipt: `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        notes
      };
      const order = await instance.orders.create(options);
      return {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt,
        is_live: true
      };
    }

    // Fallback Mock Order ID for development / testing without live API keys
    const mockOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      order_id: mockOrderId,
      amount: amountInPaise,
      currency,
      status: 'created',
      receipt: `rcpt_mock_${Date.now()}`,
      is_live: false
    };
  }

  /**
   * Verify Razorpay Payment Signature (HMAC SHA-256)
   * @param {string} orderId
   * @param {string} paymentId
   * @param {string} signature
   */
  verifySignature(orderId, paymentId, signature) {
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) return true; // Accept in test mode if secret not set

    const generatedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return generatedSignature === signature;
  }

  /**
   * Verify Webhook Signature (HMAC SHA-256)
   * @param {string|Buffer} rawBody
   * @param {string} webhookSignature
   */
  verifyWebhookSignature(rawBody, webhookSignature) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return true;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    return expectedSignature === webhookSignature;
  }
}

module.exports = new PaymentService();

