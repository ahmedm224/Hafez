import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { loadQuran } from './quranParser';
import type { QuranData } from './quranParser';
import { Header } from './components/Header';
import { useTheme } from './hooks/useTheme';
import { RecitationSessionManager, type SessionConfig, type SessionState, type MatchResult } from './services/recitationSessionManager';

function App() {
  const { t, i18n } = useTranslation();
  useTheme(); // Initialize theme hook
  
  const [quran, setQuran] = useState<QuranData | null>(null);
  const [selectedSuraIdx, setSelectedSuraIdx] = useState<number>(1);
  const [selectedAyaIdx, setSelectedAyaIdx] = useState<number>(1);
  const [sessionManager, setSessionManager] = useState<RecitationSessionManager | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({
    isActive: false,
    isRecording: false,
    isProcessing: false,
    recentTranscriptions: [],
    sessionStats: null,
    volumeLevel: 0
  });
  
  // Legacy state for UI compatibility
  const [completed, setCompleted] = useState<{ [key: string]: boolean }>({});
  const [currentMatch, setCurrentMatch] = useState<MatchResult | null>(null);
  const [noMatchTranscriptions, setNoMatchTranscriptions] = useState<string[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(false);
  
  const countdownIntervalRef = useRef<any>(null);

  // Initialize session manager when Quran is loaded
  useEffect(() => {
    loadQuran().then(data => {
      setQuran(data);
      const manager = new RecitationSessionManager(data);
      setSessionManager(manager);
      console.log('✅ Quran loaded and session manager initialized');
    }).catch(err => {
      console.error('❌ Failed to load Quran:', err);
    });
  }, []);

  // Update document direction when language changes
  useEffect(() => {
    document.documentElement.setAttribute('dir', i18n.language === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', i18n.language);
  }, [i18n.language]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionManager) {
        sessionManager.cleanup();
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [sessionManager]);

  const sura = quran?.suras.find(s => s.index === selectedSuraIdx);
  const aya = sura?.ayas.find(a => a.index === selectedAyaIdx);

  const suraProgress = sura ? 
    (sura.ayas.filter(a => completed[`${selectedSuraIdx}:${a.index}`]).length / sura.ayas.length) * 100 : 0;

  const overallProgress = quran ? 
    (Object.keys(completed).length / quran.suras.reduce((total, s) => total + s.ayas.length, 0)) * 100 : 0;

  const startRecording = async () => {
    if (!navigator.onLine) {
      alert(t('internetRequired'));
      return;
    }

    if (!sessionManager) {
      alert('Session manager not ready');
      return;
    }

    try {
      // Start with countdown
      setIsCountingDown(true);
      setCountdown(3);
      
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            setIsCountingDown(false);
            // Start actual recording after countdown
            startActualRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert(t('startFailed'));
    }
  };

  const startActualRecording = async () => {
    if (!sessionManager) return;

    try {
      const config: SessionConfig = {
        suraIndex: selectedSuraIdx,
        startingAyah: selectedAyaIdx,
        windowSize: 3,
        minChunkDuration: 2000,
        maxChunkDuration: 30000
      };

      await sessionManager.startSession(config, {
        onMatchFound: (match: MatchResult) => {
          console.log('� Match found:', match);
          setCurrentMatch(match);
          setShowFeedback(true);
          
          // Mark ayahs as completed
          for (let i = match.startAyah; i <= match.endAyah; i++) {
            const key = `${selectedSuraIdx}:${i}`;
            setCompleted(prev => ({ ...prev, [key]: true }));
          }
          
          // Advance to next ayah
          setTimeout(() => {
            const nextAyah = match.endAyah + 1;
            if (sura && nextAyah <= sura.ayas.length) {
              setSelectedAyaIdx(nextAyah);
            } else if (quran && selectedSuraIdx < quran.suras.length) {
              setSelectedSuraIdx(selectedSuraIdx + 1);
              setSelectedAyaIdx(1);
            }
            setShowFeedback(false);
          }, 2000);
        },
        
        onNoMatch: (transcription: string) => {
          console.log('❌ No match for:', transcription);
          setNoMatchTranscriptions(prev => [transcription, ...prev.slice(0, 4)]);
        },
        
        onStateChange: (state: SessionState) => {
          setSessionState(state);
        },
        
        onError: (error: Error) => {
          console.error('Session error:', error);
          alert(error.message);
        }
      });

      console.log('🎤 Advanced recording session started');
    } catch (error) {
      console.error('Failed to start recording session:', error);
      alert(error instanceof Error ? error.message : t('startFailed'));
    }
  };

  const stopRecording = async () => {
    // Clear countdown if it's running
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      setIsCountingDown(false);
      setCountdown(0);
    }
    
    if (sessionManager && sessionManager.isSessionActive()) {
      console.log('🔴 Stopping advanced recording session...');
      sessionManager.stopSession();
    }
  };

  const jumpToAyah = (ayahNumber: number) => {
    if (sessionManager) {
      sessionManager.jumpToAyah(ayahNumber);
      setSelectedAyaIdx(ayahNumber);
    }
  };

  const rewindToBeginning = () => {
    // Clear countdown if it's running
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      setIsCountingDown(false);
      setCountdown(0);
    }
    
    // Keep current Sura, just reset to Aya 1
    setSelectedAyaIdx(1);
    // Clear progress for current Sura only
    const currentSuraKey = `${selectedSuraIdx}:`;
    setCompleted(prev => {
      const filtered: { [key: string]: boolean } = {};
      Object.keys(prev).forEach(key => {
        if (!key.startsWith(currentSuraKey)) {
          filtered[key] = prev[key];
        }
      });
      return filtered;
    });
    setRecitationHistory([]);
    setLastCorrectAya(1);
    setCurrentRecitation('');
    setRecognizedText('');
    setAyaProgress(0);
    setShowCorrectAya(false);
    setShowFeedback(false);
    setIsProcessing(false);
    setProcessingProgress({ ayasChecked: 0, totalAyas: 0, currentlyChecking: 0, results: [] });
    
    // Clear any pending processing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    
    console.log(`🔄 Rewound to beginning of Sura ${selectedSuraIdx}`);
  };



  const checkMultiAyaRecitation = (fullRecitation: string) => {
    if (!aya || !sura) return { completedAyas: [], results: [] };
    
    console.log('🔍 Checking recitation against multiple Ayas starting from:', aya.index);
    
    // Simple but effective normalization for clean Quran text
    const normalize = (str: string) => str
      .replace(/[\u064B-\u0652]/g, '') // Remove diacritics (just in case)
      .replace(/إ|أ|آ/g, 'ا') // Normalize all alif variations to simple alif
      .replace(/ة/g, 'ه') // Ta marbuta to ha  
      .replace(/ي/g, 'ى') // Ya variations
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .toLowerCase();
    
    const normalizedRecitation = normalize(fullRecitation);
    const recitedWords = normalizedRecitation.split(/\s+/).filter(w => w.length > 0);
    
    // Get up to 10 Ayas starting from current position for realistic matching
    const currentAyaIndex = selectedAyaIdx - 1;
    const maxAyasToCheck = Math.min(10, sura.ayas.length - currentAyaIndex);
    const ayasToCheck = sura.ayas.slice(currentAyaIndex, currentAyaIndex + maxAyasToCheck);
    
    console.log(`Checking against ${ayasToCheck.length} Ayas: ${ayasToCheck.map(a => a.index).join(', ')}`);
    
    // Create concatenated text of all Ayas to match against
    let combinedAyaText = '';
    let ayaBoundaries: Array<{ayaIndex: number, startWord: number, endWord: number, text: string}> = [];
    let currentWordIndex = 0;
    
    for (const ayaToCheck of ayasToCheck) {
      const normalizedAyaText = normalize(ayaToCheck.text);
      const ayaWords = normalizedAyaText.split(/\s+/).filter(w => w.length > 0);
      
      if (combinedAyaText) combinedAyaText += ' ';
      combinedAyaText += normalizedAyaText;
      
      ayaBoundaries.push({
        ayaIndex: ayaToCheck.index,
        startWord: currentWordIndex,
        endWord: currentWordIndex + ayaWords.length - 1,
        text: ayaToCheck.text
      });
      
      currentWordIndex += ayaWords.length;
    }
    
    const expectedWords = combinedAyaText.split(/\s+/).filter(w => w.length > 0);
    
    console.log('Expected words:', expectedWords.length);
    console.log('Recited words:', recitedWords.length);
    
    // Debug: Log the actual words being compared
    console.log('🔍 Expected words:', expectedWords.slice(0, 5), '...');
    console.log('🔍 Recited words:', recitedWords.slice(0, 5), '...');
    
    // Enhanced matching with Arabic-specific logic
    let longestMatch = 0;
    for (let i = 0; i < Math.min(recitedWords.length, expectedWords.length); i++) {
      const recitedWord = recitedWords[i];
      const expectedWord = expectedWords[i];
      
      // Debug: Show each comparison
      console.log(`🔍 Comparing [${i}]: "${recitedWord}" vs "${expectedWord}"`);
      
      if (recitedWord === expectedWord) {
        longestMatch = i + 1;
        console.log(`✅ Exact match at position ${i}`);
      } else {
        // Try enhanced Arabic matching
        if (enhancedArabicMatch(recitedWord, expectedWord)) {
          longestMatch = i + 1;
          console.log(`✅ Enhanced match at position ${i}: "${recitedWord}" ≈ "${expectedWord}"`);
        } else {
          // Allow for one small mistake and continue
          if (i + 1 < expectedWords.length && i + 1 < recitedWords.length) {
            const nextRecited = recitedWords[i + 1];
            const nextExpected = expectedWords[i + 1];
            console.log(`🔍 Trying skip: "${nextRecited}" vs "${nextExpected}"`);
            
            if (nextRecited === nextExpected || enhancedArabicMatch(nextRecited, nextExpected)) {
              longestMatch = i + 2;
              i++; // Skip the mismatched word
              console.log(`✅ Skip match at position ${i}`);
              continue;
            }
          }
          console.log(`❌ No match at position ${i}, stopping`);
          break;
        }
      }
    }
    
    console.log(`Longest match: ${longestMatch}/${expectedWords.length} words`);
    
    // Update processing progress
    setProcessingProgress({
      ayasChecked: ayasToCheck.length,
      totalAyas: ayasToCheck.length,
      currentlyChecking: 0,
      results: []
    });
    
    // Determine which Ayas were completed based on the match
    let completedAyas: number[] = [];
    let results: Array<{ayaIndex: number, completed: boolean, accuracy: number}> = [];
    
    for (const boundary of ayaBoundaries) {
      const ayaStartWord = boundary.startWord;
      const ayaEndWord = boundary.endWord;
      
      // Check how much of this Aya was covered by the match
      const ayaWordsCovered = Math.max(0, Math.min(longestMatch - ayaStartWord, ayaEndWord - ayaStartWord + 1));
      const ayaTotalWords = ayaEndWord - ayaStartWord + 1;
      const accuracy = (ayaWordsCovered / ayaTotalWords) * 100;
      
      const isCompleted = accuracy >= 70; // Reasonable threshold
      
      if (isCompleted) {
        completedAyas.push(boundary.ayaIndex);
        
        // Mark as completed in state
        setCompleted(prev => ({ ...prev, [`${selectedSuraIdx}:${boundary.ayaIndex}`]: true }));
        setLastCorrectAya(boundary.ayaIndex);
      }
      
      // Add to recitation history
      setRecitationHistory(prev => {
        const existingIndex = prev.findIndex(h => h.ayaIndex === boundary.ayaIndex);
        
        // Extract only the words that correspond to this specific Aya
        const ayaSpecificWords = recitedWords.slice(
          Math.max(0, Math.min(ayaStartWord, longestMatch)),
          Math.max(0, Math.min(ayaEndWord + 1, longestMatch))
        );
        const ayaSpecificRecitation = ayaSpecificWords.join(' ');
        
        const newEntry = {
          ayaIndex: boundary.ayaIndex,
          correct: isCompleted,
          recitedText: ayaSpecificRecitation || '(لم يتم التلاوة)', // If empty, show "not recited"
          expectedText: boundary.text,
          accuracy
        };
        
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newEntry;
          return updated;
        } else {
          return [...prev, newEntry];
        }
      });
      
      results.push({
        ayaIndex: boundary.ayaIndex,
        completed: isCompleted,
        accuracy
      });
      
      console.log(`Aya ${boundary.ayaIndex}: ${ayaWordsCovered}/${ayaTotalWords} words (${accuracy.toFixed(1)}%) - ${isCompleted ? 'COMPLETED' : 'partial'}`);
    }
    
    // Update processing results for UI
    setProcessingProgress(prev => ({
      ...prev,
      results
    }));
    
    // Update progress for the current Aya
    if (results.length > 0) {
      setAyaProgress(results[0].accuracy);
    }
    
    console.log(`✅ Processing complete. Completed Ayas: ${completedAyas.join(', ')}`);
    
    return { completedAyas, results };
  };

  const enhancedArabicMatch = (word1: string, word2: string): boolean => {
    if (!word1 || !word2) return false;
    
    // Focused normalization for speech recognition vs clean Quran text
    const speechNormalize = (str: string) => str
      .replace(/[\u064B-\u0652]/g, '') // Remove diacritics
      .replace(/إ|أ|آ/g, 'ا') // All alif variations to simple alif (main issue)
      .replace(/ة/g, 'ه') // Ta marbuta to ha
      .replace(/ي/g, 'ى') // Ya variations
      .replace(/ک/g, 'ك') // Farsi kaf to Arabic kaf
      .replace(/ؤ/g, 'و') // Hamza on waw
      .replace(/ئ/g, 'ي') // Hamza on ya
      .trim()
      .toLowerCase();
    
    const norm1 = speechNormalize(word1);
    const norm2 = speechNormalize(word2);
    
    // Exact match after normalization should work for most cases now
    if (norm1 === norm2) return true;
    
    // Fallback: similarity check for edge cases
    if (norm1.length > 2 && norm2.length > 2) {
      const similarity = calculateSimilarity(norm1, norm2);
      return similarity >= 0.85; // Slightly higher threshold since text is cleaner
    }
    
    return false;
  };

  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
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
  };

  return (
    <div className="app-container">
      <Header />
      
      <main>
        <section className="review-section">
          <div className="quran-text">
            {isCountingDown ? (
              <div className="countdown-display">
                <div className="countdown-number">{countdown > 0 ? countdown : '🎤'}</div>
                <div className="countdown-text">
                  {countdown > 0 ? t('getReady') : t('startReciting')}
                </div>
              </div>
            ) : isRecording ? (
              <div className="countdown-display">
                <div className="countdown-number">🎤</div>
                <div className="countdown-text">
                  {t('recording')} - {t('speakNow')}!
                </div>
              </div>
            ) : isTranscribing ? (
              <div className="countdown-display">
                <div className="countdown-number">⏳</div>
                <div className="countdown-text">
                  {t('transcribing')}...
                </div>
              </div>
            ) : showCorrectAya ? (
              <span className="aya-correct" style={{ color: 'var(--color-success)' }}>
                ✅ {aya?.text}
              </span>
            ) : (
              <span className="aya-hidden">
                {t('reciteAya', { ayaNumber: selectedAyaIdx, suraName: sura?.name })}
              </span>
            )}
          </div>
          
          <div className="controls">
            <label>
              {t('sura')}:
              <select
                value={selectedSuraIdx}
                onChange={e => {
                  const idx = Number(e.target.value);
                  setSelectedSuraIdx(idx);
                  setSelectedAyaIdx(1);
                }}
                disabled={isRecording || isTranscribing}
              >
                {quran?.suras.map(s => (
                  <option key={s.index} value={s.index}>{s.name}</option>
                ))}
              </select>
            </label>
            
            <label>
              {t('aya')}:
              <select
                value={selectedAyaIdx}
                onChange={e => setSelectedAyaIdx(Number(e.target.value))}
                disabled={isRecording || isTranscribing}
              >
                {sura?.ayas.map(a => (
                  <option key={a.index} value={a.index}>{a.index}</option>
                ))}
              </select>
            </label>
          </div>
          
          <div className="voice-controls">
            <div className="voice-button-group">
              <button 
                className="primary-button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing || isCountingDown || isTranscribing}
              >
                {isCountingDown ? (
                  <>🕒 {countdown > 0 ? `${countdown}...` : t('startNow')}</>
                ) : isRecording ? (
                  <>🔴 {t('stopRecording')}</>
                ) : isTranscribing ? (
                  <>⏳ {t('transcribing')}...</>
                ) : isProcessing ? (
                  <>⏳ {t('processing')}... {processingProgress.ayasChecked}/{processingProgress.totalAyas}</>
                ) : (
                  <>🎤 {t('startRecording')}</>
                )}
              </button>
              
              <button 
                className="secondary-button"
                onClick={rewindToBeginning} 
                disabled={isRecording || isTranscribing}
                aria-label={t('rewind')}
                title={t('rewind')}
              >
                ⏪
              </button>
            </div>
            
            {isProcessing && processingProgress.results.length > 0 && (
              <div className="processing-status">
                <strong>📊 {t('processingStatus')}:</strong>
                <div className="processing-results">
                  {processingProgress.results.map((result, index) => (
                    <div key={index} className={`processing-item ${result.completed ? 'completed' : 'in-progress'}`}>
                      {result.completed ? '✅' : '⏳'} {t('aya')} {result.ayaIndex}: {result.accuracy.toFixed(1)}%
                    </div>
                  ))}
                </div>
                {processingProgress.currentlyChecking > 0 && (
                  <div className="currently-checking">
                    🔍 {t('currentlyChecking')}: {t('aya')} {processingProgress.currentlyChecking}
                  </div>
                )}
              </div>
            )}

            {recognizedText && (
              <div className="recognized-text">
                <strong>{t('currentRecitation')}:</strong>
                <div className="recitation-text">
                  {recognizedText}
                </div>
                {isRecording && ayaProgress > 0 && (
                  <div className="progress-container">
                    <span className="progress-label">
                      {t('ayaProgress')}: {Math.round(ayaProgress)}%
                    </span>
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar-fill"
                        style={{
                          backgroundColor: ayaProgress >= 90 ? 'var(--color-success)' : 
                                         ayaProgress >= 50 ? 'var(--color-warning)' : 'var(--color-error)',
                          width: `${Math.min(ayaProgress, 100)}%`
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {showFeedback && recitationHistory.length > 0 && (
              <div className="feedback-modal">
                <div className="feedback-header">
                  <h3 className="feedback-title">{t('recitationAnalysis')}</h3>
                  <button 
                    className="close-button"
                    onClick={() => setShowFeedback(false)}
                    aria-label={t('close')}
                  >
                    ✕
                  </button>
                </div>
                <div className="feedback-content">
                  {recitationHistory.map((entry, index) => (
                    <div key={index} className={`feedback-item ${entry.correct ? 'correct' : 'incorrect'}`}>
                      <div className="feedback-item-header">
                        {entry.correct ? '✅' : '❌'} {t('aya')} {entry.ayaIndex} - {t('accuracy', { percentage: entry.accuracy.toFixed(1) })}
                      </div>
                      {!entry.correct && (
                        <div className="feedback-details">
                          <div><strong>{t('expected')}:</strong> {entry.expectedText}</div>
                          <div><strong>{t('recited')}:</strong> {entry.recitedText}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="feedback-summary">
                  <strong>{t('lastCorrectAya', { ayaNumber: lastCorrectAya })}</strong>
                </div>
              </div>
            )}
          </div>
        </section>
        
        <section className="progress-tracker">
          <h2>{t('progressTracking')}</h2>
          
          <div className="progress-item">
            <div className="progress-info">
              <span>{t('currentSura')}: {sura ? sura.name : ''}</span>
              <span className="progress-percentage">{suraProgress.toFixed(1)}%</span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill"
                style={{ 
                  backgroundColor: 'var(--color-success)',
                  width: `${suraProgress}%` 
                }}
              />
            </div>
          </div>
          
          <div className="progress-item">
            <div className="progress-info">
              <span>{t('overallProgress')}</span>
              <span className="progress-percentage">{overallProgress.toFixed(1)}%</span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill"
                style={{ 
                  backgroundColor: 'var(--color-info)',
                  width: `${overallProgress}%` 
                }}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;


