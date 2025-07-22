import React, { useEffect, useState, useRef } from 'react';
import './App.css';
import { loadQuran } from './quranParser';
import type { QuranData, Sura, Aya } from './quranParser';

function compareWords(expected: string, actual: string): { word: string; correct: boolean }[] {
  // Normalize Arabic text (remove diacritics, trim, etc.)
  const normalize = (str: string) => str.replace(/[\u064B-\u0652]/g, '').replace(/[\u200C\u200F]/g, '').trim();
  const expectedWords = normalize(expected).split(/\s+/);
  const actualWords = normalize(actual).split(/\s+/);
  return expectedWords.map((word, i) => ({
    word,
    correct: actualWords[i] === word,
  }));
}

function App() {
  const [quran, setQuran] = useState<QuranData | null>(null);
  const [selectedSuraIdx, setSelectedSuraIdx] = useState<number>(1);
  const [selectedAyaIdx, setSelectedAyaIdx] = useState<number>(1);
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const recognitionRef = useRef<any>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [completed, setCompleted] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadQuran().then(setQuran);
  }, []);

  useEffect(() => {
    setRecognizedText('');
    setShowFeedback(false);
  }, [selectedSuraIdx, selectedAyaIdx]);

  const sura: Sura | undefined = quran?.suras.find(s => s.index === selectedSuraIdx);
  const aya: Aya | undefined = sura?.ayas.find(a => a.index === selectedAyaIdx);

  // Voice recognition logic
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('متصفحك لا يدعم التعرف على الصوت. يرجى استخدام متصفح حديث.');
      return;
    }
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-SA';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setRecognizedText(transcript);
      setIsListening(false);
      setShowFeedback(true);
    };
    recognition.onerror = () => {
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  let comparison: { word: string; correct: boolean }[] = [];
  let allCorrect = false;
  if (aya && recognizedText) {
    comparison = compareWords(aya.text, recognizedText);
    allCorrect = comparison.every(w => w.correct);
  }

  const handleNextAya = () => {
    if (!allCorrect) return;
    // Mark this Aya as completed
    setCompleted(prev => ({ ...prev, [`${selectedSuraIdx}:${selectedAyaIdx}`]: true }));
    if (sura && selectedAyaIdx < sura.ayas.length) {
      setSelectedAyaIdx(selectedAyaIdx + 1);
    } else if (quran && selectedSuraIdx < quran.suras.length) {
      setSelectedSuraIdx(selectedSuraIdx + 1);
      setSelectedAyaIdx(1);
    }
    setRecognizedText('');
    setShowFeedback(false);
  };

  // Progress calculation
  const totalAyas = quran ? quran.suras.reduce((sum, s) => sum + s.ayas.length, 0) : 0;
  const completedAyas = Object.keys(completed).length;
  const suraCompletedAyas = sura ? sura.ayas.filter(a => completed[`${sura.index}:${a.index}`]).length : 0;
  const suraProgress = sura ? Math.round((suraCompletedAyas / sura.ayas.length) * 100) : 0;
  const overallProgress = totalAyas ? Math.round((completedAyas / totalAyas) * 100) : 0;

  return (
    <div class="app-container">
      <header>
        <h1>حافظ - Hafez Quran Memorization</h1>
      </header>
      <main>
        <section class="review-section">
          <div class="quran-text">
            <span class="aya-highlight">{aya ? aya.text : '[آية هنا]'}</span>
          </div>
          <div class="controls">
            <label>
              السورة:
              <select
                value={selectedSuraIdx}
                onChange={e => {
                  const idx = Number(e.target.value);
                  setSelectedSuraIdx(idx);
                  setSelectedAyaIdx(1);
                }}
              >
                {quran?.suras.map(s => (
                  <option value={s.index}>{s.name}</option>
                ))}
              </select>
            </label>
            <label>
              الآية:
              <select
                value={selectedAyaIdx}
                onChange={e => setSelectedAyaIdx(Number(e.target.value))}
              >
                {sura?.ayas.map(a => (
                  <option value={a.index}>{a.index}</option>
                ))}
              </select>
            </label>
          </div>
          <div class="voice-controls">
            <button onClick={isListening ? stopListening : startListening} disabled={isListening}>
              {isListening ? 'يتم الاستماع...' : '🎤 ابدأ التلاوة'}
            </button>
            {recognizedText && (
              <div class="recognized-text">
                <strong>النص المسموع:</strong>
                <span>
                  {comparison.map((w, i) => (
                    <span key={i} style={{ color: w.correct ? 'inherit' : 'red', fontWeight: w.correct ? 'normal' : 'bold' }}>{w.word} </span>
                  ))}
                </span>
              </div>
            )}
            {showFeedback && !allCorrect && (
              <div class="feedback-alert" style={{ color: 'red', marginTop: '1em' }}>
                هناك أخطاء في التلاوة. يرجى المحاولة مرة أخرى وتصحيح الكلمات الحمراء.
              </div>
            )}
            {showFeedback && allCorrect && (
              <div class="feedback-alert" style={{ color: 'green', marginTop: '1em' }}>
                أحسنت! يمكنك الانتقال إلى الآية التالية.
              </div>
            )}
            <button onClick={handleNextAya} disabled={!allCorrect} style={{ marginTop: '1em' }}>
              التالي
            </button>
          </div>
        </section>
        <section class="progress-tracker">
          <h2>متابعة الحفظ</h2>
          <div>
            السورة الحالية: {sura ? sura.name : ''} - {suraProgress}%
            <div style={{ background: '#eee', borderRadius: '8px', height: '16px', marginTop: '8px', marginBottom: '8px', width: '200px' }}>
              <div style={{ background: '#4caf50', width: `${suraProgress}%`, height: '100%', borderRadius: '8px' }} />
            </div>
          </div>
          <div>
            التقدم الكلي: {overallProgress}%
            <div style={{ background: '#eee', borderRadius: '8px', height: '16px', marginTop: '8px', marginBottom: '8px', width: '200px' }}>
              <div style={{ background: '#2196f3', width: `${overallProgress}%`, height: '100%', borderRadius: '8px' }} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
