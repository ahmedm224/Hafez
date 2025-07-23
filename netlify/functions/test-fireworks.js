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

  try {
    const apiKey = process.env.FIREWORKS_AI_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    // Create a simple test with minimal audio data
    const formData = new FormData();
    
    // Create a minimal WebM header for testing
    const minimalWebM = Buffer.from([
      0x1A, 0x45, 0xDF, 0xA3, // EBML header
      0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F,
      0x42, 0x86, 0x81, 0x01,
      0x42, 0xF7, 0x81, 0x01,
      0x42, 0xF2, 0x81, 0x04,
      0x42, 0xF3, 0x81, 0x08,
      0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D,
      0x42, 0x87, 0x81, 0x02,
      0x42, 0x85, 0x81, 0x02
    ]);
    
    formData.append('file', minimalWebM, {
      filename: 'test.webm',
      contentType: 'audio/webm'
    });
    formData.append('model', 'whisper-v3-turbo');
    formData.append('temperature', '0');
    formData.append('language', 'ar');

    console.log('Testing Fireworks AI connection...');

    const response = await fetch('https://audio-turbo.us-virginia-1.direct.fireworks.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const result = {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    };

    if (response.ok) {
      const data = await response.json();
      result.data = data;
    } else {
      result.error = await response.text();
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};
