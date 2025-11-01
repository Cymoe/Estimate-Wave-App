import mongoose, { Schema, Document } from 'mongoose';

export interface ICostCode extends Document {
  _id: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  industry_id?: string;
  parent_id?: string;
  is_active: boolean;
  display_order?: number;
  created_at: Date;
  updated_at: Date;
}

const CostCodeSchema = new Schema<ICostCode>({
  code: { type: String, required: true, index: true },
  name: { type: String, required: true },
  description: { type: String },
  category: { type: String, index: true },
  industry_id: { type: String, index: true },
  parent_id: { type: String },
  is_active: { type: Boolean, default: true },
  display_order: { type: Number },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Indexes for performance
CostCodeSchema.index({ code: 1, industry_id: 1 });
CostCodeSchema.index({ category: 1, is_active: 1 });

export const CostCode = mongoose.model<ICostCode>('CostCode', CostCodeSchema);

