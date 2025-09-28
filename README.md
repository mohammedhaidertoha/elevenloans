# ElevenLabs Debt Collector Voice Agent

AI-powered debt collection assistant using ElevenLabs Conversational AI for PE firms.

## Quick Setup (15 minutes)

### 1. Supabase Database Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run this schema:

```sql
-- Create customers table
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  amount_due int not null, -- Amount in cents
  status text not null default 'pending', -- 'pending' or 'paid'
  payment_link_token text,
  created_at timestamptz not null default now()
);

-- Create payments table
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  amount int not null, -- Amount in cents
  status text not null default 'succeeded',
  created_at timestamptz not null default now()
);

-- Create callbacks table
create table if not exists callbacks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  requested_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

-- Insert demo customer
insert into customers (name, email, amount_due, status) values 
('John Smith', 'john.smith@example.com', 150000, 'pending'); -- $1,500.00
```

3. Get your project URL and keys from Settings > API

### 2. Resend Email Setup

1. Go to [resend.com](https://resend.com) and create account
2. Get your API key from the dashboard
3. (Optional) Add your domain for branded emails

### 3. Environment Variables

Create `.env.local` with your keys:

```env
# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_agent_id

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE=your_service_role_key

# Resend
RESEND_API_KEY=your_resend_api_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Install & Run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to test the voice agent!

## ElevenLabs Agent Configuration

In your ElevenLabs dashboard, create an agent with these tools:

### Tool 1: send_payment_link
```json
{
  "name": "send_payment_link",
  "description": "Send a secure payment link to customer's email",
  "parameters": {
    "type": "object",
    "properties": {
      "customerId": {
        "type": "string",
        "description": "The customer's unique ID"
      }
    },
    "required": ["customerId"]
  }
}
```

### Tool 2: check_payment_status
```json
{
  "name": "check_payment_status", 
  "description": "Check if customer has completed payment",
  "parameters": {
    "type": "object",
    "properties": {
      "customerId": {
        "type": "string",
        "description": "The customer's unique ID"
      }
    },
    "required": ["customerId"]
  }
}
```

### Tool 3: book_callback
```json
{
  "name": "book_callback",
  "description": "Schedule a callback with human representative",
  "parameters": {
    "type": "object", 
    "properties": {
      "customerId": {
        "type": "string",
        "description": "The customer's unique ID"
      },
      "isoDatetime": {
        "type": "string",
        "description": "Preferred callback time in ISO format"
      },
      "note": {
        "type": "string",
        "description": "Optional note about the callback"
      }
    },
    "required": ["customerId", "isoDatetime"]
  }
}
```

### System Prompt
```
You are a professional debt resolution agent working for a private equity firm. Your role is to help customers resolve outstanding loan payments respectfully.

PROCESS:
1. Greet customer and verify identity by asking for full name
2. Once verified, inform them of outstanding amount due  
3. Offer two options:
   - Pay now: Use send_payment_link tool, then check_payment_status periodically
   - Schedule callback: Use book_callback tool for human representative

TONE: Professional, empathetic, solution-focused. Never aggressive.
COMPLIANCE: Mention call may be recorded and identify your company.

For demo purposes, use customer ID: [insert the UUID from your Supabase customers table]
```

## Demo Flow

1. **Connect**: Click "Connect to Agent" 
2. **Identify**: Say "Hi, my name is John Smith"
3. **Choose Path**:
   - **Payment**: "I'd like to pay now" → Agent sends email link
   - **Callback**: "I can't pay right now" → Agent schedules callback

## Pages

- `/` - Voice agent interface
- `/pay/[token]` - Secure payment page
- `/admin` - Dashboard for payments/callbacks

## Architecture

- **Frontend**: Next.js 14 with TypeScript
- **Voice**: ElevenLabs Conversational AI WebSocket
- **Database**: Supabase (PostgreSQL)
- **Email**: Resend
- **Payments**: Mock Stripe-style form → Supabase

## Production Notes

For production deployment:
1. Replace mock payment with real Stripe integration
2. Add proper authentication for admin dashboard
3. Implement phone integration via Twilio
4. Add proper error handling and logging
5. Set up proper email domain verification
