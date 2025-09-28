export interface Customer {
  id: string;
  name: string;
  email: string;
  amount_due: number;
  status: 'pending' | 'paid';
  payment_link_token?: string | null;
  created_at?: string;
}

export interface Payment {
  id: string;
  customer_id: string;
  amount: number;
  status: 'succeeded';
  created_at: string;
}

export interface Callback {
  id: string;
  customer_id: string;
  requested_at: string;
  note?: string;
}

export interface ToolResponse {
  ok: boolean;
  message?: string;
  url?: string;
  calendarUrl?: string;
  paid?: boolean;
  amount?: number;
  at?: string;
}

export interface ElevenLabsMessage {
  type: 'conversation.item.create' | 'response.create' | 'tool_call';
  item?: {
    type: 'message';
    role: 'user' | 'assistant';
    content: Array<{
      type: 'input_text' | 'input_audio';
      text?: string;
      audio?: string;
    }>;
  };
  response?: {
    modalities: string[];
    instructions: string;
  };
}
