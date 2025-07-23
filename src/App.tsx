import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { loadQuran } from './quranParser';
import type { QuranData } from './quranParser';
import { Header } from './components/Header';
import { useTheme } from './hooks/useTheme';

function App() {
  const { t, i18n } = useTranslation();
  useTheme(); // Initialize theme hook
  
  const [quran, setQuran] = useState<QuranData | null>(null);
  const [selectedSuraIdx, setSelectedSuraIdx] = useState<number>(1);
  const [selectedAyaIdx, setSelectedAyaIdx] = useState<number>(1);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [completed, setCompleted] = useState<{ [key: string]: boolean }>({});
  const [currentRecitation, setCurrentRecitation] = useState<string>('');
  const [ayaProgress, setAyaProgress] = useState<number>(0);
  const [showCorrectAya, setShowCorrectAya] = useState<boolean>(false);
  const [recitationHistory, setRecitationHistory] = useState<Array<{ayaIndex: number, correct: boolean, recitedText: string, expectedText: string, accuracy: number}>>([]);
  const [lastCorrectAya, setLastCorrectAya] = useState<number>(1);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [pendingRecitation, setPendingRecitation] = useState<string>('');
  const [processingProgress, setProcessingProgress] = useState<{
    ayasChecked: number;
    totalAyas: number;
    currentlyChecking: number;
    results: Array<{ayaIndex: number, completed: boolean, accuracy: number}>;
  }>({ ayasChecked: 0, totalAyas: 0, currentlyChecking: 0, results: [] });
  
  const recognitionRef = useRef<any>(null);
  const processingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    loadQuran().then(data => {
      setQuran(data);
      console.log('✅ Quran loaded successfully:', data.suras.length, 'suras');
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
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, []);

  const sura = quran?.suras.find(s => s.index === selectedSuraIdx);
  const aya = sura?.ayas.find(a => a.index === selectedAyaIdx);

  const suraProgress = sura ? 
    (sura.ayas.filter(a => completed[`${selectedSuraIdx}:${a.index}`]).length / sura.ayas.length) * 100 : 0;

  const overallProgress = quran ? 
    (Object.keys(completed).length / quran.suras.reduce((total, s) => total + s.ayas.length, 0)) * 100 : 0;

  const startListening = () => {
    if (!navigator.onLine) {
      alert(t('internetRequired'));
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert(t('microphoneNotSupported'));
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'ar-SA';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      console.log('🎤 Voice recognition started');
      setIsListening(true);
      setIsProcessing(false);
      // Clear any pending processing
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    };

    recognition.onresult = (event: any) => {
      console.log('Voice recognition result:', event);
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        const newRecitation = currentRecitation + ' ' + finalTranscript;
        setCurrentRecitation(newRecitation);
        
        // If we're no longer listening but still processing, store for later processing
        if (!isListening && isProcessing) {
          setPendingRecitation(prev => prev + ' ' + finalTranscript);
        } else {
          const result = checkCurrentAyaSimple(newRecitation);
          if (result?.shouldAdvance) {
            handleAyaAdvancement(result.nextAyaIdx);
          }
        }
      }
      
      const displayText = currentRecitation + ' ' + interimTranscript;
      setRecognizedText(displayText);
      
      // Update pending recitation if processing after stop
      if (!isListening && isProcessing && interimTranscript) {
        setPendingRecitation(displayText);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Voice recognition error:', event.error);
      let errorMessage = t('startFailed');
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = t('microphonePermission');
          break;
        case 'no-speech':
          // Don't show error for no-speech, it's normal
          return;
        case 'network':
          errorMessage = t('networkError');
          break;
        case 'service-not-allowed':
          errorMessage = t('serviceUnavailable');
          break;
      }
      
      alert(errorMessage);
      setIsListening(false);
      setIsProcessing(false);
    };

    recognition.onend = () => {
      console.log('Voice recognition ended');
      
      if (isListening) {
        // Restart recognition if we're still supposed to be listening
        setTimeout(() => {
          if (recognitionRef.current && isListening) {
            try {
              recognitionRef.current.start();
            } catch (error) {
              console.error('Failed to restart recognition:', error);
              setIsListening(false);
            }
          }
        }, 100);
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      alert(t('startFailed'));
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      setIsListening(false);
      setIsProcessing(true);
      
      // Process immediately instead of waiting
      console.log('🔴 Stopping recognition, processing immediately...');
      processRecitationImmediate();
    }
  };

  const processRecitationImmediate = () => {
    if (!currentRecitation.trim()) {
      setIsProcessing(false);
      return;
    }

    console.log('🔄 Processing recitation:', currentRecitation);
    
    // Use a simple timeout to simulate processing and ensure it always completes
    setTimeout(() => {
      try {
        const result = checkCurrentAyaSimple(currentRecitation);
        if (result?.shouldAdvance) {
          handleAyaAdvancement(result.nextAyaIdx);
        }
      } catch (error) {
        console.error('Processing error:', error);
      } finally {
        // Always complete processing
        setIsProcessing(false);
        if (recitationHistory.length > 0) {
          setShowFeedback(true);
        }
      }
    }, 300); // Very short timeout to ensure it completes quickly
  };

  const handleAyaAdvancement = (nextAyaIdx: number) => {
    setShowCorrectAya(true);
    setTimeout(() => {
      if (sura && nextAyaIdx <= sura.ayas.length) {
        setSelectedAyaIdx(nextAyaIdx);
        console.log('Moving to Aya:', nextAyaIdx);
      } else if (quran && selectedSuraIdx < quran.suras.length) {
        setSelectedSuraIdx(selectedSuraIdx + 1);
        setSelectedAyaIdx(1);
      } else {
        setIsListening(false);
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        alert(t('congratulations'));
      }
      setCurrentRecitation('');
      setRecognizedText('');
      setAyaProgress(0);
      setShowCorrectAya(false);
    }, 800); // Faster response
  };

  const rewindToBeginning = () => {
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
    setPendingRecitation('');
    setProcessingProgress({ ayasChecked: 0, totalAyas: 0, currentlyChecking: 0, results: [] });
    
    // Clear any pending processing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    
    console.log(`🔄 Rewound to beginning of Sura ${selectedSuraIdx}`);
  };

  const checkCurrentAyaSimple = (fullRecitation: string) => {
    if (!aya || !sura) return { shouldAdvance: false, nextAyaIdx: selectedAyaIdx };
    
    console.log('🔍 Quick check for Aya:', aya.index);
    
    // Very simple normalization for speed
    const normalize = (str: string) => str
      .replace(/[\u064B-\u0652]/g, '') // Remove diacritics
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .toLowerCase();
    
    const normalizedRecitation = normalize(fullRecitation);
    const normalizedCurrentAya = normalize(aya.text);
    
    // Update processing progress UI
    setProcessingProgress({
      ayasChecked: 1,
      totalAyas: 3,
      currentlyChecking: aya.index,
      results: []
    });
    
    // Simple word matching for current Aya only
    const recitedWords = normalizedRecitation.split(/\s+/).filter(w => w.length > 0);
    const ayaWords = normalizedCurrentAya.split(/\s+/).filter(w => w.length > 0);
    
    // Count matching words
    let matchedWords = 0;
    const minLength = Math.min(recitedWords.length, ayaWords.length);
    
    for (let i = 0; i < minLength; i++) {
      if (recitedWords[i] === ayaWords[i]) {
        matchedWords++;
      } else {
        break; // Stop at first mismatch
      }
    }
    
    const accuracy = ayaWords.length > 0 ? (matchedWords / ayaWords.length) * 100 : 0;
    const isCompleted = accuracy >= 75; // Lower threshold for easier completion
    
    console.log(`Aya ${aya.index}: ${matchedWords}/${ayaWords.length} words (${accuracy.toFixed(1)}%)`);
    
    // Update progress
    setAyaProgress(accuracy);
    
    // Update processing results for UI
    setProcessingProgress(prev => ({
      ...prev,
      ayasChecked: 1,
      results: [{ayaIndex: aya.index, completed: isCompleted, accuracy}]
    }));
    
    if (isCompleted) {
      // Mark as completed
      setCompleted(prev => ({ ...prev, [`${selectedSuraIdx}:${aya.index}`]: true }));
      setRecitationHistory(prev => {
        const existingIndex = prev.findIndex(h => h.ayaIndex === aya.index);
        const newEntry = {
          ayaIndex: aya.index,
          correct: true,
          recitedText: normalizedRecitation,
          expectedText: aya.text,
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
      setLastCorrectAya(aya.index);
      
      const nextAya = aya.index + 1;
      console.log(`✅ Completed Aya ${aya.index}! Moving to ${nextAya}`);
      return { shouldAdvance: true, nextAyaIdx: nextAya };
    }
    
    return { shouldAdvance: false, nextAyaIdx: selectedAyaIdx };
  };

  return (
    <div className="app-container">
      <Header />
      
      <main>
        <section className="review-section">
          <div className="quran-text">
            {showCorrectAya ? (
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
                disabled={isListening}
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
                disabled={isListening}
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
                onClick={isListening ? stopListening : startListening}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>⏳ {t('processing')}... {processingProgress.ayasChecked}/{processingProgress.totalAyas}</>
                ) : isListening ? (
                  <>🔴 {t('stopRecitation')}</>
                ) : (
                  <>🎤 {t('startRecitation')}</>
                )}
              </button>
              
              <button 
                className="secondary-button"
                onClick={rewindToBeginning} 
                disabled={isListening}
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
                {isListening && ayaProgress > 0 && (
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

