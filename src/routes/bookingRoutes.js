import express from 'express';
const router = express.Router();
import * as bookingService from '../services/bookingService.js';
import { calculatePricing } from '../services/pricingService.js';
import db from '../db.js';

// Helper function to map pricing/booking service errors to Express HTTP responses
function handleServiceError(error, res) {
  const badRequestErrors = [
    'invalid code',
    'expired',
    'exhausted',
    'minimum spend not met',
    'per-customer limit reached',
    'NO_PASSENGERS_PROVIDED',
    'MAX_PASSENGERS_EXCEEDED',
    'MINIMUM_ONE_ADULT_REQUIRED',
    'CRUISE_FULLY_BOOKED',
    'INVALID_PASSENGER_FORMAT',
    'INVALID_PASSENGER_AGE'
  ];

  const notFoundErrors = [
    'CRUISE_NOT_FOUND',
    'CUSTOMER_NOT_FOUND'
  ];

  if (badRequestErrors.includes(error.message)) {
    return res.status(400).json({ error: error.message });
  }

  if (notFoundErrors.includes(error.message)) {
    return res.status(404).json({ error: error.message });
  }

  // Handle SQLite constraint exceptions directly if they leak through triggers
  if (error.message.includes('CHECK constraint failed: booked_count <= capacity')) {
    return res.status(400).json({ error: 'CRUISE_FULLY_BOOKED' });
  }
  if (error.message.includes('PROMO_GLOBAL_LIMIT_REACHED')) {
    return res.status(400).json({ error: 'exhausted' });
  }
  if (error.message.includes('PROMO_CUSTOMER_LIMIT_REACHED')) {
    return res.status(400).json({ error: 'per-customer limit reached' });
  }

  console.error('Unhandled Server Error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}

// POST /api/quote -> Estimate priced breakdown without booking
router.post('/quote', (req, res) => {
  try {
    const { cruiseId, passengers, optionalServices, promoCode, customerId } = req.body;

    // Simple parameters validation
    if (!cruiseId || isNaN(parseInt(cruiseId, 10))) {
      return res.status(400).json({ error: 'Valid cruiseId is required' });
    }

    const pricing = calculatePricing({
      cruiseId: parseInt(cruiseId, 10),
      passengers,
      optionalServices,
      promoCode,
      customerId: customerId ? parseInt(customerId, 10) : null,
      currentDate: new Date().toISOString().split('T')[0]
    });

    res.json(pricing);
  } catch (error) {
    handleServiceError(error, res);
  }
});

// POST /api/bookings -> Confirms and persists a booking
router.post('/', (req, res) => {
  try {
    const { customerId, cruiseId, passengers, optionalServices, promoCode } = req.body;

    // Parameters validation
    if (!customerId || isNaN(parseInt(customerId, 10))) {
      return res.status(400).json({ error: 'Valid customerId is required' });
    }
    if (!cruiseId || isNaN(parseInt(cruiseId, 10))) {
      return res.status(400).json({ error: 'Valid cruiseId is required' });
    }
    if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).json({ error: 'Passengers list is required' });
    }

    const booking = bookingService.createBooking({
      customerId: parseInt(customerId, 10),
      cruiseId: parseInt(cruiseId, 10),
      passengers,
      optionalServices,
      promoCode
    });

    res.status(201).json(booking);
  } catch (error) {
    handleServiceError(error, res);
  }
});

// GET /api/bookings/:reference -> Retrieve a confirmed booking's stored breakdown
router.get('/:reference', (req, res) => {
  try {
    const refUpper = req.params.reference.trim().toUpperCase();

    // Query booking header
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_reference = ?').get(refUpper);
    if (!booking) {
      return res.status(404).json({ error: 'Booking reference not found' });
    }

    // Query passengers list
    const passengers = db.prepare('SELECT first_name, last_name, age, type FROM passengers WHERE booking_id = ?').all(booking.id);

    // Query optional services selections
    const optionalServices = db.prepare(`
      SELECT s.name, s.price as rate, bs.quantity, bs.price_charged as total
      FROM booking_service_selections bs
      JOIN services s ON bs.service_id = s.id
      WHERE bs.booking_id = ?
    `).all(booking.id);

    // Query price snapshot details
    const priceSnapshot = db.prepare('SELECT * FROM booking_price_snapshots WHERE booking_id = ?').get(booking.id);

    res.json({
      bookingId: booking.id,
      bookingReference: booking.booking_reference,
      customerId: booking.customer_id,
      cruiseId: booking.cruise_id,
      bookingDate: booking.booking_date,
      status: booking.status,
      passengers: passengers.map(p => ({
        firstName: p.first_name,
        lastName: p.last_name,
        age: p.age,
        type: p.type
      })),
      optionalServices: optionalServices.map(s => ({
        name: s.name,
        rate: s.rate,
        quantity: s.quantity,
        total: s.total
      })),
      priceSnapshot: priceSnapshot ? {
        baseFareCharged: priceSnapshot.base_fare_charged,
        childDiscountPctApplied: priceSnapshot.child_discount_pct_applied,
        groupDiscountPctApplied: priceSnapshot.group_discount_pct_applied,
        taxRateApplied: priceSnapshot.tax_rate_applied,
        promoTypeApplied: priceSnapshot.promo_type_applied,
        promoValueApplied: priceSnapshot.promo_value_applied,
        totalPriceCharged: priceSnapshot.total_price_charged
      } : null
    });
  } catch (error) {
    console.error('Error fetching booking details:', error);
    res.status(500).json({ error: 'Failed to retrieve booking details' });
  }
});

// GET /customers/list -> Fetch seeded customers
router.get('/customers/list', (req, res) => {
  try {
    const customers = db.prepare('SELECT id, first_name, last_name, email FROM customers').all();
    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to retrieve customers' });
  }
});

export default router;
