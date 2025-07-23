import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  ar: {
    translation: {
      // App Header
      appTitle: "حافظ",
      
      // Navigation & Controls
      startRecitation: "ابدأ التلاوة",
      stopRecitation: "جاري الاستماع... اضغط لإيقاف",
      startRecording: "ابدأ التسجيل",
      stopRecording: "أوقف التسجيل",
      recording: "جاري التسجيل",
      transcribing: "جاري التحويل",
      speakNow: "تحدث الآن",
      transcriptionFailed: "فشل في تحويل الصوت إلى نص. يرجى المحاولة مرة أخرى.",
      processing: "جاري المعالجة...",
      startNow: "ابدأ الآن!",
      rewind: "البداية",
      sura: "السورة",
      aya: "الآية",
      
      // Progress & Status
      progressTracking: "متابعة الحفظ",
      currentSura: "السورة الحالية",
      overallProgress: "التقدم الكلي",
      currentRecitation: "التلاوة الجارية",
      ayaProgress: "تقدم الآية الحالية",
      processingStatus: "حالة المعالجة",
      currentlyChecking: "قيد الفحص",
      
      // Instructions & Prompts
      reciteAya: "اتل الآية رقم {{ayaNumber}} من سورة {{suraName}}",
      ayaCompleted: "{{ayaText}}",
      getReady: "استعد للتلاوة...",
      startReciting: "ابدأ التلاوة الآن",
      
      // Feedback & Analysis
      recitationAnalysis: "تحليل التلاوة",
      lastCorrectAya: "آخر آية صحيحة: {{ayaNumber}}",
      accuracy: "دقة: {{percentage}}%",
      expected: "المتوقع",
      recited: "المتلو",
      
      // Voice Recognition Messages
      microphoneNotSupported: "متصفحك لا يدعم التعرف على الصوت. يرجى استخدام متصفح حديث مثل Chrome.",
      internetRequired: "التعرف على الصوت يتطلب اتصال بالإنترنت. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.",
      microphonePermission: "يرجى السماح بالوصول إلى الميكروفون في إعدادات المتصفح.",
      networkError: "خطأ في الشبكة. التعرف على الصوت يتطلب اتصال إنترنت مستقر. يرجى التحقق من اتصالك والمحاولة مرة أخرى.",
      serviceUnavailable: "خدمة التعرف على الصوت غير متاحة. يرجى المحاولة لاحقاً.",
      startFailed: "فشل في بدء التعرف على الصوت. يرجى التأكد من وجود اتصال بالإنترنت والمحاولة مرة أخرى.",
      preparingMicrophone: "تحضير الميكروفون",
      listening: "نشط",
      congratulations: "مبروك! لقد أتممت حفظ القرآن الكريم! 🎉",
      
      // UI Controls
      close: "إغلاق",
      language: "اللغة",
      theme: "المظهر",
      lightTheme: "فاتح",
      darkTheme: "داكن",
      
      // Accessibility
      toggleLanguage: "تبديل اللغة",
      toggleTheme: "تبديل المظهر",
      progressBar: "شريط التقدم",
      menuButton: "قائمة الخيارات"
    }
  },
  en: {
    translation: {
      // App Header
      appTitle: "Hafez",
      
      // Navigation & Controls
      startRecitation: "Start Recitation",
      stopRecitation: "Listening... Click to Stop",
      startRecording: "Start Recording",
      stopRecording: "Stop Recording",
      recording: "Recording",
      transcribing: "Transcribing",
      speakNow: "Speak Now",
      transcriptionFailed: "Transcription failed. Please try again.",
      processing: "Processing...",
      startNow: "Start Now!",
      rewind: "Beginning",
      sura: "Sura",
      aya: "Aya",
      
      // Progress & Status
      progressTracking: "Memorization Progress",
      currentSura: "Current Sura",
      overallProgress: "Overall Progress",
      currentRecitation: "Current Recitation",
      ayaProgress: "Current Aya Progress",
      processingStatus: "Processing Status",
      currentlyChecking: "Currently Checking",
      
      // Instructions & Prompts
      reciteAya: "Recite Aya {{ayaNumber}} from Sura {{suraName}}",
      ayaCompleted: "{{ayaText}}",
      getReady: "Get ready to recite...",
      startReciting: "Start reciting now",
      
      // Feedback & Analysis
      recitationAnalysis: "Recitation Analysis",
      lastCorrectAya: "Last Correct Aya: {{ayaNumber}}",
      accuracy: "Accuracy: {{percentage}}%",
      expected: "Expected",
      recited: "Recited",
      
      // Voice Recognition Messages
      microphoneNotSupported: "Your browser doesn't support voice recognition. Please use a modern browser like Chrome.",
      internetRequired: "Voice recognition requires an internet connection. Please check your connection and try again.",
      microphonePermission: "Please allow microphone access in your browser settings.",
      networkError: "Network error. Voice recognition requires a stable internet connection. Please check your connection and try again.",
      serviceUnavailable: "Voice recognition service is unavailable. Please try again later.",
      startFailed: "Failed to start voice recognition. Please ensure you have an internet connection and try again.",
      preparingMicrophone: "Preparing Microphone",
      listening: "Listening",
      congratulations: "Congratulations! You have completed memorizing the Holy Quran! 🎉",
      
      // UI Controls
      close: "Close",
      language: "Language",
      theme: "Theme",
      lightTheme: "Light",
      darkTheme: "Dark",
      
      // Accessibility
      toggleLanguage: "Toggle Language",
      toggleTheme: "Toggle Theme",
      progressBar: "Progress Bar",
      menuButton: "Options Menu"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ar', // Default to Arabic
    fallbackLng: 'ar',
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    
    interpolation: {
      escapeValue: false,
    },
    
    react: {
      useSuspense: false,
    }
  });

export default i18n; 