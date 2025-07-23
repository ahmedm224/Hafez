const FormData = require('form-data');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get the API key from environment variables
    const apiKey = process.env.FIREWORKS_AI_KEY;
    if (!apiKey) {
      console.error('FIREWORKS_AI_KEY not found in environment variables');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    // Handle base64 encoded audio data
    let audioBuffer;
    try {
      audioBuffer = Buffer.from(event.body, 'base64');
    } catch (error) {
      console.error('Error decoding base64 audio:', error);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Invalid audio data format' })
      };
    }
    
    if (!audioBuffer || audioBuffer.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'No audio data provided' })
      };
    }

    console.log('Processing audio, size:', audioBuffer.length, 'bytes');

    // Create form data for Fireworks AI
    const formData = new FormData();
    
    formData.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm'
    });
    formData.append('model', 'whisper-v3-turbo');
    formData.append('temperature', '0');
    formData.append('vad_model', 'silero');
    formData.append('language', 'ar'); // Arabic language

    console.log('Sending audio to Fireworks AI...');

    // Make request to Fireworks AI
    const response = await fetch('https://audio-turbo.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    console.log('Fireworks AI response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fireworks AI error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Transcription failed', details: errorText })
      };
    }

    const result = await response.json();
    console.log('Transcription successful, text length:', result.text?.length || 0);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Transcription error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};
