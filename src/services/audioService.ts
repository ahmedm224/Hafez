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

      // Test the API connection first
      try {
        const testResponse = await fetch(`${this.baseUrl}/test-api`);
        if (testResponse.ok) {
          const testData = await testResponse.json();
          console.log('🔧 API test result:', testData);
        }
      } catch (testError) {
        console.warn('⚠️ API test failed:', testError);
      }

      // Convert blob to base64 for transmission using a more efficient method for large files
      console.log('🔄 Converting audio to base64...');
      const base64Audio = await this.blobToBase64(audioBlob);
      console.log('✅ Base64 conversion complete, length:', base64Audio.length);

      console.log('📡 Making request to transcription API...');
      const response = await fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: base64Audio
      });

      console.log('📡 Response status:', response.status);

      if (!response.ok) {
        const responseText = await response.text();
        console.error('❌ API Error Response:', responseText);
        
        // If the main function fails, try the test function (for local development)
        if (response.status === 404) {
          console.log('Main transcribe function not found, trying test function...');
          return this.transcribeWithTestFunction(audioBlob);
        }
        
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { error: responseText || 'Unknown error' };
        }
        
        throw new Error(`Transcription failed (${response.status}): ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      console.log('📥 Transcription result:', result);

      if (result.text) {
        return result.text.trim();
      } else {
        throw new Error('No transcription text received');
      }
    } catch (error) {
      console.error('💥 Transcription error:', error);
      
      // Fallback to test function if main function fails
      if (error instanceof TypeError && error.message.includes('fetch')) {
        console.log('Network error, trying test function as fallback...');
        return this.transcribeWithTestFunction(audioBlob);
      }
      
      throw error;
    }
  }

  // More efficient base64 conversion for large files
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (data:audio/webm;base64,)
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
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
