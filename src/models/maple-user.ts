import mongoose, { Schema, Document } from 'mongoose';

export interface IMapleUser extends Document {
  appleUserId: string;
  email: string;
  defaultPromptId?: mongoose.Types.ObjectId;
  settings: {
    autoDeleteAudioAfterDays?: number;
    preferredLanguage: string;
  };
  isActive: boolean;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MapleUserSchema = new Schema<IMapleUser>(
  {
    appleUserId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    defaultPromptId: {
      type: Schema.Types.ObjectId,
      ref: 'CustomPrompt',
      default: null,
    },
    settings: {
      autoDeleteAudioAfterDays: {
        type: Number,
        default: null,
      },
      preferredLanguage: {
        type: String,
        default: 'en',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const MapleUser = mongoose.model<IMapleUser>('MapleUser', MapleUserSchema);
