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
          checkCurrentAya(newRecitation);
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
      
      // If we were processing buffered input, continue processing
      if (isProcessing && pendingRecitation) {
        console.log('Processing buffered recitation:', pendingRecitation);
        checkCurrentAya(pendingRecitation);
        setPendingRecitation('');
        
        // Set a timeout to finish processing
        processingTimeoutRef.current = setTimeout(() => {
          setIsProcessing(false);
          if (recitationHistory.length > 0) {
            setShowFeedback(true);
            setSelectedAyaIdx(lastCorrectAya);
          }
        }, 2000); // Give 2 seconds for final processing
      } else if (isListening) {
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
      setIsProcessing(true); // Set processing state to handle buffered input
      
      // Don't immediately stop - let it process any buffered audio
      setTimeout(() => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      }, 500); // Give half a second for final audio processing
      
      console.log('🔴 Stopping recognition, entering processing mode...');
    }
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
    
    // Clear any pending processing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    
    console.log(`🔄 Rewound to beginning of Sura ${selectedSuraIdx}`);
  };

  const checkCurrentAya = (fullRecitation: string) => {
    if (!aya || !sura) return;
    
    // Enhanced normalize function for Arabic text
    const normalize = (str: string) => str
      .replace(/[\u064B-\u0652]/g, '') // Remove diacritics
      .replace(/[\u200C\u200F]/g, '') // Remove zero-width characters
      .replace(/أ|إ|آ/g, 'ا') // Normalize alif variations
      .replace(/ة/g, 'ه') // Normalize ta marbuta to ha
      .replace(/ي/g, 'ى') // Normalize ya variations
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim()
      .toLowerCase();
    
    const normalizedRecitation = normalize(fullRecitation);
    
    console.log('Checking from Aya:', aya.index, 'in Sura:', sura.name);
    console.log('Full Recitation:', normalizedRecitation);
    
    // Get the current Aya and all remaining Ayas in the Sura for comprehensive checking
    const currentAyaIndex = selectedAyaIdx - 1; // Convert to 0-based
    const ayasToCheck = sura.ayas.slice(currentAyaIndex);
    
    // Build a combined text of all remaining Ayas to match against
    let combinedExpected = '';
    let ayaCompletions: Array<{ayaIndex: number, completed: boolean, matchedWords: number, totalWords: number, startPosition: number}> = [];
    
    // First pass: build combined text and establish positions
    for (let i = 0; i < ayasToCheck.length; i++) {
      const ayaText = normalize(ayasToCheck[i].text);
      const startPosition = combinedExpected.length;
      
      if (i > 0) combinedExpected += ' ';
      combinedExpected += ayaText;
      
      const ayaWords = ayaText.split(/\s+/);
      ayaCompletions.push({
        ayaIndex: ayasToCheck[i].index,
        completed: false,
        matchedWords: 0,
        totalWords: ayaWords.length,
        startPosition: startPosition
      });
      
      console.log(`Expected Aya ${ayasToCheck[i].index}:`, ayaText);
    }
    
    const recitedWords = normalizedRecitation.split(/\s+/);
    const combinedWords = combinedExpected.split(/\s+/);
    
    // Enhanced matching: progressive alignment from current position
    let longestMatch = 0;
    
    // Find the longest consecutive match from the beginning of the remaining text
    for (let i = 0; i < Math.min(recitedWords.length, combinedWords.length); i++) {
      if (recitedWords[i] === combinedWords[i]) {
        longestMatch = i + 1;
      } else {
        // Try to find if this word appears later (allowing for small gaps)
        let found = false;
        for (let j = i + 1; j < Math.min(i + 3, combinedWords.length); j++) {
          if (recitedWords[i] === combinedWords[j]) {
            longestMatch = j + 1;
            found = true;
            break;
          }
        }
        if (!found) {
          break;
        }
      }
    }
    
    console.log(`Longest consecutive match: ${longestMatch}/${combinedWords.length} words`);
    
    // Now assign completion status to individual Ayas based on the match
    let wordCounter = 0;
    for (let i = 0; i < ayaCompletions.length; i++) {
      const completion = ayaCompletions[i];
      const wordsInThisAya = completion.totalWords;
      
      // Calculate how many words of this Aya are covered by the match
      const wordsMatchedInThisAya = Math.max(0, Math.min(wordsInThisAya, longestMatch - wordCounter));
      completion.matchedWords = wordsMatchedInThisAya;
      
      const completionPercentage = (wordsMatchedInThisAya / wordsInThisAya) * 100;
      completion.completed = completionPercentage >= 85; // Slightly lower threshold for better detection
      
      console.log(`Aya ${completion.ayaIndex}: ${wordsMatchedInThisAya}/${wordsInThisAya} words (${completionPercentage.toFixed(1)}%) - ${completion.completed ? 'COMPLETED' : 'in progress'}`);
      
      wordCounter += wordsInThisAya;
      
      // Stop checking if we haven't matched enough of this Aya and it's not the current one
      if (completion.ayaIndex > selectedAyaIdx && completionPercentage < 50) {
        break;
      }
    }

    // Process completions and advance if needed
    let nextAyaToAdvanceTo = selectedAyaIdx;
    let foundCompletedAya = false;
    let highestCompletedAya = selectedAyaIdx - 1;

    // First, mark all completed Ayas and find the highest completed one
    for (const completion of ayaCompletions) {
      if (completion.completed) {
        setCompleted(prev => ({ ...prev, [`${selectedSuraIdx}:${completion.ayaIndex}`]: true }));
        setRecitationHistory(prev => {
          const existingIndex = prev.findIndex(h => h.ayaIndex === completion.ayaIndex);
          const newEntry = {
            ayaIndex: completion.ayaIndex,
            correct: true,
            recitedText: normalizedRecitation,
            expectedText: sura.ayas[completion.ayaIndex - 1].text,
            accuracy: (completion.matchedWords / completion.totalWords) * 100
          };
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = newEntry;
            return updated;
          } else {
            return [...prev, newEntry];
          }
        });
        
        highestCompletedAya = Math.max(highestCompletedAya, completion.ayaIndex);
        foundCompletedAya = true;
        setLastCorrectAya(completion.ayaIndex);
        console.log(`✅ Completed Aya ${completion.ayaIndex}!`);
      } else {
        // Update progress for partially completed Ayas
        const accuracy = (completion.matchedWords / completion.totalWords) * 100;
        if (accuracy > 0) {
          setRecitationHistory(prev => {
            const existingIndex = prev.findIndex(h => h.ayaIndex === completion.ayaIndex);
            const newEntry = {
              ayaIndex: completion.ayaIndex,
              correct: false,
              recitedText: normalizedRecitation,
              expectedText: sura.ayas[completion.ayaIndex - 1].text,
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
        }
      }
    }

    // If we completed Ayas, advance to the next uncompleted one
    if (foundCompletedAya && highestCompletedAya >= selectedAyaIdx) {
      nextAyaToAdvanceTo = highestCompletedAya + 1;
      console.log(`🎯 Advancing from Aya ${selectedAyaIdx} to Aya ${nextAyaToAdvanceTo}`);
    }

    const currentAyaCompletion = ayaCompletions.find(c => c.ayaIndex === selectedAyaIdx);
    if (currentAyaCompletion) {
      const progressPercentage = (currentAyaCompletion.matchedWords / currentAyaCompletion.totalWords) * 100;
      setAyaProgress(progressPercentage);
    }

    if (foundCompletedAya) {
      setShowCorrectAya(true);
      setTimeout(() => {
        if (nextAyaToAdvanceTo <= sura.ayas.length) {
          setSelectedAyaIdx(nextAyaToAdvanceTo);
          console.log('Moving to Aya:', nextAyaToAdvanceTo);
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
      }, 1500);
    }
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
                  <>⏳ {t('processing')}</>
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

