import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  _id: string;
  userId: string;
  organizationId: string;
  clientId: string;
  name: string;
  description?: string;
  status: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  budget?: number;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    userId: { type: String, required: true },
    organizationId: { type: String, required: true, ref: 'Organization' },
    clientId: { type: String, required: true, ref: 'Client' },
    name: { type: String, required: true },
    description: String,
    status: {
      type: String,
      enum: ['planning', 'in_progress', 'on_hold', 'completed', 'cancelled'],
      default: 'planning',
    },
    budget: Number,
    startDate: Date,
    endDate: Date,
    category: String,
  },
  {
    timestamps: true,
    collection: 'projects',
  }
);

// Indexes
projectSchema.index({ organizationId: 1 });
projectSchema.index({ userId: 1 });
projectSchema.index({ clientId: 1 });
projectSchema.index({ status: 1 });

export const Project = mongoose.model<IProject>('Project', projectSchema);

