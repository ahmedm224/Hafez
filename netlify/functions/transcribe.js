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
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    // Handle direct binary audio data
    const audioBuffer = Buffer.from(event.body, 'base64');
    
    if (!audioBuffer || audioBuffer.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'No audio data provided' })
      };
    }

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

    console.log('Sending audio to Fireworks AI, size:', audioBuffer.length, 'bytes');

    // Make request to Fireworks AI
    const response = await fetch('https://audio-turbo.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

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
    console.log('Transcription result:', result);
    
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

// Simple multipart parser for audio data
function extractAudioFromMultipart(buffer, boundary) {
  try {
    const boundaryBuffer = Buffer.from('--' + boundary);
    const parts = [];
    let start = 0;
    
    while (true) {
      const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
      if (boundaryIndex === -1) break;
      
      if (start > 0) {
        parts.push(buffer.slice(start, boundaryIndex));
      }
      start = boundaryIndex + boundaryBuffer.length;
    }
    
    // Find the part containing audio data
    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      
      const headers = part.slice(0, headerEnd).toString();
      if (headers.includes('Content-Type: audio/') || headers.includes('filename=')) {
        return part.slice(headerEnd + 4);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing multipart data:', error);
    return null;
  }
}

// Simple multipart parser for audio data
function extractAudioFromMultipart(buffer, boundary) {
  try {
    const boundaryBuffer = Buffer.from('--' + boundary);
    const parts = [];
    let start = 0;
    
    while (true) {
      const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
      if (boundaryIndex === -1) break;
      
      if (start > 0) {
        parts.push(buffer.slice(start, boundaryIndex));
      }
      start = boundaryIndex + boundaryBuffer.length;
    }
    
    // Find the part containing audio data
    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      
      const headers = part.slice(0, headerEnd).toString();
      if (headers.includes('Content-Type: audio/') || headers.includes('filename=')) {
        return part.slice(headerEnd + 4);
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing multipart data:', error);
    return null;
  }
}
