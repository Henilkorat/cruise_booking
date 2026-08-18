const Database = require('better-sqlite3');
const path = require('path');

// Resolve path to the database file in the project root
const dbPath = path.resolve(__dirname, '../cruise_booking.db');

// Initialize better-sqlite3 database
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Initialize database schema tables and triggers
function initializeSchema() {
  // 1. Cruises table (with capacity constraint)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS cruises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      destination TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      base_price REAL NOT NULL CHECK(base_price >= 0),
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      booked_count INTEGER NOT NULL DEFAULT 0 CHECK(booked_count <= capacity)
    )
  `).run();

  // 2. Customers table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT
    )
  `).run();

  // 3. Bookings table (with unique reference code constraint)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_reference TEXT UNIQUE NOT NULL CHECK(length(booking_reference) >= 6),
      customer_id INTEGER NOT NULL,
      cruise_id INTEGER NOT NULL,
      booking_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'cancelled')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (cruise_id) REFERENCES cruises(id) ON DELETE RESTRICT
    )
  `).run();

  // 4. Passengers table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS passengers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      age INTEGER NOT NULL CHECK(age >= 0),
      type TEXT NOT NULL CHECK(type IN ('adult', 'child')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    )
  `).run();

  // 5. Services table (optional service catalog)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      price REAL NOT NULL CHECK(price >= 0)
    )
  `).run();

  // 6. Booking service selections (priced snapshot of service purchases)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS booking_service_selections (
      booking_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
      price_charged REAL NOT NULL CHECK(price_charged >= 0),
      PRIMARY KEY (booking_id, service_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
    )
  `).run();

  // 7. Promo codes table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('flat', 'percent')),
      discount_value REAL NOT NULL CHECK(discount_value >= 0),
      max_redemptions INTEGER NOT NULL CHECK(max_redemptions >= 0),
      limit_per_customer INTEGER NOT NULL DEFAULT 1 CHECK(limit_per_customer >= 0),
      redemption_count INTEGER NOT NULL DEFAULT 0 CHECK(redemption_count <= max_redemptions)
    )
  `).run();

  // 8. Promo code redemptions
  db.prepare(`
    CREATE TABLE IF NOT EXISTS promo_code_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER UNIQUE NOT NULL, -- max 1 promo code per booking
      promo_code_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id) ON DELETE RESTRICT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    )
  `).run();

  // 9. Child fare bands
  db.prepare(`
    CREATE TABLE IF NOT EXISTS child_fare_bands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      min_age INTEGER NOT NULL CHECK(min_age >= 0),
      max_age INTEGER NOT NULL CHECK(max_age >= min_age),
      discount_pct REAL NOT NULL CHECK(discount_pct >= 0 AND discount_pct <= 100)
    )
  `).run();

  // 10. Group discount tiers
  db.prepare(`
    CREATE TABLE IF NOT EXISTS group_discount_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      min_passengers INTEGER UNIQUE NOT NULL CHECK(min_passengers > 0),
      discount_pct REAL NOT NULL CHECK(discount_pct >= 0 AND discount_pct <= 100)
    )
  `).run();

  // 11. Booking price snapshots (preserving price reconstructability)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS booking_price_snapshots (
      booking_id INTEGER PRIMARY KEY,
      base_fare_charged REAL NOT NULL CHECK(base_fare_charged >= 0),
      child_discount_pct_applied REAL NOT NULL DEFAULT 0 CHECK(child_discount_pct_applied >= 0 AND child_discount_pct_applied <= 100),
      group_discount_pct_applied REAL NOT NULL DEFAULT 0 CHECK(group_discount_pct_applied >= 0 AND group_discount_pct_applied <= 100),
      tax_rate_applied REAL NOT NULL DEFAULT 0.12 CHECK(tax_rate_applied >= 0),
      promo_type_applied TEXT CHECK(promo_type_applied IN ('flat', 'percent', NULL)),
      promo_value_applied REAL NOT NULL DEFAULT 0 CHECK(promo_value_applied >= 0),
      total_price_charged REAL NOT NULL CHECK(total_price_charged >= 0),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    )
  `).run();

  // --- TRIGGERS FOR CAPACITY ENFORCEMENT ---

  // Trigger: Passenger insert -> Increment cruise booked_count (only for confirmed bookings)
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_passenger_insert
    AFTER INSERT ON passengers
    WHEN (SELECT status FROM bookings WHERE id = NEW.booking_id) = 'confirmed'
    BEGIN
      UPDATE cruises
      SET booked_count = booked_count + 1
      WHERE id = (SELECT cruise_id FROM bookings WHERE id = NEW.booking_id);
    END;
  `).run();

  // Trigger: Passenger delete -> Decrement cruise booked_count (only for confirmed bookings)
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_passenger_delete
    AFTER DELETE ON passengers
    WHEN (SELECT status FROM bookings WHERE id = OLD.booking_id) = 'confirmed'
    BEGIN
      UPDATE cruises
      SET booked_count = booked_count - 1
      WHERE id = (SELECT cruise_id FROM bookings WHERE id = OLD.booking_id);
    END;
  `).run();

  // Trigger: Booking status updated Confirmed -> Cancelled
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_booking_cancelled
    AFTER UPDATE OF status ON bookings
    WHEN OLD.status = 'confirmed' AND NEW.status = 'cancelled'
    BEGIN
      UPDATE cruises
      SET booked_count = booked_count - (SELECT COUNT(*) FROM passengers WHERE booking_id = NEW.id)
      WHERE id = NEW.cruise_id;
    END;
  `).run();

  // Trigger: Booking status updated Cancelled -> Confirmed
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_booking_confirmed
    AFTER UPDATE OF status ON bookings
    WHEN OLD.status = 'cancelled' AND NEW.status = 'confirmed'
    BEGIN
      UPDATE cruises
      SET booked_count = booked_count + (SELECT COUNT(*) FROM passengers WHERE booking_id = NEW.id)
      WHERE id = NEW.cruise_id;
    END;
  `).run();


  // --- TRIGGERS FOR PROMO REDEMPTION ENFORCEMENT ---

  // Trigger: Block insert if global redemption limit is reached
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_promo_redemption_global_limit
    BEFORE INSERT ON promo_code_redemptions
    FOR EACH ROW
    BEGIN
      SELECT RAISE(FAIL, 'PROMO_GLOBAL_LIMIT_REACHED')
      FROM promo_codes
      WHERE id = NEW.promo_code_id AND redemption_count >= max_redemptions;
    END;
  `).run();

  // Trigger: Block insert if customer redemption limit is reached
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_promo_redemption_customer_limit
    BEFORE INSERT ON promo_code_redemptions
    FOR EACH ROW
    BEGIN
      SELECT RAISE(FAIL, 'PROMO_CUSTOMER_LIMIT_REACHED')
      FROM promo_codes pc
      WHERE pc.id = NEW.promo_code_id AND (
        SELECT COUNT(*)
        FROM promo_code_redemptions pcr
        WHERE pcr.promo_code_id = NEW.promo_code_id AND pcr.customer_id = NEW.customer_id
      ) >= pc.limit_per_customer;
    END;
  `).run();

  // Trigger: On successful insert of promo redemption, increment redemption count
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_promo_redemption_insert
    AFTER INSERT ON promo_code_redemptions
    BEGIN
      UPDATE promo_codes
      SET redemption_count = redemption_count + 1
      WHERE id = NEW.promo_code_id;
    END;
  `).run();

  // Trigger: On delete of promo redemption, decrement redemption count
  db.prepare(`
    CREATE TRIGGER IF NOT EXISTS trg_promo_redemption_delete
    AFTER DELETE ON promo_code_redemptions
    BEGIN
      UPDATE promo_codes
      SET redemption_count = redemption_count - 1
      WHERE id = OLD.promo_code_id;
    END;
  `).run();
}

// Run schema initialization
initializeSchema();

module.exports = db;
