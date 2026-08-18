const express = require('express');
const router = express.Router();
const cruiseService = require('../services/cruiseService');

// Get all cruises
router.get('/', (req, res) => {
  try {
    const cruises = cruiseService.getAllCruises();
    res.json(cruises);
  } catch (error) {
    console.error('Error fetching cruises:', error);
    res.status(500).json({ error: 'Failed to retrieve cruises' });
  }
});

// Get a cruise by ID
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid cruise ID parameter' });
    }

    const cruise = cruiseService.getCruiseById(id);
    if (!cruise) {
      return res.status(404).json({ error: 'Cruise not found' });
    }

    res.json(cruise);
  } catch (error) {
    console.error('Error fetching cruise details:', error);
    res.status(500).json({ error: 'Failed to retrieve cruise details' });
  }
});

module.exports = router;
