'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { Customer } from '@/types';

export default function PaymentPage({ params }: { params: { token: string } }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    nameOnCard: '',
    billingAddress: ''
  });

  useEffect(() => {
    loadCustomer();
  }, []);

  const loadCustomer = async () => {
    try {
      const { data, error } = await supabaseClient
        .from('customers')
        .select('*')
        .eq('payment_link_token', params.token)
        .single();

      if (error || !data) {
        setError('Invalid or expired payment link');
        return;
      }

      if (data.status === 'paid') {
        setError('This payment has already been completed');
        return;
      }

      setCustomer(data);
    } catch (err) {
      console.error('Failed to load customer:', err);
      setError('Failed to load payment information');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;

    setProcessing(true);
    setError(null);

    try {
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Record payment in database
      const { error: paymentError } = await supabaseClient
        .from('payments')
        .insert({
          customer_id: customer.id,
          amount: customer.amount_due,
          status: 'succeeded'
        });

      if (paymentError) {
        throw new Error('Failed to record payment');
      }

      // Update customer status
      const { error: updateError } = await supabaseClient
        .from('customers')
        .update({ 
          status: 'paid',
          payment_link_token: null 
        })
        .eq('id', customer.id);

      if (updateError) {
        throw new Error('Failed to update customer status');
      }

      setSuccess(true);
    } catch (err) {
      console.error('Payment error:', err);
      setError('Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div>Loading payment information...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <div className="status error">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#28a745', marginBottom: '1rem' }}>✅ Payment Successful!</h2>
            <div className="status success">
              Your payment of ${(customer!.amount_due / 100).toFixed(2)} has been processed successfully.
            </div>
            <p style={{ marginTop: '1rem', color: '#666' }}>
              Thank you for your payment. You will receive a confirmation email shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
          Secure Payment
        </h1>

        {customer && (
          <div className="status info" style={{ marginBottom: '2rem' }}>
            <strong>Payment for:</strong> {customer.name}<br />
            <strong>Amount Due:</strong> ${(customer.amount_due / 100).toFixed(2)}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Name on Card
            </label>
            <input
              type="text"
              name="nameOnCard"
              value={formData.nameOnCard}
              onChange={handleInputChange}
              className="input"
              placeholder="John Doe"
              required
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Card Number
            </label>
            <input
              type="text"
              name="cardNumber"
              value={formData.cardNumber}
              onChange={handleInputChange}
              className="input"
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Expiry Date
              </label>
              <input
                type="text"
                name="expiryDate"
                value={formData.expiryDate}
                onChange={handleInputChange}
                className="input"
                placeholder="MM/YY"
                maxLength={5}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                CVV
              </label>
              <input
                type="text"
                name="cvv"
                value={formData.cvv}
                onChange={handleInputChange}
                className="input"
                placeholder="123"
                maxLength={4}
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Billing Address
            </label>
            <input
              type="text"
              name="billingAddress"
              value={formData.billingAddress}
              onChange={handleInputChange}
              className="input"
              placeholder="123 Main St, City, State 12345"
              required
            />
          </div>

          <button 
            type="submit" 
            className="button" 
            disabled={processing}
            style={{ width: '100%', fontSize: '18px', padding: '16px' }}
          >
            {processing ? 'Processing Payment...' : `Pay $${customer ? (customer.amount_due / 100).toFixed(2) : '0.00'}`}
          </button>
        </form>

        <div style={{ marginTop: '2rem', fontSize: '14px', color: '#666', textAlign: 'center' }}>
          🔒 This is a secure payment form. Your information is protected.
          <br />
          <em>(This is a demo - no real payment will be processed)</em>
        </div>
      </div>
    </div>
  );
}
