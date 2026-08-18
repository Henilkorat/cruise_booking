const Database = require('better-sqlite3');
const path = require('path');

// Resolve path to the database file in the project root
const dbPath = path.resolve(__dirname, '../cruise_booking.db');

// Initialize better-sqlite3 database
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeSchema() {
  // Create Cruises table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS cruises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      destination TEXT NOT NULL,
      price REAL NOT NULL,
      departure_date TEXT NOT NULL
    )
  `).run();

  // Create Bookings table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cruise_id INTEGER NOT NULL,
      passenger_name TEXT NOT NULL,
      passenger_email TEXT NOT NULL,
      booking_date TEXT NOT NULL,
      FOREIGN KEY (cruise_id) REFERENCES cruises(id) ON DELETE CASCADE
    )
  `).run();

  // Seed initial data if cruises table is empty
  const count = db.prepare('SELECT COUNT(*) as count FROM cruises').get();
  if (count.count === 0) {
    console.log('Seeding initial cruise data...');
    const insertCruise = db.prepare(`
      INSERT INTO cruises (name, destination, price, departure_date)
      VALUES (?, ?, ?, ?)
    `);

    // Insert dummy data using a transaction for efficiency
    const insertTransaction = db.transaction((cruises) => {
      for (const cruise of cruises) {
        insertCruise.run(cruise.name, cruise.destination, cruise.price, cruise.departure_date);
      }
    });

    insertTransaction([
      { name: 'Caribbean Breeze', destination: 'Bahamas', price: 799.99, departure_date: '2026-10-15' },
      { name: 'Mediterranean Odyssey', destination: 'Greece & Italy', price: 1499.50, departure_date: '2026-11-01' },
      { name: 'Alaskan Glacier Expedition', destination: 'Alaska', price: 1250.00, departure_date: '2026-09-20' },
      { name: 'Pacific Paradise', destination: 'Hawaii', price: 1899.99, departure_date: '2026-12-05' }
    ]);
    console.log('Seeding complete.');
  }
}

// Run schema initialization
initializeSchema();

module.exports = db;
