require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/register-card', async (req, res) => {
  try {
    const { address } = req.body;
    
    // Create a cardholder using Stripe's recommended format
    const cardholder = await stripe.issuing.cardholders.create({
      name: 'Test User',
      email: `${address}@example.com`,
      status: 'active',
      type: 'individual',
      individual: {
        first_name: 'Test',
        last_name: 'User',
        card_issuing: {
          user_terms_acceptance: {
            date: Math.floor(Date.now() / 1000),
            ip: req.ip || '127.0.0.1',
          },
        },
      },
      billing: {
        address: {
          line1: '123 Main Street',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94111',
          country: 'US',
        },
      },
      phone_number: '+18888675309',
    });

    // Wait for cardholder to be fully created
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the cardholder's requirements are met
    const verifiedCardholder = await stripe.issuing.cardholders.retrieve(cardholder.id);
    
    if (verifiedCardholder.requirements?.past_due?.length > 0) {
      throw new Error(`Cardholder requirements not met: ${verifiedCardholder.requirements.past_due.join(', ')}`);
    }

    // Create a virtual card
    const card = await stripe.issuing.cards.create({
      cardholder: cardholder.id,
      currency: 'usd',
      type: 'virtual',
      status: 'active',
      spending_controls: {
        spending_limits: [{
          amount: 5000,
          interval: 'per_authorization',
        }],
        allowed_categories: ['ac_refrigeration_repair', 'accounting_bookkeeping_services'],
      },
    });

    // Format response
    const formattedResponse = {
      customerId: cardholder.id,
      cardTokenId: card.id,
      cardType: 'virtual',
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      status: card.status,
      unixExpiration: Math.floor(Date.now() / 1000) + (3 * 365 * 24 * 60 * 60)
    };

    res.json(formattedResponse);

  } catch (error) {
    console.error('Error creating card:', error);
    res.status(500).json({ 
      error: error.message,
      details: error.raw || error
    });
  }
});

app.get('/api/check-requirements/:cardHolderId', async (req, res) => {
  try {
    const { cardHolderId } = req.params;
    const cardholder = await stripe.issuing.cardholders.retrieve(cardHolderId);
    
    res.json({
      status: cardholder.status,
      requirements: cardholder.requirements || {},
      metadata: cardholder.metadata || {}
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cancel-card', async (req, res) => {
  try {
    const { cardId } = req.body;
    
    await stripe.issuing.cards.update(cardId, {
      status: 'canceled'
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error canceling card:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});