const express = require('express');
const cors = require('cors');
const cruiseRoutes = require('./routes/cruiseRoutes');
const bookingRoutes = require('./routes/bookingRoutes');

// Load database to trigger connection & setup
const db = require('./db');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'Cruise Booking Backend API is running',
    timestamp: new Date()
  });
});

// Register routers (supporting both /api and root namespaces)
app.use('/cruises', cruiseRoutes);
app.use('/api/cruises', cruiseRoutes);

app.use('/bookings', bookingRoutes);
app.use('/api/bookings', bookingRoutes);

app.use('/', bookingRoutes); // for POST /quote and GET /:reference
app.use('/api', bookingRoutes); // for POST /api/quote and GET /api/:reference

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start listening
const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Handle graceful shutdown
function gracefulShutdown() {
  console.log('Shutting down server gracefully...');
  server.close(() => {
    console.log('Express server closed.');
    db.close();
    console.log('Database connection closed.');
    process.exit(0);
  });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = app; // Export for testing if needed
