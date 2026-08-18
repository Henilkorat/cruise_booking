const db = require('../db');

/**
 * Create a new booking for a cruise.
 * @param {Object} bookingDetails
 * @param {number} bookingDetails.cruiseId - ID of the cruise.
 * @param {string} bookingDetails.passengerName - Passenger full name.
 * @param {string} bookingDetails.passengerEmail - Passenger email address.
 * @returns {Object} The created booking record.
 */
function createBooking({ cruiseId, passengerName, passengerEmail }) {
  // Check if cruise exists
  const cruise = db.prepare('SELECT id FROM cruises WHERE id = ?').get(cruiseId);
  if (!cruise) {
    throw new Error('CRUISE_NOT_FOUND');
  }

  const bookingDate = new Date().toISOString().split('T')[0];

  const statement = db.prepare(`
    INSERT INTO bookings (cruise_id, passenger_name, passenger_email, booking_date)
    VALUES (?, ?, ?, ?)
  `);

  const info = statement.run(cruiseId, passengerName, passengerEmail, bookingDate);

  // Return the newly created booking record
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(info.lastInsertRowid);
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

module.exports = {
  createBooking,
  getBookingsByCruise
};
