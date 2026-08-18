const express = require('express');
const router = express.Router();
const bookingService = require('../services/bookingService');

// Create a booking
router.post('/', (req, res) => {
  try {
    const { cruiseId, passengerName, passengerEmail } = req.body;

    // Simple validation
    if (!cruiseId || isNaN(parseInt(cruiseId, 10))) {
      return res.status(400).json({ error: 'Valid cruiseId is required' });
    }
    if (!passengerName || typeof passengerName !== 'string' || passengerName.trim() === '') {
      return res.status(400).json({ error: 'Passenger name is required' });
    }
    if (!passengerEmail || typeof passengerEmail !== 'string' || !passengerEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid passenger email is required' });
    }

    const booking = bookingService.createBooking({
      cruiseId: parseInt(cruiseId, 10),
      passengerName: passengerName.trim(),
      passengerEmail: passengerEmail.trim()
    });

    res.status(201).json(booking);
  } catch (error) {
    if (error.message === 'CRUISE_NOT_FOUND') {
      return res.status(404).json({ error: 'Cruise not found' });
    }
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get bookings for a cruise
router.get('/cruise/:cruiseId', (req, res) => {
  try {
    const cruiseId = parseInt(req.params.cruiseId, 10);
    if (isNaN(cruiseId)) {
      return res.status(400).json({ error: 'Invalid cruise ID parameter' });
    }

    const bookings = bookingService.getBookingsByCruise(cruiseId);
    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to retrieve bookings' });
  }
});

module.exports = router;
