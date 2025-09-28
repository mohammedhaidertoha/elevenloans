'use client';

import { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Ready to connect');
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);

  const connectToAgent = async () => {
    try {
      setStatus('Authenticating and connecting to voice agent...');
      
      // Get authentication details from our secure proxy
      const authResponse = await fetch('/api/elevenlabs-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!authResponse.ok) {
        throw new Error('Failed to authenticate for WebSocket connection.');
      }

      const { url: wsUrl, apiKey, agentId } = await authResponse.json();

      // Initialize WebSocket connection to ElevenLabs
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setStatus('Connected! Click "Start Conversation" to begin real-time chat.');
        
        // Send authentication and agent configuration
        ws.send(JSON.stringify({
          user_auth: {
            type: 'api_key',
            value: apiKey
          },
          agent_id: agentId
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
        
        // Handle different message types from ElevenLabs
        if (data.type === 'audio') {
          // Play audio response
          playAudioDelta(data.audio_event.audio_base_64);
        } else if (data.type === 'message') {
          // Show text message
          setMessages(prev => [...prev, `Agent: ${data.message}`]);
        } else if (data.type === 'interruption') {
          setStatus('Agent interrupted');
        } else if (data.type === 'ping') {
          // Respond to ping
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (data.type === 'conversation_initiation_metadata') {
          setStatus('Ready - speak anytime! Agent can hear you now.');
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setIsStreaming(false);
        setStatus(`Disconnected: ${event.reason || 'Connection closed'}`);
        console.log('WebSocket closed:', event);
        stopAudioStream();
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

  const startAudioStream = async () => {
    try {
      setStatus('Starting microphone...');
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      mediaStreamRef.current = stream;
      
      // Create audio context for real-time processing
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
      audioContextRef.current = audioContext;
      
      // Add audio worklet processor
      await audioContext.audioWorklet.addModule(
        'data:text/javascript,' + encodeURIComponent(`
          class AudioProcessor extends AudioWorkletProcessor {
            process(inputs, outputs, parameters) {
              const input = inputs[0];
              if (input.length > 0) {
                const inputData = input[0];
                
                // Convert float32 to int16 PCM
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }
                
                // Send to main thread
                this.port.postMessage(pcmData.buffer);
              }
              return true;
            }
          }
          registerProcessor('audio-processor', AudioProcessor);
        `)
      );
      
      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, 'audio-processor');
      workletRef.current = worklet;
      
      worklet.port.onmessage = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        // Send audio data in real-time to ElevenLabs
        const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(event.data))));
        wsRef.current.send(JSON.stringify({
          user_audio_chunk: base64Audio
        }));
      };
      
      source.connect(worklet);
      worklet.connect(audioContext.destination);
      
      setIsStreaming(true);
      setStatus('Ready - speak anytime! Agent can hear you now.');
      
    } catch (error) {
      console.error('Failed to start audio stream:', error);
      setStatus('Microphone access denied');
    }
  };

  const stopAudioStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (workletRef.current) {
      workletRef.current.disconnect();
      workletRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsStreaming(false);
    setStatus('Audio stream stopped');
  };

  const playAudioDelta = async (audioData: string) => {
    try {
      // Decode base64 audio and play it
      const binaryString = atob(audioData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Queue audio for playback
      audioQueueRef.current.push(bytes.buffer);
      
      // Process audio queue
      if (audioQueueRef.current.length === 1) {
        processAudioQueue();
      }
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const processAudioQueue = async () => {
    while (audioQueueRef.current.length > 0) {
      const audioBuffer = audioQueueRef.current.shift()!;
      
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decodedBuffer = await audioContext.decodeAudioData(audioBuffer);
        const source = audioContext.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(audioContext.destination);
        source.start();
        
        // Wait for audio to finish before playing next chunk
        await new Promise(resolve => {
          source.onended = resolve;
        });
      } catch (error) {
        console.error('Error playing audio chunk:', error);
      }
    }
  };

  const toggleConversation = () => {
    if (isStreaming) {
      stopAudioStream();
    } else {
      startAudioStream();
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
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className={`button ${isStreaming ? 'active' : ''}`}
                onClick={toggleConversation}
                style={{ 
                  backgroundColor: isStreaming ? '#dc3545' : '#28a745',
                  color: 'white'
                }}
              >
                {isStreaming ? '🔴 End Conversation' : '🎤 Start Conversation'}
              </button>
            </div>
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
            <li>Click "Start Conversation" to begin real-time chat</li>
            <li>Speak naturally - the agent can hear you in real-time</li>
            <li>Say "Hi, my name is John Smith" to begin</li>
            <li>The agent will respond immediately and guide you through options</li>
            <li>Click "End Conversation" when finished</li>
          </ol>
        </div>

        <div className="card">
          <h3>Real-Time Features</h3>
          <ul style={{ paddingLeft: '1.5rem', lineHeight: '1.6' }}>
            <li><strong>🎤 Live Audio:</strong> Agent hears you speaking in real-time</li>
            <li><strong>🔊 Instant Response:</strong> Agent responds immediately like a phone call</li>
            <li><strong>💬 Natural Flow:</strong> No need to wait or press buttons</li>
            <li><strong>🔄 Interruption:</strong> You can speak while agent is talking</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
