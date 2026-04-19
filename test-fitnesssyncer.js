#!/usr/bin/env node

const querystring = require('querystring');
const https = require('https');

// For testing: disable SSL verification (not for production)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CLIENT_ID = 'df950ab8fe90414d96c8d480bd8823b1';
const CLIENT_SECRET = '2f4aed980b3b46f786149151508bf3ae';
const REDIRECT_URI = 'https://personal.fitnesssyncer.com/';

// Step 1: Generate Authorization URL
function getAuthorizationUrl() {
  const params = {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'Sources',
    state: 'test123'
  };
  return `https://www.fitnesssyncer.com/api/oauth/authorize?${querystring.stringify(params)}`;
}

// Step 2: Exchange code for token
function exchangeCodeForToken(code) {
  return new Promise((resolve, reject) => {
    const data = querystring.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    const options = {
      hostname: 'api.fitnesssyncer.com',
      path: '/api/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode === 200) {
            resolve(result);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(result)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}, Body: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Main
const command = process.argv[2];
const code = process.argv[3];

if (command === 'auth-url') {
  console.log('\n✅ Authorization URL Generated:\n');
  console.log(getAuthorizationUrl());
  console.log('\n📋 Next Steps:');
  console.log('1. Visit the URL above in your browser');
  console.log('2. Log in and authorize');
  console.log('3. Copy the "code" parameter from the redirect URL');
  console.log('4. Run: node test-fitnesssyncer.js exchange YOUR_CODE\n');
} else if (command === 'exchange' && code) {
  console.log('\n🔄 Exchanging code for token...\n');
  exchangeCodeForToken(code)
    .then((tokens) => {
      console.log('✅ Success! Tokens received:\n');
      console.log('Access Token:', tokens.access_token.substring(0, 20) + '...');
      console.log('Refresh Token:', tokens.refresh_token.substring(0, 20) + '...');
      console.log('Expires In:', tokens.expires_in, 'seconds');
      console.log('\n💾 Save these tokens to: /data/corpus/metadata/fitnesssyncer_tokens.json');
      console.log('Or use the web UI at /fitnesssyncer to connect.\n');
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      if (error.message.includes('HTTP')) {
        console.error('Full error:', error.message);
      }
    });
} else {
  console.log('\n📋 FitnessSyncer Connection Test\n');
  console.log('Usage:');
  console.log('  node test-fitnesssyncer.js auth-url          # Get authorization URL');
  console.log('  node test-fitnesssyncer.js exchange <code>   # Exchange code for token\n');
  console.log('Example:');
  console.log('  node test-fitnesssyncer.js auth-url');
  console.log('  # Visit URL, authorize, copy code');
  console.log('  node test-fitnesssyncer.js exchange abc123xyz\n');
}

