import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase';

export async function POST(req: NextRequest) {
  try {
    const { customerName } = await req.json();

    if (!customerName) {
      return NextResponse.json({ ok: false, message: 'Customer name is required' }, { status: 400 });
    }

    // Search for the customer by name (case-insensitive)
    const { data: customer, error } = await supabaseAdmin
      .from('customers')
      .select('id, name, amount_due')
      .ilike('name', `%${customerName}%`) // Use ilike for case-insensitive search
      .limit(1)
      .single();

    if (error || !customer) {
      console.error('Find customer error:', error);
      return NextResponse.json({ ok: false, message: 'Customer not found' }, { status: 404 });
    }

    // Return the customer's ID and other relevant details
    return NextResponse.json({
      ok: true,
      customerId: customer.id,
      customerName: customer.name,
      amountDue: customer.amount_due,
      message: `Customer ${customer.name} found.`
    });

  } catch (error) {
    console.error('Server error in find-customer:', error);
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 });
  }
}
