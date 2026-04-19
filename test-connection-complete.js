#!/usr/bin/env node

const querystring = require('querystring');
const https = require('https');

const CLIENT_ID = 'df950ab8fe90414d96c8d480bd8823b1';
const CLIENT_SECRET = '2f4aed980b3b46f786149151508bf3ae';
const REDIRECT_URI = 'https://personal.fitnesssyncer.com/';

console.log('🔍 Testing FitnessSyncer Connection Setup...\n');

// Test 1: Verify credentials format
console.log('✅ Credentials loaded:');
console.log('   Client ID:', CLIENT_ID.substring(0, 20) + '...');
console.log('   Client Secret:', CLIENT_SECRET.substring(0, 20) + '...');
console.log('   Redirect URI:', REDIRECT_URI);
console.log('');

// Test 2: Generate authorization URL
function getAuthorizationUrl() {
  const params = {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'Sources',
    state: 'corpus-test-' + Date.now()
  };
  return `https://www.fitnesssyncer.com/api/oauth/authorize?${querystring.stringify(params)}`;
}

const authUrl = getAuthorizationUrl();
console.log('✅ Authorization URL generated:\n');
console.log(authUrl);
console.log('');

// Test 3: Verify URL is accessible
console.log('🌐 Testing FitnessSyncer API accessibility...');
const testUrl = new URL('https://www.fitnesssyncer.com/api/oauth/authorize');
const testParams = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: 'Sources'
});

https.get(`https://www.fitnesssyncer.com/api/oauth/authorize?${testParams.toString()}`, (res) => {
  console.log(`   Status: ${res.statusCode}`);
  if (res.statusCode === 200 || res.statusCode === 302) {
    console.log('   ✅ FitnessSyncer API is accessible\n');
  } else {
    console.log('   ⚠️  Unexpected status code\n');
  }
  
  console.log('📋 NEXT STEPS TO COMPLETE CONNECTION:\n');
  console.log('1. Copy this authorization URL:');
  console.log('   ' + authUrl);
  console.log('');
  console.log('2. Open it in your browser and authorize');
  console.log('');
  console.log('3. After authorization, you\'ll be redirected to:');
  console.log('   https://personal.fitnesssyncer.com/?code=YOUR_CODE');
  console.log('');
  console.log('4. Copy the code and test token exchange:');
  console.log('   node test-fitnesssyncer.js exchange YOUR_CODE');
  console.log('');
  console.log('5. Or use the web UI at http://localhost:3000/fitnesssyncer');
  console.log('   and paste the code in the form\n');
}).on('error', (err) => {
  console.log('   ⚠️  Could not reach FitnessSyncer:', err.message);
  console.log('   (This might be normal - the URL might require browser interaction)\n');
  
  console.log('📋 TO COMPLETE CONNECTION:\n');
  console.log('1. Visit this URL in your browser:');
  console.log('   ' + authUrl);
  console.log('');
  console.log('2. Authorize the application');
  console.log('');
  console.log('3. Copy the code from the redirect URL');
  console.log('');
  console.log('4. Test: node test-fitnesssyncer.js exchange YOUR_CODE\n');
});

