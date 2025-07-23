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
  
  // Enhanced state for better feedback
  const [completed, setCompleted] = useState<{ [key: string]: boolean }>({});
  const [currentMatch, setCurrentMatch] = useState<MatchResult | null>(null);
  const [feedbackHistory, setFeedbackHistory] = useState<Array<{
    transcription: string;
    isMatch: boolean;
    matchDetails?: MatchResult;
    timestamp: number;
  }>>([]);
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
          console.log('🎯 Match found:', match);
          setCurrentMatch(match);
          setShowFeedback(true);
          
          // Add to feedback history as successful match
          setFeedbackHistory(prev => [{
            transcription: sessionState.recentTranscriptions[0] || 'Unknown',
            isMatch: true,
            matchDetails: match,
            timestamp: Date.now()
          }, ...prev.slice(0, 9)]); // Keep last 10 entries
          
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
          
          // Add to feedback history as failed match
          setFeedbackHistory(prev => [{
            transcription,
            isMatch: false,
            timestamp: Date.now()
          }, ...prev.slice(0, 9)]); // Keep last 10 entries
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
    setShowFeedback(false);
    
    console.log(`🔄 Rewound to beginning of Sura ${selectedSuraIdx}`);
  };

  if (!quran) {
    return (
      <div className="app loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      
      <main className="main-content">
        {/* Sura/Aya Selector */}
        <section className="selector-section">
          <div className="selector-container">
            <div className="selector-header">
              <h3>{t('selectStartingPosition')}</h3>
              <p className="selector-description">{t('selectStartingPositionDesc')}</p>
            </div>
            
            <div className="selector-group">
              <label>{t('selectSura')}:</label>
              <select 
                value={selectedSuraIdx} 
                onChange={(e) => {
                  setSelectedSuraIdx(Number(e.target.value));
                  setSelectedAyaIdx(1); // Reset to first ayah when changing sura
                }}
                disabled={sessionState.isActive}
              >
                {quran.suras.map(sura => (
                  <option key={sura.index} value={sura.index}>
                    {sura.index}. {sura.name} ({sura.ayas.length} {t('ayahs')})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="selector-group">
              <label>{t('selectStartingAya')}:</label>
              <select 
                value={selectedAyaIdx} 
                onChange={(e) => setSelectedAyaIdx(Number(e.target.value))}
                disabled={sessionState.isActive}
              >
                {sura?.ayas.map(aya => (
                  <option key={aya.index} value={aya.index}>
                    {t('aya')} {aya.index}
                  </option>
                )) || []}
              </select>
            </div>
            
            {sessionState.isActive && (
              <div className="current-session-info">
                <p className="session-status">
                  📍 {t('sessionActive')}: {t('sura')} {selectedSuraIdx}, {t('startingFrom')} {t('aya')} {selectedAyaIdx}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Current Aya Display */}
        <section className="aya-section">
          <div className="aya-container">
            <div className="aya-header">
              <h2>{t('currentAya')}: {aya?.index} / {sura?.ayas.length}</h2>
              <div className="aya-actions">
                <button onClick={rewindToBeginning} className="action-btn secondary">
                  {t('rewindToBeginning')}
                </button>
                <button 
                  onClick={() => jumpToAyah(selectedAyaIdx + 1)} 
                  className="action-btn secondary"
                  disabled={!sura || selectedAyaIdx >= sura.ayas.length}
                >
                  {t('skip')}
                </button>
              </div>
            </div>
            
            <div className="aya-text-container">
              <div className="aya-text arabic">
                {aya?.text}
              </div>
            </div>
          </div>
        </section>

        {/* Recording Controls */}
        <section className="recording-section">
          <div className="recording-controls">
            {isCountingDown ? (
              <div className="countdown-container">
                <div className="countdown-circle">
                  <span className="countdown-number">{countdown}</span>
                </div>
                <p>{t('getReady')}</p>
              </div>
            ) : (
              <div className="control-buttons">
                <button
                  className={`record-btn ${sessionState.isRecording ? 'recording' : ''}`}
                  onClick={sessionState.isRecording ? stopRecording : startRecording}
                  disabled={sessionState.isProcessing}
                >
                  <div className="btn-content">
                    <div className="record-icon">
                      {sessionState.isRecording ? '⏹️' : '🎤'}
                    </div>
                    <span>
                      {sessionState.isRecording ? t('stopRecording') : t('startRecording')}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Session State Display */}
          {sessionState.isActive && (
            <div className="session-status">
              <div className="status-item">
                <span className="status-label">{t('recording')}:</span>
                <span className={`status-value ${sessionState.isRecording ? 'active' : ''}`}>
                  {sessionState.isRecording ? t('active') : t('inactive')}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">{t('processing')}:</span>
                <span className={`status-value ${sessionState.isProcessing ? 'active' : ''}`}>
                  {sessionState.isProcessing ? t('processing') : t('ready')}
                </span>
              </div>
              {sessionState.isRecording && (
                <div className="status-item">
                  <span className="status-label">{t('volume')}:</span>
                  <div className="volume-bar">
                    <div 
                      className="volume-fill" 
                      style={{ width: `${Math.min(sessionState.volumeLevel + 60, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Match Results */}
        {showFeedback && currentMatch && (
          <section className="feedback-section">
            <div className="feedback-container">
              <div className="feedback-header">
                <h3>{t('matchFound')} ✅</h3>
              </div>
              <div className="match-details">
                <p><strong>{t('matched')}:</strong> {t('ayahs')} {currentMatch.startAyah}-{currentMatch.endAyah}</p>
                <p><strong>{t('confidence')}:</strong> {(currentMatch.confidence * 100).toFixed(1)}%</p>
                <p><strong>{t('accuracy')}:</strong> {(currentMatch.accuracy * 100).toFixed(1)}%</p>
              </div>
            </div>
          </section>
        )}

        {/* Unified Feedback History */}
        {feedbackHistory.length > 0 && (
          <section className="feedback-history-section">
            <h3>{t('recitationFeedback')}</h3>
            <div className="feedback-history-list">
              {feedbackHistory.map((feedback) => (
                <div key={feedback.timestamp} className={`feedback-item ${feedback.isMatch ? 'correct' : 'incorrect'}`}>
                  <div className="feedback-content">
                    <div className="feedback-status">
                      {feedback.isMatch ? (
                        <span className="status-icon correct">✅</span>
                      ) : (
                        <span className="status-icon incorrect">❌</span>
                      )}
                    </div>
                    <div className="feedback-details">
                      <div className="transcription-text">
                        <strong>{t('recited')}:</strong> "{feedback.transcription}"
                      </div>
                      {feedback.isMatch && feedback.matchDetails ? (
                        <div className="match-info">
                          <span className="match-result">
                            {t('matched')} {t('ayahs')} {feedback.matchDetails.startAyah}-{feedback.matchDetails.endAyah}
                          </span>
                          <span className="accuracy-score">
                            {t('accuracy')}: {(feedback.matchDetails.accuracy * 100).toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <div className="no-match-info">
                          <span className="no-match-result">
                            {t('noMatchFound')} - {t('tryAgainOrSkip')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Transcriptions */}
        {sessionState.recentTranscriptions.length > 0 && (
          <section className="transcriptions-section">
            <h3>{t('recentTranscriptions')}</h3>
            <div className="transcriptions-list">
              {sessionState.recentTranscriptions.map((transcription, index) => (
                <div key={index} className="transcription-item">
                  <span className="transcription-text">{transcription}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Progress Tracking */}
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
