import React, { useRef, useEffect } from 'react';
import './VoiceVisualizer.css';

interface VoiceVisualizerProps {
  audioStream: MediaStream | null;
  isRecording: boolean;
}

const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ audioStream, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording || !audioStream || !audioStream.getAudioTracks()[0]) {
      // If stream is not active, stop the animation
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const microphone = audioContext.createMediaStreamSource(audioStream);

    microphone.connect(analyser);
    analyser.fftSize = 512; // Increased for a smoother wave
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    const canvasCtx = canvas?.getContext('2d');

  const draw = () => {
      if (!canvas || !canvasCtx) return;
      
      // Keep the animation loop going
      animationFrameId.current = requestAnimationFrame(draw);

      // --- THIS IS THE NEW, CRUCIAL LINE ---
      // Clear the entire canvas before drawing the new frame
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      // Get the current audio data
      analyser.getByteTimeDomainData(dataArray);

      canvasCtx.lineWidth = 4;
      canvasCtx.strokeStyle = 'rgb(16, 100, 255)';
      canvasCtx.beginPath();

      const sliceWidth = (canvas.width * 1.0) / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();

    return () => {
      // Cleanup on component unmount or when dependencies change
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    };
  }, [isRecording, audioStream]);

  // Use a class to control visibility and style
  return <canvas ref={canvasRef} className={`voice-visualizer ${isRecording ? 'active' : ''}`} width={300} height={70} />;
};

export default VoiceVisualizer;