import db from '../db.js';
import { calculatePricing } from './pricingService.js';

/**
 * Creates a confirmed booking with passenger lists, optional services, and promo codes.
 * Runs entirely inside a single SQLite transaction to prevent race conditions.
 *
 * @param {Object} params
 * @param {number} params.customerId - ID of the customer making the booking.
 * @param {number} params.cruiseId - ID of the cruise.
 * @param {Array<Object>} params.passengers - List of passengers: [{ firstName, lastName, age }, ...]
 * @param {Array<string>} params.optionalServices - Optional services names, e.g. ['Insurance', 'WiFi']
 * @param {string} [params.promoCode] - Optional promotional code.
 * 
 * @returns {Object} Confirmed booking details and breakdown.
 */
function createBooking({ customerId, cruiseId, passengers, optionalServices = [], promoCode }) {
  // Define transaction logic
  const executeTransaction = db.transaction(() => {
    // 1. Verify Customer exists
    const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }

    // 2. Verify Cruise exists and has capacity
    // SELECT FOR UPDATE equivalent in SQLite: SQLite locks the database on writes. 
    // We select details to do manual validation.
    const cruise = db.prepare('SELECT * FROM cruises WHERE id = ?').get(cruiseId);
    if (!cruise) {
      throw new Error('CRUISE_NOT_FOUND');
    }

    const passengerCount = passengers.length;
    if (cruise.booked_count + passengerCount > cruise.capacity) {
      throw new Error('CRUISE_FULLY_BOOKED');
    }

    // 3. Compute pricing breakdown (validates passenger count limits, promo codes date, and spending boundaries)
    const passengerAges = passengers.map(p => p.age);
    const pricing = calculatePricing({
      cruiseId,
      passengers: passengerAges,
      optionalServices,
      promoCode,
      customerId,
      currentDate: new Date().toISOString().split('T')[0]
    });

    // 4. Generate unique booking reference (CRZ-XXXXXX)
    let bookingReference;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      attempts++;
      bookingReference = 'CRZ-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const existing = db.prepare('SELECT id FROM bookings WHERE booking_reference = ?').get(bookingReference);
      if (!existing) {
        isUnique = true;
      }
    }
    if (!isUnique) {
      throw new Error('BOOKING_REFERENCE_GENERATION_FAILED');
    }

    // 5. Insert Booking record
    const bookingDate = new Date().toISOString().split('T')[0];
    const bookingInsert = db.prepare(`
      INSERT INTO bookings (booking_reference, customer_id, cruise_id, booking_date, status)
      VALUES (?, ?, ?, ?, 'confirmed')
    `).run(bookingReference, customerId, cruiseId, bookingDate);
    const bookingId = bookingInsert.lastInsertRowid;

    // 6. Insert Passengers list (triggers trg_passenger_insert to update capacity)
    const passengerInsert = db.prepare(`
      INSERT INTO passengers (booking_id, first_name, last_name, age, type)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of passengers) {
      const age = p.age === 'adult' ? 18 : parseInt(p.age, 10);
      const type = age >= 18 ? 'adult' : 'child';
      passengerInsert.run(bookingId, p.firstName, p.lastName, age, type);
    }

    // 7. Insert Optional Services selections
    const serviceInsert = db.prepare(`
      INSERT INTO booking_service_selections (booking_id, service_id, quantity, price_charged)
      VALUES (?, ?, ?, ?)
    `);
    for (const s of pricing.optionalServices) {
      const service = db.prepare('SELECT id FROM services WHERE name = ?').get(s.name);
      if (service) {
        serviceInsert.run(bookingId, service.id, s.quantity, s.rate);
      }
    }

    // 8. Apply Promo Code Redemption (triggers global and customer limit checks)
    if (promoCode) {
      const codeUpper = promoCode.trim().toUpperCase();
      const promo = db.prepare('SELECT id FROM promo_codes WHERE code = ?').get(codeUpper);
      if (promo) {
        db.prepare(`
          INSERT INTO promo_code_redemptions (booking_id, promo_code_id, customer_id)
          VALUES (?, ?, ?)
        `).run(bookingId, promo.id, customerId);
      }
    }

    // 9. Insert Price Snapshot
    const promoApplied = pricing.promoCodeApplied;
    // Find the first child discount applied (or 0)
    const childDiscountApplied = pricing.passengers.find(p => p.discountPct > 0)?.discountPct || 0;

    db.prepare(`
      INSERT INTO booking_price_snapshots (
        booking_id, base_fare_charged, child_discount_pct_applied,
        group_discount_pct_applied, tax_rate_applied, promo_type_applied,
        promo_value_applied, total_price_charged
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookingId,
      pricing.cruiseDetails.basePrice,
      childDiscountApplied,
      pricing.groupDiscount.percentage,
      pricing.tax.rate,
      promoApplied ? promoApplied.discountType : null,
      promoApplied ? promoApplied.discountAmount : 0,
      pricing.totalPrice
    );

    // Return the created structure
    return {
      bookingId,
      bookingReference,
      customerId,
      cruiseId,
      status: 'confirmed',
      bookingDate,
      totalPrice: pricing.totalPrice,
      breakdown: pricing
    };
  });

  // Execute the database transaction
  // If any code or database constraint throws an error, better-sqlite3 automatically rolls back the transaction.
  return executeTransaction();
}

/**
 * Get all bookings for a specific cruise.
 * @param {number} cruiseId - Cruise ID.
 * @returns {Array} List of bookings for the cruise.
 */
function getBookingsByCruise(cruiseId) {
  const query = 'SELECT * FROM bookings WHERE cruise_id = ?';
  return db.prepare(query).all(cruiseId);
}

export {
  createBooking,
  getBookingsByCruise
};
