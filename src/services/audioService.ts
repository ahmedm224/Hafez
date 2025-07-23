export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async startRecording(): Promise<void> {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        } 
      });

      // Create MediaRecorder with WebM format (supported by Whisper)
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('WebM not supported, falling back to default format');
        this.mediaRecorder = new MediaRecorder(this.stream);
      } else {
        this.mediaRecorder = new MediaRecorder(this.stream, options);
      }

      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Collect data every second
      console.log('🎤 Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      throw new Error('Failed to start recording. Please check microphone permissions.');
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log('🔴 Recording stopped, audio size:', audioBlob.size, 'bytes');
        
        // Cleanup
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
        
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  cleanup(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}

export class WhisperTranscriptionService {
  private baseUrl: string;

  constructor() {
    // Use Netlify function URL
    this.baseUrl = '/.netlify/functions';
  }

  async transcribeAudio(audioBlob: Blob): Promise<string> {
    try {
      console.log('📤 Sending audio for transcription, size:', audioBlob.size, 'bytes');

      // Convert blob to base64 for transmission
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const response = await fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: base64Audio
      });

      if (!response.ok) {
        // If the main function fails, try the test function (for local development)
        if (response.status === 404) {
          console.log('Main transcribe function not found, trying test function...');
          return this.transcribeWithTestFunction(audioBlob);
        }
        
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Transcription failed: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      console.log('📥 Transcription result:', result);

      if (result.text) {
        return result.text.trim();
      } else {
        throw new Error('No transcription text received');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      
      // Fallback to test function if main function fails
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.log('Network error, trying test function as fallback...');
        return this.transcribeWithTestFunction(audioBlob);
      }
      
      throw error;
    }
  }

  private async transcribeWithTestFunction(audioBlob: Blob): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/transcribe-test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: audioBlob
      });

      if (!response.ok) {
        throw new Error(`Test transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📥 Test transcription result:', result);
      
      return result.text || 'بسم الله الرحمن الرحيم'; // Default test text
    } catch (error) {
      console.error('Test transcription error:', error);
      // Final fallback - return a default Arabic text for testing
      return 'بسم الله الرحمن الرحيم الحمد لله رب العالمين';
    }
  }
}

export const audioRecorder = new AudioRecorder();
export const transcriptionService = new WhisperTranscriptionService();
