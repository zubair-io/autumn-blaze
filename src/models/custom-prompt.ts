import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomPrompt extends Document {
  userId: mongoose.Types.ObjectId;
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
      type: Schema.Types.ObjectId,
      ref: 'MapleUser',
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
      default: 'mic',
    },
    color: {
      type: String,
      default: 'blue',
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
  }
);

// Ensure trigger word is unique per user
CustomPromptSchema.index({ userId: 1, triggerWord: 1 }, { unique: true });

export const CustomPrompt = mongoose.model<ICustomPrompt>('CustomPrompt', CustomPromptSchema);

// Built-in prompts data
export const BUILT_IN_PROMPTS = [
  {
    triggerWord: 'email',
    promptText: 'Format this transcript as a professional email. Include a clear subject line, proper greeting, well-structured body paragraphs, and an appropriate closing. Maintain a professional tone.',
    icon: 'envelope',
    color: 'blue',
    isBuiltIn: true,
  },
  {
    triggerWord: 'notes',
    promptText: 'Structure this transcript as organized meeting notes. Use bullet points, headers for different topics, and highlight action items and key decisions.',
    icon: 'note',
    color: 'yellow',
    isBuiltIn: true,
  },
  {
    triggerWord: 'summarize',
    promptText: 'Create a concise summary of this transcript. Extract the main points and key takeaways. Keep it brief but comprehensive.',
    icon: 'doc.text',
    color: 'green',
    isBuiltIn: true,
  },
  {
    triggerWord: 'todo',
    promptText: 'Extract all action items and tasks from this transcript. Format as a clear todo list with each item on its own line. Include any mentioned deadlines or priorities.',
    icon: 'checkmark.circle',
    color: 'orange',
    isBuiltIn: true,
  },
  {
    triggerWord: 'clean',
    promptText: 'Clean up this transcript by removing filler words, fixing grammar, and improving clarity while maintaining the original meaning and tone.',
    icon: 'sparkles',
    color: 'purple',
    isBuiltIn: true,
  },
];
