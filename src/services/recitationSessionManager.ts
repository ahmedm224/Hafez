import { AdvancedRecitationMatcher, type MatchResult } from './advancedRecitationMatcher';
import { AdvancedAudioRecorder, ChunkedTranscriptionService, type AudioChunk } from './advancedAudioService';
import type { QuranData } from '../quranParser';

// Re-export for consumers
export type { MatchResult } from './advancedRecitationMatcher';

export interface SessionConfig {
  suraIndex: number;
  startingAyah?: number;
  windowSize?: number;
  vadSilenceThreshold?: number;
  maxSilenceDuration?: number;
  minChunkDuration?: number;
  maxChunkDuration?: number;
}

export interface SessionState {
  isActive: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  currentMatch?: MatchResult;
  recentTranscriptions: string[];
  sessionStats: any;
  volumeLevel: number;
}

export interface SessionEvents {
  onMatchFound: (match: MatchResult) => void;
  onNoMatch: (transcription: string) => void;
  onSilenceDetected: () => void;
  onVoiceDetected: () => void;
  onSessionComplete: () => void;
  onError: (error: Error) => void;
  onStateChange: (state: SessionState) => void;
}

export class RecitationSessionManager {
  private matcher: AdvancedRecitationMatcher;
  private audioRecorder: AdvancedAudioRecorder;
  private transcriptionService: ChunkedTranscriptionService;
  private events: Partial<SessionEvents> = {};
  private state: SessionState;
  private stateUpdateInterval: number | null = null;

  constructor(quran: QuranData) {
    this.matcher = new AdvancedRecitationMatcher(quran);
    this.audioRecorder = new AdvancedAudioRecorder();
    this.transcriptionService = new ChunkedTranscriptionService();
    
    this.state = {
      isActive: false,
      isRecording: false,
      isProcessing: false,
      recentTranscriptions: [],
      sessionStats: null,
      volumeLevel: 0
    };

    this.setupEventHandlers();
  }

  // Set up event handlers for all components
  private setupEventHandlers(): void {
    // Audio recorder events
    this.audioRecorder.onChunkReady = (chunk: AudioChunk) => {
      console.log('📦 Audio chunk ready, sending for transcription...');
      this.transcriptionService.processChunk(chunk);
    };

    this.audioRecorder.onSilenceDetected = () => {
      console.log('🔇 Silence detected');
      if (this.events.onSilenceDetected) {
        this.events.onSilenceDetected();
      }
      this.handleSilenceDetected();
    };

    this.audioRecorder.onVoiceDetected = () => {
      if (this.events.onVoiceDetected) {
        this.events.onVoiceDetected();
      }
    };

    // Transcription service events
    this.transcriptionService.onTranscriptionReady = (transcription: string, chunk: AudioChunk) => {
      this.handleTranscription(transcription, chunk);
    };

    this.transcriptionService.onProcessingComplete = () => {
      this.updateState({ isProcessing: false });
    };
  }

  // Initialize a new recitation session
  async startSession(config: SessionConfig, events: Partial<SessionEvents> = {}): Promise<void> {
    try {
      this.events = events;
      
      // Initialize matcher session
      this.matcher.initializeSession(
        config.suraIndex,
        config.startingAyah || 1,
        config.windowSize || 3
      );

      // Configure audio recorder VAD
      this.audioRecorder.updateVADConfig({
        silenceThreshold: config.vadSilenceThreshold || -45,
        maxSilenceDuration: config.maxSilenceDuration || 3000,
        minChunkDuration: config.minChunkDuration || 2000,
        maxChunkDuration: config.maxChunkDuration || 30000
      });

      // Start audio recording
      await this.audioRecorder.startChunkedRecording();

      // Start state monitoring
      this.startStateMonitoring();

      this.updateState({
        isActive: true,
        isRecording: true,
        sessionStats: this.matcher.getSessionStats()
      });

      console.log('🚀 Recitation session started');
    } catch (error) {
      console.error('Failed to start session:', error);
      if (this.events.onError) {
        this.events.onError(error as Error);
      }
      throw error;
    }
  }

  // Stop the current session
  stopSession(): void {
    this.audioRecorder.stopRecording();
    this.stopStateMonitoring();
    this.transcriptionService.clearQueue();
    
    this.updateState({
      isActive: false,
      isRecording: false,
      isProcessing: false
    });

    if (this.events.onSessionComplete) {
      this.events.onSessionComplete();
    }

    console.log('🛑 Recitation session stopped');
  }

  // Handle incoming transcription
  private async handleTranscription(transcription: string, _chunk: AudioChunk): Promise<void> {
    console.log(`🎯 Processing transcription: "${transcription}"`);
    
    // Update recent transcriptions
    this.state.recentTranscriptions.unshift(transcription);
    if (this.state.recentTranscriptions.length > 5) {
      this.state.recentTranscriptions.pop();
    }

    this.updateState({ 
      isProcessing: true,
      recentTranscriptions: [...this.state.recentTranscriptions]
    });

    try {
      // Process with matcher
      const match = await this.matcher.processAudioChunk(transcription);
      
      if (match) {
        console.log(`✅ Match found: Ayahs ${match.startAyah}-${match.endAyah}`);
        
        this.updateState({ 
          currentMatch: match,
          sessionStats: this.matcher.getSessionStats()
        });

        if (this.events.onMatchFound) {
          this.events.onMatchFound(match);
        }
      } else {
        console.log('❌ No match found');
        
        if (this.events.onNoMatch) {
          this.events.onNoMatch(transcription);
        }
      }
    } catch (error) {
      console.error('Error processing transcription:', error);
      if (this.events.onError) {
        this.events.onError(error as Error);
      }
    }

    this.updateState({ isProcessing: false });
  }

  // Handle silence detection
  private handleSilenceDetected(): void {
    // If we detect long silence, we might want to reset the search window
    console.log('🔄 Resetting session due to silence');
    this.matcher.resetSession();
    
    this.updateState({
      sessionStats: this.matcher.getSessionStats()
    });
  }

  // Manual jump to specific ayah
  jumpToAyah(ayahNumber: number): void {
    this.matcher.jumpToPosition(ayahNumber);
    
    this.updateState({
      sessionStats: this.matcher.getSessionStats()
    });

    console.log(`🦘 Jumped to ayah ${ayahNumber}`);
  }

  // Force a chunk break (useful for user-initiated breaks)
  forceChunkBreak(): void {
    this.audioRecorder.forceChunkBreak();
    console.log('✂️ Forced chunk break');
  }

  // Get current session state
  getState(): SessionState {
    return { ...this.state };
  }

  // Start monitoring state updates
  private startStateMonitoring(): void {
    this.stateUpdateInterval = window.setInterval(() => {
      if (this.audioRecorder.isActivelyRecording()) {
        const volumeLevel = this.audioRecorder.getCurrentVolumeLevel();
        
        if (Math.abs(volumeLevel - this.state.volumeLevel) > 2) { // Only update if significant change
          this.updateState({ volumeLevel });
        }
      }
    }, 100); // Update every 100ms
  }

  private stopStateMonitoring(): void {
    if (this.stateUpdateInterval) {
      clearInterval(this.stateUpdateInterval);
      this.stateUpdateInterval = null;
    }
  }

  // Update state and notify listeners
  private updateState(updates: Partial<SessionState>): void {
    this.state = { ...this.state, ...updates };
    
    if (this.events.onStateChange) {
      this.events.onStateChange(this.getState());
    }
  }

  // Get session statistics
  getSessionStats(): any {
    return this.matcher.getSessionStats();
  }

  // Cleanup resources
  cleanup(): void {
    this.stopSession();
    this.audioRecorder.cleanup();
  }

  // Configuration updates
  updateVADConfig(config: any): void {
    this.audioRecorder.updateVADConfig(config);
  }

  // Check if session is active
  isSessionActive(): boolean {
    return this.state.isActive;
  }

  // Get recent transcriptions for debugging
  getRecentTranscriptions(): string[] {
    return [...this.state.recentTranscriptions];
  }
}
