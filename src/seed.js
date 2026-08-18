const db = require('./db');

function seedDatabase() {
  console.log('--- Clearing existing database tables ---');

  // Disable triggers temporarily or delete in order of foreign keys
  db.prepare('DELETE FROM booking_price_snapshots').run();
  db.prepare('DELETE FROM promo_code_redemptions').run();
  db.prepare('DELETE FROM booking_service_selections').run();
  db.prepare('DELETE FROM passengers').run();
  db.prepare('DELETE FROM bookings').run();
  db.prepare('DELETE FROM promo_codes').run();
  db.prepare('DELETE FROM services').run();
  db.prepare('DELETE FROM child_fare_bands').run();
  db.prepare('DELETE FROM group_discount_tiers').run();
  db.prepare('DELETE FROM customers').run();
  db.prepare('DELETE FROM cruises').run();

  console.log('--- Seeding new data ---');

  db.transaction(() => {
    // 1. Seed cruises (name, destination, departure_date, base_price, capacity, booked_count, duration_nights)
    const insertCruise = db.prepare(`
      INSERT INTO cruises (name, destination, departure_date, base_price, capacity, booked_count, duration_nights)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const cruises = [
      ['Bahamas Getaway', 'Nassau & Cococay', '2026-10-10', 599.00, 150, 0, 4],
      ['Mediterranean Explorer', 'Rome, Athens & Ephesus', '2026-11-15', 1299.00, 200, 0, 10],
      ['Alaska Glaciers', 'Juneau & Skagway', '2026-09-05', 999.00, 100, 0, 7],
      ['Hawaii Tropical Cruise', 'Honolulu & Maui', '2026-12-20', 1499.00, 120, 0, 8],
      ['European Rivers', 'Rhine & Danube Rivers', '2027-05-18', 1899.00, 80, 0, 14]
    ];
    for (const cruise of cruises) {
      insertCruise.run(...cruise);
    }
    console.log('Seeded 5 Cruises.');

    // 2. Seed child fare bands
    const insertBand = db.prepare(`
      INSERT INTO child_fare_bands (name, min_age, max_age, discount_pct)
      VALUES (?, ?, ?, ?)
    `);
    const bands = [
      ['Infant', 0, 4, 100.0],
      ['Child', 5, 11, 50.0],
      ['Teen', 12, 17, 25.0]
    ];
    for (const band of bands) {
      insertBand.run(...band);
    }
    console.log('Seeded Child Fare Bands.');

    // 3. Seed group discount tiers
    const insertTier = db.prepare(`
      INSERT INTO group_discount_tiers (min_passengers, discount_pct)
      VALUES (?, ?)
    `);
    const tiers = [
      [3, 5.0],
      [5, 10.0]
    ];
    for (const tier of tiers) {
      insertTier.run(...tier);
    }
    console.log('Seeded Group Discount Tiers.');

    // 4. Seed optional services
    const insertService = db.prepare(`
      INSERT INTO services (name, price)
      VALUES (?, ?)
    `);
    const services = [
      ['Insurance', 80.00],
      ['WiFi', 15.00],
      ['Shore Excursion', 120.00]
    ];
    for (const service of services) {
      insertService.run(...service);
    }
    console.log('Seeded Optional Services.');

    // 5. Seed promo codes (code, discount_type, discount_value, max_redemptions, limit_per_customer, start_date, end_date, min_spend)
    const insertPromo = db.prepare(`
      INSERT INTO promo_codes (code, discount_type, discount_value, max_redemptions, limit_per_customer, start_date, end_date, min_spend)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const promos = [
      ['WELCOME10', 'percent', 10.00, 100, 1, '2026-01-01', '2026-12-31', 0.00],
      ['CRUISE50', 'flat', 50.00, 50, 1, '2026-01-01', '2026-12-31', 500.00],
      ['SUPERDEAL', 'percent', 25.00, 5, 2, '2026-01-01', '2026-12-31', 1000.00]
    ];
    for (const promo of promos) {
      insertPromo.run(...promo);
    }
    console.log('Seeded Promo Codes.');

    // 6. Seed some customers for testing
    const insertCustomer = db.prepare(`
      INSERT INTO customers (first_name, last_name, email, phone)
      VALUES (?, ?, ?, ?)
    `);
    const customers = [
      ['John', 'Doe', 'john.doe@example.com', '555-0199'],
      ['Jane', 'Smith', 'jane.smith@example.com', '555-0122'],
      ['Bob', 'Johnson', 'bob.johnson@example.com', '555-0188']
    ];
    for (const customer of customers) {
      insertCustomer.run(...customer);
    }
    console.log('Seeded Customers.');
  })();

  console.log('--- Database successfully seeded ---');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
