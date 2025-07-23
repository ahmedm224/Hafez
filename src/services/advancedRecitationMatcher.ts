import type { QuranData } from '../quranParser';

export interface AyahWindow {
  startAyah: number;
  endAyah: number;
  text: string;
  normalizedText: string;
  words: string[];
  confidence?: number;
}

export interface MatchResult {
  windowIndex: number;
  confidence: number;
  accuracy: number;
  matchedWords: number;
  totalWords: number;
  startAyah: number;
  endAyah: number;
  alignmentScore: number;
}

export interface RecitationSession {
  suraIndex: number;
  currentPosition: number; // Current ayah position
  windowSize: number; // 2-3 ayahs
  confidenceThreshold: number;
  slidingWindows: AyahWindow[];
  sessionHistory: MatchResult[];
  lastSuccessfulMatch?: MatchResult;
  consecutiveFailures: number;
  isActive: boolean;
}

export class AdvancedRecitationMatcher {
  private session: RecitationSession | null = null;
  private quran: QuranData | null = null;

  constructor(quran: QuranData) {
    this.quran = quran;
  }

  // Initialize a new recitation session starting from any ayah
  initializeSession(suraIndex: number, startingAyah: number = 1, windowSize: number = 3): RecitationSession {
    const sura = this.quran?.suras.find(s => s.index === suraIndex);
    if (!sura) {
      throw new Error(`Sura ${suraIndex} not found`);
    }

    this.session = {
      suraIndex,
      currentPosition: startingAyah,
      windowSize,
      confidenceThreshold: 0.7, // 70% confidence minimum
      slidingWindows: [],
      sessionHistory: [],
      consecutiveFailures: 0,
      isActive: true
    };

    // Build initial sliding windows
    this.buildSlidingWindows();
    
    console.log(`🎯 Session initialized: Sura ${suraIndex}, starting at ayah ${startingAyah}`);
    console.log(`📊 Created ${this.session.slidingWindows.length} sliding windows`);
    
    return this.session;
  }

  // Build sliding windows of 2-3 ayahs for better matching
  private buildSlidingWindows(): void {
    if (!this.session || !this.quran) return;

    const sura = this.quran.suras.find(s => s.index === this.session!.suraIndex);
    if (!sura) return;

    this.session.slidingWindows = [];
    
    // Create overlapping windows around current position with wider coverage
    const windowRadius = Math.max(5, this.session.windowSize * 2); // Expand search area
    const startPos = Math.max(0, this.session.currentPosition - windowRadius - 1);
    const endPos = Math.min(sura.ayas.length, this.session.currentPosition + windowRadius);
    
    console.log(`🔍 Building windows from ayah ${startPos + 1} to ${endPos} (current position: ${this.session.currentPosition})`);
    
    // Create overlapping windows for flexible matching
    for (let i = startPos; i < endPos; i++) {
      for (let windowSize = 1; windowSize <= this.session.windowSize; windowSize++) {
        if (i + windowSize <= sura.ayas.length) {
          const windowAyas = sura.ayas.slice(i, i + windowSize);
          const combinedText = windowAyas.map(a => a.text).join(' ');
          const normalizedText = this.normalizeArabicText(combinedText);
          
          this.session.slidingWindows.push({
            startAyah: windowAyas[0].index,
            endAyah: windowAyas[windowAyas.length - 1].index,
            text: combinedText,
            normalizedText,
            words: normalizedText.split(/\s+/).filter(w => w.length > 0)
          });
        }
      }
    }

    console.log(`🔄 Built ${this.session.slidingWindows.length} sliding windows around position ${this.session.currentPosition}`);
  }

  // Process audio chunk and find best match using sliding windows
  async processAudioChunk(transcribedText: string): Promise<MatchResult | null> {
    if (!this.session || !this.session.isActive) {
      console.warn('⚠️ No active session');
      return null;
    }

    const normalizedTranscription = this.normalizeArabicText(transcribedText);
    const transcribedWords = normalizedTranscription.split(/\s+/).filter(w => w.length > 0);

    if (transcribedWords.length === 0) {
      console.warn('⚠️ Empty transcription');
      return null;
    }

    console.log(`🔍 Processing ${transcribedWords.length} words against ${this.session.slidingWindows.length} windows`);

    // Score all windows
    const windowScores: MatchResult[] = [];
    
    for (let i = 0; i < this.session.slidingWindows.length; i++) {
      const window = this.session.slidingWindows[i];
      const score = this.scoreWindow(transcribedWords, window);
      
      if (score.confidence >= this.session.confidenceThreshold) {
        windowScores.push({
          ...score,
          windowIndex: i,
          startAyah: window.startAyah,
          endAyah: window.endAyah
        });
      }
    }

    // Sort by combined score (confidence + accuracy + alignment)
    windowScores.sort((a, b) => {
      const scoreA = (a.confidence * 0.4) + (a.accuracy * 0.4) + (a.alignmentScore * 0.2);
      const scoreB = (b.confidence * 0.4) + (b.accuracy * 0.4) + (b.alignmentScore * 0.2);
      return scoreB - scoreA;
    });

    const bestMatch = windowScores[0];

    if (bestMatch) {
      console.log(`✅ Best match: Ayahs ${bestMatch.startAyah}-${bestMatch.endAyah}, confidence: ${bestMatch.confidence.toFixed(2)}`);
      
      // Update session state
      this.session.lastSuccessfulMatch = bestMatch;
      this.session.currentPosition = bestMatch.endAyah + 1;
      this.session.consecutiveFailures = 0;
      this.session.sessionHistory.push(bestMatch);
      
      // Rebuild windows from new position
      this.buildSlidingWindows();
      
      return bestMatch;
    } else {
      console.warn(`❌ No match found above threshold (${this.session.confidenceThreshold})`);
      this.session.consecutiveFailures++;
      
      // Handle consecutive failures
      if (this.session.consecutiveFailures >= 3) {
        console.log('🔄 Multiple failures, expanding search and lowering threshold');
        this.handleConsecutiveFailures();
      }
      
      return null;
    }
  }

  // Score a window against transcribed words using multiple metrics
  private scoreWindow(transcribedWords: string[], window: AyahWindow): Omit<MatchResult, 'windowIndex' | 'startAyah' | 'endAyah'> {
    const windowWords = window.words;
    
    // 1. Exact sequence matching (primary metric)
    const sequenceMatch = this.calculateSequenceMatch(transcribedWords, windowWords);
    
    // 2. Word overlap (secondary metric)
    const overlapScore = this.calculateWordOverlap(transcribedWords, windowWords);
    
    // 3. Edit distance (fuzzy matching)
    const editScore = this.calculateEditScore(transcribedWords, windowWords);
    
    // 4. Position alignment score
    const alignmentScore = this.calculateAlignmentScore(transcribedWords, windowWords);
    
    // Combine scores with weights
    const confidence = (sequenceMatch * 0.5) + (overlapScore * 0.3) + (editScore * 0.2);
    const accuracy = sequenceMatch; // Primary accuracy is sequence match
    
    return {
      confidence,
      accuracy,
      matchedWords: Math.round(sequenceMatch * transcribedWords.length),
      totalWords: transcribedWords.length,
      alignmentScore
    };
  }

  // Calculate longest common subsequence match
  private calculateSequenceMatch(transcribed: string[], window: string[]): number {
    if (transcribed.length === 0 || window.length === 0) return 0;
    
    // Find longest common subsequence
    const lcs = this.longestCommonSubsequence(transcribed, window);
    return lcs.length / Math.max(transcribed.length, window.length);
  }

  // Calculate word overlap percentage
  private calculateWordOverlap(transcribed: string[], window: string[]): number {
    const transcribedSet = new Set(transcribed);
    const windowSet = new Set(window);
    
    let overlap = 0;
    for (const word of transcribedSet) {
      if (windowSet.has(word)) overlap++;
    }
    
    return overlap / Math.max(transcribedSet.size, windowSet.size);
  }

  // Calculate edit distance score (normalized)
  private calculateEditScore(transcribed: string[], window: string[]): number {
    const joinedTranscribed = transcribed.join(' ');
    const joinedWindow = window.join(' ');
    
    const editDistance = this.levenshteinDistance(joinedTranscribed, joinedWindow);
    const maxLength = Math.max(joinedTranscribed.length, joinedWindow.length);
    
    return maxLength > 0 ? 1 - (editDistance / maxLength) : 0;
  }

  // Calculate position alignment score
  private calculateAlignmentScore(transcribed: string[], window: string[]): number {
    let alignmentScore = 0;
    let matches = 0;
    
    const minLength = Math.min(transcribed.length, window.length);
    
    for (let i = 0; i < minLength; i++) {
      if (this.arabicWordMatch(transcribed[i], window[i])) {
        alignmentScore += (minLength - i) / minLength; // Earlier matches score higher
        matches++;
      }
    }
    
    return matches > 0 ? alignmentScore / matches : 0;
  }

  // Handle consecutive failures by expanding search and lowering threshold
  private handleConsecutiveFailures(): void {
    if (!this.session) return;
    
    // Lower confidence threshold temporarily
    this.session.confidenceThreshold = Math.max(0.5, this.session.confidenceThreshold - 0.1);
    
    // Expand window size
    this.session.windowSize = Math.min(5, this.session.windowSize + 1);
    
    // Reset position if we have a last successful match
    if (this.session.lastSuccessfulMatch) {
      this.session.currentPosition = this.session.lastSuccessfulMatch.startAyah;
    } else {
      // Go back to beginning of sura
      this.session.currentPosition = 1;
    }
    
    // Rebuild windows with new parameters
    this.buildSlidingWindows();
    
    console.log(`🔧 Adjusted: threshold=${this.session.confidenceThreshold}, windowSize=${this.session.windowSize}, position=${this.session.currentPosition}`);
  }

  // Allow user to jump to specific position (skip ayahs)
  jumpToPosition(ayahNumber: number): void {
    if (!this.session) return;
    
    this.session.currentPosition = ayahNumber;
    this.session.consecutiveFailures = 0;
    this.session.confidenceThreshold = 0.7; // Reset threshold
    
    this.buildSlidingWindows();
    console.log(`🦘 Jumped to ayah ${ayahNumber}`);
  }

  // Reset session for mid-sura restart
  resetSession(): void {
    if (!this.session) return;
    
    this.session.consecutiveFailures = 0;
    this.session.confidenceThreshold = 0.7;
    this.session.windowSize = 3;
    
    console.log('🔄 Session reset for restart');
  }

  // Normalize Arabic text for better matching
  private normalizeArabicText(text: string): string {
    return text
      .replace(/[\u064B-\u0652]/g, '') // Remove diacritics
      .replace(/إ|أ|آ/g, 'ا') // Normalize alif variations
      .replace(/ة/g, 'ه') // Ta marbuta to ha  
      .replace(/ي/g, 'ى') // Ya variations
      .replace(/ک/g, 'ك') // Farsi kaf to Arabic kaf
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .toLowerCase();
  }

  // Enhanced Arabic word matching
  private arabicWordMatch(word1: string, word2: string): boolean {
    if (!word1 || !word2) return false;
    
    const norm1 = this.normalizeArabicText(word1);
    const norm2 = this.normalizeArabicText(word2);
    
    if (norm1 === norm2) return true;
    
    // Fuzzy match for similar words
    if (norm1.length > 2 && norm2.length > 2) {
      const similarity = this.calculateSimilarity(norm1, norm2);
      return similarity >= 0.85;
    }
    
    return false;
  }

  // Longest Common Subsequence algorithm
  private longestCommonSubsequence(arr1: string[], arr2: string[]): string[] {
    const m = arr1.length;
    const n = arr2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (this.arabicWordMatch(arr1[i - 1], arr2[j - 1])) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    // Reconstruct LCS
    const lcs: string[] = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (this.arabicWordMatch(arr1[i - 1], arr2[j - 1])) {
        lcs.unshift(arr1[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    
    return lcs;
  }

  // String similarity calculation
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Levenshtein distance calculation
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Get session statistics
  getSessionStats(): any {
    if (!this.session) return null;
    
    return {
      suraIndex: this.session.suraIndex,
      currentPosition: this.session.currentPosition,
      totalMatches: this.session.sessionHistory.length,
      averageConfidence: this.session.sessionHistory.length > 0 
        ? this.session.sessionHistory.reduce((sum, match) => sum + match.confidence, 0) / this.session.sessionHistory.length 
        : 0,
      consecutiveFailures: this.session.consecutiveFailures,
      confidenceThreshold: this.session.confidenceThreshold,
      windowSize: this.session.windowSize
    };
  }
}
