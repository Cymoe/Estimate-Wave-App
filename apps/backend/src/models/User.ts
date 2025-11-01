import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  organizationId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date;
}

const UserSchema: Schema = new Schema(
  {
    googleId: {
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
    name: {
      type: String,
      required: true,
    },
    picture: {
      type: String,
    },
    organizationId: {
      type: String,
      index: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>('User', UserSchema);

