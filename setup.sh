#!/bin/bash

echo "🔧 Setting up Job Search Agent..."

# Create directories
mkdir -p data public

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Initialize database
echo "🗄️  Initializing database..."
npm run build

# Create .env file
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env
  echo "✅ Created .env file. Please update with your Gmail credentials."
  echo ""
  echo "To enable email notifications:"
  echo "1. Go to https://myaccount.google.com/apppasswords"
  echo "2. Create an app password for 'Mail' on 'Windows/Mac/Linux'"
  echo "3. Copy the password to GMAIL_APP_PASSWORD in .env"
else
  echo "✅ .env file already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your email credentials (optional but recommended)"
echo "2. Run: npm run dev"
echo "3. Open http://localhost:3000 in your browser"
