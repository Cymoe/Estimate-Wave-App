import mongoose, { Schema, Document } from 'mongoose';

export interface IClient extends Document {
  _id: string;
  userId: string;
  organizationId: string;
  name: string;
  email: string;
  phone?: string;
  companyName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const clientSchema = new Schema<IClient>(
  {
    userId: { type: String, required: true },
    organizationId: { type: String, required: true, ref: 'Organization' },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    companyName: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    notes: String,
  },
  {
    timestamps: true,
    collection: 'clients',
  }
);

// Indexes
clientSchema.index({ organizationId: 1 });
clientSchema.index({ userId: 1 });
clientSchema.index({ email: 1 });

export const Client = mongoose.model<IClient>('Client', clientSchema);

