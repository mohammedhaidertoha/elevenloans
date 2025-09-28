import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      return NextResponse.json(
        { message: 'ElevenLabs API key or Agent ID not configured' },
        { status: 500 }
      );
    }

    // Return the WebSocket URL with authentication parameters
    // ElevenLabs Conversational AI WebSocket URL
    const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation`;
    
    return NextResponse.json({
      url: wsUrl,
      apiKey: ELEVENLABS_API_KEY,
      agentId: ELEVENLABS_AGENT_ID
    });

  } catch (error) {
    console.error('Error in ElevenLabs auth proxy:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
