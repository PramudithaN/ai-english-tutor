import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Mic, Send, StopCircle } from 'lucide-react';
import './App.css';
import VoiceVisualizer from './VoiceVisualizer';
import Swal from 'sweetalert2';

type Message = {
  sender: 'user' | 'ai';
  text: string;
};

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [loadingDots, setLoadingDots] = useState('.');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chatWindowRef = useRef<HTMLDivElement | null>(null);
  const currentlyPlayingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    chatWindowRef.current?.scrollTo(0, chatWindowRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setLoadingDots(dots => (dots.length >= 3 ? '.' : dots + '.'));
      }, 400);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const sendPromptToAI = async (promptText: string) => {
    const newUserMessage: Message = { sender: 'user', text: promptText };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setIsLoading(true);

    // --- EASTER EGG LOGIC ---
   if (promptText.toLowerCase().includes('pramuditha')) {
      Swal.fire({
        title: '🎉 Congratulations!',
        text: 'You found the Easter egg!',
        icon: 'success',
        confirmButtonText: 'Awesome!',
        color: '#fff',
        background: '#1f1f1f',
        allowOutsideClick() {
          return true;
        },
      });
      const easterEggResponse = `Congratulations on finding the Easter egg! Pramuditha is a Software Engineer and Graphic Designer. He loves creating innovative solutions and has a passion for design. Keep exploring and have fun with the AI! Portfolio: [https://pramuditha.is-a.dev](https://pramuditha.is-a.dev)`;
      
      // Simulate a short delay to feel like the AI is thinking
      setTimeout(() => {
        const aiTextMessage: Message = { sender: 'ai', text: easterEggResponse };
        setMessages(prevMessages => [...prevMessages, aiTextMessage]);
        
        // Use the browser's built-in speech synthesis for the Easter egg
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(easterEggResponse);
          window.speechSynthesis.speak(utterance);
        }
        
        setIsLoading(false);
      }, 1200); // 1.2 second delay

      // Stop the function here so it doesn't call the real API
      return; 
    }

    const currentHistory = messages.map(msg => ({
      role: msg.sender === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    }));

    try {
      const chatResponse = await fetch(`${process.env.REACT_APP_API_URL}api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: currentHistory, prompt: promptText }),
      });
      if (!chatResponse.ok) throw new Error(`Chat API failed with status ${chatResponse.status}`);
      const chatData = await chatResponse.json();
      const aiTextMessage: Message = { sender: 'ai', text: chatData.message };
      setMessages(prevMessages => [...prevMessages, aiTextMessage]);

      const ttsResponse = await fetch(`${process.env.REACT_APP_API_URL}api/text-to-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chatData.message }),
      });
      if (!ttsResponse.ok) throw new Error(`TTS API failed with status ${ttsResponse.status}`);
      const ttsData = await ttsResponse.json();
      const audio = new Audio(`data:audio/mp3;base64,${ttsData.audioContent}`);
      currentlyPlayingAudioRef.current = audio;
      await audio.play();
      audio.onended = () => {
        currentlyPlayingAudioRef.current = null;
      };

    } catch (error) {
      console.error("API call failed:", error);
      const errorMessage: Message = { sender: 'ai', text: 'Sorry, I ran into an error. Please try again.' };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;
    if (currentlyPlayingAudioRef.current) {
      currentlyPlayingAudioRef.current.pause();
      currentlyPlayingAudioRef.current = null;
    }
    sendPromptToAI(userInput);
    setUserInput('');
  };

  const handleToggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      if (currentlyPlayingAudioRef.current) {
        currentlyPlayingAudioRef.current.pause();
        currentlyPlayingAudioRef.current = null;
      }
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          audioStreamRef.current = stream;
          audioChunksRef.current = [];
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.addEventListener("dataavailable", event => audioChunksRef.current.push(event.data));
          mediaRecorder.addEventListener("stop", async () => {
            stream.getTracks().forEach(track => track.stop());
            setIsLoading(true);
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append("audio", audioBlob);
            try {
              const sttResponse = await fetch(`${process.env.REACT_APP_API_URL}api/speech-to-text`, {
                method: 'POST',
                body: formData,
              });
              if (!sttResponse.ok) throw new Error(`STT API failed with status ${sttResponse.status}`);
              const sttData = await sttResponse.json();
              if (sttData.text) {
                sendPromptToAI(sttData.text);
              } else {
                throw new Error("Transcription result was empty.");
              }
            } catch (error) {
              console.error("Speech-to-Text failed:", error);
              const errorMessage: Message = { sender: 'ai', text: 'Sorry, I could not understand your speech.' };
              setMessages(prevMessages => [...prevMessages, errorMessage]);
            } finally {
              setIsLoading(false);
            }
          });
          mediaRecorder.start();
          setIsRecording(true);
        })
        .catch(err => {
          console.error("Error accessing microphone:", err);
          alert("Microphone access was denied. Please allow microphone access in your browser settings.");
        });
    }
  };

  return (
    <div className="App">
      <div className="chat-window" ref={chatWindowRef}>
        {messages.length === 0 && !isLoading && (
          <div className="welcome-message">
             <h2>Hello <span style={{ color: '#8ab4f8' }}>Machan</span>,</h2>
             <p>I'm your personal AI assistant. Start typing, or tap the mic button to talk!</p>
          </div>
        )}
        
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          </div>
        ))}

        {isLoading && !isRecording && (
          <div className="message ai">
            <p><i>Thinking<span style={{ minWidth: '15px', display: 'inline-block', textAlign: 'left' }}>{loadingDots}</span></i></p>
          </div>
        )}
      </div>

      {isRecording && <VoiceVisualizer audioStream={audioStreamRef.current} isRecording={isRecording} />}
      
      <form className="chat-input-form" onSubmit={handleTextSubmit}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Type or tap the mic to talk..."
          disabled={isLoading}
          autoFocus
        />
        <button type="submit" disabled={isLoading || !userInput.trim()}>
           <Send size={18} />
        </button>
        <button 
          type="button" 
          onClick={handleToggleRecording}
          className={`mic-button ${isRecording ? 'recording' : ''}`}
          disabled={isLoading}
        >
          {isRecording ? <StopCircle size={18} /> : <Mic size={18} />}
        </button>
      </form>
    </div>
  );
}

export default App;