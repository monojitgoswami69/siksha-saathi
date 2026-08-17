import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env.local');

// 1. Read existing .env.local if present
let appKey = process.env.DROPBOX_APP_KEY || '';
let appSecret = process.env.DROPBOX_APP_SECRET || '';

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const keyMatch = content.match(/DROPBOX_APP_KEY=([^\r\n]+)/);
  const secretMatch = content.match(/DROPBOX_APP_SECRET=([^\r\n]+)/);
  if (keyMatch && keyMatch[1] && !keyMatch[1].includes('dummy')) appKey = keyMatch[1].trim();
  if (secretMatch && secretMatch[1] && !secretMatch[1].includes('dummy')) appSecret = secretMatch[1].trim();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n======================================================');
  console.log('   📦 Siksha Saathi - Dropbox Refresh Token Generator');
  console.log('======================================================\n');

  if (!appKey) {
    appKey = (await question('Enter your Dropbox App Key: ')).trim();
  } else {
    console.log(`Using App Key from .env.local: ${appKey}`);
  }

  if (!appSecret) {
    appSecret = (await question('Enter your Dropbox App Secret: ')).trim();
  } else {
    console.log(`Using App Secret from .env.local: ${appSecret.slice(0, 4)}••••••••`);
  }

  if (!appKey || !appSecret) {
    console.error('\n❌ App Key and App Secret are required.');
    rl.close();
    process.exit(1);
  }

  // 2. Generate authorization URL with offline access
  const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(
    appKey
  )}&response_type=code&token_access_type=offline`;

  console.log('\n------------------------------------------------------');
  console.log('👉 STEP 1: Open this URL in your browser and click "Allow":\n');
  console.log(`   ${authUrl}\n`);
  console.log('------------------------------------------------------\n');

  // 3. Prompt for authorization code
  const authCode = (await question('👉 STEP 2: Paste the authorization code here: ')).trim();
  rl.close();

  if (!authCode) {
    console.error('\n❌ Authorization code cannot be empty.');
    process.exit(1);
  }

  console.log('\n⏳ Exchanging authorization code for permanent refresh token...');

  try {
    const params = new URLSearchParams();
    params.append('code', authCode);
    params.append('grant_type', 'authorization_code');
    params.append('client_id', appKey);
    params.append('client_secret', appSecret);

    const response = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error('\n❌ Failed to obtain token:', data.error_description || data.error || JSON.stringify(data));
      process.exit(1);
    }

    const refreshToken = data.refresh_token;

    console.log('\n======================================================');
    console.log('🎉 SUCCESS! Your Dropbox Refresh Token has been generated:');
    console.log('======================================================\n');
    console.log(`DROPBOX_REFRESH_TOKEN=${refreshToken}\n`);

    // 4. Update .env.local automatically
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');

      if (envContent.includes('DROPBOX_REFRESH_TOKEN=')) {
        envContent = envContent.replace(
          /DROPBOX_REFRESH_TOKEN=[^\r\n]*/,
          `DROPBOX_REFRESH_TOKEN=${refreshToken}`
        );
      } else {
        envContent += `\nDROPBOX_REFRESH_TOKEN=${refreshToken}\n`;
      }

      if (envContent.includes('DROPBOX_APP_KEY=')) {
        envContent = envContent.replace(/DROPBOX_APP_KEY=[^\r\n]*/, `DROPBOX_APP_KEY=${appKey}`);
      }
      if (envContent.includes('DROPBOX_APP_SECRET=')) {
        envContent = envContent.replace(/DROPBOX_APP_SECRET=[^\r\n]*/, `DROPBOX_APP_SECRET=${appSecret}`);
      }

      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('✅ Automatically updated .env.local with your new Dropbox credentials!');
    }
  } catch (err) {
    console.error('\n❌ Unexpected error:', err.message);
  }
}

main();
