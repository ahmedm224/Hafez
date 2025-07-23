export interface AudioChunk {
  blob: Blob;
  timestamp: number;
  duration: number;
  hasVoice: boolean;
}

export interface VADConfig {
  silenceThreshold: number; // dB level for silence detection
  maxSilenceDuration: number; // Max silence before reset (ms)
  minChunkDuration: number; // Minimum chunk duration (ms)
  maxChunkDuration: number; // Maximum chunk duration (ms)
}

export class AdvancedAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private vadConfig: VADConfig;
  private currentChunk: Blob[] = [];
  private chunkStartTime: number = 0;
  private lastVoiceTime: number = 0;
  private isRecording: boolean = false;
  private vadCheckInterval: number | null = null;
  
  // Callbacks
  public onChunkReady?: (chunk: AudioChunk) => void;
  public onSilenceDetected?: () => void;
  public onVoiceDetected?: () => void;

  constructor(config: Partial<VADConfig> = {}) {
    this.vadConfig = {
      silenceThreshold: -45, // dB
      maxSilenceDuration: 3000, // 3 seconds
      minChunkDuration: 2000, // 2 seconds
      maxChunkDuration: 30000, // 30 seconds
      ...config
    };
  }

  async startChunkedRecording(): Promise<void> {
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

      // Set up audio context for VAD
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      // Create MediaRecorder
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('WebM not supported, falling back to default format');
        this.mediaRecorder = new MediaRecorder(this.stream);
      } else {
        this.mediaRecorder = new MediaRecorder(this.stream, options);
      }

      this.setupMediaRecorderEvents();
      this.startNewChunk();
      this.startVADMonitoring();

      console.log('🎤 Chunked recording started with VAD');
    } catch (error) {
      console.error('Error starting chunked recording:', error);
      throw new Error('Failed to start recording. Please check microphone permissions.');
    }
  }

  private setupMediaRecorderEvents(): void {
    if (!this.mediaRecorder) return;

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.currentChunk.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.finalizeCurrentChunk();
    };
  }

  private startNewChunk(): void {
    if (!this.mediaRecorder) return;

    this.currentChunk = [];
    this.chunkStartTime = Date.now();
    this.lastVoiceTime = Date.now();
    
    if (this.mediaRecorder.state === 'inactive') {
      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;
    }
  }

  private finalizeCurrentChunk(): void {
    if (this.currentChunk.length === 0) return;

    const chunkBlob = new Blob(this.currentChunk, { type: 'audio/webm' });
    const duration = Date.now() - this.chunkStartTime;
    const hasVoice = (Date.now() - this.lastVoiceTime) < this.vadConfig.maxSilenceDuration;

    const audioChunk: AudioChunk = {
      blob: chunkBlob,
      timestamp: this.chunkStartTime,
      duration,
      hasVoice
    };

    console.log(`📦 Chunk finalized: ${duration}ms, ${chunkBlob.size} bytes, hasVoice: ${hasVoice}`);

    if (this.onChunkReady && chunkBlob.size > 1000) { // Only process chunks with actual content
      this.onChunkReady(audioChunk);
    }
  }

  private startVADMonitoring(): void {
    this.vadCheckInterval = window.setInterval(() => {
      if (!this.analyser || !this.isRecording) return;

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      // Calculate average volume
      const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      const decibels = 20 * Math.log10(average / 255);

      const hasVoice = decibels > this.vadConfig.silenceThreshold;
      const currentTime = Date.now();
      const chunkDuration = currentTime - this.chunkStartTime;
      const silenceDuration = currentTime - this.lastVoiceTime;

      if (hasVoice) {
        this.lastVoiceTime = currentTime;
        if (this.onVoiceDetected) {
          this.onVoiceDetected();
        }
      }

      // Check if we should finalize current chunk
      const shouldFinalize = 
        (chunkDuration >= this.vadConfig.maxChunkDuration) || // Max duration reached
        (chunkDuration >= this.vadConfig.minChunkDuration && silenceDuration >= this.vadConfig.maxSilenceDuration); // Min duration + silence

      if (shouldFinalize) {
        console.log(`🔄 Finalizing chunk: duration=${chunkDuration}ms, silence=${silenceDuration}ms`);
        
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
        }

        // Start new chunk if silence is not too long
        if (silenceDuration < this.vadConfig.maxSilenceDuration * 2) {
          setTimeout(() => this.startNewChunk(), 100);
        } else {
          console.log('🔇 Long silence detected, stopping automatic chunking');
          if (this.onSilenceDetected) {
            this.onSilenceDetected();
          }
        }
      }
    }, 100); // Check every 100ms
  }

  stopRecording(): void {
    this.isRecording = false;

    if (this.vadCheckInterval) {
      clearInterval(this.vadCheckInterval);
      this.vadCheckInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    this.cleanup();
    console.log('🔴 Chunked recording stopped');
  }

  // Force finalize current chunk (useful for manual chunk breaks)
  forceChunkBreak(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      setTimeout(() => this.startNewChunk(), 100);
    }
  }

  // Update VAD configuration
  updateVADConfig(config: Partial<VADConfig>): void {
    this.vadConfig = { ...this.vadConfig, ...config };
    console.log('🔧 VAD config updated:', this.vadConfig);
  }

  getCurrentVolumeLevel(): number {
    if (!this.analyser) return 0;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
    return 20 * Math.log10(average / 255);
  }

  isActivelyRecording(): boolean {
    return this.isRecording && this.mediaRecorder?.state === 'recording';
  }

  cleanup(): void {
    if (this.vadCheckInterval) {
      clearInterval(this.vadCheckInterval);
      this.vadCheckInterval = null;
    }

    if (this.mediaRecorder) {
      if (this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
      this.mediaRecorder = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.analyser = null;
    this.isRecording = false;
  }
}

// Enhanced transcription service with chunked processing
export class ChunkedTranscriptionService {
  private baseUrl: string;
  private processingQueue: AudioChunk[] = [];
  private isProcessing: boolean = false;

  public onTranscriptionReady?: (transcription: string, chunk: AudioChunk) => void;
  public onProcessingComplete?: () => void;

  constructor() {
    this.baseUrl = '/.netlify/functions';
  }

  async processChunk(chunk: AudioChunk): Promise<void> {
    this.processingQueue.push(chunk);
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.isProcessing = true;

    while (this.processingQueue.length > 0) {
      const chunk = this.processingQueue.shift()!;
      
      try {
        console.log(`📤 Processing chunk: ${chunk.duration}ms, ${chunk.blob.size} bytes`);
        
        const transcription = await this.transcribeChunk(chunk.blob);
        
        if (transcription && transcription.trim().length > 0) {
          console.log(`📝 Transcription: "${transcription}"`);
          
          if (this.onTranscriptionReady) {
            this.onTranscriptionReady(transcription, chunk);
          }
        }
      } catch (error) {
        console.error('Error processing chunk:', error);
      }
    }

    this.isProcessing = false;
    
    if (this.onProcessingComplete) {
      this.onProcessingComplete();
    }
  }

  private async transcribeChunk(audioBlob: Blob): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/webm',
        },
        body: audioBlob
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const result = await response.json();
      return result.text?.trim() || '';
    } catch (error) {
      console.error('Chunk transcription error:', error);
      throw error;
    }
  }

  clearQueue(): void {
    this.processingQueue = [];
  }
}
