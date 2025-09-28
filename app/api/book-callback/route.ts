import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { customerId, isoDatetime, note } = await req.json();

    if (!customerId || !isoDatetime) {
      return NextResponse.json({ ok: false, message: 'Customer ID and datetime required' }, { status: 400 });
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

    // Store callback request
    const { error: callbackError } = await supabaseAdmin
      .from('callbacks')
      .insert({
        customer_id: customerId,
        requested_at: isoDatetime,
        note: note || `Callback requested for ${customer.name}`
      });

    if (callbackError) {
      console.error('Failed to store callback:', callbackError);
      return NextResponse.json({ ok: false, message: 'Failed to book callback' }, { status: 500 });
    }

    // Generate Google Calendar URL
    const startDate = new Date(isoDatetime);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 minutes later
    
    const formatDateForCalendar = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Debt Resolution Callback')}&dates=${formatDateForCalendar(startDate)}/${formatDateForCalendar(endDate)}&details=${encodeURIComponent(`Callback for ${customer.name} regarding outstanding debt of $${(customer.amount_due / 100).toFixed(2)}`)}&add=${encodeURIComponent(customer.email)}`;

    // Send confirmation email to customer
    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev', // Use Resend's test domain or your verified domain
        to: 'loanseleven@gmail.com',
        subject: 'Callback Scheduled - Debt Resolution',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Callback Scheduled</h2>
            <p>Dear ${customer.name},</p>
            <p>We have scheduled a callback for you on <strong>${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}</strong>.</p>
            <p>One of our representatives will call you at this time to discuss your account and payment options.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${calendarUrl}" 
                 style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Add to Calendar
              </a>
            </div>
            <p>If you need to reschedule, please contact our office.</p>
            <hr>
            <p style="font-size: 12px; color: #666;">
              This is an automated confirmation from our debt resolution system.
            </p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Failed to send callback confirmation email:', emailError);
      // Continue anyway - the callback is still booked
    }

    return NextResponse.json({
      ok: true,
      message: `Callback scheduled for ${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString()}`,
      calendarUrl
    });

  } catch (error) {
    console.error('Book callback error:', error);
    return NextResponse.json({ ok: false, message: 'Internal server error' }, { status: 500 });
  }
}
