import { query } from '../src/lib/server/db.ts';

async function migrate() {
  console.log('Creating quizzes table...');
  await query(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id VARCHAR(100) PRIMARY KEY,
      user_id UUID REFERENCES student_users(id) ON DELETE CASCADE,
      subject VARCHAR(200) NOT NULL,
      num_questions INT NOT NULL,
      document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
      file_name VARCHAR(255),
      questions JSONB NOT NULL,
      selected_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      review_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(50) NOT NULL DEFAULT 'available',
      score INT,
      percentage INT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      completed_at TIMESTAMP WITH TIME ZONE
    );

    CREATE INDEX IF NOT EXISTS idx_quizzes_user_status ON quizzes(user_id, status, updated_at DESC);
  `);
  console.log('✅ quizzes table created successfully!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
