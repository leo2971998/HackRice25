# Swipe Coach - Data Setup Guide

## Issue Fixed: Credit Card Data Population

This guide addresses the issue where credit card data stored in MongoDB was not populating on the homepage and other pages.

### What Was Fixed

1. **Multi-card selection on Homepage**: You can now select multiple credit cards to filter data specifically for those cards
2. **Consolidated card management**: All add/edit card functionality is now in one place (`/cards` page)
3. **Card import functionality**: Added ability to import existing cards from MongoDB
4. **Debug endpoint**: Added debugging tools to troubleshoot data issues

### Using Your Existing MongoDB Data

If you have existing card data in MongoDB (like the Amex Platinum card example), here are the steps to get it working:

#### Option 1: Import Existing Card
1. Go to the Cards page (`/cards`)
2. Click "Import existing card" 
3. Enter the MongoDB ObjectId of your card (e.g., `68ce69b39324d73a6b56b95b`)
4. The card will be linked to your user account

#### Option 2: Use Debug Endpoint
1. Go to the Cards page (`/cards`)
2. If no cards show up, click "Debug card data"
3. This will show you:
   - Your user ID
   - Total cards in the database
   - Cards linked to your account
   - All cards in the system (for debugging)

### Data Requirements

Your MongoDB data structure should match:
```json
{
  "_id": {"$oid": "..."},
  "userId": {"$oid": "your-user-id"},
  "account_type": "credit_card",
  "nickname": "Card Name",
  "issuer": "Bank Name",
  "network": "Visa/Mastercard/Amex",
  "account_mask": "1234",
  "expiry_month": 3,
  "expiry_year": 2029,
  "status": "Active",
  "last_sync": {"$date": "..."}
}
```

### Key Issue: User ID Matching

The most common issue is that the `userId` in your card documents doesn't match your authenticated user's `_id`. The debug endpoint will help you identify this.

### New Features

#### Multi-Card Selection (Homepage)
- When you have multiple cards, checkboxes appear next to each card
- Select specific cards to filter all dashboard data (spending, merchants, insights)
- "Select All" and "Clear" buttons for convenience

#### Consolidated Card Management (Cards Page)
- **Add new cards**: Complete form with all card details
- **Edit existing cards**: Click edit button on any card
- **Import cards**: Link existing MongoDB data to your account
- **Debug data**: Troubleshoot data population issues

### API Endpoints Added

- `GET /api/cards/debug` - Debug card data and user relationships
- `POST /api/cards/import` - Import existing card by ID
- All existing endpoints now support `cardIds` parameter for filtering

### Environment Setup

Make sure you have the required environment variables:
- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID` 
- `VITE_AUTH0_AUDIENCE`
- `MONGODB_URI`
- `AUTH0_DOMAIN`
- `AUTH0_AUDIENCE`

### Testing the Fix

1. **Build the client**: `cd client && npm run build`
2. **Run the server**: `cd server && python app.py`
3. **Visit the app**: Login and go to `/cards`
4. **Use debug tools**: Click "Debug card data" to see what's in your database
5. **Import cards**: Use the card ID from debug output to import existing cards

The data should now populate properly on both the homepage and cards page!