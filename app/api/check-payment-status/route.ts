import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase';

export async function POST(req: NextRequest) {
  try {
    const { customerId } = await req.json();
    
    if (!customerId) {
      return NextResponse.json({ ok: false, message: 'Customer ID required' }, { status: 400 });
    }

    // Get customer details
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id, status, amount_due, updated_at')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ ok: false, message: 'Customer not found' }, { status: 404 });
    }

    // Get latest payment (if any)
    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const paid = customer.status === 'paid';

    return NextResponse.json({
      ok: true,
      paid,
      amount: customer.amount_due,
      at: paid ? (payment?.created_at ?? customer.updated_at) : undefined,
      message: paid ? 'Payment completed' : 'Payment pending'
    });

  } catch (error) {
    console.error('Check payment status error:', error);
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 });
  }
}