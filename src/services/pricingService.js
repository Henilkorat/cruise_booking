const db = require('../db');

/**
 * Calculates itemized cruise booking prices based on business rules.
 * 
 * @param {Object} params
 * @param {number} params.cruiseId - ID of the cruise.
 * @param {Array<Object|number|string>} params.passengers - Passengers list. Each item is either:
 *   - A number representing age.
 *   - A string 'adult' (assumed age 18).
 *   - An object { age } or { age, name }.
 * @param {Array<string>} params.optionalServices - List of service names (e.g. ['Insurance', 'WiFi']).
 * @param {string} [params.promoCode] - Optional coupon code to apply.
 * @param {number} [params.customerId] - ID of the customer (required if promoCode is checked for per-customer limit).
 * @param {string} [params.currentDate] - Current date string (YYYY-MM-DD) for promo validation. Defaults to today's date.
 * 
 * @returns {Object} Itemized breakdown.
 */
function calculatePricing({ cruiseId, passengers, optionalServices = [], promoCode, customerId, currentDate }) {
  // Helpers
  const roundMoney = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

  // 1. Fetch Cruise details from DB
  const cruise = db.prepare('SELECT * FROM cruises WHERE id = ?').get(cruiseId);
  if (!cruise) {
    throw new Error('CRUISE_NOT_FOUND');
  }

  // 2. Validate passengers count & age boundaries
  if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
    throw new Error('NO_PASSENGERS_PROVIDED');
  }
  if (passengers.length > 6) {
    throw new Error('MAX_PASSENGERS_EXCEEDED');
  }

  // Standardize passengers into structures with calculated ages
  const standardizedPassengers = passengers.map((p, idx) => {
    let age;
    let name = `Passenger ${idx + 1}`;
    if (typeof p === 'number') {
      age = p;
    } else if (p === 'adult') {
      age = 18;
    } else if (p && typeof p === 'object') {
      age = p.age === 'adult' ? 18 : parseInt(p.age, 10);
      if (p.name) name = p.name;
    } else {
      throw new Error('INVALID_PASSENGER_FORMAT');
    }

    if (isNaN(age) || age < 0) {
      throw new Error('INVALID_PASSENGER_AGE');
    }

    return { name, age };
  });

  // Check minimum 1 adult (age >= 18) requirement
  const adultCount = standardizedPassengers.filter(p => p.age >= 18).length;
  if (adultCount === 0) {
    throw new Error('MINIMUM_ONE_ADULT_REQUIRED');
  }

  // 3. Compute Child Fare Bands
  // Age bands: 0-4 free (100% off), 5-11 = 50% of adult fare, 12-17 = 75% of adult (25% off), 18+ = full adult fare (0% off)
  const baseCruiseFare = cruise.base_price;
  let faresSubtotal = 0;

  const itemizedPassengers = standardizedPassengers.map(p => {
    let discountPct = 0;
    let category = 'Adult';

    if (p.age >= 0 && p.age <= 4) {
      discountPct = 100;
      category = 'Infant (0-4)';
    } else if (p.age >= 5 && p.age <= 11) {
      discountPct = 50;
      category = 'Child (5-11)';
    } else if (p.age >= 12 && p.age <= 17) {
      discountPct = 25;
      category = 'Teen (12-17)';
    }

    const passengerFare = roundMoney(baseCruiseFare * (1 - discountPct / 100));
    faresSubtotal += passengerFare;

    return {
      name: p.name,
      age: p.age,
      category,
      originalFare: baseCruiseFare,
      discountPct,
      finalFare: passengerFare
    };
  });

  faresSubtotal = roundMoney(faresSubtotal);

  // 4. Compute Group Discount
  // 1-2 passengers = 0%, 3-4 = 5%, 5-6 = 10%
  const totalCount = standardizedPassengers.length;
  let groupDiscountPct = 0;
  if (totalCount >= 3 && totalCount <= 4) {
    groupDiscountPct = 5;
  } else if (totalCount >= 5 && totalCount <= 6) {
    groupDiscountPct = 10;
  }

  const groupDiscountAmount = roundMoney(faresSubtotal * (groupDiscountPct / 100));
  const cruiseFaresNet = roundMoney(faresSubtotal - groupDiscountAmount);

  // 5. Compute Optional Services (Insurance $80/passenger, WiFi $15/passenger/night, Shore Excursion $120/passenger)
  // These are NOT subject to group discount
  let servicesSubtotal = 0;
  const itemizedServices = [];

  // Match optional services names case-insensitively
  const normalizedServices = optionalServices.map(s => s.toLowerCase());

  // Check service definitions
  if (normalizedServices.includes('insurance')) {
    const rate = 80.00;
    const cost = roundMoney(rate * totalCount);
    servicesSubtotal += cost;
    itemizedServices.push({
      name: 'Insurance',
      rate,
      quantity: totalCount,
      nights: null,
      total: cost
    });
  }

  if (normalizedServices.includes('wifi')) {
    const rate = 15.00;
    const nights = cruise.duration_nights;
    const cost = roundMoney(rate * totalCount * nights);
    servicesSubtotal += cost;
    itemizedServices.push({
      name: 'WiFi',
      rate,
      quantity: totalCount,
      nights,
      total: cost
    });
  }

  if (normalizedServices.includes('shore excursion') || normalizedServices.includes('shoreexcursion')) {
    const rate = 120.00;
    const cost = roundMoney(rate * totalCount);
    servicesSubtotal += cost;
    itemizedServices.push({
      name: 'Shore Excursion',
      rate,
      quantity: totalCount,
      nights: null,
      total: cost
    });
  }

  servicesSubtotal = roundMoney(servicesSubtotal);
  const prePromoSubtotal = roundMoney(cruiseFaresNet + servicesSubtotal);

  // 6. Handle Promo Codes
  let promoDiscountAmount = 0;
  let promoApplied = null;

  if (promoCode) {
    // Standardize code to uppercase
    const codeUpper = promoCode.trim().toUpperCase();
    const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ?').get(codeUpper);

    // Validate: code exists
    if (!promo) {
      throw new Error('invalid code');
    }

    // Validate: date range (expired)
    const activeDate = currentDate || new Date().toISOString().split('T')[0];
    if (activeDate < promo.start_date || activeDate > promo.end_date) {
      throw new Error('expired');
    }

    // Validate: max global redemptions (exhausted)
    if (promo.redemption_count >= promo.max_redemptions) {
      throw new Error('exhausted');
    }

    // Validate: per-customer limit
    if (customerId) {
      const redemptionsCount = db.prepare(`
        SELECT COUNT(*) as count 
        FROM promo_code_redemptions 
        WHERE promo_code_id = ? AND customer_id = ?
      `).get(promo.id, customerId).count;

      if (redemptionsCount >= promo.limit_per_customer) {
        throw new Error('per-customer limit reached');
      }
    }

    // Validate: minimum spend met (on the pre-promo subtotal)
    if (prePromoSubtotal < promo.min_spend) {
      throw new Error('minimum spend not met');
    }

    // Calculate Promo Discount
    if (promo.discount_type === 'percent') {
      promoDiscountAmount = roundMoney(prePromoSubtotal * (promo.discount_value / 100));
    } else if (promo.discount_type === 'flat') {
      promoDiscountAmount = promo.discount_value;
    }

    // Cap promo discount at subtotal to prevent negative billing
    if (promoDiscountAmount > prePromoSubtotal) {
      promoDiscountAmount = prePromoSubtotal;
    }

    promoApplied = {
      code: promo.code,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      discountAmount: promoDiscountAmount
    };
  }

  // 7. Compute Tax (12%)
  // Tax applies to the net amount after promo codes and group discounts have been applied
  const netSubtotal = roundMoney(prePromoSubtotal - promoDiscountAmount);
  const taxRate = 0.12;
  const taxAmount = roundMoney(netSubtotal * taxRate);

  // Final price
  const totalPrice = roundMoney(netSubtotal + taxAmount);

  return {
    cruiseDetails: {
      id: cruise.id,
      name: cruise.name,
      basePrice: cruise.base_price,
      durationNights: cruise.duration_nights
    },
    passengers: itemizedPassengers,
    faresSubtotal,
    groupDiscount: {
      percentage: groupDiscountPct,
      amount: groupDiscountAmount
    },
    cruiseFaresNet,
    optionalServices: itemizedServices,
    servicesSubtotal,
    prePromoSubtotal,
    promoCodeApplied: promoApplied,
    tax: {
      rate: taxRate,
      amount: taxAmount
    },
    totalPrice
  };
}

module.exports = {
  calculatePricing
};
