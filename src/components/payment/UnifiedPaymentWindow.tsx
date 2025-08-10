import React, { useState } from 'react';

interface PaymentProps {
  plan: 'basic' | 'premium';
}

export default function UnifiedPaymentWindow({ plan }: PaymentProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayment = async () => {
    try {
      setLoading(true);
      setError(null);

      const paymentData = {
        amount: plan === 'premium' ? 5000 : 2000, // adjust as needed
        currency: 'XOF',
        phone: '+2237701100100', // replace with dynamic user phone if available
        email: 'customer@example.com', // replace with user email
        name: 'Test Customer', // replace with user name
        reference: `REF_${Date.now()}`
      };

      const res = await fetch('http://localhost:3001/api/initiate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });

      const data = await res.json();

      if (data.payment_url) {
        // Redirect user to Orange Money hosted payment page
        window.location.href = data.payment_url;
      } else {
        setError(`Payment initiation failed: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      setError(err.message || 'Unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payment-window">
      <h2>{plan === 'premium' ? 'Premium Plan' : 'Basic Plan'} Payment</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button onClick={handlePayment} disabled={loading}>
        {loading ? 'Processing...' : 'Pay Now'}
      </button>
    </div>
  );
}
