import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase';
import { Resend } from 'resend';
import { nanoid } from 'nanoid';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { customerId } = await req.json();

    if (!customerId) {
      return NextResponse.json({ ok: false, message: 'Customer ID required' }, { status: 400 });
    }

    // Get customer details
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ ok: false, message: 'Customer not found' }, { status: 404 });
    }

    // Generate payment token
    const token = nanoid(32);
    const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL}/pay/${token}`;

    // Update customer with payment token
    const { error: updateError } = await supabaseAdmin
      .from('customers')
      .update({ payment_link_token: token })
      .eq('id', customerId);

    if (updateError) {
      console.error('Failed to update customer:', updateError);
      return NextResponse.json({ ok: false, message: 'Failed to generate payment link' }, { status: 500 });
    }

    // Send email with payment link
    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev', // Use Resend's test domain or your verified domain
        to: 'loanseleven@gmail.com',
        subject: 'Secure Payment Link - Debt Resolution',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Payment Request</h2>
            <p>Dear ${customer.name},</p>
            <p>Please use the secure link below to complete your payment of $${(customer.amount_due / 100).toFixed(2)}:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${paymentUrl}" 
                 style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Pay Now - $${(customer.amount_due / 100).toFixed(2)}
              </a>
            </div>
            <p>This link is secure and will expire in 24 hours.</p>
            <p>If you have any questions, please contact our support team.</p>
            <hr>
            <p style="font-size: 12px; color: #666;">
              This is an automated message from our debt resolution system.
            </p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Continue anyway - the payment link still works
    }

    return NextResponse.json({ 
      ok: true, 
      message: `Payment link sent to loanseleven@gmail.com`,
      url: paymentUrl 
    });

  } catch (error) {
    console.error('Send payment link error:', error);
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 });
  }
}
