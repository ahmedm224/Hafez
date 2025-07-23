exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Netlify function is working',
      hasApiKey: !!process.env.FIREWORKS_AI_KEY,
      apiKeyLength: process.env.FIREWORKS_AI_KEY ? process.env.FIREWORKS_AI_KEY.length : 0,
      timestamp: new Date().toISOString()
    })
  };
};
