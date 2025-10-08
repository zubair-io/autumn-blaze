import mongoose, { Schema, Document } from "mongoose";

export interface ICustomPrompt extends Document {
  userId: string; // Auth0 sub
  triggerWord: string;
  promptText: string;
  icon: string;
  color: string;
  isBuiltIn: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomPromptSchema = new Schema<ICustomPrompt>(
  {
    userId: {
      type: String, // Auth0 sub
      required: true,
      index: true,
    },
    triggerWord: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    promptText: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: "mic",
    },
    color: {
      type: String,
      default: "blue",
    },
    isBuiltIn: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Ensure trigger word is unique per user
CustomPromptSchema.index({ userId: 1, triggerWord: 1 }, { unique: true });

export const CustomPrompt = mongoose.model<ICustomPrompt>(
  "CustomPrompt",
  CustomPromptSchema,
);

// Built-in prompts data
export const BUILT_IN_PROMPTS = [
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
    promptText:
      "Structure this transcript as organized meeting notes. Use bullet points, headers for different topics, and highlight action items and key decisions.",
    icon: "note",
    color: "yellow",
    isBuiltIn: true,
  },
  {
    triggerWord: "summarize",
    promptText:
      "Create a concise summary of this transcript. Extract the main points and key takeaways. Keep it brief but comprehensive.",
    icon: "doc.text",
    color: "green",
    isBuiltIn: true,
  },
  {
    triggerWord: "to do",
    promptText:
      "Extract all action items and tasks from this transcript. Format as a clear todo list with each item on its own line. Include any mentioned deadlines or priorities.",
    icon: "checkmark.circle",
    color: "orange",
    isBuiltIn: true,
  },
  {
    triggerWord: "clean",
    promptText:
      "Clean up this transcript by removing filler words, fixing grammar, and improving clarity while maintaining the original meaning and tone.",
    icon: "sparkles",
    color: "purple",
    isBuiltIn: true,
  },
];
