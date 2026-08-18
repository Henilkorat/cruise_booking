# Cruise Booking Backend API Documentation

Minimal Node.js + Express backend using `better-sqlite3`.

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Backend Server
```bash
npm start
```
The server will start on port `3000`.

---

## Database Schema

### Cruises Table
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT NOT NULL)
- `destination` (TEXT NOT NULL)
- `price` (REAL NOT NULL)
- `departure_date` (TEXT NOT NULL)

### Bookings Table
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `cruise_id` (INTEGER NOT NULL, FOREIGN KEY)
- `passenger_name` (TEXT NOT NULL)
- `passenger_email` (TEXT NOT NULL)
- `booking_date` (TEXT NOT NULL)

---

## Endpoints API

### 1. Health Check
* **URL:** `/`
* **Method:** `GET`
* **Response Status:** `200 OK`
* **Response Example:**
  ```json
  {
    "status": "healthy",
    "message": "Cruise Booking Backend API is running",
    "timestamp": "2026-08-18T17:45:00.000Z"
  }
  ```

### 2. Get All Cruises
* **URL:** `/api/cruises`
* **Method:** `GET`
* **Response Status:** `200 OK`
* **Response Example:**
  ```json
  [
    {
      "id": 1,
      "name": "Caribbean Breeze",
      "destination": "Bahamas",
      "price": 799.99,
      "departure_date": "2026-10-15"
    },
    ...
  ]
  ```

### 3. Get Cruise by ID
* **URL:** `/api/cruises/:id`
* **Method:** `GET`
* **Response Status:** `200 OK` (or `404 Not Found`, `400 Bad Request`)
* **Response Example (200):**
  ```json
  {
    "id": 1,
    "name": "Caribbean Breeze",
    "destination": "Bahamas",
    "price": 799.99,
    "departure_date": "2026-10-15"
  }
  ```

### 4. Create Booking
* **URL:** `/api/bookings`
* **Method:** `POST`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "cruiseId": 1,
    "passengerName": "John Doe",
    "passengerEmail": "john.doe@example.com"
  }
  ```
* **Response Status:** `201 Created` (or `400 Bad Request`, `404 Not Found` if cruiseId invalid)
* **Response Example:**
  ```json
  {
    "id": 1,
    "cruise_id": 1,
    "passenger_name": "John Doe",
    "passenger_email": "john.doe@example.com",
    "booking_date": "2026-08-18"
  }
  ```

### 5. Get Bookings by Cruise
* **URL:** `/api/bookings/cruise/:cruiseId`
* **Method:** `GET`
* **Response Status:** `200 OK` (or `400 Bad Request`)
* **Response Example:**
  ```json
  [
    {
      "id": 1,
      "cruise_id": 1,
      "passenger_name": "John Doe",
      "passenger_email": "john.doe@example.com",
      "booking_date": "2026-08-18"
    }
  ]
  ```
