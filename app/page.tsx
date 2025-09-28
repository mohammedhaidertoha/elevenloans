'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Ready to connect');
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const connectToAgent = async () => {
    try {
      setStatus('Connecting to voice agent...');
      
      // Initialize WebSocket connection to ElevenLabs
      const ws = new WebSocket('wss://api.elevenlabs.io/v1/convai/conversation');
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setStatus('Connected! Click the microphone to start talking.');
        
        // Send initial configuration
        ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'system',
            content: [{
              type: 'input_text',
              text: `You are a professional and empathetic debt resolution agent working for a private equity firm. Your role is to help customers resolve outstanding loan payments in a respectful manner.

IMPORTANT INSTRUCTIONS:
1. Always start by verifying the customer's identity by asking for their full name
2. Once verified, inform them of their outstanding amount due
3. Offer two clear options:
   - Option 1: If they can pay now, offer to send a secure payment link to their email
   - Option 2: If they cannot pay now, offer to schedule a callback with a human representative

AVAILABLE TOOLS:
- send_payment_link(customerId): Sends a secure payment link to customer's email
- check_payment_status(customerId): Checks if payment has been completed
- book_callback(customerId, isoDatetime): Books a callback appointment

TONE: Professional, empathetic, and solution-focused. Never be aggressive or threatening.
COMPLIANCE: Always mention this call may be recorded and you represent the debt collection agency.

Start the conversation by greeting the customer and asking for their name to verify their account.`
            }]
          }
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
        
        if (data.type === 'conversation.item.created' && data.item?.content) {
          const content = data.item.content[0];
          if (content.type === 'text') {
            setMessages(prev => [...prev, `Agent: ${content.text}`]);
          }
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setStatus('Disconnected');
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('Connection error');
      };

    } catch (error) {
      console.error('Failed to connect:', error);
      setStatus('Failed to connect');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        sendAudioToAgent(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus('Recording... Click again to send');
    } catch (error) {
      console.error('Failed to start recording:', error);
      setStatus('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus('Processing audio...');
    }
  };

  const sendAudioToAgent = async (audioBlob: Blob) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setStatus('Not connected to agent');
      return;
    }

    try {
      // Convert audio to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));

      // Send audio to agent
      wsRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_audio',
            audio: base64Audio
          }]
        }
      }));

      // Trigger response generation
      wsRef.current.send(JSON.stringify({
        type: 'response.create',
        response: {
          modalities: ['text', 'audio'],
          instructions: 'Please respond to the customer appropriately based on their input.'
        }
      }));

      setStatus('Sent! Agent is responding...');
    } catch (error) {
      console.error('Failed to send audio:', error);
      setStatus('Failed to send audio');
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="container">
      <div className="card">
        <h1 style={{ textAlign: 'center', marginBottom: '2rem', color: '#333' }}>
          ElevenLabs Voice Agent
        </h1>
        
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className={`status ${isConnected ? 'success' : 'info'}`}>
            {status}
          </div>
        </div>

        <div className="voice-controls">
          {!isConnected ? (
            <button className="button" onClick={connectToAgent}>
              Connect to Agent
            </button>
          ) : (
            <button 
              className={`mic-button ${isRecording ? 'active' : ''}`}
              onClick={toggleRecording}
              title={isRecording ? 'Click to stop recording' : 'Click to start recording'}
            >
              🎤
            </button>
          )}
        </div>

        {messages.length > 0 && (
          <div className="card">
            <h3>Conversation</h3>
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '1rem' }}>
              {messages.map((message, index) => (
                <div key={index} style={{ 
                  padding: '8px', 
                  marginBottom: '8px', 
                  background: '#f8f9fa', 
                  borderRadius: '4px' 
                }}>
                  {message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid">
        <div className="card">
          <h3>Demo Instructions</h3>
          <ol style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
            <li>Click "Connect to Agent" to establish connection</li>
            <li>Click the microphone button to start recording</li>
            <li>Speak your message (e.g., "Hi, my name is John Smith")</li>
            <li>Click the microphone again to send your message</li>
            <li>The agent will respond and guide you through payment or callback options</li>
          </ol>
        </div>

        <div className="card">
          <h3>Test Scenarios</h3>
          <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
            <li><strong>Payment Flow:</strong> Say you want to pay now</li>
            <li><strong>Callback Flow:</strong> Say you can't pay right now and need to schedule a call</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
