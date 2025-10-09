// Script to seed system prompts
// Run with: node seed-system-prompts.js

const mongoose = require('mongoose');

const SYSTEM_USER_ID = "11577eca-11f1-453f-81b3-d0bb46a995e3";

const BUILT_IN_PROMPTS = [
  {
    triggerWord: "email",
    promptText: `Clean up this transcript while preserving the speaker's natural voice and communication style. Fix any transcription errors, unclear words, or garbled phrases, but maintain:
- The speaker's tone (casual/formal/urgent/friendly)
- Their sentence structure preferences (short/long/direct)
- Any personal speaking patterns or characteristic phrases
- The overall energy and personality of the message

Format as a clean, readable email with:
- An appropriate subject line that matches the speaker's tone
- Natural paragraph breaks where needed
- Corrected spelling and basic grammar
- Clarity improvements only where the meaning was unclear

Do NOT make it overly formal or corporate if the speaker is being casual. Keep their authentic voice.`,
    icon: "envelope",
    color: "blue",
    isBuiltIn: true,
  },
  {
    triggerWord: "notes",
    promptText: "Structure this transcript as organized meeting notes. Use bullet points, headers for different topics, and highlight action items and key decisions.",
    icon: "note",
    color: "yellow",
    isBuiltIn: true,
  },
  {
    triggerWord: "summarize",
    promptText: "Create a concise summary of this transcript. Extract the main points and key takeaways. Keep it brief but comprehensive.",
    icon: "doc.text",
    color: "green",
    isBuiltIn: true,
  },
  {
    triggerWord: "to do",
    promptText: "Extract all action items and tasks from this transcript. Format as a clear todo list with each item on its own line. Include any mentioned deadlines or priorities.",
    icon: "checkmark.circle",
    color: "orange",
    isBuiltIn: true,
  },
  {
    triggerWord: "clean",
    promptText: "Clean up this transcript by removing filler words, fixing grammar, and improving clarity while maintaining the original meaning and tone.",
    icon: "sparkles",
    color: "purple",
    isBuiltIn: true,
  },
];

async function seedSystemPrompts() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI environment variable not set');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(mongoUri);

  const CustomPromptSchema = new mongoose.Schema({
    userId: String,
    triggerWord: String,
    promptText: String,
    icon: String,
    color: String,
    isBuiltIn: Boolean,
    isActive: Boolean,
  }, { timestamps: true });

  const CustomPrompt = mongoose.model('CustomPrompt', CustomPromptSchema);

  console.log(`🌱 Seeding system prompts with userId: ${SYSTEM_USER_ID}`);

  for (const builtInPrompt of BUILT_IN_PROMPTS) {
    const existing = await CustomPrompt.findOne({
      userId: SYSTEM_USER_ID,
      triggerWord: builtInPrompt.triggerWord,
    });

    if (existing) {
      console.log(`  ⏭️  Skipping "${builtInPrompt.triggerWord}" (already exists)`);
    } else {
      const prompt = new CustomPrompt({
        userId: SYSTEM_USER_ID,
        ...builtInPrompt,
        isActive: true,
      });
      await prompt.save();
      console.log(`  ✅ Created "${builtInPrompt.triggerWord}"`);
    }
  }

  console.log('✨ Done!');
  await mongoose.disconnect();
}

seedSystemPrompts().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
