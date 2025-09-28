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
  const audioQueueRef = useRef<string[]>([]);
  const lastCommitRef = useRef<number>(0);

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
        
        console.log('WebSocket opened, waiting for conversation to start...');
        
        console.log('Connected to ElevenLabs agent:', agentId);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received:', data);
        
        // Handle different message types from ElevenLabs
        if (data.type === 'audio' && data.audio_event?.audio_base_64) {
          // Play PCM16 audio base64
          playAudioDelta(data.audio_event.audio_base_64);
        } else if (data.type === 'agent_response') {
          if (data.agent_response_event?.transcript) {
            setMessages(prev => [...prev, `Agent: ${data.agent_response_event.transcript}`]);
          }
          // Agent finished speaking, ready for next input
          setStatus('Ready - speak anytime');
        } else if (data.type === 'conversation_initiation_metadata') {
          setStatus('Ready - speak anytime! Agent can hear you now.');
        } else if (data.type === 'message') {
          // Show text message
          setMessages(prev => [...prev, `Agent: ${data.message}`]);
        } else if (data.type === 'interruption') {
          setStatus('Agent interrupted');
        } else if (data.type === 'ping') {
          // Respond to ping to keep connection alive - ElevenLabs format
          if (data.ping_event?.event_id) {
            ws.send(JSON.stringify({ type: 'pong', event_id: data.ping_event.event_id }));
          } else if (data.ping_event?.ping_id) {
            ws.send(JSON.stringify({ type: 'pong', event_id: data.ping_event.ping_id }));
          } else {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } else if (data.type === 'error') {
          console.error('ElevenLabs error:', data);
          setStatus(`Agent error: ${data.message || 'Unknown error'}`);
        } else {
          console.log('Unhandled message type:', data.type, data);
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
        setStatus('Connection error - check console for details');
        setIsConnected(false);
        setIsStreaming(false);
        stopAudioStream();
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
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // Try AudioWorklet first, fallback to ScriptProcessor if needed
      try {
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
        
        const worklet = new AudioWorkletNode(audioContext, 'audio-processor');
        workletRef.current = worklet;
        
        worklet.port.onmessage = (event) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          
          try {
            // Send audio data - ElevenLabs format
            if (event.data && event.data.byteLength > 0) {
              const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(event.data))));
              wsRef.current.send(JSON.stringify({
                type: 'audio',
                audio_event: {
                  audio_base_64: base64Audio
                }
              }));
            }
          } catch (error) {
            console.error('Error sending audio chunk:', error);
          }
        };
        
        source.connect(worklet);
        worklet.connect(audioContext.destination);
        
      } catch (workletError) {
        console.warn('AudioWorklet not supported, using ScriptProcessor fallback:', workletError);
        
        // Fallback to ScriptProcessor for older browsers
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        workletRef.current = processor as any; // Type compatibility
        
        processor.onaudioprocess = (event) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          
          try {
            const inputBuffer = event.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            
            // Convert float32 to int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            
            // Send audio data - ElevenLabs format
            if (pcmData.length > 0) {
              const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(pcmData.buffer))));
              wsRef.current.send(JSON.stringify({
                type: 'audio',
                audio_event: {
                  audio_base_64: base64Audio
                }
              }));
            }
          } catch (error) {
            console.error('Error sending audio chunk:', error);
          }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
      }
      
      setIsStreaming(true);
      setStatus('Ready - speak anytime! Agent can hear you now.');
      
    } catch (error) {
      console.error('Failed to start audio stream:', error);
      setStatus(`Audio stream error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsStreaming(false);
    }
  };

  const stopAudioStream = () => {
    try {
      // Reset commit timer
      lastCommitRef.current = 0;
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      
      if (workletRef.current) {
        workletRef.current.disconnect();
        workletRef.current = null;
      }
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      setIsStreaming(false);
      setStatus('Audio stream stopped');
    } catch (error) {
      console.error('Error stopping audio stream:', error);
      setIsStreaming(false);
      setStatus('Audio stream stopped with errors');
    }
  };

  const playAudioDelta = async (audioBase64: string) => {
    try {
      // Queue base64 chunks; decode during playback to avoid decodeAudioData errors
      audioQueueRef.current.push(audioBase64);
      
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
      const audioBase64 = audioQueueRef.current.shift()!;
      
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        // Convert base64 PCM16 to Float32 and play via AudioBuffer
        const binaryString = atob(audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x7FFF;
        const buffer = audioContext.createBuffer(1, float32.length, 24000);
        buffer.copyToChannel(float32, 0, 0);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
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
