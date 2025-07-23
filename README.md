# Hafez - Quran Recitation App

A Progressive Web App (PWA) for Quran memorization and recitation practice with AI-powered voice recognition. Hafez helps users review their Quran recitation by providing real-time feedback and accuracy tracking.

## Features
- 📖 Full Quran text, parsed from XML
- 🎤 **AI-Powered Voice Recognition** using Whisper v3 Turbo (via Fireworks AI)
- 📊 Real-time recitation analysis and feedback
- ✅ Progress tracking for memorization
- ⚡ Fast, offline-ready PWA
- 🌙 Modern, responsive UI
- 🌓 Theme support (light/dark)
- 🌍 Multi-language support (Arabic/English)
- 🚀 Easy deployment on Netlify

## Voice Recognition Technology

This app uses **Whisper v3 Turbo** via Fireworks AI for highly accurate Arabic speech-to-text transcription. The integration includes:

- High-quality audio recording (WebM format)
- Serverless transcription via Netlify Functions
- Real-time feedback on recitation accuracy
- Arabic-specific text normalization for better matching

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- Fireworks AI API key (for production)

### Installation
Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/hafez.git
cd hafez/hafez-pwa
npm install
```

### Environment Setup
For production deployment on Netlify, add the following environment variable:
- `FIREWORKS_AI_KEY`: Your Fireworks AI API key

### Running Locally
Start the development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to view the app.

## Deployment on Netlify

### Automatic Deployment
1. Push your code to GitHub
2. Connect your repository to Netlify
3. Set the build command: `npm run build`
4. Set the publish directory: `dist`
5. Add environment variable: `FIREWORKS_AI_KEY` with your Fireworks AI API key

### Manual Deployment
To build the app for production:

```bash
npm run build
```

Then deploy the `dist` folder to Netlify.

## How Voice Recognition Works

1. **Audio Recording**: The app captures high-quality audio using the Web Audio API
2. **Serverless Processing**: Audio is sent to a Netlify function (`/netlify/functions/transcribe`)
3. **AI Transcription**: The function uses Fireworks AI's Whisper v3 Turbo for Arabic speech-to-text
4. **Text Matching**: Transcribed text is compared against the Quran using Arabic-specific normalization
5. **Feedback**: Users receive real-time accuracy scores and progress tracking

## API Integration

The voice recognition is powered by Fireworks AI's Whisper v3 Turbo model, which provides:
- Superior Arabic language support
- Fast transcription (turbo model)
- Voice Activity Detection (VAD) for better audio processing
- High accuracy for religious text recitation

## Contributing
Contributions are welcome! Please open an issue or submit a pull request.

## License
[MIT](LICENSE)