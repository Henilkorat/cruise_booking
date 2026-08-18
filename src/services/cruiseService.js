const db = require('../db');

/**
 * Get all available cruises.
 * @returns {Array} List of cruises.
 */
function getAllCruises() {
  const query = 'SELECT * FROM cruises ORDER BY departure_date ASC';
  return db.prepare(query).all();
}

/**
 * Get details for a specific cruise by ID.
 * @param {number} id - Cruise ID.
 * @returns {Object|undefined} Cruise details or undefined if not found.
 */
function getCruiseById(id) {
  const query = 'SELECT * FROM cruises WHERE id = ?';
  return db.prepare(query).get(id);
}

module.exports = {
  getAllCruises,
  getCruiseById
};
