'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { Customer, Payment, Callback } from '@/types';

export default function AdminDashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load customers
      const { data: customersData } = await supabaseClient
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      // Load payments
      const { data: paymentsData } = await supabaseClient
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false });

      // Load callbacks
      const { data: callbacksData } = await supabaseClient
        .from('callbacks')
        .select('*')
        .order('requested_at', { ascending: false });

      setCustomers(customersData || []);
      setPayments(paymentsData || []);
      setCallbacks(callbacksData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            Loading dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 style={{ textAlign: 'center', marginBottom: '2rem', color: 'white' }}>
        Admin Dashboard
      </h1>

      <div className="grid">
        {/* Customers Overview */}
        <div className="card">
          <h3>Customers ({customers.length})</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {customers.map(customer => (
              <div key={customer.id} style={{ 
                padding: '12px', 
                marginBottom: '8px', 
                background: '#f8f9fa', 
                borderRadius: '4px',
                borderLeft: `4px solid ${customer.status === 'paid' ? '#28a745' : '#dc3545'}`
              }}>
                <div style={{ fontWeight: '500' }}>{customer.name}</div>
                <div style={{ fontSize: '14px', color: '#666' }}>
                  {customer.email} • ${(customer.amount_due / 100).toFixed(2)} • {customer.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="card">
          <h3>Recent Payments ({payments.length})</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {payments.map(payment => {
              const customer = customers.find(c => c.id === payment.customer_id);
              return (
                <div key={payment.id} style={{ 
                  padding: '12px', 
                  marginBottom: '8px', 
                  background: '#d4edda', 
                  borderRadius: '4px' 
                }}>
                  <div style={{ fontWeight: '500' }}>
                    ${(payment.amount / 100).toFixed(2)} - {payment.status}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    {customer?.name || 'Unknown'} • {new Date(payment.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
            {payments.length === 0 && (
              <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                No payments yet
              </div>
            )}
          </div>
        </div>

        {/* Scheduled Callbacks */}
        <div className="card">
          <h3>Scheduled Callbacks ({callbacks.length})</h3>
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {callbacks.map(callback => {
              const customer = customers.find(c => c.id === callback.customer_id);
              return (
                <div key={callback.id} style={{ 
                  padding: '12px', 
                  marginBottom: '8px', 
                  background: '#fff3cd', 
                  borderRadius: '4px' 
                }}>
                  <div style={{ fontWeight: '500' }}>
                    {customer?.name || 'Unknown Customer'}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>
                    Callback: {new Date(callback.requested_at).toLocaleString()}
                  </div>
                  {callback.note && (
                    <div style={{ fontSize: '12px', color: '#856404', marginTop: '4px' }}>
                      {callback.note}
                    </div>
                  )}
                </div>
              );
            })}
            {callbacks.length === 0 && (
              <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                No callbacks scheduled
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="card">
        <h3>Summary</h3>
        <div className="grid">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#28a745' }}>
              ${payments.reduce((sum, p) => sum + p.amount, 0) / 100}
            </div>
            <div style={{ color: '#666' }}>Total Collected</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc3545' }}>
              ${customers.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount_due, 0) / 100}
            </div>
            <div style={{ color: '#666' }}>Outstanding</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#ffc107' }}>
              {callbacks.length}
            </div>
            <div style={{ color: '#666' }}>Pending Callbacks</div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <button className="button" onClick={loadData}>
          Refresh Data
        </button>
      </div>
    </div>
  );
}
